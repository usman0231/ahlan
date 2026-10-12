import { createElement } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ClipboardCheck, List, ScanEye } from 'lucide-react-native';
import type { Discipline } from '@ahlan/shared';

import {
  Appear,
  Card,
  EmptyState,
  ErrorState,
  PressableCard,
  Screen,
  Skeleton,
  Text,
} from '../../../src/components';
import { CardGrid } from '../../../src/features/admin/components/admin-ui';
import { NavTile } from '../../../src/components/nav-tile';
import { useDisciplines } from '../../../src/features/admin/hooks';
import { disciplineIcon } from '../../../src/features/observations/discipline-icon';
import { usePalette } from '../../../src/theme/theme-provider';
import { fonts } from '../../../src/theme/tokens';

/**
 * HSE Observation for the administrator and supervisor (client mockup): one
 * card per discipline, each opening its dashboard of charts. Reviewers do not
 * raise observations, so there is no "New observation" action here.
 */
export default function AdminHseScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const disciplines = useDisciplines();
  const rows = (disciplines.data ?? []).filter((discipline) => discipline.isActive);

  return (
    <Screen
      title={t('admin.hse.title')}
      subtitle={t('admin.hse.subtitle')}
      wide
      onRefresh={() => void disciplines.refetch()}
      contentClassName="gap-5"
    >
      <Appear index={0}>
        <Card className="flex-row items-center gap-4">
          <View className="h-12 w-12 items-center justify-center rounded-md bg-accent-soft">
            <ClipboardCheck size={24} color={palette.accent} />
          </View>
          <View className="flex-1 gap-0.5">
            <Text variant="overline" tone="subtle">
              {t('admin.hse.overline')}
            </Text>
            <Text variant="heading">{t('admin.hse.selectCategory')}</Text>
            <Text variant="caption" tone="muted">
              {t('admin.hse.selectCategoryHint')}
            </Text>
          </View>
        </Card>
      </Appear>

      <Appear index={1}>
        <NavTile
          title={t('admin.observations.title')}
          description={t('admin.observations.hubDescription')}
          icon={<List size={22} color={palette.primary} />}
          onPress={() => router.push('/(admin)/hse/observations')}
        />
      </Appear>

      {disciplines.isError ? (
        <ErrorState error={disciplines.error} onRetry={() => void disciplines.refetch()} />
      ) : disciplines.isLoading ? (
        <CardGrid minColumnWidth={240}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} height={210} rounded="md" />
          ))}
        </CardGrid>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('admin.hse.emptyTitle')}
          icon={<ScanEye size={40} color={palette.fgMuted} />}
        />
      ) : (
        <CardGrid minColumnWidth={240}>
          {rows.map((discipline, index) => (
            <Appear key={discipline.id} index={index + 1}>
              <DisciplineCard
                discipline={discipline}
                onPress={() =>
                  router.push({ pathname: '/(admin)/hse/[id]', params: { id: discipline.id } })
                }
              />
            </Appear>
          ))}
        </CardGrid>
      )}
    </Screen>
  );
}

function DisciplineCard({
  discipline,
  onPress,
}: {
  discipline: Discipline;
  onPress: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const arabic = i18n.language.startsWith('ar');
  const Chevron = i18n.dir() === 'rtl' ? ChevronLeft : ChevronRight;
  const name = arabic && discipline.nameAr ? discipline.nameAr : discipline.name;
  const description =
    arabic && discipline.descriptionAr ? discipline.descriptionAr : discipline.description;

  return (
    <PressableCard
      accessibilityLabel={`${name}. ${t('admin.hse.openDashboard')}`}
      onPress={onPress}
      className="min-h-[210px] gap-4 p-5"
    >
      <View className="h-12 w-12 items-center justify-center rounded-md bg-accent-soft">
        {createElement(disciplineIcon(discipline.icon), { size: 24, color: palette.accent })}
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
          {t('admin.hse.openDashboard')}
        </Text>
        <Chevron size={18} color={palette.fg} />
      </View>
    </PressableCard>
  );
}
