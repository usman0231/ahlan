/**
 * Canonical enum values shared by the API (Prisma) and the mobile app.
 * These strings are persisted, so changing a value is a breaking migration.
 */

/**
 * `ADMIN` sees and manages everything. `SUPERVISOR` reviews the stadiums assigned
 * to them (no field data entry, cannot close actions). `INSPECTOR` does the field work.
 */
export const ROLES = ['ADMIN', 'SUPERVISOR', 'INSPECTOR'] as const;
export type Role = (typeof ROLES)[number];

/** Everyone except an admin is limited to the stadiums assigned to them. */
export function isStadiumScopedRole(role: Role): boolean {
  return role !== 'ADMIN';
}

/** A stadium-scoped user with no stadium would see nothing, so one is required. */
export function requiresStadiumAssignment(role: Role): boolean {
  return isStadiumScopedRole(role);
}

/** User statuses an admin may set directly; `PENDING` only comes from an access request. */
export const ADMIN_SETTABLE_USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type AdminSettableUserStatus = (typeof ADMIN_SETTABLE_USER_STATUSES)[number];

export const USER_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ACCESS_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];

/** Checklist answer. `NA` is excluded from compliance maths. */
export const RESPONSE_VALUES = ['YES', 'NO', 'NA'] as const;
export type ResponseValue = (typeof RESPONSE_VALUES)[number];

/**
 * What a checklist is for. `READINESS` checklists are the daily stadium safety
 * readiness sheets every stadium completes (they drive the "x / 6 done today"
 * progress); `DISCIPLINE` checklists belong to an HSE observation discipline.
 */
export const CHECKLIST_CATEGORIES = ['READINESS', 'DISCIPLINE', 'GENERAL'] as const;
export type ChecklistCategory = (typeof CHECKLIST_CATEGORIES)[number];

/** EOD window state as shown on the admin EOD screen. */
export const EOD_WINDOW_STATES = ['OPEN', 'CLOSED', 'DISABLED'] as const;
export type EodWindowState = (typeof EOD_WINDOW_STATES)[number];

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const RISK_RATINGS = ['LOW', 'MODERATE', 'HIGH', 'EXTREME'] as const;
export type RiskRating = (typeof RISK_RATINGS)[number];

export const OBSERVATION_TYPES = ['UNSAFE_ACT', 'UNSAFE_CONDITION', 'POSITIVE', 'NEAR_MISS'] as const;
export type ObservationType = (typeof OBSERVATION_TYPES)[number];

/**
 * Finding lifecycle. `OVERDUE` is never stored - it is derived from the due date
 * of the finding's corrective action (see `isOverdue`).
 */
export const FINDING_STATUSES = [
  'OPEN',
  'ACTION_ASSIGNED',
  'IN_PROGRESS',
  'PENDING_VERIFICATION',
  'CLOSED',
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/** Corrective actions follow the same lifecycle as the finding they resolve. */
export const CORRECTIVE_ACTION_STATUSES = FINDING_STATUSES;
export type CorrectiveActionStatus = FindingStatus;

export const SUBMISSION_STATUSES = ['DRAFT', 'SUBMITTED'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const EVIDENCE_KINDS = ['PHOTO', 'DOCUMENT'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_CONTEXTS = [
  'INSPECTION_RESPONSE',
  'OBSERVATION',
  'FINDING',
  'CORRECTIVE_ACTION_PROGRESS',
  'CORRECTIVE_ACTION_CLOSURE',
  'EOD',
] as const;
export type EvidenceContext = (typeof EVIDENCE_CONTEXTS)[number];

export const EVIDENCE_UPLOAD_STATUSES = ['PENDING', 'UPLOADED', 'FAILED'] as const;
export type EvidenceUploadStatus = (typeof EVIDENCE_UPLOAD_STATUSES)[number];

export const REPORT_TYPES = ['WEEKLY', 'CUMULATIVE', 'END_OF_TOURNAMENT'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_SCOPES = ['CONSOLIDATED', 'STADIUM'] as const;
export type ReportScope = (typeof REPORT_SCOPES)[number];

export const JOB_STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const AI_INSIGHT_KINDS = [
  'TREND_SUMMARY',
  'RISK_FORECAST',
  'RECOMMENDATION',
  'ANOMALY',
] as const;
export type AiInsightKind = (typeof AI_INSIGHT_KINDS)[number];

export const AI_REVIEW_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;
export type AiReviewStatus = (typeof AI_REVIEW_STATUSES)[number];

export const NOTIFICATION_KINDS = [
  'ACCESS_REQUEST_SUBMITTED',
  'ACCESS_REQUEST_APPROVED',
  'ACCESS_REQUEST_REJECTED',
  'FINDING_ASSIGNED',
  'ACTION_DUE_SOON',
  'ACTION_OVERDUE',
  'EOD_WINDOW_OPEN',
  'EOD_MISSING',
  'REPORT_READY',
  'AI_INSIGHT_READY',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'SUBMIT',
  'ADMIN_CORRECTION',
  'STATUS_CHANGE',
  'APPROVE',
  'REJECT',
  'LOGIN',
  'LOGOUT',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Sync state is device-local (WatermelonDB) and never sent to the server. */
export const SYNC_STATES = ['LOCAL', 'SYNCING', 'SYNCED', 'FAILED'] as const;
export type SyncState = (typeof SYNC_STATES)[number];

/** Seeded discipline slugs. The table is the source of truth; these are the seed keys. */
export const DISCIPLINE_SLUGS = [
  'work-at-height',
  'electrical-safety',
  'excavation',
  'power-infrastructure',
  'overlay-temporary-infrastructure',
  'housekeeping',
] as const;
export type DisciplineSlug = (typeof DISCIPLINE_SLUGS)[number];
