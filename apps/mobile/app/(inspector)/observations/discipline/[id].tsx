import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react-native';

import { Button, Screen } from '../../../../src/components';
import { HeaderBar } from '../../../../src/components/back-button';
import { DisciplineDashboard } from '../../../../src/features/observations/discipline-dashboard';
import { useQueryClient } from '@tanstack/react-query';
import { usePalette } from '../../../../src/theme/theme-provider';

/** One discipline's HSE observation dashboard (see DisciplineDashboard). */
export default function DisciplineDashboardScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const palette = usePalette();
  const queryClient = useQueryClient();

  return (
    <Screen
      headerAction={
        <HeaderBar fallback="/(inspector)/observations">
          <Button
            label={t('home.newObservation')}
            size="sm"
            fullWidth={false}
            icon={<Plus size={18} color={palette.onPrimary} />}
            onPress={() => router.push(`/(inspector)/observations/new?disciplineId=${id}`)}
          />
        </HeaderBar>
      }
      onRefresh={async () => {
        await queryClient.invalidateQueries({ queryKey: ['kpis', 'discipline', id] });
      }}
      wide
    >
      <DisciplineDashboard disciplineId={id} />
    </Screen>
  );
}
