import { Q } from '@nozbe/watermelondb';
import { useMemo } from 'react';

import { collections } from '../../db';
import type {
  ChecklistItemModel,
  ChecklistModel,
  ChecklistSectionModel,
  ChecklistVersionModel,
  DisciplineModel,
  StadiumModel,
} from '../../db/models/catalog';
import { useRecords } from '../../hooks/use-watermelon';
import { useAuthStore } from '../../store/auth';

/**
 * Reference data, read from the local database.
 *
 * All of it comes from the sync pull, so an inspector who has opened the app
 * once on Wi-Fi has every checklist, discipline and stadium they need for the
 * rest of the day with no connection.
 */

/**
 * The caller's stadiums. The pull is already scoped (the API is the real
 * boundary); this only ever narrows further: a stadium the inspector was
 * unassigned from stays in the local database - the pull never deletes it -
 * so rows are also matched against the session's current `stadiumIds`.
 */
export function useStadiums() {
  const stadiumIds = useAuthStore((state) => state.user?.stadiumIds);
  const key = (stadiumIds ?? []).join(',');

  const { records, loading } = useRecords<StadiumModel>(
    () =>
      collections
        .stadiums()
        .query(
          Q.where('is_active', true),
          ...(stadiumIds ? [Q.where('id', Q.oneOf(stadiumIds))] : []),
          Q.sortBy('name', Q.asc),
        ),
    [key],
  );

  return { stadiums: records, loading };
}

export function useStadium(stadiumId: string | null | undefined) {
  const { records, loading } = useRecords<StadiumModel>(
    () => collections.stadiums().query(Q.where('id', stadiumId ?? '')),
    [stadiumId],
  );
  return { stadium: records[0] ?? null, loading };
}

export function useDisciplines() {
  const { records, loading } = useRecords<DisciplineModel>(
    () =>
      collections
        .disciplines()
        .query(Q.where('is_active', true), Q.sortBy('sort_order', Q.asc)),
    [],
  );
  return { disciplines: records, loading };
}

/** Checklists an inspector can start at a stadium, each with a published version. */
export function useChecklistsForStadium(stadiumId: string | null) {
  const { records: checklists, loading } = useRecords<ChecklistModel>(
    () =>
      collections
        .checklists()
        .query(
          Q.where('is_active', true),
          Q.where('current_version_id', Q.notEq(null)),
          Q.sortBy('title', Q.asc),
        ),
    [stadiumId],
  );

  const versionIds = checklists
    .map((checklist) => checklist.currentVersionId)
    .filter((id): id is string => Boolean(id));

  const { records: versions } = useRecords<ChecklistVersionModel>(
    () => collections.checklistVersions().query(Q.where('id', Q.oneOf(versionIds))),
    [versionIds.join(',')],
  );

  const versionById = useMemo(() => {
    const map = new Map<string, ChecklistVersionModel>();
    for (const version of versions) map.set(version.id, version);
    return map;
  }, [versions]);

  const withVersions = useMemo(
    () =>
      checklists
        .map((checklist) => ({
          checklist,
          version: checklist.currentVersionId
            ? (versionById.get(checklist.currentVersionId) ?? null)
            : null,
        }))
        // A checklist whose version has not synced yet cannot be started.
        .filter((entry) => entry.version !== null),
    [checklists, versionById],
  );

  return { checklists: withVersions, loading };
}

/** Sections and items of one version, in display order. */
export function useChecklistVersionContent(versionId: string | null) {
  const { records: sections, loading: loadingSections } = useRecords<ChecklistSectionModel>(
    () =>
      collections
        .checklistSections()
        .query(Q.where('version_id', versionId ?? ''), Q.sortBy('sort_order', Q.asc)),
    [versionId],
  );

  const { records: items, loading: loadingItems } = useRecords<ChecklistItemModel>(
    () =>
      collections
        .checklistItems()
        .query(
          Q.where('section_id', Q.oneOf(sections.map((section) => section.id))),
          Q.sortBy('sort_order', Q.asc),
        ),
    [sections.map((section) => section.id).join(',')],
  );

  const itemsBySection = useMemo(() => {
    const map = new Map<string, ChecklistItemModel[]>();
    for (const item of items) {
      const bucket = map.get(item.sectionId) ?? [];
      bucket.push(item);
      map.set(item.sectionId, bucket);
    }
    return map;
  }, [items]);

  return {
    sections,
    items,
    itemsBySection,
    loading: loadingSections || loadingItems,
  };
}
