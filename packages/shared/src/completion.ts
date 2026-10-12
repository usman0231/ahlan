/**
 * Checklist completion rules behind the stadium cards ("4 / 6 done today") and
 * the admin checklist completion view. Pure functions so the app can show the
 * same figures offline.
 */

import type { ChecklistCategory } from './enums';
import { roundTo } from './kpi';

/** A checklist with no stadium rows applies to every stadium. */
export function checklistAppliesToStadium(
  checklistStadiumIds: readonly string[],
  stadiumId: string,
): boolean {
  return checklistStadiumIds.length === 0 || checklistStadiumIds.includes(stadiumId);
}

export interface CompletionChecklist {
  id: string;
  category: ChecklistCategory;
  isActive: boolean;
  /** Empty = all stadiums. */
  stadiumIds: readonly string[];
}

/** The active READINESS checklists that apply to a stadium. */
export function readinessChecklistsFor<T extends CompletionChecklist>(
  checklists: readonly T[],
  stadiumId: string,
): T[] {
  return checklists.filter(
    (checklist) =>
      checklist.isActive &&
      checklist.category === 'READINESS' &&
      checklistAppliesToStadium(checklist.stadiumIds, stadiumId),
  );
}

/**
 * Stadium card progress: distinct expected checklists with at least one
 * SUBMITTED inspection at the stadium that day / number expected.
 */
export function stadiumChecklistProgress(
  expectedChecklistIds: readonly string[],
  submittedChecklistIds: readonly string[],
): { done: number; expected: number; percent: number | null } {
  const expected = new Set(expectedChecklistIds);
  const done = new Set(submittedChecklistIds.filter((id) => expected.has(id))).size;
  return { done, expected: expected.size, percent: progressPercent(done, expected.size) };
}

/** done / expected as a 2dp percentage; null when nothing is expected. */
export function progressPercent(done: number, expected: number): number | null {
  if (expected <= 0) return null;
  return roundTo((Math.min(done, expected) / expected) * 100);
}

export interface CompletionAssignment {
  userId: string;
  fullName: string;
  stadiumId: string;
  stadiumCode: string;
}

export interface CompletionSubmission {
  inspectorId: string;
  stadiumId: string;
  inspectionId: string;
}

export interface CompletionRow extends CompletionAssignment {
  status: 'COMPLETED' | 'PENDING';
  inspectionId: string | null;
}

/**
 * Per-checklist completion for a day. One slot is expected per active inspector
 * per assigned stadium the checklist applies to; a slot is COMPLETED when that
 * inspector submitted an inspection of the checklist at that stadium.
 * `assignments` must already be limited to active inspectors.
 */
export function checklistCompletionFor(
  checklistStadiumIds: readonly string[],
  assignments: readonly CompletionAssignment[],
  submissions: readonly CompletionSubmission[],
): { expected: number; completed: number; pending: number; inspectors: CompletionRow[] } {
  const done = new Map<string, string>();
  for (const submission of submissions) {
    const key = `${submission.inspectorId}:${submission.stadiumId}`;
    if (!done.has(key)) done.set(key, submission.inspectionId);
  }

  const inspectors: CompletionRow[] = [];
  const seen = new Set<string>();
  for (const assignment of assignments) {
    if (!checklistAppliesToStadium(checklistStadiumIds, assignment.stadiumId)) continue;
    const key = `${assignment.userId}:${assignment.stadiumId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const inspectionId = done.get(key) ?? null;
    inspectors.push({
      ...assignment,
      status: inspectionId ? 'COMPLETED' : 'PENDING',
      inspectionId,
    });
  }

  const completed = inspectors.filter((row) => row.status === 'COMPLETED').length;
  return { expected: inspectors.length, completed, pending: inspectors.length - completed, inspectors };
}
