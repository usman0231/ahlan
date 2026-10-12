import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ROLES, requiresStadiumAssignment, type AccessRequest, type Role } from '@ahlan/shared';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  OptionList,
  Screen,
  SegmentedControl,
  SkeletonList,
  Text,
  TextField,
} from '../../../src/components';
import { Icon } from '../../../src/components/icon';
import { HeaderBar } from '../../../src/components/back-button';
import { ListFooter } from '../../../src/components/list-footer';
import {
  flatPages,
  useAccessRequests,
  useAllStadiums,
  useApproveAccessRequest,
  useRejectAccessRequest,
} from '../../../src/features/admin/hooks';
import { ApiError } from '../../../src/api/client';

/**
 * Approving access.
 *
 * This is the gate that lets somebody into the product, so the screen makes the
 * two decisions that matter explicit: which role, and which stadiums. An
 * inspector with no stadium can see nothing, so the approve button stays
 * disabled until at least one is chosen.
 */
export default function AccessRequestsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AccessRequest['status']>('PENDING');
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useAccessRequests(status);
  const { data: stadiums } = useAllStadiums();

  const approve = useApproveAccessRequest();
  const reject = useRejectAccessRequest();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('INSPECTOR');
  const [stadiumIds, setStadiumIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  function startApproval(request: AccessRequest): void {
    setExpandedId(request.id);
    setRole('INSPECTOR');
    // Pre-fill with what the applicant asked for; the admin confirms.
    setStadiumIds(request.requestedStadiumIds);
    setFormError(null);
  }

  function toggleStadium(id: string): void {
    setStadiumIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function handleApprove(request: AccessRequest): void {
    setFormError(null);
    if (requiresStadiumAssignment(role) && stadiumIds.length === 0) {
      setFormError(t('users.errors.stadiumRequired'));
      return;
    }

    approve.mutate(
      { id: request.id, role, stadiumIds: requiresStadiumAssignment(role) ? stadiumIds : [] },
      {
        onSuccess: () => setExpandedId(null),
        onError: (mutationError) =>
          setFormError(
            mutationError instanceof ApiError
              ? t(mutationError.translationKey, { defaultValue: t('errors.UNKNOWN') })
              : t('errors.UNKNOWN'),
          ),
      },
    );
  }

  const header = <HeaderBar backLabel={t('admin.manage')} fallback="/(admin)/manage" />;

  if (isError) {
    return (
      <Screen headerAction={header} title={t('admin.accessRequests')}>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const requests = flatPages(data);

  return (
    <Screen
      headerAction={header}
      title={t('admin.accessRequests')}
      onRefresh={() => void refetch()}
      contentClassName="gap-5"
    >
      <SegmentedControl
        options={[
          { value: 'PENDING', label: t('admin.pendingRequests', { count: requests.length }) },
          { value: 'APPROVED', label: t('admin.approve') },
          { value: 'REJECTED', label: t('admin.reject') },
        ]}
        value={status}
        onChange={(value) => setStatus(value as AccessRequest['status'])}
      />

      {isLoading ? (
        <SkeletonList count={4} />
      ) : requests.length === 0 ? (
        <EmptyState
          title={t('states.emptyTitle')}
          body={t('states.emptyBody')}
          icon={<Icon name="inbox" size={40} tone="muted" />}
        />
      ) : (
        <View className="gap-3">
          {requests.map((request) => {
            const isApproving = expandedId === request.id;
            const isRejecting = expandedId === `reject:${request.id}`;

            return (
              <Card key={request.id} className="gap-3">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 gap-0.5">
                    <Text variant="heading">{request.fullName}</Text>
                    <Text variant="caption" tone="muted">
                      {request.email}
                    </Text>
                    {request.organisation || request.jobTitle ? (
                      <Text variant="caption" tone="subtle">
                        {[request.jobTitle, request.organisation].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  <Badge
                    label={t(`users.requestStatuses.${request.status}`)}
                    tone={
                      request.status === 'PENDING'
                        ? 'warning'
                        : request.status === 'APPROVED'
                          ? 'success'
                          : 'danger'
                    }
                  />
                </View>

                {request.note ? (
                  <Text variant="caption" tone="muted">
                    {request.note}
                  </Text>
                ) : null}

                {request.status === 'PENDING' && !isApproving && !isRejecting ? (
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Button label={t('admin.approve')} onPress={() => startApproval(request)} />
                    </View>
                    <View className="flex-1">
                      <Button
                        label={t('admin.reject')}
                        variant="secondary"
                        onPress={() => setExpandedId(`reject:${request.id}`)}
                      />
                    </View>
                  </View>
                ) : null}

                {isApproving ? (
                  <View className="gap-4 rounded-sm bg-surface-sunken p-3">
                    <Field label={t('admin.approveRole')}>
                      <OptionList
                        options={[...ROLES].reverse().map((value) => ({
                          value,
                          label: t(`roles.${value}`),
                          description: t(`users.roleDescriptions.${value}`),
                        }))}
                        value={role}
                        onChange={(value) => setRole(value as Role)}
                      />
                    </Field>

                    {requiresStadiumAssignment(role) ? (
                      <Field
                        label={t('admin.approveStadiums')}
                        hint={t('users.stadiumHint', { count: stadiumIds.length })}
                      >
                        <OptionList
                          multiple
                          options={(stadiums ?? []).map((stadium) => ({
                            value: stadium.id,
                            label: stadium.name,
                            description: stadium.isActive
                              ? stadium.code
                              : `${stadium.code} · ${t('stadiums.inactive')}`,
                          }))}
                          selectedValues={stadiumIds}
                          onChange={toggleStadium}
                        />
                      </Field>
                    ) : null}

                    {formError ? <InlineError message={formError} /> : null}

                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <Button
                          label={t('common.cancel')}
                          variant="ghost"
                          onPress={() => setExpandedId(null)}
                        />
                      </View>
                      <View className="flex-[1.4]">
                        <Button
                          label={t('admin.approve')}
                          loading={approve.isPending}
                          disabled={requiresStadiumAssignment(role) && stadiumIds.length === 0}
                          onPress={() => handleApprove(request)}
                        />
                      </View>
                    </View>
                  </View>
                ) : null}

                {isRejecting ? (
                  <RejectForm
                    pending={reject.isPending}
                    onCancel={() => setExpandedId(null)}
                    onReject={(note) =>
                      reject.mutate(
                        { id: request.id, note },
                        { onSuccess: () => setExpandedId(null) },
                      )
                    }
                  />
                ) : null}

                {request.decisionNote ? (
                  <Text variant="caption" tone="subtle">
                    {request.decisionNote}
                  </Text>
                ) : null}
              </Card>
            );
          })}
        </View>
      )}
      <ListFooter
        loadingMore={isFetchingNextPage}
        hasMore={Boolean(hasNextPage)}
        error={isFetchNextPageError}
        onRetry={() => void fetchNextPage()}
        count={requests.length}
      />
      {hasNextPage && !isFetchingNextPage ? (
        <Button label={t('admin.loadMore')} variant="ghost" onPress={() => void fetchNextPage()} />
      ) : null}
    </Screen>
  );
}

/** Rejection needs a reason: the applicant is emailed it. */
function RejectForm({
  pending,
  onCancel,
  onReject,
}: {
  pending: boolean;
  onCancel: () => void;
  onReject: (note: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [note, setNote] = useState('');

  return (
    <View className="gap-3 rounded-sm bg-surface-sunken p-3">
      <TextField label={t('admin.rejectReason')} value={note} onChangeText={setNote} multiline />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button label={t('common.cancel')} variant="ghost" onPress={onCancel} />
        </View>
        <View className="flex-[1.4]">
          <Button
            label={t('admin.reject')}
            variant="danger"
            loading={pending}
            disabled={note.trim().length === 0}
            onPress={() => onReject(note.trim())}
          />
        </View>
      </View>
    </View>
  );
}
