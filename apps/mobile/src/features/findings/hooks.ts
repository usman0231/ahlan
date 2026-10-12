import { Q } from '@nozbe/watermelondb';
import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  allowedTransitionsForRole,
  type Finding,
  type FindingStatus,
  type Severity,
  type TransitionCorrectiveActionInput,
} from '@ahlan/shared';

import { api } from '../../api/client';
import { collections } from '../../db';
import type { CorrectiveActionModel, FindingModel } from '../../db/models/field-records';
import { useRecords } from '../../hooks/use-watermelon';
import { useAuthStore } from '../../store/auth';
import { runSync } from '../../db/sync';
import { useHaptics } from '../../hooks/use-haptics';

export interface FindingFilters {
  stadiumId?: string | null;
  severity?: Severity | null;
  status?: FindingStatus | null;
  overdueOnly?: boolean;
  assignedToMe?: boolean;
}

/**
 * Findings, read from the local database.
 *
 * Read locally rather than from the API so an inspector can see what is open at
 * their stadium while standing in it with no signal. The overdue filter is
 * applied in JS because OVERDUE is derived from the due date, not a stored
 * status - which is the same reason the API expresses it as a predicate.
 */
export function useFindings(filters: FindingFilters = {}) {
  const userId = useAuthStore((state) => state.user?.id ?? '');

  const { records: findings, loading } = useRecords<FindingModel>(
    () =>
      collections
        .findings()
        .query(
          ...(filters.stadiumId ? [Q.where('stadium_id', filters.stadiumId)] : []),
          ...(filters.severity ? [Q.where('severity', filters.severity)] : []),
          ...(filters.status ? [Q.where('status', filters.status)] : []),
          Q.sortBy('raised_at', Q.desc),
          Q.take(300),
        ),
    [filters.stadiumId, filters.severity, filters.status],
  );

  const { records: actions } = useRecords<CorrectiveActionModel>(
    () =>
      collections
        .correctiveActions()
        .query(Q.where('finding_id', Q.oneOf(findings.map((finding) => finding.id)))),
    [findings.map((finding) => finding.id).join(',')],
  );

  const actionsByFinding = useMemo(() => {
    const map = new Map<string, CorrectiveActionModel[]>();
    for (const action of actions) {
      const bucket = map.get(action.findingId) ?? [];
      bucket.push(action);
      map.set(action.findingId, bucket);
    }
    return map;
  }, [actions]);

  const rows = useMemo(() => {
    return findings
      .map((finding) => {
        const findingActions = actionsByFinding.get(finding.id) ?? [];
        return {
          finding,
          actions: findingActions,
          isOverdue: findingActions.some((action) => action.isOverdue),
          assignedToMe: findingActions.some(
            (action) => action.assigneeId === userId && action.status !== 'CLOSED',
          ),
        };
      })
      .filter((row) => (filters.overdueOnly ? row.isOverdue : true))
      .filter((row) => (filters.assignedToMe ? row.assignedToMe : true));
  }, [findings, actionsByFinding, userId, filters.overdueOnly, filters.assignedToMe]);

  return { rows, loading };
}

export function useFinding(findingId: string) {
  const { records, loading } = useRecords<FindingModel>(
    () => collections.findings().query(Q.where('id', findingId)),
    [findingId],
  );

  const { records: actions } = useRecords<CorrectiveActionModel>(
    () =>
      collections
        .correctiveActions()
        .query(Q.where('finding_id', findingId), Q.sortBy('created_at', Q.asc)),
    [findingId],
  );

  return { finding: records[0] ?? null, actions, loading };
}

/**
 * Moves a corrective action to its next status.
 *
 * Status changes go to the API rather than being written locally: the
 * transition has to be authorised server-side, the closure-evidence rule has to
 * be checked against what actually landed in storage, and only an admin may
 * reach CLOSED. Offline, the button is disabled rather than queueing a change
 * that might be rejected later.
 */
export function useTransitionAction(findingId: string) {
  const queryClient = useQueryClient();
  const haptics = useHaptics();

  return useMutation({
    mutationFn: async (input: { actionId: string } & TransitionCorrectiveActionInput) => {
      const { actionId, ...body } = input;
      return api.post<Finding>(`/corrective-actions/${actionId}/transition`, body);
    },
    onSuccess: async () => {
      haptics.success();
      // Pull the updated finding and action rows into the local database.
      await runSync();
      await queryClient.invalidateQueries({ queryKey: ['findings'] });
      await queryClient.invalidateQueries({ queryKey: ['finding', findingId] });
    },
    onError: () => haptics.error(),
  });
}

/** Which buttons the current user may see on an action, from the shared rules. */
export function useAvailableTransitions(
  status: FindingStatus,
  assigneeId: string | null,
): FindingStatus[] {
  const user = useAuthStore((state) => state.user);

  return useMemo(() => {
    if (!user) return [];
    return allowedTransitionsForRole(status, user.role, assigneeId === user.id).map(
      (rule) => rule.to,
    );
  }, [status, assigneeId, user]);
}

/** Open actions assigned to the signed-in user, for the home screen badge. */
export function useMyOpenActionCount(): number {
  const userId = useAuthStore((state) => state.user?.id ?? '');

  const { records } = useRecords<CorrectiveActionModel>(
    () =>
      collections
        .correctiveActions()
        .query(Q.where('assignee_id', userId), Q.where('status', Q.notEq('CLOSED'))),
    [userId],
  );

  return records.length;
}
