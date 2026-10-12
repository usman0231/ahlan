import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type {
  AccessRequest,
  AiInsight,
  ApproveAccessRequestInput,
  AssignCorrectiveActionInput,
  ChecklistCompletion,
  ChecklistVersion,
  ChecklistWithVersion,
  CorrectiveAction,
  CreateStadiumInput,
  CreateUserInput,
  Dashboard,
  Discipline,
  EodComplianceRow,
  EodReport,
  EodWindowDefaultStatus,
  Finding,
  FindingStatus,
  Inspection,
  InspectionWithResponses,
  InspectorHome,
  KpiQuery,
  Paginated,
  Report,
  RequestReportInput,
  ReviewAiInsightInput,
  Role,
  Severity,
  Stadium,
  StadiumCardKpi,
  StadiumKpi,
  UpdateStadiumInput,
  UpsertEodWindowDefaultInput,
  User,
} from '@ahlan/shared';

import { api } from '../../api/client';
import { useHaptics } from '../../hooks/use-haptics';
import { useAuthStore } from '../../store/auth';
import { canManage } from './roles';

/**
 * Admin and supervisor data, read from the API through React Query.
 *
 * Deliberately not offline-first, unlike the inspector screens: a reviewer
 * works from an office on a stable connection, the figures are aggregates over
 * the whole tournament that would be pointless to compute on a phone, and
 * report generation and AI review are server-side by design. Caching these
 * locally would add a sync surface for no benefit.
 *
 * Every list is cursor-paginated (`useInfiniteQuery`), so nothing silently
 * stops at the first page.
 */

const STALE = 30_000;
const PAGE = 25;

/** Flattens an infinite query into one array for a list. */
export function flatPages<T>(data: InfiniteData<Paginated<T>> | undefined): T[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

const nextCursor = <T>(last: Paginated<T>) =>
  last.hasMore ? (last.nextCursor ?? undefined) : undefined;

function useRole(): Role | null {
  return useAuthStore((state) => state.user?.role ?? null);
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export function useDashboard(query: Partial<KpiQuery> = {}) {
  return useQuery({
    queryKey: ['dashboard', query],
    queryFn: ({ signal }) =>
      api.get<Dashboard>(
        '/kpis/dashboard',
        {
          from: query.from,
          to: query.to,
          stadiumId: query.stadiumId,
          compare: query.compare ?? true,
        },
        signal,
      ),
    staleTime: STALE,
  });
}

/** The inspector home summary; also used by the admin's stadium overview. */
export function useInspectorHome() {
  return useQuery({
    queryKey: ['inspector-home'],
    queryFn: ({ signal }) => api.get<InspectorHome>('/kpis/inspector-home', undefined, signal),
    staleTime: 15_000,
  });
}

/* -------------------------------------------------------------------------- */
/* Access requests (admin)                                                    */
/* -------------------------------------------------------------------------- */

export function useAccessRequests(status: AccessRequest['status'] = 'PENDING') {
  return useInfiniteQuery({
    queryKey: ['access-requests', status],
    queryFn: ({ signal, pageParam }) =>
      api.get<Paginated<AccessRequest>>(
        '/access-requests',
        { status, limit: PAGE, cursor: pageParam },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: STALE,
  });
}

/** Admin-only endpoint: never called for a supervisor, who would get a 403. */
export function usePendingAccessRequestCount() {
  const role = useRole();
  return useQuery({
    queryKey: ['access-requests', 'pending-count'],
    queryFn: ({ signal }) =>
      api.get<{ pending: number }>('/access-requests/pending-count', undefined, signal),
    enabled: canManage(role),
    staleTime: 60_000,
  });
}

export function useApproveAccessRequest() {
  const queryClient = useQueryClient();
  const haptics = useHaptics();

  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ApproveAccessRequestInput) =>
      api.post<User>(`/access-requests/${id}/approve`, body),
    onSuccess: async () => {
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: ['access-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => haptics.error(),
  });
}

export function useRejectAccessRequest() {
  const queryClient = useQueryClient();
  const haptics = useHaptics();

  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post<AccessRequest>(`/access-requests/${id}/reject`, { note }),
    onSuccess: async () => {
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: ['access-requests'] });
    },
    onError: () => haptics.error(),
  });
}

