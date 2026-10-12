import { ERROR_CODES } from '@ahlan/shared';

import { AppException } from '../../common/errors/app.exception';
import { CorrectiveActionsService } from './corrective-actions.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { EvidenceService } from '../evidence/evidence.service';
import type { FindingsService } from '../findings/findings.service';
import type { RequestUser } from '../../common/types/request-user';

const STADIUM = '01930000-0000-7000-8000-000000000001';
const FINDING = '01930000-0000-7000-8000-000000000011';
const ACTION = '01930000-0000-7000-8000-000000000021';
const ASSIGNEE = '01930000-0000-7000-8000-000000000031';

const admin: RequestUser = {
  id: '01930000-0000-7000-8000-00000000000a',
  email: 'admin@example.test',
  fullName: 'Test Admin',
  role: 'ADMIN',
  sessionId: '01930000-0000-7000-8000-00000000000b',
  stadiumIds: [],
};

const assignee: RequestUser = {
  id: ASSIGNEE,
  email: 'inspector@example.test',
  fullName: 'Test Inspector',
  role: 'INSPECTOR',
  sessionId: '01930000-0000-7000-8000-00000000000c',
  stadiumIds: [STADIUM],
};

const otherInspector: RequestUser = {
  ...assignee,
  id: '01930000-0000-7000-8000-000000000032',
};

function harness(options: { closureEvidence?: number } = {}) {
  const tx = {
    correctiveAction: { create: jest.fn(), update: jest.fn() },
    finding: { update: jest.fn() },
    auditLog: { create: jest.fn() },
  };

  const prisma = {
    finding: { findUnique: jest.fn() },
    correctiveAction: { findUnique: jest.fn(), update: jest.fn() },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        role: 'INSPECTOR',
        stadiums: [{ stadiumId: STADIUM }],
      }),
    },
    // Runs the callback immediately with the fake transaction client.
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };

  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const evidence = {
    attach: jest.fn().mockResolvedValue(undefined),
    countFor: jest.fn().mockResolvedValue(options.closureEvidence ?? 0),
  };
  const findings = {
    get: jest.fn().mockResolvedValue({ id: FINDING, status: 'OPEN' }),
    syncStatusFromAction: jest.fn().mockResolvedValue(undefined),
    notifyAssignment: jest.fn().mockResolvedValue(undefined),
    assertInScope: jest.fn(),
  };

  const service = new CorrectiveActionsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    evidence as unknown as EvidenceService,
    findings as unknown as FindingsService,
  );

  return { service, prisma, tx, audit, evidence, findings };
}

function actionRow(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: ACTION,
    findingId: FINDING,
    assigneeId: ASSIGNEE,
    status,
    startedAt: null,
    completedAt: null,
    finding: { id: FINDING, stadiumId: STADIUM, reference: 'F-LSL-00001' },
    ...overrides,
  };
}

describe('assigning a corrective action', () => {
  it('moves the finding OPEN -> ACTION_ASSIGNED', async () => {
    const { service, prisma, tx, findings } = harness();
    prisma.finding.findUnique.mockResolvedValue({
      id: FINDING,
      stadiumId: STADIUM,
      status: 'OPEN',
      actions: [],
    });

    await service.assign(
      FINDING,
      { assigneeId: ASSIGNEE, action: 'Fit the missing guardrail', dueDate: '2026-10-09' },
      admin,
    );

    expect(tx.correctiveAction.create).toHaveBeenCalled();
    expect(findings.syncStatusFromAction).toHaveBeenCalledWith(tx, FINDING, 'ACTION_ASSIGNED');
    expect(findings.notifyAssignment).toHaveBeenCalledWith(FINDING, ASSIGNEE);
  });

  it('refuses to assign on a closed finding', async () => {
    const { service, prisma } = harness();
    prisma.finding.findUnique.mockResolvedValue({
      id: FINDING,
      stadiumId: STADIUM,
      status: 'CLOSED',
      actions: [],
    });

    await expect(
      service.assign(
        FINDING,
        { assigneeId: ASSIGNEE, action: 'Too late', dueDate: '2026-10-09' },
        admin,
      ),
    ).rejects.toThrow(AppException);
  });

  it('refuses an assignee who does not cover the stadium', async () => {
    const { service, prisma } = harness();
    prisma.finding.findUnique.mockResolvedValue({
      id: FINDING,
      stadiumId: STADIUM,
      status: 'OPEN',
      actions: [],
    });
    prisma.user.findFirst.mockResolvedValue({ role: 'INSPECTOR', stadiums: [] });

    await expect(
      service.assign(
        FINDING,
        { assigneeId: ASSIGNEE, action: 'Fit the guardrail', dueDate: '2026-10-09' },
        admin,
      ),
    ).rejects.toThrow(AppException);
  });
});

