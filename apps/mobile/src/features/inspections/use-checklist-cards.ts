import { useMemo } from 'react';
import { Q } from '@nozbe/watermelondb';
import { stadiumChecklistProgress, zonedDateString } from '@ahlan/shared';

import { collections } from '../../db';
import type { ChecklistModel, ChecklistVersionModel } from '../../db/models/catalog';
import type { InspectionModel } from '../../db/models/field-records';
import { useRecords } from '../../hooks/use-watermelon';
import { useNow } from '../../hooks/use-now';
import { useAuthStore } from '../../store/auth';
import { useChecklistsForStadium, useStadium } from '../catalog/hooks';

export interface ChecklistCardEntry {
  checklist: ChecklistModel;
  version: ChecklistVersionModel;
  /** A SUBMITTED inspection of this checklist exists at the stadium today. */
  doneToday: boolean;
  /** The caller's open draft of this checklist at the stadium, to resume. */
  draftId: string | null;
}

/**
 * Splits checklists into readiness vs discipline/other.
 *
 * Rows pulled before schema v2 have no category until the post-migration
 * re-pull lands; until then a checklist with no discipline counts as
 * readiness, which is what the six readiness sheets are.
 */
export function isReadinessChecklist(checklist: {
  category: string | null;
  disciplineId: string | null;
}): boolean {
  return checklist.category ? checklist.category === 'READINESS' : checklist.disciplineId === null;
}

/**
 * Today's readiness checklists at one stadium, from the local database, with
 * the same "done / expected" rule as the stadium cards on the API (distinct
 * checklists with a submitted inspection today, stadium-local).
 */
export function useChecklistCards(stadiumId: string | null) {
  const userId = useAuthStore((state) => state.user?.id ?? '');
  const { stadium } = useStadium(stadiumId);
  const { checklists, loading } = useChecklistsForStadium(stadiumId);
  const now = useNow(60_000);
  const today = stadium ? zonedDateString(new Date(now), stadium.timezone) : '';

  const { records: inspections, loading: loadingInspections } = useRecords<InspectionModel>(
    () =>
      collections
        .inspections()
        .query(
          Q.where('stadium_id', stadiumId ?? ''),
          Q.or(
            Q.where('local_date', today),
            Q.and(Q.where('status', 'DRAFT'), Q.where('inspector_id', userId)),
          ),
        ),
    [stadiumId, today, userId],
  );

  return useMemo(() => {
    const entries: ChecklistCardEntry[] = checklists.flatMap(({ checklist, version }) => {
      if (!version) return [];
      const mine = inspections.filter((row) => row.checklistId === checklist.id);
      return [
        {
          checklist,
          version,
          doneToday: mine.some((row) => row.status === 'SUBMITTED' && row.localDate === today),
          draftId:
            mine
              .filter((row) => row.status === 'DRAFT' && row.inspectorId === userId)
              .sort((a, b) => b.startedAt - a.startedAt)[0]?.id ?? null,
        },
      ];
    });

    const readiness = entries.filter((entry) => isReadinessChecklist(entry.checklist));
    const others = entries.filter((entry) => !isReadinessChecklist(entry.checklist));
    const progress = stadiumChecklistProgress(
      readiness.map((entry) => entry.checklist.id),
      readiness.filter((entry) => entry.doneToday).map((entry) => entry.checklist.id),
    );

    return {
      readiness,
      others,
      progress,
      today,
      loading: loading || loadingInspections,
    };
  }, [checklists, inspections, today, userId, loading, loadingInspections]);
}
