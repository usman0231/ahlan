import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, ScanEye, Settings, SlidersHorizontal } from 'lucide-react-native';

import { Appear, Screen, Section } from '../../src/components';
import { NavTile } from '../../src/components/nav-tile';
import { usePendingAccessRequestCount } from '../../src/features/admin/hooks';
import { moreDestinationsFor, type MoreDestination } from '../../src/features/admin/admin-nav';
import { useAuthStore } from '../../src/store/auth';
import { usePalette } from '../../src/theme/theme-provider';

/**
 * What does not fit on the six-item dock: HSE Observation, EOD reports,
 * management (administrator only) and settings. The list itself comes from
 * `moreDestinationsFor`, so the rule is unit tested.
 */
export default function AdminMoreScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const role = useAuthStore((state) => state.user?.role);
  const { data: pending } = usePendingAccessRequestCount();
  const admin = role === 'ADMIN';

  const tiles: Record<
    MoreDestination,
    { title: string; description: string; icon: React.ReactNode; href: Href; count?: number }
  > = {
    hse: {
      title: t('admin.nav.hse'),
      description: t('admin.more.hse'),
      icon: <ScanEye size={22} color={palette.primary} />,
      href: '/(admin)/hse',
    },
    'eod-reports': {
      title: t('admin.nav.eod'),
      description: admin ? t('admin.more.eodAdmin') : t('admin.more.eodSupervisor'),
      icon: <CalendarCheck size={22} color={palette.primary} />,
      href: '/(admin)/eod-reports',
    },
    manage: {
      title: t('admin.nav.manage'),
      description: t('admin.manageSubtitle'),
      icon: <SlidersHorizontal size={22} color={palette.primary} />,
      href: '/(admin)/manage',
      count: pending?.pending,
    },
    settings: {
      title: t('admin.nav.settings'),
      description: t('admin.more.settings'),
      icon: <Settings size={22} color={palette.primary} />,
      href: '/(admin)/settings',
    },
  };

  return (
    <Screen title={t('admin.nav.more')} contentClassName="gap-6">
      <Section>
        {moreDestinationsFor(role).map((key, index) => {
          const tile = tiles[key];
          return (
            <Appear key={key} index={index}>
              <NavTile
                title={tile.title}
                description={tile.description}
                icon={tile.icon}
                count={tile.count}
                onPress={() => router.push(tile.href)}
              />
            </Appear>
          );
        })}
      </Section>
    </Screen>
  );
}
