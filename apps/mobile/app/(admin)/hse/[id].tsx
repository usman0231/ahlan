import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { ChipRow, Screen, Text } from '../../../src/components';
import { HeaderBar } from '../../../src/components/back-button';
import { DisciplineDashboard } from '../../../src/features/observations/discipline-dashboard';
import { useAllStadiums } from '../../../src/features/admin/hooks';

/**
 * One discipline's dashboard for a reviewer: the inspector's dashboard
 * component, plus a stadium filter (every stadium for an administrator, the
 * assigned ones for a supervisor; the API scopes the figures either way).
 */
export default function AdminDisciplineDashboardScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: stadiums } = useAllStadiums();
  const [stadiumId, setStadiumId] = useState<string | null>(null);
  const options = (stadiums ?? []).map((stadium) => ({ value: stadium.id, label: stadium.code }));

  return (
    <Screen
      headerAction={<HeaderBar backLabel={t('admin.hse.title')} fallback="/(admin)/hse" />}
      onRefresh={async () => {
        await queryClient.invalidateQueries({ queryKey: ['kpis', 'discipline', id] });
      }}
      wide
      contentClassName="gap-4"
    >
      {options.length > 1 ? (
        <View className="gap-2">
          <Text variant="overline" tone="subtle">
            {stadiumId
              ? t('admin.hse.filteredTo', {
                  name: stadiums?.find((stadium) => stadium.id === stadiumId)?.name ?? '',
                })
              : t('admin.allStadiums')}
          </Text>
          <ChipRow
            className="-mx-gutter"
            options={options}
            value={stadiumId}
            onChange={setStadiumId}
          />
        </View>
      ) : null}
      <DisciplineDashboard disciplineId={id} stadiumId={stadiumId ?? undefined} />
    </Screen>
  );
}
