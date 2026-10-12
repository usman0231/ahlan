import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ClipboardCheck, Plus } from 'lucide-react-native';

import {
  Button,
  Card,
  EmptyState,
  PressableCard,
  Screen,
  Skeleton,
  Text,
} from '../../../src/components';
import { useDisciplines } from '../../../src/features/catalog/hooks';
import { useMyObservations } from '../../../src/features/observations/use-observation-draft';
import { DisciplineIcon } from '../../../src/features/observations/discipline-icon';
import type { DisciplineModel } from '../../../src/db/models/catalog';
import { useSettingsStore } from '../../../src/store/settings';
import { usePalette } from '../../../src/theme/theme-provider';
import { fonts } from '../../../src/theme/tokens';

/**
 * HSE Observation, per the client mockup: one card per discipline (icon,
 * name, description, "Open dashboard") plus the primary "New observation"
 * action. Disciplines come from the local database, so the grid shows
 * offline; each dashboard needs the API.
 */
export default function HseObservationScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const { disciplines, loading } = useDisciplines();
  const { observations } = useMyObservations(null);
  const [width, setWidth] = useState(0);
  const columns = width >= 1000 ? 4 : width >= 700 ? 3 : width >= 440 ? 2 : 1;
  const pending = observations.filter((row) => row.syncState !== 'SYNCED').length;

  return (
    <Screen title={t('nav.hseObservation')} wide contentClassName="gap-5">
      <Card className="flex-row items-center gap-4">
        <View className="h-12 w-12 items-center justify-center rounded-md bg-accent-soft">
          <ClipboardCheck size={24} color={palette.accent} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text variant="overline" tone="subtle">
            {t('observations.fieldObservation')}
          </Text>
          <Text variant="heading">{t('observations.selectCategory')}</Text>
          <Text variant="caption" tone="muted">
            {t('observations.selectCategoryHint')}
          </Text>
        </View>
      </Card>

      <View className="flex-row flex-wrap gap-3">
        <View className="min-w-[220px] flex-[2]">
          <Button
            label={t('home.newObservation')}
            size="lg"
            icon={<Plus size={20} color={palette.onPrimary} />}
            onPress={() => router.push('/(inspector)/observations/new')}
          />
        </View>
        <View className="min-w-[160px] flex-1">
          <Button
            label={
              pending > 0
                ? t('observations.mineWithPending', { count: pending })
                : t('observations.mine')
            }
            size="lg"
            variant="secondary"
            onPress={() => router.push('/(inspector)/observations/mine')}
          />
        </View>
      </View>

      <View
        className="flex-row flex-wrap"
        style={{ marginHorizontal: -6 }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <View key={index} style={{ width: `${100 / columns}%`, padding: 6 }}>
              <Skeleton height={200} rounded="md" />
            </View>
          ))
        ) : disciplines.length === 0 ? (
          <View className="w-full">
            <EmptyState title={t('observations.noDisciplines')} body={t('states.offlineBody')} />
          </View>
        ) : (
          disciplines.map((discipline) => (
            <View key={discipline.id} style={{ width: `${100 / columns}%`, padding: 6 }}>
              <DisciplineCard
                discipline={discipline}
                onPress={() => router.push(`/(inspector)/observations/discipline/${discipline.id}`)}
              />
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

function DisciplineCard({
  discipline,
  onPress,
}: {
  discipline: DisciplineModel;
  onPress: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const locale = useSettingsStore((state) => state.locale);
  const Chevron = i18n.dir() === 'rtl' ? ChevronLeft : ChevronRight;
  const name = discipline.displayName(locale);
  const description = discipline.displayDescription(locale);

  return (
    <PressableCard
      accessibilityLabel={`${name}. ${t('observations.openDashboard')}`}
      onPress={onPress}
      className="min-h-[200px] gap-4 p-5"
    >
      <View className="h-12 w-12 items-center justify-center rounded-md bg-accent-soft">
        <DisciplineIcon name={discipline.icon} size={24} color={palette.accent} />
      </View>
      <View className="flex-1 gap-1.5">
        <Text variant="heading" numberOfLines={2}>
          {name}
        </Text>
        {description ? (
          <Text variant="callout" tone="muted" numberOfLines={3}>
            {description}
          </Text>
        ) : null}
      </View>
      <View className="flex-row items-center justify-between border-t border-border pt-3">
        <Text variant="callout" style={{ fontFamily: fonts.semibold }}>
          {t('observations.openDashboard')}
        </Text>
        <Chevron size={18} color={palette.fg} />
      </View>
    </PressableCard>
  );
}
