import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { EmptyState, ErrorState, Screen, Skeleton } from '../../../src/components';
import { useStadiumCards } from '../../../src/features/catalog/kpi-hooks';
import { StadiumKpiCard } from '../../../src/features/catalog/stadium-kpi-card';

/**
 * My Stadium: one photo card per assigned venue (client layout) with today's
 * readiness checklists done / expected, open findings and compliance, from
 * `GET /kpis/stadium-cards`. The API scopes it to my stadiums.
 */
export default function MyStadiumScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const cards = useStadiumCards();
  const [width, setWidth] = useState(0);
  const columns = width >= 1100 ? 3 : width >= 680 ? 2 : 1;

  return (
    <Screen
      title={t('nav.myStadium')}
      subtitle={t('stadium.subtitle')}
      onRefresh={async () => {
        await cards.refetch();
      }}
      wide
    >
      <View
        className="flex-row flex-wrap"
        style={{ marginHorizontal: -8 }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {cards.isLoading ? (
          Array.from({ length: 2 }).map((_, index) => (
            <View key={index} style={{ width: `${100 / columns}%`, padding: 8 }}>
              <Skeleton height={420} rounded="md" />
            </View>
          ))
        ) : cards.isError ? (
          <View className="w-full">
            <ErrorState error={cards.error} onRetry={() => void cards.refetch()} />
          </View>
        ) : (cards.data ?? []).length === 0 ? (
          <View className="w-full">
            <EmptyState title={t('stadium.emptyTitle')} body={t('errors.STADIUM_OUT_OF_SCOPE')} />
          </View>
        ) : (
          (cards.data ?? []).map((card) => (
            <View key={card.stadiumId} style={{ width: `${100 / columns}%`, padding: 8 }}>
              <StadiumKpiCard
                card={card}
                onOpen={() => router.push(`/(inspector)/stadium/${card.stadiumId}`)}
              />
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