describe('progressing a corrective action', () => {
  it('lets the assignee start work', async () => {
    const { service, prisma, tx } = harness();
    prisma.correctiveAction.findUnique.mockResolvedValue(actionRow('ACTION_ASSIGNED'));

    await service.transition(ACTION, { to: 'IN_PROGRESS', evidenceIds: [] }, assignee);

    expect(tx.correctiveAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'IN_PROGRESS' }),
      }),
    );
  });

  it("stops an inspector progressing someone else's action", async () => {
    const { service, prisma } = harness();
    prisma.correctiveAction.findUnique.mockResolvedValue(actionRow('ACTION_ASSIGNED'));

    await expect(
      service.transition(ACTION, { to: 'IN_PROGRESS', evidenceIds: [] }, otherInspector),
    ).rejects.toMatchObject({ code: ERROR_CODES.FORBIDDEN });
  });

  it('stamps completedAt when work is submitted for verification', async () => {
    const { service, prisma, tx } = harness();
    prisma.correctiveAction.findUnique.mockResolvedValue(actionRow('IN_PROGRESS'));

    await service.transition(ACTION, { to: 'PENDING_VERIFICATION', evidenceIds: [] }, assignee);

    const data = tx.correctiveAction.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBe('PENDING_VERIFICATION');
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it('rejects a skipped step', async () => {
    const { service, prisma } = harness({ closureEvidence: 3 });
    prisma.correctiveAction.findUnique.mockResolvedValue(actionRow('ACTION_ASSIGNED'));

    await expect(
      service.transition(ACTION, { to: 'CLOSED', evidenceIds: [] }, admin),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_STATUS_TRANSITION });
  });
});

describe('closing a corrective action', () => {
  it('is refused for an inspector, even the assignee', async () => {
    const { service, prisma } = harness({ closureEvidence: 2 });
    prisma.correctiveAction.findUnique.mockResolvedValue(actionRow('PENDING_VERIFICATION'));

    await expect(
      service.transition(ACTION, { to: 'CLOSED', evidenceIds: [] }, assignee),
    ).rejects.toMatchObject({ code: ERROR_CODES.FORBIDDEN });
  });

  it('is refused without closure evidence', async () => {
    const { service, prisma } = harness({ closureEvidence: 0 });
    prisma.correctiveAction.findUnique.mockResolvedValue(actionRow('PENDING_VERIFICATION'));

    await expect(
      service.transition(ACTION, { to: 'CLOSED', evidenceIds: [] }, admin),
    ).rejects.toMatchObject({ code: ERROR_CODES.CLOSURE_EVIDENCE_REQUIRED });
  });

  it('closes for an admin with closure evidence, and records the verifier', async () => {
    const { service, prisma, tx, findings, audit } = harness({ closureEvidence: 1 });
    prisma.correctiveAction.findUnique.mockResolvedValue(actionRow('PENDING_VERIFICATION'));

    await service.transition(
      ACTION,
      { to: 'CLOSED', note: 'Verified on site', evidenceIds: [] },
      admin,
    );

    const data = tx.correctiveAction.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBe('CLOSED');
    expect(data.verifiedAt).toBeInstanceOf(Date);
    expect(data.closureNote).toBe('Verified on site');
    expect(findings.syncStatusFromAction).toHaveBeenCalledWith(tx, FINDING, 'CLOSED');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'STATUS_CHANGE' }),
      tx,
    );
  });

  it('attaches photos sent with the request as closure evidence', async () => {
    const { service, prisma, evidence } = harness({ closureEvidence: 1 });
    prisma.correctiveAction.findUnique.mockResolvedValue(actionRow('PENDING_VERIFICATION'));
    const photo = '01930000-0000-7000-8000-0000000000e1';

    await service.transition(ACTION, { to: 'CLOSED', evidenceIds: [photo] }, admin);

    expect(evidence.attach).toHaveBeenCalledWith(
      [photo],
      'CORRECTIVE_ACTION_CLOSURE',
      ACTION,
      admin,
    );
  });

  it('cannot reopen a closed action', async () => {
    const { service, prisma } = harness();
    prisma.correctiveAction.findUnique.mockResolvedValue(actionRow('CLOSED'));

    await expect(
      service.transition(ACTION, { to: 'IN_PROGRESS', note: 'Reopening', evidenceIds: [] }, admin),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_STATUS_TRANSITION });
  });
});

