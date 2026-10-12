/**
 * The audit reason every admin correction, delete and restore carries.
 *
 * The API refuses a missing or short reason (`adminReasonSchema`: 5..500
 * characters); checking it here first keeps the dialog from sending a request
 * that can only fail.
 */
export const REASON_MIN = 5;
export const REASON_MAX = 500;
/** Kept as names so call sites say what the reason is for. */
export const DELETE_REASON_MIN = REASON_MIN;
export const CORRECTION_REASON_MIN = REASON_MIN;

export type ReasonProblem = 'required' | 'tooShort' | 'tooLong';

export function reasonProblem(reason: string, min: number = REASON_MIN): ReasonProblem | null {
  const value = reason.trim();
  if (value.length === 0) return 'required';
  if (value.length < min) return 'tooShort';
  if (value.length > REASON_MAX) return 'tooLong';
  return null;
}
