/**
 * The finding / corrective-action state machine.
 *
 * One definition, used by the API to authorise a change and by the app to decide
 * which buttons to show, so the two can never disagree about what is allowed.
 */

import { ERROR_CODES, type ErrorCode } from './errors';
import { type FindingStatus, type Role } from './enums';

export interface TransitionRule {
  to: FindingStatus;
  /** Roles permitted to make this move. */
  roles: readonly Role[];
  /** Closure evidence must exist before the move is accepted. */
  requiresClosureEvidence?: boolean;
  /** Only the user the action is assigned to may make this move. */
  assigneeOnly?: boolean;
  /** A note explaining the move is mandatory (used for rejections). */
  requiresNote?: boolean;
}

/**
 * OPEN -> ACTION_ASSIGNED -> IN_PROGRESS -> PENDING_VERIFICATION -> CLOSED,
 * plus the two backward moves a reviewer needs in practice.
 *
 * A supervisor reviews like an admin for their own stadiums (assign, re-open for
 * reassignment, send back) but can never close: CLOSED stays admin-only.
 */
export const TRANSITIONS: Readonly<Record<FindingStatus, readonly TransitionRule[]>> = Object.freeze({
  OPEN: [{ to: 'ACTION_ASSIGNED', roles: ['ADMIN', 'SUPERVISOR'] }],
  ACTION_ASSIGNED: [
    { to: 'IN_PROGRESS', roles: ['ADMIN', 'INSPECTOR'], assigneeOnly: true },
    // Re-open so the action can be reassigned to somebody else.
    { to: 'OPEN', roles: ['ADMIN', 'SUPERVISOR'], requiresNote: true },
  ],
  IN_PROGRESS: [
    { to: 'PENDING_VERIFICATION', roles: ['ADMIN', 'INSPECTOR'], assigneeOnly: true },
  ],
  PENDING_VERIFICATION: [
    { to: 'CLOSED', roles: ['ADMIN'], requiresClosureEvidence: true },
    // Verification failed: the fix was not good enough.
    { to: 'IN_PROGRESS', roles: ['ADMIN', 'SUPERVISOR'], requiresNote: true },
  ],
  CLOSED: [],
});

export interface TransitionContext {
  from: FindingStatus;
  to: FindingStatus;
  role: Role;
  /** True when the acting user is the assignee of the corrective action. */
  isAssignee?: boolean;
  closureEvidenceCount?: number;
  note?: string | null;
}

export type TransitionResult =
  | { allowed: true; rule: TransitionRule }
  | { allowed: false; code: ErrorCode; message: string };

export function allowedTransitions(from: FindingStatus): readonly TransitionRule[] {
  return TRANSITIONS[from];
}

/** Transitions a given role may perform from `from`, for rendering action buttons. */
export function allowedTransitionsForRole(
  from: FindingStatus,
  role: Role,
  isAssignee = false,
): readonly TransitionRule[] {
  return allowedTransitions(from).filter(
    (rule) => rule.roles.includes(role) && (!rule.assigneeOnly || isAssignee || role === 'ADMIN'),
  );
}

export function checkTransition(context: TransitionContext): TransitionResult {
  const { from, to, role } = context;

  if (from === to) {
    return {
      allowed: false,
      code: ERROR_CODES.INVALID_STATUS_TRANSITION,
      message: `Status is already ${to}.`,
    };
  }

  const rule = allowedTransitions(from).find((candidate) => candidate.to === to);
  if (!rule) {
    return {
      allowed: false,
      code: ERROR_CODES.INVALID_STATUS_TRANSITION,
      message: `Cannot move from ${from} to ${to}.`,
    };
  }

  if (!rule.roles.includes(role)) {
    return {
      allowed: false,
      code: ERROR_CODES.FORBIDDEN,
      message: `Role ${role} cannot move a finding from ${from} to ${to}.`,
    };
  }

  // An admin can act on behalf of the assignee; nobody else can (supervisors included).
  if (rule.assigneeOnly && role !== 'ADMIN' && context.isAssignee !== true) {
    return {
      allowed: false,
      code: ERROR_CODES.FORBIDDEN,
      message: 'Only the assigned user can progress this corrective action.',
    };
  }

  if (rule.requiresClosureEvidence && (context.closureEvidenceCount ?? 0) < 1) {
    return {
      allowed: false,
      code: ERROR_CODES.CLOSURE_EVIDENCE_REQUIRED,
      message: 'At least one closure evidence photo is required before closing.',
    };
  }

  if (rule.requiresNote && (context.note ?? '').trim().length === 0) {
    return {
      allowed: false,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: 'A note is required to explain this change.',
    };
  }

  return { allowed: true, rule };
}

export function isTerminalStatus(status: FindingStatus): boolean {
  return allowedTransitions(status).length === 0;
}

/** Zero-based position in the happy path, for progress indicators. */
export const STATUS_ORDER: readonly FindingStatus[] = [
  'OPEN',
  'ACTION_ASSIGNED',
  'IN_PROGRESS',
  'PENDING_VERIFICATION',
  'CLOSED',
];

export function statusProgress(status: FindingStatus): number {
  const index = STATUS_ORDER.indexOf(status);
  return index < 0 ? 0 : index / (STATUS_ORDER.length - 1);
}
