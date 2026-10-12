import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  Button,
  EmptyState,
  ListItem,
  Screen,
  Section,
  SkeletonList,
  Text,
  Badge,
} from '../../../src/components';
import { Icon } from '../../../src/components/icon';
import { useStadiums } from '../../../src/features/catalog/hooks';
import { useChecklistCards, type ChecklistCardEntry } from '../../../src/features/inspections/use-checklist-cards';
import { ChecklistCardGrid } from '../../../src/features/inspections/checklist-cards';
import { startInspection } from '../../../src/features/inspections/use-inspection-draft';
import { useSettingsStore } from '../../../src/store/settings';
import { useHaptics } from '../../../src/hooks/use-haptics';

/**
 * Starting an inspection: pick the stadium, then the checklist.
 *
 * Both lists come from the local database, so this works with no connection.
 * The stadium step is skipped when the inspector only covers one venue, which
 * is the common case.
 */
export default function NewInspectionScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);
  const haptics = useHaptics();

  const { stadiums, loading: loadingStadiums } = useStadiums();
  const [stadiumId, setStadiumId] = useState<string | null>(
    stadiums.length === 1 ? (stadiums[0]?.id ?? null) : null,
  );
  const [starting, setStarting] = useState(false);

  // One stadium: go straight to the checklist step.
  const effectiveStadiumId = stadiumId ?? (stadiums.length === 1 ? stadiums[0]?.id ?? null : null);
  const cards = useChecklistCards(effectiveStadiumId);

  function open(entry: ChecklistCardEntry): void {
    if (entry.draftId) {
      haptics.answer();
      router.replace(`/(inspector)/inspections/${entry.draftId}`);
      return;
    }
    void start(entry.checklist.id, entry.version.id);
  }

  async function start(checklistId: string, versionId: string): Promise<void> {
    if (!effectiveStadiumId) return;
    setStarting(true);
    try {
      const id = await startInspection({
        stadiumId: effectiveStadiumId,
        checklistId,
        checklistVersionId: versionId,
      });
      haptics.answer();
      router.replace(`/(inspector)/inspections/${id}`);
    } finally {
      setStarting(false);
    }
  }

  if (loadingStadiums) {
    return (
      <Screen title={t('inspections.newTitle')}>
        <SkeletonList count={4} />
      </Screen>
    );
  }

  if (stadiums.length === 0) {
    return (
      <Screen title={t('inspections.newTitle')}>
        <EmptyState body={t('errors.STADIUM_OUT_OF_SCOPE')} />
      </Screen>
    );
  }

  return (
    <Screen
      title={t('inspections.newTitle')}
      subtitle={effectiveStadiumId ? t('inspections.chooseChecklist') : t('inspections.chooseStadium')}
      headerAction={
        <Button
          label={t('common.cancel')}
          variant="ghost"
          fullWidth={false}
          onPress={() => router.back()}
        />
      }
      contentClassName="gap-6"
    >
      {!effectiveStadiumId ? (
        <Section title={t('inspections.chooseStadium')}>
          <View className="gap-3">
            {stadiums.map((stadium) => (
              <ListItem
                key={stadium.id}
                title={stadium.displayName(locale)}
                subtitle={stadium.city ?? undefined}
                meta={stadium.code}
                trailing={<Icon name="chevron" tone="muted" />}
                onPress={() => setStadiumId(stadium.id)}
              />
            ))}
          </View>
        </Section>
      ) : (
        <>
          {stadiums.length > 1 ? (
            <View className="self-start">
              <Button
                label={`‹  ${t('inspections.chooseStadium')}`}
                variant="ghost"
                size="sm"
                fullWidth={false}
                onPress={() => setStadiumId(null)}
              />
            </View>
          ) : null}

          <Section
            title={t('inspections.readinessChecklists')}
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
            {!cards.loading && cards.readiness.length === 0 && cards.others.length === 0 ? (
              <EmptyState body={t('inspections.noChecklists')} />
            ) : (
              <ChecklistCardGrid
                entries={cards.readiness}
                loading={cards.loading}
                disabled={starting}
                onPress={open}
              />
            )}
          </Section>

          {cards.others.length > 0 ? (
            <Section title={t('inspections.disciplineChecklists')}>
              <View className="gap-3">
                {cards.others.map((entry) => (
                  <ListItem
                    key={entry.checklist.id}
                    title={entry.checklist.displayTitle(locale)}
                    subtitle={entry.checklist.description ?? undefined}
                    meta={t('inspections.cards.checks', { count: entry.version.itemCount })}
                    leading={
                      <View className="h-11 w-11 items-center justify-center rounded-md bg-primary-soft">
                        <Icon name="checklist" tone="primary" />
                      </View>
                    }
                    trailing={
                      entry.doneToday ? (
                        <Badge label={`✓ ${t('inspections.cards.done')}`} tone="success" />
                      ) : entry.draftId ? (
                        <Badge label={t('inspections.cards.draft')} tone="warning" />
                      ) : undefined
                    }
                    disabled={starting}
                    onPress={() => open(entry)}
                  />
                ))}
              </View>
            </Section>
          ) : null}

          <Text variant="caption" tone="subtle">
            {t('states.offlineBody')}
          </Text>
        </>
      )}
    </Screen>
  );
}
