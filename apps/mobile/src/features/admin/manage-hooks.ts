import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  Checklist,
  ChecklistWithVersion,
  CorrectEodInput,
  CorrectInspectionInput,
  CorrectObservationInput,
  CreateChecklistInput,
  CreateChecklistVersionInput,
  CreateDisciplineInput,
  CreateTournamentInput,
  Discipline,
  EodReport,
  Finding,
  InspectionWithResponses,
  Observation,
  ObservationType,
  Paginated,
  Severity,
  Stadium,
  Tournament,
  UpdateChecklistMetaInput,
  UpdateDisciplineInput,
  UpdateFindingInput,
  UpdateTournamentInput,
} from '@ahlan/shared';

import { api, request } from '../../api/client';
import { useHaptics } from '../../hooks/use-haptics';
import { removeStadiumPhoto, uploadStadiumPhoto } from './stadium-photo';
import { recordInvalidationKeys, type HseRecordKind } from './record-keys';

export { recordInvalidationKeys, type HseRecordKind } from './record-keys';

/**
 * Administrator mutations: full create / edit / delete on the catalogue
 * (stadiums, checklists, disciplines, tournaments), reports and AI insights,
 * plus correct / soft delete / restore on HSE records. Every destructive call
 * carries the audit reason the API requires.
 */

const PAGE = 25;
const STALE = 30_000;

const nextCursor = <T>(last: Paginated<T>) =>
  last.hasMore ? (last.nextCursor ?? undefined) : undefined;

/** Success: haptic + invalidate every listed key. Failure: error haptic. */
function useEffects(keys: QueryKey[]) {
  const queryClient = useQueryClient();
  const haptics = useHaptics();
  return {
    onSuccess: async () => {
      haptics.success();
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
    onError: () => haptics.error(),
  };
}

const deleteWithReason = (path: string, reason?: string) =>
  request<void>(path, { method: 'DELETE', body: reason ? { reason } : undefined });

/* -------------------------------------------------------------------------- */
/* Stadiums                                                                   */
/* -------------------------------------------------------------------------- */

const STADIUM_KEYS: QueryKey[] = [['stadiums'], ['kpis']];

export function useDeleteStadium() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      deleteWithReason(`/stadiums/${id}`, reason),
    ...useEffects(STADIUM_KEYS),
  });
}

export function useUploadStadiumPhoto() {
  return useMutation({
    mutationFn: (input: { stadiumId: string; sourceUri: string }) => uploadStadiumPhoto(input),
    ...useEffects(STADIUM_KEYS),
  });
}

export function useRemoveStadiumPhoto() {
  return useMutation({
    mutationFn: (stadiumId: string): Promise<Stadium> => removeStadiumPhoto(stadiumId),
    ...useEffects(STADIUM_KEYS),
  });
}

/* -------------------------------------------------------------------------- */
/* Checklists                                                                 */
/* -------------------------------------------------------------------------- */

export interface ChecklistFilters {
  search?: string;
  category?: Checklist['category'] | null;
}

export function useChecklistsPage(filters: ChecklistFilters = {}) {
  const search = filters.search?.trim() || undefined;
  return useInfiniteQuery({
    queryKey: ['checklists', 'list', search ?? '', filters.category ?? 'all'],
    queryFn: ({ signal, pageParam }) =>
      api.get<Paginated<Checklist>>(
        '/checklists',
        { search, category: filters.category ?? undefined, limit: PAGE, cursor: pageParam },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: STALE,
  });
}

export interface ChecklistVersionSummary {
  id: string;
  version: number;
  isPublished: boolean;
  publishedAt: string | null;
  itemCount: number;
  createdAt: string;
}

export function useChecklistVersions(id: string | undefined) {
  return useQuery({
    queryKey: ['checklists', 'versions', id],
    queryFn: ({ signal }) =>
      api.get<ChecklistVersionSummary[]>(`/checklists/${id}/versions`, undefined, signal),
    enabled: Boolean(id),
    staleTime: STALE,
  });
}

const CHECKLIST_KEYS: QueryKey[] = [['checklists'], ['kpis']];

export function useCreateChecklist() {
  return useMutation({
    mutationFn: (input: CreateChecklistInput) =>
      api.post<ChecklistWithVersion>('/checklists', input),
    ...useEffects(CHECKLIST_KEYS),
  });
}

export function useUpdateChecklistMeta() {
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateChecklistMetaInput) =>
      api.patch<ChecklistWithVersion>(`/checklists/${id}`, input),
    ...useEffects(CHECKLIST_KEYS),
  });
}

export function useCreateChecklistVersion() {
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & CreateChecklistVersionInput) =>
      api.post<ChecklistWithVersion>(`/checklists/${id}/versions`, input),
    ...useEffects(CHECKLIST_KEYS),
  });
}

export function usePublishChecklistVersion() {
  return useMutation({
    mutationFn: (versionId: string) =>
      api.post<ChecklistWithVersion>(`/checklists/versions/${versionId}/publish`),
    ...useEffects(CHECKLIST_KEYS),
  });
}

export function useDeleteChecklist() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      deleteWithReason(`/checklists/${id}`, reason),
    ...useEffects(CHECKLIST_KEYS),
  });
}

/* -------------------------------------------------------------------------- */
/* Disciplines                                                                */
/* -------------------------------------------------------------------------- */

