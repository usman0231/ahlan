import { progressPercent, type ChecklistCompletion } from '@ahlan/shared';

/**
 * Summaries over `GET /checklists/completion`, kept pure for tests.
 *
 * The API owns the per-checklist figures (expected = active inspectors x
 * assigned stadiums the checklist applies to); this only adds them up and
 * orders them for the screen.
 */

export interface CompletionTotals {
  expected: number;
  completed: number;
  pending: number;
  /** completed / expected x 100, 2dp; null when nothing is expected. */
  percent: number | null;
}

export function summariseCompletion(rows: readonly ChecklistCompletion[]): CompletionTotals {
  let expected = 0;
  let completed = 0;
  for (const row of rows) {
    expected += row.expected;
    completed += Math.min(row.completed, row.expected);
  }
  return {
    expected,
    completed,
    pending: Math.max(0, expected - completed),
    percent: progressPercent(completed, expected),
  };
}

/** 0..1 for a progress bar. */
export function completionRatio(row: Pick<ChecklistCompletion, 'completed' | 'expected'>): number {
  if (row.expected <= 0) return 0;
  return Math.min(1, Math.max(0, row.completed / row.expected));
}

/**
 * Pending first (who still owes it is the point of the list), then by stadium
 * code and name, so the order is stable across refreshes.
 */
export function sortCompletionInspectors<
  T extends { status: 'COMPLETED' | 'PENDING'; stadiumCode: string; fullName: string },
>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'PENDING' ? -1 : 1;
    const byCode = a.stadiumCode.localeCompare(b.stadiumCode);
    if (byCode !== 0) return byCode;
    return a.fullName.localeCompare(b.fullName);
  });
}

/** The mockup tints each template card in turn: blue, amber, green, red. */
export const TEMPLATE_TONES = ['info', 'warning', 'success', 'danger'] as const;
export type TemplateTone = (typeof TEMPLATE_TONES)[number];

export function templateTone(index: number): TemplateTone {
  const safe = Number.isFinite(index) && index >= 0 ? Math.trunc(index) : 0;
  return TEMPLATE_TONES[safe % TEMPLATE_TONES.length] ?? 'info';
}
