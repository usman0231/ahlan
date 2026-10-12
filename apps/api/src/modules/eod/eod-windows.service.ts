import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  addDays,
  checkEodSubmissionWindow,
  checkEodWindow,
  eachDay,
  EOD_FALLBACK_WINDOW,
  eodDefaultWindowState,
  resolveEodWindow,
  uuidv7,
  zonedDateString,
  type BulkEodWindowInput,
  type EodWindow,
  type EodWindowCheck,
  type EodWindowDefaultStatus,
  type EodWindowRecord,
  type EodWindowStatus,
  type IsoDate,
  type UpsertEodWindowDefaultInput,
  type UpsertEodWindowInput,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { fromDateColumn, toDateColumn } from '../../common/util/local-date';
import type { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';

/** Zone the global default's OPEN/CLOSED status is shown in when no stadium is given. */
export const GLOBAL_EOD_TIMEZONE = 'Asia/Riyadh';

/** A window resolved for one stadium and date, with the stadium it came from (null = global). */
export interface ResolvedEodWindow extends EodWindow {
  stadiumId: string | null;
}

/**
 * EOD submission windows.
 *
 * The admin sets a recurring daily default (global, optionally per stadium) and
 * may override single dates, either for one stadium or for all of them. The
 * times are stadium-local wall clock, so the same global window means 18:00 in
 * every stadium's own zone rather than one absolute instant.
 *
 * Resolve order: per-date stadium row > per-date global row > stadium default >
 * global default (`resolveEodWindow` in @ahlan/shared).
 */
@Injectable()
export class EodWindowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(from: string, to: string, stadiumId?: string): Promise<EodWindowRecord[]> {
    const rows = await this.prisma.eodWindow.findMany({
      where: {
        date: { gte: toDateColumn(from), lte: toDateColumn(to) },
        ...(stadiumId ? { OR: [{ stadiumId }, { stadiumId: null }] } : {}),
      },
      orderBy: [{ date: 'asc' }, { stadiumId: 'asc' }],
    });
    return rows.map(toDto);
  }

  /**
   * Upsert. Postgres treats NULLs as distinct in a unique index, so the global
   * (stadiumId = null) case is deduplicated here rather than by a constraint.
   */
  async upsert(input: UpsertEodWindowInput, actor: RequestUser): Promise<EodWindowRecord> {
    if (input.stadiumId) {
      const stadium = await this.prisma.stadium.findFirst({
        where: { id: input.stadiumId, deletedAt: null },
        select: { id: true },
      });
      if (!stadium) throw AppException.notFound('Stadium', input.stadiumId);
    }

    const date = toDateColumn(input.date);
    const existing = await this.prisma.eodWindow.findFirst({
      where: { date, stadiumId: input.stadiumId ?? null },
    });

    const data = {
      startTime: input.startTime,
      endTime: input.endTime,
      enabled: input.enabled,
      createdById: actor.id,
    };

    const row = existing
      ? await this.prisma.eodWindow.update({ where: { id: existing.id }, data })
      : await this.prisma.eodWindow.create({
          data: {
            id: uuidv7(),
            stadiumId: input.stadiumId ?? null,
            date,
            ...data,
          },
        });

    await this.audit.record({
      actor,
      action: existing ? 'UPDATE' : 'CREATE',
      entity: 'eod_windows',
      entityId: row.id,
      stadiumId: input.stadiumId ?? null,
      diff: {
        date: { from: existing ? fromDateColumn(existing.date) : null, to: input.date },
        window: {
          from: existing ? `${existing.startTime}-${existing.endTime}` : null,
          to: `${input.startTime}-${input.endTime}`,
        },
        enabled: { from: existing?.enabled ?? null, to: input.enabled },
      },
    });

    return toDto(row);
  }

  /** Opens the same window across a date range, which is how a tournament is set up. */
  async bulkUpsert(input: BulkEodWindowInput, actor: RequestUser): Promise<{ written: number }> {
    const dates = eachDay(input.from, input.to);
    const targets: (string | null)[] = input.stadiumIds.length > 0 ? input.stadiumIds : [null];

    let written = 0;
    for (const stadiumId of targets) {
      for (const date of dates) {
        await this.upsert(
          {
            stadiumId,
            date,
            startTime: input.startTime,
            endTime: input.endTime,
            enabled: input.enabled,
          },
          actor,
        );
        written += 1;
      }
    }
    return { written };
  }

  async remove(id: string, actor: RequestUser): Promise<void> {
    const existing = await this.prisma.eodWindow.findUnique({ where: { id } });
    if (!existing) throw AppException.notFound('EOD window', id);
    await this.prisma.eodWindow.delete({ where: { id } });
    await this.audit.record({
      actor,
      action: 'DELETE',
      entity: 'eod_windows',
      entityId: id,
      stadiumId: existing.stadiumId,
    });
  }

  /** The window in force for a stadium on a date. */
  async resolve(
    stadiumId: string,
    date: string,
  ): Promise<{ window: ResolvedEodWindow | null; timezone: string }> {
    const timezone = await this.timezoneOf(stadiumId);
    const windowFor = await this.windowsFor(stadiumId, [date]);
    return { window: windowFor(date), timezone };
  }

  /**
   * Whether an EOD for this stadium may be submitted at `now`. Judged at the
   * moment of submission: today's window, or yesterday's when it runs past
   * midnight - never against the report date.
   */
  async checkSubmission(stadiumId: string, now = new Date()): Promise<EodWindowCheck> {
    const timezone = await this.timezoneOf(stadiumId);
    const today = zonedDateString(now, timezone);
    const windowFor = await this.windowsFor(stadiumId, [today, addDays(today, -1)]);
    return checkEodSubmissionWindow(windowFor, timezone, now);
  }

  /**
   * Whether a submission would be accepted right now, and when it closes.
   * `date` is the report date (for the already-submitted flag); the window
   * itself is judged at `now`, exactly as submit does.
   */
  async status(
    stadiumId: string,
    date: string,
    actor: RequestUser,
    now = new Date(),
  ): Promise<EodWindowStatus> {
    const check = await this.checkSubmission(stadiumId, now);

    const submitted = await this.prisma.eodReport.findFirst({
      where: {
        stadiumId,
        inspectorId: actor.id,
        date: toDateColumn(date),
        status: 'SUBMITTED',
      },
      select: { id: true },
    });

    return {
      date,
      stadiumId,
      open: check.open,
      reason: check.open ? null : check.message,
      opensAt: check.bounds?.opensAt ?? null,
      closesAt: check.bounds?.closesAt ?? null,
      alreadySubmitted: Boolean(submitted),
    };
  }

  /** Delegates to the shared rule so the app and API agree exactly. */
  check(window: EodWindow | null, timezone: string, now = new Date()): EodWindowCheck {
    return checkEodWindow(
      window
        ? {
            date: window.date,
            startTime: window.startTime,
            endTime: window.endTime,
            enabled: window.enabled,
          }
        : null,
      timezone,
      now,
    );
  }

  /* ---------------------------- recurring default --------------------------- */

  /**
   * The recurring default and whether it is open now. With a stadium: that
   * stadium's default if it has one, else the global one, in the stadium's zone.
   */
  async getDefault(stadiumId?: string | null, now = new Date()): Promise<EodWindowDefaultStatus> {
    const timezone = stadiumId ? await this.timezoneOf(stadiumId) : GLOBAL_EOD_TIMEZONE;
    const rows = await this.prisma.eodWindowDefault.findMany({
      where: stadiumId ? { OR: [{ stadiumId }, { stadiumId: null }] } : { stadiumId: null },
    });
    const row = rows.find((r) => r.stadiumId === stadiumId) ?? rows.find((r) => r.stadiumId === null);
    return toDefaultStatus(row ?? null, stadiumId ?? null, timezone, now);
  }

  /** Admin: sets the recurring default (global, or one stadium's). Audited. */
  async upsertDefault(
    input: UpsertEodWindowDefaultInput,
    actor: RequestUser,
  ): Promise<EodWindowDefaultStatus> {
    const stadiumId = input.stadiumId ?? null;
    if (stadiumId) await this.timezoneOf(stadiumId);

    // findFirst rather than a unique lookup: the global row has a null stadiumId.
    const existing = await this.prisma.eodWindowDefault.findFirst({ where: { stadiumId } });
    const data = {
      startTime: input.startTime,
      endTime: input.endTime,
      enabled: input.enabled,
      updatedById: actor.id,
    };
    const row = existing
      ? await this.prisma.eodWindowDefault.update({ where: { id: existing.id }, data })
      : await this.prisma.eodWindowDefault.create({ data: { id: uuidv7(), stadiumId, ...data } });

    await this.audit.record({
      actor,
      action: existing ? 'UPDATE' : 'CREATE',
      entity: 'eod_window_defaults',
      entityId: row.id,
      stadiumId,
      diff: {
        window: {
          from: existing ? `${existing.startTime}-${existing.endTime}` : null,
          to: `${input.startTime}-${input.endTime}`,
        },
        enabled: { from: existing?.enabled ?? null, to: input.enabled },
      },
    });

    const timezone = stadiumId ? await this.timezoneOf(stadiumId) : GLOBAL_EOD_TIMEZONE;
    return toDefaultStatus(row, stadiumId, timezone, new Date());
  }

  /* -------------------------------- internals ------------------------------- */

  /**
   * Loads every candidate row for the given dates in two queries and returns a
   * resolver applying the shared precedence rule.
   */
  private async windowsFor(
    stadiumId: string,
    dates: IsoDate[],
  ): Promise<(date: IsoDate) => ResolvedEodWindow | null> {
    const [dated, defaults] = await Promise.all([
      this.prisma.eodWindow.findMany({
        where: {
          date: { in: dates.map(toDateColumn) },
          OR: [{ stadiumId }, { stadiumId: null }],
        },
      }),
      this.prisma.eodWindowDefault.findMany({
        where: { OR: [{ stadiumId }, { stadiumId: null }] },
      }),
    ]);

    return (date) => {
      const forDate = dated.filter((row) => fromDateColumn(row.date) === date);
      const perDateStadium = forDate.find((row) => row.stadiumId === stadiumId) ?? null;
      const perDateGlobal = forDate.find((row) => row.stadiumId === null) ?? null;
      const stadiumDefault = defaults.find((row) => row.stadiumId === stadiumId) ?? null;
      const globalDefault = defaults.find((row) => row.stadiumId === null) ?? null;
      const window = resolveEodWindow(date, {
        perDateStadium,
        perDateGlobal,
        stadiumDefault,
        globalDefault,
      });
      if (!window) return null;
      const source = perDateStadium ?? perDateGlobal ?? stadiumDefault ?? globalDefault;
      return { ...window, stadiumId: source?.stadiumId ?? null };
    };
  }

  private async timezoneOf(stadiumId: string): Promise<string> {
    const stadium = await this.prisma.stadium.findFirst({
      where: { id: stadiumId, deletedAt: null },
      select: { timezone: true },
    });
    if (!stadium) throw AppException.notFound('Stadium', stadiumId);
    return stadium.timezone;
  }

  /** Today in a stadium's own zone, which is the day an EOD belongs to. */
  async todayFor(stadiumId: string, now = new Date()): Promise<string> {
    const stadium = await this.prisma.stadium.findFirst({
      where: { id: stadiumId, deletedAt: null },
      select: { timezone: true },
    });
    if (!stadium) throw AppException.notFound('Stadium', stadiumId);
    return zonedDateString(now, stadium.timezone);
  }
}

type EodWindowRow = Prisma.EodWindowGetPayload<Record<string, never>>;
type EodWindowDefaultRow = Prisma.EodWindowDefaultGetPayload<Record<string, never>>;

function toDefaultStatus(
  row: EodWindowDefaultRow | null,
  stadiumId: string | null,
  timezone: string,
  now: Date,
): EodWindowDefaultStatus {
  const times = row ?? { ...EOD_FALLBACK_WINDOW, enabled: false };
  const state = eodDefaultWindowState(row, timezone, now);
  return {
    stadiumId: row ? row.stadiumId : stadiumId,
    startTime: times.startTime,
    endTime: times.endTime,
    enabled: times.enabled,
    status: state.status,
    timezone,
    opensAt: state.opensAt,
    closesAt: state.closesAt,
    updatedAt: row?.updatedAt ?? null,
  };
}

function toDto(row: EodWindowRow): EodWindowRecord {
  return {
    id: row.id,
    stadiumId: row.stadiumId,
    date: fromDateColumn(row.date),
    startTime: row.startTime,
    endTime: row.endTime,
    enabled: row.enabled,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
