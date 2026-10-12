import { Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import {
  addDays,
  checkEodWindow,
  resolveEodWindow,
  zonedDateString,
  DEFAULT_TIME_ZONE,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { toDateColumn } from '../../common/util/local-date';
import { JOBS, QUEUES } from '../../queues/queue-names';
import { enqueue } from '../../queues/enqueue';
import { NotificationsService } from './notifications.service';

/**
 * Enqueues the recurring reminder scans. The cron only produces a job; the scan
 * itself runs in the worker, so a slow query never blocks the scheduler.
 */
@Injectable()
export class RemindersScheduler {
  private readonly logger = new Logger(RemindersScheduler.name);

  constructor(@InjectQueue(QUEUES.reminders) private readonly queue: Queue) {}

  /**
   * Once a day, at the start of the working day. Hourly scans re-sent the same
   * "due tomorrow" / "overdue" notice for every open action every hour.
   */
  @Cron('0 8 * * *', { name: 'corrective-action-reminders', timeZone: 'Asia/Riyadh' })
  async scheduleActionReminders(): Promise<void> {
    await this.enqueue(JOBS.actionDueSoon);
    await this.enqueue(JOBS.actionOverdue);
  }

  /** Runs hourly: stadiums span several zones, so "end of day" is not one moment. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'eod-missing' })
  async scheduleEodCheck(): Promise<void> {
    await this.enqueue(JOBS.eodMissing);
  }

  private async enqueue(name: string): Promise<void> {
    try {
      await enqueue(this.queue, name, {}, { jobId: `${name}:${new Date().toISOString().slice(0, 13)}` });
    } catch (error) {
      this.logger.warn(`Could not enqueue ${name}: ${(error as Error).message}`);
    }
  }
}

/** Does the scanning and sends the reminders. */
@Processor(QUEUES.reminders)
export class RemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(RemindersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  override async process(job: Job): Promise<{ sent: number }> {
    switch (job.name) {
      case JOBS.actionDueSoon:
        return { sent: await this.remindDueSoon() };
      case JOBS.actionOverdue:
        return { sent: await this.remindOverdue() };
      case JOBS.eodMissing:
        return { sent: await this.remindMissingEod() };
      default:
        this.logger.warn(`Ignoring unknown reminder job ${job.name}`);
        return { sent: 0 };
    }
  }

  /** Corrective actions due tomorrow that are not finished yet. */
  private async remindDueSoon(): Promise<number> {
    const tomorrow = addDays(zonedDateString(new Date(), DEFAULT_TIME_ZONE), 1);
    const actions = await this.prisma.correctiveAction.findMany({
      where: {
        dueDate: toDateColumn(tomorrow),
        status: { notIn: ['CLOSED', 'PENDING_VERIFICATION'] },
        assigneeId: { not: null },
      },
      include: { finding: { select: { reference: true, title: true, stadiumId: true } } },
    });

    let sent = 0;
    for (const action of actions) {
      if (!action.assigneeId) continue;
      await this.notifications.notify({
        userId: action.assigneeId,
        kind: 'ACTION_DUE_SOON',
        title: 'Corrective action due tomorrow',
        body: `${action.finding.reference}: ${action.finding.title}`,
        route: `/findings/${action.findingId}`,
        data: { findingId: action.findingId, actionId: action.id },
      });
      sent += 1;
    }
    return sent;
  }

  /**
   * Overdue is derived, so this query is "past due and not closed" rather than a
   * lookup on a stored OVERDUE status.
   */
  private async remindOverdue(): Promise<number> {
    const today = zonedDateString(new Date(), DEFAULT_TIME_ZONE);
    const actions = await this.prisma.correctiveAction.findMany({
      where: {
        dueDate: { lt: toDateColumn(today) },
        status: { not: 'CLOSED' },
      },
      include: { finding: { select: { reference: true, title: true, stadiumId: true } } },
    });

    let sent = 0;
    for (const action of actions) {
      const overdueBy = action.dueDate
        ? Math.max(1, Math.round((Date.now() - action.dueDate.getTime()) / 86_400_000))
        : 1;
      const body = `${action.finding.reference} is ${overdueBy} day(s) overdue.`;

      if (action.assigneeId) {
        await this.notifications.notify({
          userId: action.assigneeId,
          kind: 'ACTION_OVERDUE',
          title: 'Corrective action overdue',
          body,
          route: `/findings/${action.findingId}`,
          data: { findingId: action.findingId, actionId: action.id },
        });
        sent += 1;
      }

    }
    if (actions.length === 0) return sent;

    // Supervisors and admins chase these up across many actions, so they get one
    // digest each instead of one notice per action.
    const overdueByStadium = new Map<string, number>();
    for (const action of actions) {
      const stadiumId = action.finding.stadiumId;
      overdueByStadium.set(stadiumId, (overdueByStadium.get(stadiumId) ?? 0) + 1);
    }

    const supervisors = await this.prisma.stadiumAssignment.findMany({
      where: {
        stadiumId: { in: [...overdueByStadium.keys()] },
        user: { role: 'SUPERVISOR', status: 'ACTIVE', deletedAt: null },
      },
      select: { userId: true, stadiumId: true },
    });
    const overdueBySupervisor = new Map<string, number>();
    for (const row of supervisors) {
      overdueBySupervisor.set(
        row.userId,
        (overdueBySupervisor.get(row.userId) ?? 0) + (overdueByStadium.get(row.stadiumId) ?? 0),
      );
    }
    for (const [userId, count] of overdueBySupervisor) {
      await this.notifications.notify({
        userId,
        kind: 'ACTION_OVERDUE',
        title: 'Corrective actions overdue',
        body: `${count} corrective action(s) at your stadiums are overdue.`,
        route: '/review-findings',
        data: { overdueCount: String(count) },
      });
      sent += 1;
    }

    await this.notifications.notifyAllAdmins({
      kind: 'ACTION_OVERDUE',
      title: 'Corrective actions overdue',
      body: `${actions.length} corrective action(s) are overdue across ${overdueByStadium.size} stadium(s).`,
      route: '/review-findings',
      data: { overdueCount: String(actions.length) },
    });
    return sent;
  }

  /**
   * For every stadium whose EOD window has closed today, remind inspectors who
   * have not submitted, and tell the admins who is missing.
   */
  private async remindMissingEod(): Promise<number> {
    const now = new Date();
    const stadiums = await this.prisma.stadium.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        timezone: true,
        // Only inspectors owe an EOD; supervisors and admins never do.
        assignments: {
          where: { user: { role: 'INSPECTOR', status: 'ACTIVE', deletedAt: null } },
          select: { userId: true },
        },
      },
    });

    let sent = 0;
    for (const stadium of stadiums) {
      const localDate = zonedDateString(now, stadium.timezone);
      const [dated, defaults] = await Promise.all([
        this.prisma.eodWindow.findMany({
          where: {
            date: toDateColumn(localDate),
            OR: [{ stadiumId: stadium.id }, { stadiumId: null }],
          },
        }),
        this.prisma.eodWindowDefault.findMany({
          where: { OR: [{ stadiumId: stadium.id }, { stadiumId: null }] },
        }),
      ]);
      // Same precedence as submission: per-date stadium > per-date global >
      // stadium default > global default.
      const window = resolveEodWindow(localDate, {
        perDateStadium: dated.find((row) => row.stadiumId === stadium.id) ?? null,
        perDateGlobal: dated.find((row) => row.stadiumId === null) ?? null,
        stadiumDefault: defaults.find((row) => row.stadiumId === stadium.id) ?? null,
        globalDefault: defaults.find((row) => row.stadiumId === null) ?? null,
      });
      if (!window || !window.enabled) continue;

      const check = checkEodWindow(window, stadium.timezone, now);
      // Only chase once the window has actually closed.
      if (check.open || !check.bounds || now.getTime() < check.bounds.closesAt.getTime()) continue;

      const submitted = await this.prisma.eodReport.findMany({
        where: {
          stadiumId: stadium.id,
          date: toDateColumn(localDate),
          status: 'SUBMITTED',
        },
        select: { inspectorId: true },
      });
      const submittedIds = new Set(submitted.map((row) => row.inspectorId));
      const missing = stadium.assignments
        .map((assignment) => assignment.userId)
        .filter((userId) => !submittedIds.has(userId));

      if (missing.length === 0) continue;

      // This scan runs hourly; once the window has closed it would chase the
      // same people every hour until midnight. Send once per stadium and day.
      const alreadySent = await this.prisma.notification.count({
        where: {
          kind: 'EOD_MISSING',
          AND: [
            { data: { path: ['stadiumId'], equals: stadium.id } },
            { data: { path: ['date'], equals: localDate } },
          ],
        },
      });
      if (alreadySent > 0) continue;

      await this.notifications.notifyMany(missing, {
        kind: 'EOD_MISSING',
        title: 'End of Day report missing',
        body: `You have not submitted an EOD report for ${stadium.name} on ${localDate}.`,
        route: '/eod',
        data: { stadiumId: stadium.id, date: localDate },
      });
      sent += missing.length;

      await this.notifications.notifyAllAdmins({
        kind: 'EOD_MISSING',
        title: 'Missing EOD reports',
        body: `${missing.length} inspector(s) did not submit an EOD for ${stadium.name} on ${localDate}.`,
        route: '/eod-reports',
        data: { stadiumId: stadium.id, date: localDate },
      });
    }
    return sent;
  }
}