/* -------------------------------------------------------------------------- */
/* Users (admin)                                                              */
/* -------------------------------------------------------------------------- */

export interface UserFilters {
  search?: string;
  role?: Role | null;
  status?: User['status'] | null;
}

export function useUsers(filters: UserFilters = {}) {
  const search = filters.search?.trim() || undefined;
  return useInfiniteQuery({
    queryKey: ['users', 'list', search ?? '', filters.role ?? 'all', filters.status ?? 'all'],
    queryFn: ({ signal, pageParam }) =>
      api.get<Paginated<User>>(
        '/users',
        {
          search,
          role: filters.role ?? undefined,
          status: filters.status ?? undefined,
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

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ['users', 'detail', id],
    queryFn: ({ signal }) => api.get<User>(`/users/${id}`, undefined, signal),
    enabled: Boolean(id),
    staleTime: STALE,
  });
}

/** Shared success handling for every user mutation. */
function useUserMutationEffects() {
  const queryClient = useQueryClient();
  const haptics = useHaptics();
  return {
    onSuccess: async () => {
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['stadiums'] });
    },
    onError: () => haptics.error(),
  };
}

export function useCreateUser() {
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post<User>('/users', input),
    ...useUserMutationEffects(),
  });
}

/**
 * Saves role and stadiums together.
 *
 * The API insists a supervisor or inspector always has a stadium, so the order
 * matters: moving to a scoped role assigns the stadiums first; moving to
 * ADMIN changes the role first and only then clears the stadiums.
 */
export function useSaveUserAccess() {
  return useMutation({
    mutationFn: async (input: { user: User; role: Role; stadiumIds: string[] }): Promise<void> => {
      const { user, role, stadiumIds } = input;
      const roleChanged = role !== user.role;
      const before = [...user.stadiumIds].sort().join(',');
      const after = [...stadiumIds].sort().join(',');
      const stadiumsChanged = before !== after;

      const patchRole = () => api.patch<User>(`/users/${user.id}`, { role });
      const patchStadiums = () => api.patch<User>(`/users/${user.id}/stadiums`, { stadiumIds });

      if (role === 'ADMIN') {
        if (roleChanged) await patchRole();
        if (stadiumsChanged) await patchStadiums();
      } else {
        if (stadiumsChanged) await patchStadiums();
        if (roleChanged) await patchRole();
      }
    },
    ...useUserMutationEffects(),
  });
}

export function useSetUserStatus() {
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'SUSPENDED' }) =>
      api.patch<User>(`/users/${id}`, { status }),
    ...useUserMutationEffects(),
  });
}

