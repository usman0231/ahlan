import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OBSERVATION_TYPES, zonedDateString } from '@ahlan/shared';
import type { ObservationType, Severity, SyncState } from '@ahlan/shared';

import {
  Button,
  ChipRow,
  EmptyState,
  ListItem,
  Screen,
  SeverityBadge,
  SkeletonList,
  SyncBadge,
} from '../../../src/components';
import { Icon } from '../../../src/components/icon';
import { HeaderBar } from '../../../src/components/back-button';
import { useMyObservations } from '../../../src/features/observations/use-observation-draft';
import { useStadiums } from '../../../src/features/catalog/hooks';
import { relativeDay } from '../../../src/utils/format';

/** The inspector's own observations, filterable by type ("My observations"). */
export default function ObservationsListScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { stadiums } = useStadiums();
  const { observations, loading } = useMyObservations(null);
  const [type, setType] = useState<ObservationType | null>(null);

  const stadiumName = useMemo(() => {
    const map = new Map(stadiums.map((stadium) => [stadium.id, stadium.name]));
    return (id: string) => map.get(id) ?? '';
  }, [stadiums]);

  const today = stadiums[0] ? zonedDateString(new Date(), stadiums[0].timezone) : '';
  const rows = type ? observations.filter((row) => row.type === type) : observations;

  return (
    <Screen
      title={t('observations.mine')}
      headerAction={
        <HeaderBar fallback="/(inspector)/observations">
          <Button
            label={t('home.newObservation')}
            fullWidth={false}
            size="sm"
            onPress={() => router.push('/(inspector)/observations/new')}
          />
        </HeaderBar>
      }
      scroll={false}
    >
      <ChipRow
        className="mb-4"
        options={OBSERVATION_TYPES.map((value) => ({
          value,
          label: t(`observations.types.${value}`),
        }))}
        value={type}
        onChange={(value) => setType(value as ObservationType | null)}
      />

      <View className="flex-1 px-gutter">
        {loading ? (
          <SkeletonList count={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t('observations.emptyTitle')}
            body={t('observations.emptyBody')}
            icon={<Icon name="observations" size={40} tone="muted" />}
            actionLabel={t('home.newObservation')}
            onAction={() => router.push('/(inspector)/observations/new')}
          />
        ) : (
          <View className="gap-3">
            {rows.map((observation) => (
              <ListItem
                key={observation.id}
                title={observation.title}
                subtitle={stadiumName(observation.stadiumId)}
                meta={`${t(`observations.types.${observation.type as ObservationType}`)} · ${relativeDay(
                  observation.localDate,
                  today,
                  { today: t('common.today'), yesterday: t('common.yesterday') },
                )}`}
                trailing={
                  <View className="items-end gap-1">
                    <SeverityBadge severity={observation.severity as Severity} />
                    <SyncBadge state={observation.syncState as SyncState} />
                  </View>
                }
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
