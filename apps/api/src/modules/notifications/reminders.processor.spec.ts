import type { Job } from 'bullmq';

import { JOBS } from '../../queues/queue-names';
import { RemindersProcessor } from './reminders.processor';
import type { PrismaService } from '../../prisma/prisma.service';
import type { NotificationsService } from './notifications.service';

const STADIUM_A = '01930000-0000-7000-8000-0000000000a1';
const STADIUM_B = '01930000-0000-7000-8000-0000000000b1';
const INSPECTOR = '01930000-0000-7000-8000-000000000031';
const SUPERVISOR = '01930000-0000-7000-8000-000000000041';

function overdueAction(id: string, stadiumId: string) {
  return {
    id,
    findingId: `${id}-finding`,
    assigneeId: INSPECTOR,
    dueDate: new Date(Date.now() - 3 * 86_400_000),
    finding: { reference: `F-${id}`, title: 'Loose cable', stadiumId },
  };
}

function harness() {
  const prisma = {
    correctiveAction: {
      findMany: jest.fn().mockResolvedValue([
        overdueAction('a1', STADIUM_A),
        overdueAction('a2', STADIUM_A),
        overdueAction('b1', STADIUM_B),
      ]),
    },
    stadiumAssignment: {
      findMany: jest.fn().mockResolvedValue([
        { userId: SUPERVISOR, stadiumId: STADIUM_A },
        { userId: SUPERVISOR, stadiumId: STADIUM_B },
      ]),
    },
  };
  const notifications = {
    notify: jest.fn().mockResolvedValue('id'),
    notifyMany: jest.fn().mockResolvedValue(undefined),
    notifyAllAdmins: jest.fn().mockResolvedValue(undefined),
  };
  const processor = new RemindersProcessor(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { processor, notifications };
}

describe('RemindersProcessor overdue actions', () => {
  it('notifies each assignee per action but sends supervisors and admins one digest', async () => {
    const { processor, notifications } = harness();

    await processor.process({ name: JOBS.actionOverdue } as Job);

    const toInspector = notifications.notify.mock.calls.filter(([p]) => p.userId === INSPECTOR);
    const toSupervisor = notifications.notify.mock.calls.filter(([p]) => p.userId === SUPERVISOR);
    expect(toInspector).toHaveLength(3);
    expect(toSupervisor).toHaveLength(1);
    expect(toSupervisor[0][0].data).toEqual({ overdueCount: '3' });
    expect(notifications.notifyMany).not.toHaveBeenCalled();
    expect(notifications.notifyAllAdmins).toHaveBeenCalledTimes(1);
    expect(notifications.notifyAllAdmins.mock.calls[0][0].body).toBe(
      '3 corrective action(s) are overdue across 2 stadium(s).',
    );
  });

  it('sends nothing to supervisors or admins when nothing is overdue', async () => {
    const { processor, notifications } = harness();
    const prisma = (processor as unknown as { prisma: { correctiveAction: { findMany: jest.Mock } } })
      .prisma;
    prisma.correctiveAction.findMany.mockResolvedValue([]);

    await processor.process({ name: JOBS.actionOverdue } as Job);

    expect(notifications.notify).not.toHaveBeenCalled();
    expect(notifications.notifyAllAdmins).not.toHaveBeenCalled();
  });
});