describe('sending work back', () => {
  it('lets an admin reject a verification with a note', async () => {
    const { service, prisma, tx } = harness();
    prisma.correctiveAction.findUnique.mockResolvedValue(actionRow('PENDING_VERIFICATION'));

    await service.transition(
      ACTION,
      { to: 'IN_PROGRESS', note: 'Guardrail still missing on the east side', evidenceIds: [] },
      admin,
    );

    const data = tx.correctiveAction.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBe('IN_PROGRESS');
    // The earlier completion no longer holds.
    expect(data.completedAt).toBeNull();
  });

  it('requires the note', async () => {
    const { service, prisma } = harness();
    prisma.correctiveAction.findUnique.mockResolvedValue(actionRow('PENDING_VERIFICATION'));

    await expect(
      service.transition(ACTION, { to: 'IN_PROGRESS', note: '  ', evidenceIds: [] }, admin),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });
});

describe('a supervisor', () => {
  const OTHER_STADIUM = '01930000-0000-7000-8000-000000000002';
  const supervisor: RequestUser = {
    id: '01930000-0000-7000-8000-000000000041',
    email: 'supervisor@example.test',
    fullName: 'Test Supervisor',
    role: 'SUPERVISOR',
    sessionId: '01930000-0000-7000-8000-00000000000d',
    stadiumIds: [STADIUM],
  };

  /** The real scope rule, so these tests exercise it rather than a stub. */
  function scopedHarness(options: { closureEvidence?: number } = {}) {
    const built = harness(options);
    built.findings.assertInScope.mockImplementation((stadiumId: string, actor: RequestUser) => {
      if (actor.role !== 'ADMIN' && !actor.stadiumIds.includes(stadiumId)) {
        throw AppException.outOfScope();
      }
    });
    return built;
  }

  it('can assign an action on a finding at their stadium', async () => {
    const { service, prisma, tx } = scopedHarness();
    prisma.finding.findUnique.mockResolvedValue({
      id: FINDING,
      stadiumId: STADIUM,
      status: 'OPEN',
      actions: [],
    });

    await service.assign(
      FINDING,
      { assigneeId: ASSIGNEE, action: 'Fit the guardrail', dueDate: '2026-10-09' },
      supervisor,
    );
    expect(tx.correctiveAction.create).toHaveBeenCalled();
  });

  it('cannot assign at a stadium outside their assignment', async () => {
    const { service, prisma, tx } = scopedHarness();
    prisma.finding.findUnique.mockResolvedValue({
      id: FINDING,
      stadiumId: OTHER_STADIUM,
      status: 'OPEN',
      actions: [],
    });

    await expect(
      service.assign(
        FINDING,
        { assigneeId: ASSIGNEE, action: 'Fit the guardrail', dueDate: '2026-10-09' },
        supervisor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.STADIUM_OUT_OF_SCOPE });
    expect(tx.correctiveAction.create).not.toHaveBeenCalled();
  });

  it('cannot edit an action outside their assignment', async () => {
    const { service, prisma } = scopedHarness();
    prisma.correctiveAction.findUnique.mockResolvedValue(
      actionRow('ACTION_ASSIGNED', { finding: { stadiumId: OTHER_STADIUM, status: 'ACTION_ASSIGNED' } }),
    );

    await expect(
      service.update(ACTION, { action: 'Reworded' }, supervisor),
    ).rejects.toMatchObject({ code: ERROR_CODES.STADIUM_OUT_OF_SCOPE });
  });

  it('cannot assign the action to another supervisor', async () => {
    const { service, prisma } = scopedHarness();
    prisma.finding.findUnique.mockResolvedValue({
      id: FINDING,
      stadiumId: STADIUM,
      status: 'OPEN',
      actions: [],
    });
    prisma.user.findFirst.mockResolvedValue({
      role: 'SUPERVISOR',
      stadiums: [{ stadiumId: STADIUM }],
    });

    await expect(
      service.assign(
        FINDING,
        { assigneeId: ASSIGNEE, action: 'Fit the guardrail', dueDate: '2026-10-09' },
        supervisor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });

  it('cannot close, even with closure evidence', async () => {
    const { service, prisma, tx } = scopedHarness({ closureEvidence: 2 });
    prisma.correctiveAction.findUnique.mockResolvedValue(actionRow('PENDING_VERIFICATION'));

    await expect(
      service.transition(ACTION, { to: 'CLOSED', evidenceIds: [] }, supervisor),
    ).rejects.toMatchObject({ code: ERROR_CODES.FORBIDDEN });
    expect(tx.correctiveAction.update).not.toHaveBeenCalled();
  });

  it('can send a failed verification back with a note', async () => {
    const { service, prisma, tx } = scopedHarness();
    prisma.correctiveAction.findUnique.mockResolvedValue(actionRow('PENDING_VERIFICATION'));

    await service.transition(
      ACTION,
      { to: 'IN_PROGRESS', note: 'Barrier still missing', evidenceIds: [] },
      supervisor,
    );

    const data = tx.correctiveAction.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.status).toBe('IN_PROGRESS');
  });

  it('cannot progress the work on the assignee’s behalf', async () => {
    const { service, prisma } = scopedHarness();
    prisma.correctiveAction.findUnique.mockResolvedValue(actionRow('ACTION_ASSIGNED'));

    await expect(
      service.transition(ACTION, { to: 'IN_PROGRESS', evidenceIds: [] }, supervisor),
    ).rejects.toMatchObject({ code: ERROR_CODES.FORBIDDEN });
  });
});
