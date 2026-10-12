import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react-native';

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  ListItem,
  Screen,
  SkeletonList,
} from '../../../../src/components';
import { HeaderBar } from '../../../../src/components/back-button';
import { useTournaments } from '../../../../src/features/admin/manage-hooks';
import { usePalette } from '../../../../src/theme/theme-provider';

/**
 * Tournaments. Exactly one is active: KPIs, cumulative reports and the
 * dashboard anchor to it. The active one cannot be deleted.
 */
export default function TournamentsScreen(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const arabic = i18n.language.startsWith('ar');
  const tournaments = useTournaments();
  const rows = tournaments.data ?? [];
  const openNew = (): void => router.push('/(admin)/manage/tournaments/edit');

  return (
    <Screen
      headerAction={
        <HeaderBar backLabel={t('admin.manage')} fallback="/(admin)/manage">
          <Button
            label={t('manage.tournaments.new')}
            size="sm"
            fullWidth={false}
            onPress={openNew}
          />
        </HeaderBar>
      }
      title={t('manage.tournaments.title')}
      subtitle={t('manage.tournaments.subtitle')}
      onRefresh={() => void tournaments.refetch()}
      contentClassName="gap-3"
    >
      {tournaments.isError ? (
        <ErrorState error={tournaments.error} onRetry={() => void tournaments.refetch()} />
      ) : tournaments.isLoading ? (
        <SkeletonList count={3} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('manage.tournaments.emptyTitle')}
          body={t('manage.tournaments.emptyBody')}
          icon={<Trophy size={40} color={palette.fgMuted} />}
          actionLabel={t('manage.tournaments.new')}
          onAction={openNew}
        />
      ) : (
        rows.map((tournament, index) => (
          <ListItem
            key={tournament.id}
            index={index}
            leading={
              <View className="h-12 w-12 items-center justify-center rounded-md bg-accent-soft">
                <Trophy size={22} color={palette.accent} />
              </View>
            }
            title={arabic && tournament.nameAr ? tournament.nameAr : tournament.name}
            subtitle={t('manage.tournaments.range', {
              start: tournament.startDate,
              end: tournament.endDate,
            })}
            trailing={
              tournament.isActive ? (
                <Badge label={t('manage.tournaments.activeBadge')} tone="success" />
              ) : (
                <Badge label={t('manage.inactive')} />
              )
            }
            onPress={() =>
              router.push({
                pathname: '/(admin)/manage/tournaments/edit',
                params: { id: tournament.id },
              })
            }
          />
        ))
      )}
    </Screen>
  );
}
