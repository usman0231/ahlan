import { useQuery } from '@tanstack/react-query';
import type { DisciplineDashboard, StadiumCardKpi } from '@ahlan/shared';

import { api } from '../../api/client';

/**
 * Server-computed KPIs for the inspector workspace. These aggregate across
 * every inspector's records at a stadium, which the device does not hold, so
 * they come from the API; screens fall back to local data or an offline state.
 */

/** `GET /kpis/stadium-cards` - scoped to the caller's stadiums by the API. */
export function useStadiumCards(date?: string) {
  return useQuery({
    queryKey: ['kpis', 'stadium-cards', date ?? 'today'],
    queryFn: ({ signal }) =>
      api.get<StadiumCardKpi[]>('/kpis/stadium-cards', date ? { date } : undefined, signal),
    staleTime: 30_000,
  });
}

export interface DisciplineDashboardRange {
  from?: string;
  to?: string;
  stadiumId?: string;
}

/** `GET /kpis/disciplines/:id` - one HSE observation discipline's dashboard. */
export function useDisciplineDashboard(disciplineId: string | null, range: DisciplineDashboardRange) {
  return useQuery({
    queryKey: ['kpis', 'discipline', disciplineId, range.from ?? '', range.to ?? '', range.stadiumId ?? ''],
    queryFn: ({ signal }) =>
      api.get<DisciplineDashboard>(
        `/kpis/disciplines/${disciplineId ?? ''}`,
        {
          ...(range.from ? { from: range.from } : {}),
          ...(range.to ? { to: range.to } : {}),
          ...(range.stadiumId ? { stadiumId: range.stadiumId } : {}),
        },
        signal,
      ),
    enabled: Boolean(disciplineId),
    staleTime: 30_000,
  });
}