/** Every discipline including inactive ones (the management list). */
export function useManagedDisciplines() {
  return useQuery({
    queryKey: ['disciplines', 'all'],
    queryFn: ({ signal }) =>
      api.get<Discipline[]>('/disciplines', { includeInactive: true }, signal),
    staleTime: STALE,
  });
}

const DISCIPLINE_KEYS: QueryKey[] = [['disciplines'], ['kpis']];

export function useCreateDiscipline() {
  return useMutation({
    mutationFn: (input: CreateDisciplineInput) => api.post<Discipline>('/disciplines', input),
    ...useEffects(DISCIPLINE_KEYS),
  });
}

export function useUpdateDiscipline() {
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateDisciplineInput) =>
      api.patch<Discipline>(`/disciplines/${id}`, input),
    ...useEffects(DISCIPLINE_KEYS),
  });
}

export function useDeleteDiscipline() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      deleteWithReason(`/disciplines/${id}`, reason),
    ...useEffects(DISCIPLINE_KEYS),
  });
}

/* -------------------------------------------------------------------------- */
/* Tournaments                                                                */
/* -------------------------------------------------------------------------- */

export function useTournaments() {
  return useQuery({
    queryKey: ['tournaments'],
    queryFn: ({ signal }) => api.get<Tournament[]>('/tournaments', undefined, signal),
    staleTime: STALE,
  });
}

/** Changing the active tournament moves every KPI and report anchor. */
const TOURNAMENT_KEYS: QueryKey[] = [['tournaments'], ['kpis'], ['dashboard']];

export function useCreateTournament() {
  return useMutation({
    mutationFn: (input: CreateTournamentInput) => api.post<Tournament>('/tournaments', input),
    ...useEffects(TOURNAMENT_KEYS),
  });
}

export function useUpdateTournament() {
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateTournamentInput) =>
      api.patch<Tournament>(`/tournaments/${id}`, input),
    ...useEffects(TOURNAMENT_KEYS),
  });
}

export function useActivateTournament() {
  return useMutation({
    mutationFn: (id: string) => api.post<Tournament>(`/tournaments/${id}/activate`),
    ...useEffects(TOURNAMENT_KEYS),
  });
}

export function useDeleteTournament() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      deleteWithReason(`/tournaments/${id}`, reason),
    ...useEffects(TOURNAMENT_KEYS),
  });
}

/* -------------------------------------------------------------------------- */
/* Reports and AI insights                                                    */
/* -------------------------------------------------------------------------- */

export function useDeleteReport() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      deleteWithReason(`/reports/${id}`, reason),
    ...useEffects([['reports']]),
  });
}

export function useDeleteAiInsight() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      deleteWithReason(`/ai/insights/${id}`, reason),
    ...useEffects([['ai-insights']]),
  });
}

/* -------------------------------------------------------------------------- */
/* HSE records: correct, soft delete, restore                                 */
/* -------------------------------------------------------------------------- */

export function useSoftDeleteRecord(kind: HseRecordKind) {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      deleteWithReason(`/${kind}/${id}`, reason),
    ...useEffects(recordInvalidationKeys(kind)),
  });
}

export function useRestoreRecord(kind: HseRecordKind) {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<unknown>(`/${kind}/${id}/restore`, { reason }),
    ...useEffects(recordInvalidationKeys(kind)),
  });
}

export function useCorrectFinding() {
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateFindingInput) =>
      api.patch<Finding>(`/findings/${id}`, input),
    ...useEffects(recordInvalidationKeys('findings')),
  });
}

export function useCorrectInspection() {
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & CorrectInspectionInput) =>
      api.patch<InspectionWithResponses>(`/inspections/${id}/correct`, input),
    ...useEffects(recordInvalidationKeys('inspections')),
  });
}

export function useCorrectObservation() {
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & CorrectObservationInput) =>
      api.patch<Observation>(`/observations/${id}/correct`, input),
    ...useEffects(recordInvalidationKeys('observations')),
  });
}

export function useCorrectEod() {
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & CorrectEodInput) =>
      api.patch<EodReport>(`/eod/${id}/correct`, input),
    ...useEffects(recordInvalidationKeys('eod')),
  });
}

/* -------------------------------------------------------------------------- */
/* Observations (reviewer list + detail)                                      */
/* -------------------------------------------------------------------------- */

export interface ObservationFilters {
  stadiumId?: string | null;
  disciplineId?: string | null;
  type?: ObservationType | null;
  severity?: Severity | null;
  includeDeleted?: boolean;
}

export function useObservationsList(filters: ObservationFilters) {
  return useInfiniteQuery({
    queryKey: [
      'observations',
      'list',
      filters.stadiumId ?? 'all',
      filters.disciplineId ?? 'all',
      filters.type ?? 'all',
      filters.severity ?? 'all',
      Boolean(filters.includeDeleted),
    ],
    queryFn: ({ signal, pageParam }) =>
      api.get<Paginated<Observation>>(
        '/observations',
        {
          status: 'SUBMITTED',
          stadiumId: filters.stadiumId ?? undefined,
          disciplineId: filters.disciplineId ?? undefined,
          type: filters.type ?? undefined,
          severity: filters.severity ?? undefined,
          includeDeleted: filters.includeDeleted || undefined,
          limit: PAGE,
          cursor: pageParam,
        },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: STALE,
  });
}

export function useObservationDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['observations', 'detail', id],
    queryFn: ({ signal }) => api.get<Observation>(`/observations/${id}`, undefined, signal),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}