export function useDeleteUser() {
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/users/${id}`),
    ...useUserMutationEffects(),
  });
}

export function useResetUserPassword() {
  const haptics = useHaptics();
  return useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      api.post<void>(`/users/${id}/reset-password`, { newPassword }),
    onSuccess: () => haptics.success(),
    onError: () => haptics.error(),
  });
}

/** Active users who cover a stadium: the assignee picker for an action. */
export function useStadiumUsers(stadiumId: string | undefined) {
  return useQuery({
    queryKey: ['users', 'by-stadium', stadiumId],
    queryFn: ({ signal }) => api.get<User[]>(`/users/by-stadium/${stadiumId}`, undefined, signal),
    enabled: Boolean(stadiumId),
    staleTime: STALE,
  });
}

/* -------------------------------------------------------------------------- */
/* Stadiums                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Every stadium the signed-in reviewer may pick.
 *
 * An administrator sees all of them, inactive ones included (an inactive
 * venue still has history to report on and users to reassign), so this walks
 * every page of `GET /stadiums`. A supervisor gets only their assigned venues.
 */
export function useAllStadiums() {
  const role = useRole();
  const admin = canManage(role);

  return useQuery({
    queryKey: ['stadiums', 'picker', admin ? 'all' : 'mine'],
    queryFn: async ({ signal }) => {
      if (!admin) return api.get<Stadium[]>('/stadiums/mine', undefined, signal);

      const all: Stadium[] = [];
      let cursor: string | undefined;
      // Bounded, so a server bug can never spin this forever.
      for (let page = 0; page < 50; page += 1) {
        const result = await api.get<Paginated<Stadium>>(
          '/stadiums',
          { limit: 100, cursor },
          signal,
        );
        all.push(...result.items);
        if (!result.hasMore || !result.nextCursor) break;
        cursor = result.nextCursor;
      }
      return all.sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: Boolean(role),
    staleTime: 300_000,
  });
}

/** @deprecated kept for older call sites; same as `useAllStadiums`. */
export const useAdminStadiums = useAllStadiums;

export function useStadiumsPage(search?: string, enabled = true) {
  const query = search?.trim() || undefined;
  return useInfiniteQuery({
    enabled,
    queryKey: ['stadiums', 'list', query ?? ''],
    queryFn: ({ signal, pageParam }) =>
      api.get<Paginated<Stadium>>(
        '/stadiums',
        { search: query, limit: PAGE, cursor: pageParam },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: STALE,
  });
}

export function useStadium(id: string | undefined) {
  return useQuery({
    queryKey: ['stadiums', 'detail', id],
    queryFn: ({ signal }) => api.get<Stadium>(`/stadiums/${id}`, undefined, signal),
    enabled: Boolean(id),
    staleTime: STALE,
  });
}

export interface StadiumAssignee {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: User['status'];
}

export function useStadiumAssignees(id: string | undefined) {
  return useQuery({
    queryKey: ['stadiums', 'assignees', id],
    queryFn: ({ signal }) =>
      api.get<StadiumAssignee[]>(`/stadiums/${id}/assignees`, undefined, signal),
    enabled: Boolean(id),
    staleTime: STALE,
  });
}

function useStadiumMutationEffects() {
  const queryClient = useQueryClient();
  const haptics = useHaptics();
  return {
    onSuccess: async () => {
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: ['stadiums'] });
    },
    onError: () => haptics.error(),
  };
}

export function useCreateStadium() {
  return useMutation({
    mutationFn: (input: CreateStadiumInput) => api.post<Stadium>('/stadiums', input),
    ...useStadiumMutationEffects(),
  });
}

export function useUpdateStadium() {
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateStadiumInput) =>
      api.patch<Stadium>(`/stadiums/${id}`, input),
    ...useStadiumMutationEffects(),
  });
}

/** Per-stadium KPIs for the stadium cards (tournament to date by default). */
export function useStadiumKpis(query: { from?: string; to?: string; stadiumId?: string } = {}) {
  return useQuery({
    queryKey: ['kpis', 'by-stadium', query],
    queryFn: ({ signal }) =>
      api.get<StadiumKpi[]>(
        '/kpis/by-stadium',
        { from: query.from, to: query.to, stadiumId: query.stadiumId, compare: false },
        signal,
      ),
    staleTime: STALE,
  });
}

export function useRecentInspections(stadiumId: string | undefined, limit = 5) {
  return useQuery({
    queryKey: ['inspections', 'recent', stadiumId, limit],
    queryFn: ({ signal }) =>
      api.get<Paginated<Inspection>>(
        '/inspections',
        { stadiumId, status: 'SUBMITTED', limit },
        signal,
      ),
    enabled: Boolean(stadiumId),
    staleTime: STALE,
  });
}

export function useRecentFindings(stadiumId: string | undefined, limit = 5) {
  return useQuery({
    queryKey: ['findings', 'recent', stadiumId, limit],
    queryFn: ({ signal }) => api.get<Paginated<Finding>>('/findings', { stadiumId, limit }, signal),
    enabled: Boolean(stadiumId),
    staleTime: STALE,
  });
}

/* -------------------------------------------------------------------------- */
/* Findings                                                                   */
/* -------------------------------------------------------------------------- */

export interface FindingFilters {
  status?: FindingStatus | null;
  stadiumId?: string | null;
  severity?: Severity | null;
  overdueOnly?: boolean;
  /** Administrator only (the API ignores it otherwise): soft-deleted rows too. */
  includeDeleted?: boolean;
}

/** Filtered on the server, so a filter never hides rows beyond the first page. */
export function useFindingsList(filters: FindingFilters) {
  return useInfiniteQuery({
    queryKey: [
      'findings',
      'list',
      filters.status ?? 'all',
      filters.stadiumId ?? 'all',
      filters.severity ?? 'all',
      Boolean(filters.overdueOnly),
      Boolean(filters.includeDeleted),
    ],
    queryFn: ({ signal, pageParam }) =>
      api.get<Paginated<Finding>>(
        '/findings',
        {
          status: filters.status ?? undefined,
          stadiumId: filters.stadiumId ?? undefined,
          severity: filters.severity ?? undefined,
          overdueOnly: filters.overdueOnly || undefined,
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

export function useFindingDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['findings', 'detail', id],
    queryFn: ({ signal }) => api.get<Finding>(`/findings/${id}`, undefined, signal),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

function useFindingMutationEffects() {
  const queryClient = useQueryClient();
  const haptics = useHaptics();
  return {
    onSuccess: async () => {
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: ['findings'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: () => haptics.error(),
  };
}

export function useAssignAction(findingId: string) {
  const { onSuccess, onError } = useFindingMutationEffects();
  return useMutation({
    mutationFn: (input: AssignCorrectiveActionInput) =>
      api.post<CorrectiveAction>(`/findings/${findingId}/actions`, input),
    onSuccess,
    onError,
  });
}

export function useTransitionFindingAction() {
  const { onSuccess, onError } = useFindingMutationEffects();
  return useMutation({
    mutationFn: ({
      actionId,
      ...body
    }: {
      actionId: string;
      to: FindingStatus;
      note?: string;
      evidenceIds: string[];
    }) => api.post<CorrectiveAction>(`/corrective-actions/${actionId}/transition`, body),
    onSuccess,
    onError,
  });
}

/* -------------------------------------------------------------------------- */
/* Reports                                                                    */
/* -------------------------------------------------------------------------- */

export function useReports() {
  return useInfiniteQuery({
    queryKey: ['reports'],
    queryFn: ({ signal, pageParam }) =>
      api.get<Paginated<Report>>('/reports', { limit: PAGE, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    // A queued report becomes ready without the user doing anything, so this
    // polls while any report is still generating.
    refetchInterval: (query) => {
      const data = query.state.data as InfiniteData<Paginated<Report>> | undefined;
      const pending = flatPages(data).some(
        (report) => report.status === 'QUEUED' || report.status === 'RUNNING',
      );
      return pending ? 4000 : false;
    },
    staleTime: 5_000,
  });
}

export function useRequestReport() {
  const queryClient = useQueryClient();
  const haptics = useHaptics();

  return useMutation({
    mutationFn: (input: RequestReportInput) => api.post<Report>('/reports', input),
    onSuccess: async () => {
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: () => haptics.error(),
  });
}

/* -------------------------------------------------------------------------- */
/* AI (admin)                                                                 */
/* -------------------------------------------------------------------------- */

export function useAiInsights(reviewStatus?: AiInsight['reviewStatus']) {
  return useInfiniteQuery({
    queryKey: ['ai-insights', reviewStatus ?? 'all'],
    queryFn: ({ signal, pageParam }) =>
      api.get<Paginated<AiInsight>>(
        '/ai/insights',
        { reviewStatus, limit: PAGE, cursor: pageParam },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    staleTime: STALE,
  });
}

export function useReviewAiInsight() {
  const queryClient = useQueryClient();
  const haptics = useHaptics();

  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ReviewAiInsightInput) =>
      api.post<AiInsight>(`/ai/insights/${id}/review`, body),
    onSuccess: async () => {
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
    },
    onError: () => haptics.error(),
  });
}

export function useGenerateAiInsights() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      kinds: AiInsight['kind'][];
      periodStart: string;
      periodEnd: string;
      stadiumId?: string | null;
    }) => api.post<{ jobId: string }>('/ai/insights/generate', input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
    },
  });
}

/** Who still owes an EOD report for a date. */
export function useEodCompliance(date: string, stadiumId?: string) {
  return useQuery({
    queryKey: ['eod-compliance', date, stadiumId ?? 'all'],
    queryFn: ({ signal }) =>
      api.get<EodComplianceRow[]>('/eod/compliance', { date, stadiumId }, signal),
    staleTime: STALE,
  });
}

/* -------------------------------------------------------------------------- */
/* EOD window and submitted reports                                           */
/* -------------------------------------------------------------------------- */

/**
 * The recurring daily EOD window (global default) with its live status.
 * Polled once a minute: "open" turns into "closed" without anyone saving.
 */
export function useEodWindowDefault() {
  return useQuery({
    queryKey: ['eod-window-default'],
    queryFn: ({ signal }) =>
      api.get<EodWindowDefaultStatus>('/eod/window-default', undefined, signal),
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}

/** Administrator only: saves the global default every stadium uses. */
export function useSaveEodWindowDefault() {
  const queryClient = useQueryClient();
  const haptics = useHaptics();
  return useMutation({
    mutationFn: (input: UpsertEodWindowDefaultInput) =>
      api.put<EodWindowDefaultStatus>('/eod/window-default', { ...input, stadiumId: null }),
    onSuccess: (saved) => {
      haptics.success();
      queryClient.setQueryData(['eod-window-default'], saved);
    },
    onError: () => haptics.error(),
  });
}

export interface EodListFilters {
  stadiumId?: string | null;
  from?: string;
  to?: string;
  /** Administrator only: soft-deleted reports too. */
  includeDeleted?: boolean;
}

/** Submitted EOD reports, newest first, paged by cursor. */
export function useEodReports(filters: EodListFilters) {
  return useInfiniteQuery({
    queryKey: [
      'eod',
      'list',
      filters.stadiumId ?? 'all',
      filters.from ?? '',
      filters.to ?? '',
      Boolean(filters.includeDeleted),
    ],
    queryFn: ({ signal, pageParam }) =>
      api.get<Paginated<EodReport>>(
        '/eod',
        {
          status: 'SUBMITTED',
          stadiumId: filters.stadiumId ?? undefined,
          from: filters.from,
          to: filters.to,
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

export function useEodReport(id: string | undefined) {
  return useQuery({
    queryKey: ['eod', 'detail', id],
    queryFn: ({ signal }) => api.get<EodReport>(`/eod/${id}`, undefined, signal),
    enabled: Boolean(id),
    staleTime: STALE,
  });
}

/* -------------------------------------------------------------------------- */
/* Checklists                                                                 */
/* -------------------------------------------------------------------------- */

/** READINESS checklists with who completed them on a date. */
export function useChecklistCompletion(date: string) {
  return useQuery({
    queryKey: ['checklists', 'completion', date],
    queryFn: ({ signal }) =>
      api.get<ChecklistCompletion[]>(
        '/checklists/completion',
        { date, category: 'READINESS' },
        signal,
      ),
    staleTime: STALE,
  });
}

/** One checklist with its published version (sections and items). */
export function useChecklistDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['checklists', 'detail', id],
    queryFn: ({ signal }) => api.get<ChecklistWithVersion>(`/checklists/${id}`, undefined, signal),
    enabled: Boolean(id),
    staleTime: 300_000,
  });
}

/** A submitted inspection with every answer, for the read-only review. */
export function useInspectionDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['inspections', 'detail', id],
    queryFn: ({ signal }) =>
      api.get<InspectionWithResponses>(`/inspections/${id}`, undefined, signal),
    enabled: Boolean(id),
    staleTime: STALE,
  });
}

/* -------------------------------------------------------------------------- */
/* Stadium cards and disciplines                                              */
/* -------------------------------------------------------------------------- */

/** "x/6 checklists today", open findings, compliance and inspectors per stadium. */
export function useStadiumCards(date?: string) {
  return useQuery({
    queryKey: ['kpis', 'stadium-cards', date ?? 'today'],
    queryFn: ({ signal }) => api.get<StadiumCardKpi[]>('/kpis/stadium-cards', { date }, signal),
    staleTime: STALE,
  });
}

export function useDisciplines() {
  return useQuery({
    queryKey: ['disciplines'],
    queryFn: ({ signal }) => api.get<Discipline[]>('/disciplines', undefined, signal),
    staleTime: 300_000,
  });
}

/** The exact checklist version an inspection was answered against. */
export function useChecklistVersion(versionId: string | undefined) {
  return useQuery({
    queryKey: ['checklists', 'version', versionId],
    queryFn: ({ signal }) =>
      api.get<ChecklistVersion>(`/checklists/versions/${versionId}`, undefined, signal),
    enabled: Boolean(versionId),
    staleTime: Infinity,
  });
}
