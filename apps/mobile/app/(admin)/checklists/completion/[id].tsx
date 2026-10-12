import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CircleCheck, Clock3, Users } from 'lucide-react-native';
import { isIsoDate, zonedDateString } from '@ahlan/shared';

import {
  Appear,
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  ListItem,
  Screen,
  Skeleton,
  SkeletonList,
  Text,
} from '../../../../src/components';
import { HeaderBar } from '../../../../src/components/back-button';
import { ProgressBar } from '../../../../src/components/progress-bar';
import { DateStepper } from '../../../../src/features/admin/components/admin-ui';
import { sortCompletionInspectors } from '../../../../src/features/admin/completion-summary';
import { REVIEW_TIMEZONE } from '../../../../src/features/admin/eod-window-form';
import { useChecklistCompletion } from '../../../../src/features/admin/hooks';
import { usePalette } from '../../../../src/theme/theme-provider';
import { fonts } from '../../../../src/theme/tokens';

/**
 * Who completed one checklist on a day and who has not: every expected
 * inspector-stadium pair, pending first. A completed row opens the inspection.
 */
export default function ChecklistCompletionScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{ id: string; date?: string }>();
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const today = zonedDateString(new Date(), REVIEW_TIMEZONE);
  const date = params.date && isIsoDate(params.date) ? params.date : today;
  const completion = useChecklistCompletion(date);
  const row = completion.data?.find((candidate) => candidate.checklistId === params.id);
  const arabic = i18n.language.startsWith('ar');

  const header = <HeaderBar backLabel={t('checklists.title')} fallback="/(admin)/checklists" />;
  const setDate = (next: string): void => router.setParams({ date: next });

  if (completion.isError) {
    return (
      <Screen headerAction={header}>
        <ErrorState error={completion.error} onRetry={() => void completion.refetch()} />
      </Screen>
    );
  }

  const inspectors = row ? sortCompletionInspectors(row.inspectors) : [];

  return (
    <Screen
      headerAction={header}
      wide
      onRefresh={() => void completion.refetch()}
      contentClassName="gap-5"
    >
      <Appear index={0} className="gap-1">
        <Text variant="overline" tone="subtle">
          {t('checklists.completionOverline')}
        </Text>
        {row ? (
          <Text variant="display" numberOfLines={2}>
            {arabic && row.titleAr ? row.titleAr : row.title}
          </Text>
        ) : (
          <Skeleton height={36} width="60%" />
        )}
      </Appear>

      <DateStepper value={date} onChange={setDate} max={today} />

      <Card className="gap-3">
        {!row ? (
          completion.isLoading ? (
            <>
              <Skeleton height={20} width="40%" />
              <Skeleton height={8} rounded="full" />
            </>
          ) : (
            <Text variant="callout" tone="muted">
              {t('checklists.notFound')}
            </Text>
          )
        ) : (
          <>
            <View className="flex-row items-center justify-between gap-3">
              <Text variant="heading" className="flex-1">
                {t('checklists.completedOf', { completed: row.completed, expected: row.expected })}
              </Text>
              <Text variant="callout" tone={row.pending > 0 ? 'warning' : 'success'}>
                {row.pending > 0
                  ? t('checklists.pendingCount', { count: row.pending })
                  : row.expected > 0
                    ? t('checklists.allDone')
                    : t('checklists.nobodyExpected')}
              </Text>
            </View>
            <ProgressBar value={row.expected ? row.completed / row.expected : 0} />
          </>
        )}
      </Card>

      {completion.isLoading ? (
        <SkeletonList count={6} />
      ) : row && inspectors.length === 0 ? (
        <EmptyState
          title={t('checklists.nobodyExpected')}
          body={t('checklists.nobodyExpectedBody')}
          icon={<Users size={40} color={palette.fgMuted} />}
        />
      ) : (
        <View className="gap-3">
          {inspectors.map((inspector, index) => {
            const done = inspector.status === 'COMPLETED' && inspector.inspectionId;
            return (
              <ListItem
                key={`${inspector.userId}:${inspector.stadiumId}`}
                index={index}
                leading={<Avatar name={inspector.fullName} />}
                title={inspector.fullName}
                subtitle={inspector.stadiumCode}
                meta={done ? t('checklists.openInspection') : undefined}
                trailing={<CompletionStatus completed={inspector.status === 'COMPLETED'} />}
                onPress={
                  done
                    ? () =>
                        router.push({
                          pathname: '/(admin)/checklists/inspection/[id]',
                          params: { id: inspector.inspectionId as string },
                        })
                    : undefined
                }
              />
            );
          })}
        </View>
      )}
    </Screen>
  );
}

function CompletionStatus({ completed }: { completed: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  return (
    <View
      className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${completed ? 'bg-success-soft' : 'bg-warning-soft'}`}
    >
      {completed ? (
        <CircleCheck size={14} color={palette.success} />
      ) : (
        <Clock3 size={14} color={palette.warning} />
      )}
      <Text
        variant="caption"
        tone={completed ? 'success' : 'warning'}
        style={{ fontFamily: fonts.semibold }}
      >
        {completed ? t('checklists.statusCompleted') : t('checklists.statusPending')}
      </Text>
    </View>
  );
}
