import type { QueryKey } from '@tanstack/react-query';

export type HseRecordKind = 'inspections' | 'observations' | 'findings' | 'eod';

/**
 * What a correction, delete or restore of one kind of HSE record can move.
 *
 * Deleting an inspection or observation also hides the findings it raised,
 * so findings refresh too; every kind feeds the dashboard, stadium cards and
 * KPIs, which leave out soft-deleted records.
 */
export function recordInvalidationKeys(kind: HseRecordKind): QueryKey[] {
  const shared: QueryKey[] = [['dashboard'], ['kpis'], ['inspector-home']];
  switch (kind) {
    case 'inspections':
      return [['inspections'], ['checklists'], ['findings'], ['eod'], ...shared];
    case 'observations':
      return [['observations'], ['findings'], ['eod'], ...shared];
    case 'findings':
      return [['findings'], ...shared];
    case 'eod':
      return [['eod'], ['eod-compliance'], ...shared];
  }
}
