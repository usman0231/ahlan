import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import type { SyncState } from '@ahlan/shared';

import {
  Badge,
  Button,
  ChipRow,
  EmptyState,
  ListItem,
  Screen,
  Section,
  SkeletonList,
  SyncBadge,
  Text,
} from '../../../src/components';
import { ProgressBar } from '../../../src/components/progress-bar';
import { collections } from '../../../src/db';
import type { ChecklistModel } from '../../../src/db/models/catalog';
import type { InspectionModel } from '../../../src/db/models/field-records';
import { useRecords } from '../../../src/hooks/use-watermelon';
import { useStadiums } from '../../../src/features/catalog/hooks';
import {
  useChecklistCards,
  type ChecklistCardEntry,
} from '../../../src/features/inspections/use-checklist-cards';
import { ChecklistCardGrid } from '../../../src/features/inspections/checklist-cards';
import { startInspection } from '../../../src/features/inspections/use-inspection-draft';
import { useAuthStore } from '../../../src/store/auth';
import { useSettingsStore } from '../../../src/store/settings';
import { useHaptics } from '../../../src/hooks/use-haptics';
import { formatPercent, relativeDay } from '../../../src/utils/format';

/**
 * My Checklists: today's readiness checklists at my stadium as cards (done,
 * in progress, to do), then my drafts and my recent inspections. Everything
 * comes from the local database, so it works with no connection.
 */
export default function InspectionsListScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);
  const haptics = useHaptics();
  const userId = useAuthStore((state) => state.user?.id ?? '');
  const { stadiums, loading: loadingStadiums } = useStadiums();
  const [stadiumId, setStadiumId] = useState<string | null>(null);
  const effectiveStadiumId = stadiumId ?? stadiums[0]?.id ?? null;
  const cards = useChecklistCards(effectiveStadiumId);
  const [starting, setStarting] = useState(false);

  const { records, loading } = useRecords<InspectionModel>(
    () =>
      collections
        .inspections()
        .query(Q.where('inspector_id', userId), Q.sortBy('started_at', Q.desc), Q.take(100)),
    [userId],
  );

  const { records: checklists } = useRecords<ChecklistModel>(
    () => collections.checklists().query(),
    [],
  );

  const checklistTitle = useMemo(() => {
    const map = new Map(checklists.map((checklist) => [checklist.id, checklist]));
    return (id: string) => map.get(id)?.displayTitle(locale) ?? t('inspections.title');
  }, [checklists, locale, t]);

  const stadiumName = useMemo(() => {
    const map = new Map(stadiums.map((stadium) => [stadium.id, stadium]));
    return (id: string) => map.get(id)?.displayName(locale) ?? '';
  }, [stadiums, locale]);

  const drafts = records.filter((record) => record.status === 'DRAFT');
  const submitted = records.filter((record) => record.status === 'SUBMITTED');
  const dayLabels = { today: t('common.today'), yesterday: t('common.yesterday') };

  async function open(entry: ChecklistCardEntry): Promise<void> {
    if (entry.draftId) {
      router.push(`/(inspector)/inspections/${entry.draftId}`);
      return;
    }
    if (!effectiveStadiumId) return;
    setStarting(true);
    try {
      const id = await startInspection({
        stadiumId: effectiveStadiumId,
        checklistId: entry.checklist.id,
        checklistVersionId: entry.version.id,
      });
      haptics.answer();
      router.push(`/(inspector)/inspections/${id}`);
    } finally {
      setStarting(false);
    }
  }

  return (
    <Screen
      title={t('nav.myChecklists')}
      subtitle={effectiveStadiumId ? stadiumName(effectiveStadiumId) : undefined}
      headerAction={
        <Button
          label={t('inspections.allChecklists')}
          variant="secondary"
          fullWidth={false}
          size="sm"
          onPress={() => router.push('/(inspector)/inspections/new')}
        />
      }
      wide
      contentClassName="gap-6"
    >
      {stadiums.length > 1 ? (
        <ChipRow
          className="-mx-gutter"
          options={stadiums.map((stadium) => ({ value: stadium.id, label: stadium.code }))}
          value={effectiveStadiumId}
          onChange={(value) => value && setStadiumId(value)}
        />
      ) : null}

      <Section
        title={t('inspections.todayReadiness')}
        action={
          cards.progress.expected > 0 ? (
            <Badge
              label={t('inspections.cards.progress', {
                done: cards.progress.done,
                total: cards.progress.expected,
              })}
              tone={cards.progress.done === cards.progress.expected ? 'success' : 'neutral'}
            />
          ) : null
        }
      >
        {cards.progress.expected > 0 ? (
          <ProgressBar value={cards.progress.done / cards.progress.expected} />
        ) : null}
        {loadingStadiums ? (
          <SkeletonList count={2} />
        ) : !effectiveStadiumId ? (
          <EmptyState body={t('errors.STADIUM_OUT_OF_SCOPE')} />
        ) : !cards.loading && cards.readiness.length === 0 ? (
          <EmptyState title={t('inspections.noChecklistsTitle')} body={t('inspections.noChecklists')} />
        ) : (
          <ChecklistCardGrid
            entries={cards.readiness}
            loading={cards.loading}
            disabled={starting}
            onPress={(entry) => void open(entry)}
          />
        )}
      </Section>

      {loading ? (
        <SkeletonList count={3} />
      ) : (
        <>
          {drafts.length > 0 ? (
            <Section title={t('inspections.drafts')}>
              <View className="gap-3">
                {drafts.map((inspection, index) => (
                  <ListItem
                    key={inspection.id}
                    index={index}
                    title={checklistTitle(inspection.checklistId)}
                    subtitle={`${stadiumName(inspection.stadiumId)} · ${t('inspections.answeredCount', {
                      count: inspection.yesCount + inspection.noCount + inspection.naCount,
                    })}`}
                    meta={relativeDay(inspection.localDate, cards.today, dayLabels)}
                    trailing={<Badge label={t('inspections.resumeDraft')} tone="warning" />}
                    onPress={() => router.push(`/(inspector)/inspections/${inspection.id}`)}
                  />
                ))}
              </View>
            </Section>
          ) : null}

          <Section title={t('inspections.recent')}>
            {submitted.length === 0 ? (
              <Text variant="callout" tone="muted">
                {t('inspections.emptyBody')}
              </Text>
            ) : (
              <View className="gap-3">
                {submitted.map((inspection, index) => (
                  <ListItem
                    key={inspection.id}
                    index={index}
                    title={checklistTitle(inspection.checklistId)}
                    subtitle={`${inspection.yesCount} ${t('common.yes')} · ${inspection.noCount} ${t('common.no')} · ${inspection.naCount} ${t('common.na')}`}
                    meta={`${stadiumName(inspection.stadiumId)} · ${relativeDay(inspection.localDate, cards.today, dayLabels)}`}
                    trailing={
                      <View className="items-end gap-1">
                        <Text variant="callout" tabular>
                          {formatPercent(inspection.compliance, t('common.noScore'))}
                        </Text>
                        <SyncBadge state={inspection.syncState as SyncState} />
                      </View>
                    }
                    onPress={() => router.push(`/(inspector)/inspections/${inspection.id}`)}
                  />
                ))}
              </View>
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}
