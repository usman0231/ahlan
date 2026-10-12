import { useQuery } from '@tanstack/react-query';
import type { Evidence } from '@ahlan/shared';

import { api, ApiError } from '../../api/client';
import { useSyncStore } from '../../store/sync';

/**
 * Presigned GETs live 15 minutes (S3_PRESIGN_TTL_SECONDS=900). Refresh well
 * before that, and on any image load error (`refresh`), so a thumbnail never
 * points at an expired URL.
 */
const URL_STALE_MS = 10 * 60 * 1000;
const URL_GC_MS = 14 * 60 * 1000;

export const evidenceUrlKey = (id: string) => ['evidence', id, 'url'] as const;

/**
 * The remote URL for a photo that is no longer (or never was) on this device:
 * one uploaded and freed, or one pulled from the server.
 *
 * Asks `GET /evidence/:id` (scoped by the API) for a short-lived presigned GET.
 * Cached per evidence id by TanStack Query; the image itself is cached by
 * expo-image under the evidence id, so a refreshed URL does not re-download.
 */
export function useEvidenceImage(input: {
  id: string;
  uploaded: boolean;
  hasLocalCopy: boolean;
}) {
  const online = useSyncStore((state) => state.online);
  const enabled = input.uploaded && !input.hasLocalCopy;

  const query = useQuery({
    queryKey: evidenceUrlKey(input.id),
    queryFn: ({ signal }) => api.get<Evidence>(`/evidence/${input.id}`, undefined, signal),
    enabled: enabled && online,
    staleTime: URL_STALE_MS,
    gcTime: URL_GC_MS,
    // A 403/404 will not fix itself by retrying in a loop.
    retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    select: (dto) => dto.url ?? null,
  });

  return {
    url: query.data ?? null,
    /** Waiting for a URL we expect to get. */
    loading: enabled && online && query.isPending,
    /** Uploaded, but no URL to show: offline with nothing cached, or the API refused. */
    unavailable: enabled && !query.data && (!online || query.isError),
    refresh: () => void query.refetch(),
  };
}
