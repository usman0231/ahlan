/**
 * BullMQ queues. Reports, AI generation, notifications and reminders all run
 * out of process: nothing long-running happens inside an HTTP request.
 */
export const QUEUES = {
  reports: 'reports',
  ai: 'ai',
  notifications: 'notifications',
  reminders: 'reminders',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const JOBS = {
  generateReport: 'generate-report',
  generateInsights: 'generate-insights',
  sendNotification: 'send-notification',
  fanOutNotification: 'fan-out-notification',
  actionDueSoon: 'action-due-soon',
  actionOverdue: 'action-overdue',
  eodMissing: 'eod-missing',
  eodWindowOpen: 'eod-window-open',
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];

/** Retried with backoff; a failed report should not need a human to re-request. */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 86_400, count: 500 },
  removeOnFail: { age: 604_800 },
} as const;
