/**
 * Pure helpers for the discipline and tournament forms.
 */

/** The Lucide names the discipline tiles render (see `disciplineIcon`). */
export const DISCIPLINE_ICON_NAMES = [
  'hard-hat',
  'zap',
  'construction',
  'power',
  'layout-panel-left',
  'sparkles',
] as const;

/** Palette keys a discipline may take; stored as the token name, never a hex value. */
export const DISCIPLINE_COLOR_TOKENS = [
  'accent',
  'info',
  'success',
  'warning',
  'danger',
  'primary',
] as const;
export type DisciplineColorToken = (typeof DISCIPLINE_COLOR_TOKENS)[number];

export function isColorToken(value: string | null | undefined): value is DisciplineColorToken {
  return (DISCIPLINE_COLOR_TOKENS as readonly string[]).includes(value ?? '');
}

/**
 * A URL-safe slug from an English name: "Work at Height" -> "work-at-height".
 * Matches the API rule (lowercase letters, digits, dashes, 2..48).
 */
export function slugFromName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

/** A tournament date range is valid when both are ISO dates and start <= end. */
export function tournamentRangeProblem(start: string, end: string): 'format' | 'order' | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(start) || !iso.test(end)) return 'format';
  return start <= end ? null : 'order';
}
