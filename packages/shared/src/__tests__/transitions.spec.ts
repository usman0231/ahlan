import { ERROR_CODES } from '../errors';
import {
  allowedTransitionsForRole,
  checkTransition,
  isTerminalStatus,
  statusProgress,
} from '../transitions';

describe('the happy path', () => {
  it('walks OPEN -> ACTION_ASSIGNED -> IN_PROGRESS -> PENDING_VERIFICATION -> CLOSED', () => {
    expect(checkTransition({ from: 'OPEN', to: 'ACTION_ASSIGNED', role: 'ADMIN' }).allowed).toBe(
      true,
    );
    expect(
      checkTransition({
        from: 'ACTION_ASSIGNED',
        to: 'IN_PROGRESS',
        role: 'INSPECTOR',
        isAssignee: true,
      }).allowed,
    ).toBe(true);
    expect(
      checkTransition({
        from: 'IN_PROGRESS',
        to: 'PENDING_VERIFICATION',
        role: 'INSPECTOR',
        isAssignee: true,
      }).allowed,
    ).toBe(true);
    expect(
      checkTransition({
        from: 'PENDING_VERIFICATION',
        to: 'CLOSED',
        role: 'ADMIN',
        closureEvidenceCount: 1,
      }).allowed,
    ).toBe(true);
  });
});

describe('skipping steps', () => {
  it('rejects OPEN -> CLOSED', () => {
    const result = checkTransition({
      from: 'OPEN',
      to: 'CLOSED',
      role: 'ADMIN',
      closureEvidenceCount: 3,
    });
    expect(result).toMatchObject({
      allowed: false,
      code: ERROR_CODES.INVALID_STATUS_TRANSITION,
    });
  });

  it('rejects a no-op', () => {
    expect(checkTransition({ from: 'OPEN', to: 'OPEN', role: 'ADMIN' })).toMatchObject({
      allowed: false,
      code: ERROR_CODES.INVALID_STATUS_TRANSITION,
    });
  });

  it('treats CLOSED as terminal', () => {
    expect(isTerminalStatus('CLOSED')).toBe(true);
    expect(
      checkTransition({ from: 'CLOSED', to: 'IN_PROGRESS', role: 'ADMIN' }).allowed,
    ).toBe(false);
  });
});

describe('closing', () => {
  it('is admin-only', () => {
    expect(
      checkTransition({
        from: 'PENDING_VERIFICATION',
        to: 'CLOSED',
        role: 'INSPECTOR',
        isAssignee: true,
        closureEvidenceCount: 2,
      }),
    ).toMatchObject({ allowed: false, code: ERROR_CODES.FORBIDDEN });
  });

  it('requires closure evidence', () => {
    expect(
      checkTransition({
        from: 'PENDING_VERIFICATION',
        to: 'CLOSED',
        role: 'ADMIN',
        closureEvidenceCount: 0,
      }),
    ).toMatchObject({ allowed: false, code: ERROR_CODES.CLOSURE_EVIDENCE_REQUIRED });
  });
});

describe('assignee restriction', () => {
  it('stops an inspector progressing somebody else’s action', () => {
    expect(
      checkTransition({
        from: 'ACTION_ASSIGNED',
        to: 'IN_PROGRESS',
        role: 'INSPECTOR',
        isAssignee: false,
      }),
    ).toMatchObject({ allowed: false, code: ERROR_CODES.FORBIDDEN });
  });

  it('lets an admin act on behalf of the assignee', () => {
    expect(
      checkTransition({
        from: 'ACTION_ASSIGNED',
        to: 'IN_PROGRESS',
        role: 'ADMIN',
        isAssignee: false,
      }).allowed,
    ).toBe(true);
  });
});

describe('backward moves', () => {
  it('lets an admin send a failed verification back with a note', () => {
    expect(
      checkTransition({
        from: 'PENDING_VERIFICATION',
        to: 'IN_PROGRESS',
        role: 'ADMIN',
        note: 'Barrier still missing on the east side.',
      }).allowed,
    ).toBe(true);
  });

  it('requires the note', () => {
    expect(
      checkTransition({
        from: 'PENDING_VERIFICATION',
        to: 'IN_PROGRESS',
        role: 'ADMIN',
        note: '   ',
      }),
    ).toMatchObject({ allowed: false, code: ERROR_CODES.VALIDATION_FAILED });
  });
});

describe('UI helpers', () => {
  it('lists what an inspector may do', () => {
    expect(allowedTransitionsForRole('ACTION_ASSIGNED', 'INSPECTOR', true).map((r) => r.to)).toEqual(
      ['IN_PROGRESS'],
    );
    expect(allowedTransitionsForRole('OPEN', 'INSPECTOR')).toEqual([]);
  });

  it('reports progress along the happy path', () => {
    expect(statusProgress('OPEN')).toBe(0);
    expect(statusProgress('CLOSED')).toBe(1);
    expect(statusProgress('IN_PROGRESS')).toBe(0.5);
  });
});

describe('supervisor', () => {
  it('can assign an open finding', () => {
    expect(
      checkTransition({ from: 'OPEN', to: 'ACTION_ASSIGNED', role: 'SUPERVISOR' }).allowed,
    ).toBe(true);
  });

  it('can re-open an assigned action for reassignment, with a note', () => {
    expect(
      checkTransition({
        from: 'ACTION_ASSIGNED',
        to: 'OPEN',
        role: 'SUPERVISOR',
        note: 'Wrong contractor.',
      }).allowed,
    ).toBe(true);
  });

  it('can send a failed verification back, with a note', () => {
    expect(
      checkTransition({
        from: 'PENDING_VERIFICATION',
        to: 'IN_PROGRESS',
        role: 'SUPERVISOR',
        note: 'Barrier still missing.',
      }).allowed,
    ).toBe(true);
  });

  it('cannot close, even with closure evidence', () => {
    expect(
      checkTransition({
        from: 'PENDING_VERIFICATION',
        to: 'CLOSED',
        role: 'SUPERVISOR',
        closureEvidenceCount: 3,
      }),
    ).toMatchObject({ allowed: false, code: ERROR_CODES.FORBIDDEN });
  });

  it('does not bypass the assignee restriction', () => {
    expect(
      checkTransition({ from: 'ACTION_ASSIGNED', to: 'IN_PROGRESS', role: 'SUPERVISOR' }),
    ).toMatchObject({ allowed: false, code: ERROR_CODES.FORBIDDEN });
    expect(
      checkTransition({ from: 'IN_PROGRESS', to: 'PENDING_VERIFICATION', role: 'SUPERVISOR' }),
    ).toMatchObject({ allowed: false, code: ERROR_CODES.FORBIDDEN });
  });

  it('gets the review buttons but never "close"', () => {
    expect(allowedTransitionsForRole('OPEN', 'SUPERVISOR').map((r) => r.to)).toEqual([
      'ACTION_ASSIGNED',
    ]);
    expect(
      allowedTransitionsForRole('PENDING_VERIFICATION', 'SUPERVISOR').map((r) => r.to),
    ).toEqual(['IN_PROGRESS']);
    expect(allowedTransitionsForRole('ACTION_ASSIGNED', 'SUPERVISOR').map((r) => r.to)).toEqual(
      ['OPEN'],
    );
  });
});
