import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addDays, type AiInsight, type AiReviewStatus } from '@ahlan/shared';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  InlineError,
  Screen,
  SegmentedControl,
  SeverityBadge,
  SkeletonList,
  Text,
  TextField,
} from '../../../src/components';
import { Icon } from '../../../src/components/icon';
import { HeaderBar } from '../../../src/components/back-button';
import { ListFooter } from '../../../src/components/list-footer';
import {
  flatPages,
  useAiInsights,
  useGenerateAiInsights,
  useReviewAiInsight,
} from '../../../src/features/admin/hooks';
import { ApiError } from '../../../src/api/client';
import { Trash2 } from 'lucide-react-native';
import { useDeleteAiInsight } from '../../../src/features/admin/manage-hooks';
import { useReasonDialog } from '../../../src/features/admin/components/reason-dialog';
import { usePalette } from '../../../src/theme/theme-provider';

/**
 * AI intelligence, and the review gate in front of it.
 *
 * Every card carries the AI-generated label and says plainly that approval is
 * what makes an insight usable in an official report. The admin can correct the
 * wording before approving, and a rejection needs a reason - both are recorded.
 */
export default function AiInsightsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<AiReviewStatus>('PENDING_REVIEW');
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
  } = useAiInsights(filter);
  const generate = useGenerateAiInsights();
  const review = useReviewAiInsight();
  const removeInsight = useDeleteAiInsight();
  const reason = useReasonDialog();
  const palette = usePalette();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  function startReview(insight: AiInsight): void {
    setEditingId(insight.id);
    setEditedTitle(insight.title);
    setEditedBody(insight.body);
    setNote('');
    setFormError(null);
  }

  function decide(insight: AiInsight, decision: 'APPROVED' | 'REJECTED'): void {
    setFormError(null);
    if (decision === 'REJECTED' && note.trim().length === 0) {
      setFormError(t('admin.rejectReason'));
      return;
    }

    review.mutate(
      {
        id: insight.id,
        decision,
        note: note.trim() || undefined,
        // Only sent when the admin actually changed something.
        editedTitle: editedTitle !== insight.title ? editedTitle : undefined,
        editedBody: editedBody !== insight.body ? editedBody : undefined,
      },
      {
        onSuccess: () => setEditingId(null),
        onError: (mutationError) =>
          setFormError(
            mutationError instanceof ApiError
              ? t(mutationError.translationKey, { defaultValue: t('errors.UNKNOWN') })
              : t('errors.UNKNOWN'),
          ),
      },
    );
  }

  function runGeneration(): void {
    const to = new Date().toISOString().slice(0, 10);
    generate.mutate({
      kinds: ['TREND_SUMMARY', 'RISK_FORECAST', 'RECOMMENDATION', 'ANOMALY'],
      periodStart: addDays(to, -29),
      periodEnd: to,
    });
  }

  if (isError) {
    return (
      <Screen
        headerAction={<HeaderBar backLabel={t('admin.manage')} fallback="/(admin)/manage" />}
        title={t('admin.aiInsights')}
      >
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const insights = flatPages(data);

  return (
    <Screen
      title={t('admin.aiInsights')}
      onRefresh={() => void refetch()}
      headerAction={
        <HeaderBar backLabel={t('admin.manage')} fallback="/(admin)/manage">
          <Button
            label={t('admin.aiGenerate')}
            size="sm"
            fullWidth={false}
            loading={generate.isPending}
            onPress={runGeneration}
          />
        </HeaderBar>
      }
      contentClassName="gap-5"
    >
      <Card className="border-primary bg-primary-soft">
        <Text variant="caption" tone="primary">
          {t('admin.aiReviewNote')} {t('admin.aiBasedOn')}
        </Text>
      </Card>

      <SegmentedControl
        options={[
          { value: 'PENDING_REVIEW', label: t('admin.aiPendingShort') },
          { value: 'APPROVED', label: t('admin.aiApprove') },
          { value: 'REJECTED', label: t('admin.aiReject') },
        ]}
        value={filter}
        onChange={(value) => setFilter(value as AiReviewStatus)}
      />

      {isLoading ? (
        <SkeletonList count={3} />
      ) : insights.length === 0 ? (
        <EmptyState
          title={t('states.emptyTitle')}
          body={t('states.emptyBody')}
          icon={<Icon name="ai" size={40} tone="muted" />}
          actionLabel={t('admin.aiGenerate')}
          onAction={runGeneration}
        />
      ) : (
        <View className="gap-4">
          {insights.map((insight) => {
            const isEditing = editingId === insight.id;

            return (
              <Card key={insight.id} className="gap-3 border-s-4 border-s-primary">
                <View className="flex-row items-center justify-between gap-2">
                  {/* The label is not optional and is never conditional. */}
                  <Badge label={t('admin.aiGenerated')} tone="primary" />
                  <Text variant="caption" tone="subtle">
                    {insight.kind}
                  </Text>
                </View>

                {isEditing ? (
                  <TextField
                    label={t('observations.observationTitle')}
                    value={editedTitle}
                    onChangeText={setEditedTitle}
                  />
                ) : (
                  <Text variant="heading">{insight.title}</Text>
                )}

                {isEditing ? (
                  <TextField
                    label={t('observations.description')}
                    value={editedBody}
                    onChangeText={setEditedBody}
                    multiline
                  />
                ) : (
                  <Text variant="body" tone="muted">
                    {insight.body}
                  </Text>
                )}

                {insight.bullets.length > 0 && !isEditing ? (
                  <View className="gap-1.5">
                    {insight.bullets.map((bullet, index) => (
                      <View key={index} className="flex-row gap-2">
                        <Text variant="caption" tone="subtle">
                          &bull;
                        </Text>
                        <Text variant="caption" className="flex-1">
                          {bullet}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View className="flex-row items-center gap-2">
                  {insight.severity ? <SeverityBadge severity={insight.severity} /> : null}
                  <Text variant="caption" tone="subtle">
                    {insight.periodStart} &rarr; {insight.periodEnd}
                  </Text>
                  {insight.confidence !== null ? (
                    <Text variant="caption" tone="subtle">
                      {Math.round(insight.confidence * 100)}%
                    </Text>
                  ) : null}
                </View>

                <Text variant="caption" tone="subtle">
                  {insight.model} &middot; {insight.promptVersion}
                </Text>

                {insight.reviewStatus === 'PENDING_REVIEW' ? (
                  isEditing ? (
                    <View className="gap-3">
                      <TextField
                        label={t('admin.rejectReason')}
                        value={note}
                        onChangeText={setNote}
                        optional
                        multiline
                      />
                      {formError ? <InlineError message={formError} /> : null}
                      <View className="flex-row gap-3">
                        <View className="flex-1">
                          <Button
                            label={t('admin.aiReject')}
                            variant="secondary"
                            loading={review.isPending}
                            onPress={() => decide(insight, 'REJECTED')}
                          />
                        </View>
                        <View className="flex-[1.4]">
                          <Button
                            label={t('admin.aiApprove')}
                            variant="success"
                            loading={review.isPending}
                            onPress={() => decide(insight, 'APPROVED')}
                          />
                        </View>
                      </View>
                      <Button
                        label={t('common.cancel')}
                        variant="ghost"
                        onPress={() => setEditingId(null)}
                      />
                    </View>
                  ) : (
                    <Button
                      label={t('common.edit')}
                      variant="secondary"
                      onPress={() => startReview(insight)}
                    />
                  )
                ) : (
                  <Badge
                    label={
                      insight.reviewStatus === 'APPROVED'
                        ? t('admin.aiApprove')
                        : t('admin.aiReject')
                    }
                    tone={insight.reviewStatus === 'APPROVED' ? 'success' : 'danger'}
                  />
                )}

                {insight.reviewNote ? (
                  <Text variant="caption" tone="subtle">
                    {insight.reviewNote}
                  </Text>
                ) : null}
                {!isEditing ? (
                  <Button
                    label={t('admin.aiDelete.action')}
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={16} color={palette.danger} />}
                    onPress={() =>
                      reason.open({
                        title: t('admin.aiDelete.title'),
                        message: insight.title,
                        confirmLabel: t('common.delete'),
                        destructive: true,
                        onConfirm: (text) =>
                          removeInsight.mutateAsync({ id: insight.id, reason: text }),
                      })
                    }
                  />
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
        count={insights.length}
      />
      {hasNextPage && !isFetchingNextPage ? (
        <Button label={t('admin.loadMore')} variant="ghost" onPress={() => void fetchNextPage()} />
      ) : null}
      {reason.element}
    </Screen>
  );
}
