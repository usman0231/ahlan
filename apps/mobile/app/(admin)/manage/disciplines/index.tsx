import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Shapes } from 'lucide-react-native';

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
import { DisciplineIcon } from '../../../../src/features/observations/discipline-icon';
import { useManagedDisciplines } from '../../../../src/features/admin/manage-hooks';
import { isColorToken } from '../../../../src/features/admin/catalog-form';
import { usePalette } from '../../../../src/theme/theme-provider';

/**
 * Disciplines (Work at Height, Electrical Safety, ...): the rows behind the
 * HSE Observation tiles and the discipline checklists. Inactive ones stay
 * listed here so they can be switched back on.
 */
export default function DisciplinesScreen(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const arabic = i18n.language.startsWith('ar');
  const disciplines = useManagedDisciplines();
  const rows = disciplines.data ?? [];

  const header = (
    <HeaderBar backLabel={t('admin.manage')} fallback="/(admin)/manage">
      <Button
        label={t('manage.disciplines.new')}
        size="sm"
        fullWidth={false}
        onPress={() => router.push('/(admin)/manage/disciplines/edit')}
      />
    </HeaderBar>
  );

  return (
    <Screen
      headerAction={header}
      title={t('manage.disciplines.title')}
      subtitle={t('manage.disciplines.subtitle')}
      onRefresh={() => void disciplines.refetch()}
      contentClassName="gap-3"
    >
      {disciplines.isError ? (
        <ErrorState error={disciplines.error} onRetry={() => void disciplines.refetch()} />
      ) : disciplines.isLoading ? (
        <SkeletonList count={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('manage.disciplines.emptyTitle')}
          body={t('manage.disciplines.emptyBody')}
          icon={<Shapes size={40} color={palette.fgMuted} />}
          actionLabel={t('manage.disciplines.new')}
          onAction={() => router.push('/(admin)/manage/disciplines/edit')}
        />
      ) : (
        rows.map((discipline, index) => {
          const tone = isColorToken(discipline.colorToken) ? discipline.colorToken : 'accent';
          return (
            <ListItem
              key={discipline.id}
              index={index}
              leading={
                <View
                  className="h-12 w-12 items-center justify-center rounded-md bg-surface-sunken"
                  style={{ borderStartWidth: 3, borderStartColor: palette[tone] }}
                >
                  <DisciplineIcon name={discipline.icon} size={22} color={palette[tone]} />
                </View>
              }
              title={arabic && discipline.nameAr ? discipline.nameAr : discipline.name}
              subtitle={
                (arabic && discipline.descriptionAr
                  ? discipline.descriptionAr
                  : discipline.description) ?? undefined
              }
              meta={discipline.slug}
              trailing={
                discipline.isActive ? (
                  <Badge label={t('manage.active')} tone="success" />
                ) : (
                  <Badge label={t('manage.inactive')} />
                )
              }
              onPress={() =>
                router.push({
                  pathname: '/(admin)/manage/disciplines/edit',
                  params: { id: discipline.id },
                })
              }
            />
          );
        })
      )}
    </Screen>
  );
}
