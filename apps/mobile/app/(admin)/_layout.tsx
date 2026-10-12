import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  ResponsiveTabBar,
  useNavMode,
  useResponsiveTabsOptions,
} from '../../src/components/responsive-nav';
import { useAuthStore } from '../../src/store/auth';
import { usePendingAccessRequestCount } from '../../src/features/admin/hooks';
import { adminNavFor } from '../../src/features/admin/admin-nav';
import { canManage, homeFor } from '../../src/features/admin/roles';

/**
 * The review workspace, shared by the HSE Administrator and the Supervisor.
 *
 * One shell rather than two: a supervisor reviews exactly what an admin
 * reviews, for fewer stadiums, so the screens are the same and only the
 * management hub is withheld (`adminNavFor`, plus the guard on the Manage
 * layout for deep links). The API scopes the data; the navigation only
 * decides what is offered.
 *
 * Navigation: the six-item graphite dock at every width (Overview, Stadiums,
 * Checklists, Findings, Reports, More - see `adminNavFor`). The pending
 * access-request count rides on Manage (and on More, which holds Manage on
 * the dock), because an unapproved inspector is someone who cannot work.
 *
 * No sync engine here: review screens read from the API.
 */
export default function AdminLayout(): React.JSX.Element {
  const { t } = useTranslation();
  const options = useResponsiveTabsOptions();
  const mode = useNavMode();
  const user = useAuthStore((state) => state.user);
  const { data: pending } = usePendingAccessRequestCount();

  if (!user) return <Redirect href="/(auth)/login" />;
  if (homeFor(user.role) !== '/(admin)') return <Redirect href={homeFor(user.role)} />;

  const admin = canManage(user.role);
  const items = adminNavFor(user.role);
  const pendingCount = admin ? pending?.pending || undefined : undefined;

  return (
    <Tabs
      screenOptions={options}
      tabBar={(props) => (
        <ResponsiveTabBar
          {...props}
          items={items}
          title={t('common.appName')}
          workspaceLabel={
            admin ? t('admin.nav.adminWorkspace') : t('admin.nav.supervisorWorkspace')
          }
          badges={{ manage: pendingCount, more: mode === 'phone' ? pendingCount : undefined }}
        />
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="stadiums" />
      <Tabs.Screen name="hse" />
      <Tabs.Screen name="checklists" />
      {/* Not `eod`/`findings`: the field workspace owns those URLs, and Expo
          Router resolves a URL shared by two groups to one group only. */}
      <Tabs.Screen name="eod-reports" />
      <Tabs.Screen name="review-findings" />
      <Tabs.Screen name="reports" />
      <Tabs.Screen name="manage" />
      <Tabs.Screen name="settings" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}
