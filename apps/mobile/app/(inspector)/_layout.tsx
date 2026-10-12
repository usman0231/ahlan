import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  INSPECTOR_NAV,
  ResponsiveTabBar,
  useResponsiveTabsOptions,
} from '../../src/components/responsive-nav';
import { useAuthStore } from '../../src/store/auth';
import { useSyncEngine } from '../../src/hooks/use-sync';
import { homeFor } from '../../src/features/admin/roles';
import { useMyOpenActionCount } from '../../src/features/findings/hooks';

/**
 * The Venue Inspector workspace.
 *
 * Navigation (U1): a bottom dock at every width (Overview, My Stadium,
 * Checklists, HSE Obs., EOD, More). The sidebar rendering is kept but not
 * selected. Every screen is a tab route; the bar decides
 * which ones it shows.
 *
 * The sync engine is mounted here rather than at the root: it should only run
 * for a signed-in inspector, and this is the layout that is alive for exactly
 * as long as that is true.
 */
export default function InspectorLayout(): React.JSX.Element {
  const { t } = useTranslation();
  const options = useResponsiveTabsOptions();
  const user = useAuthStore((state) => state.user);
  const openActions = useMyOpenActionCount();

  useSyncEngine();

  if (!user) return <Redirect href="/(auth)/login" />;
  // An admin who deep-links in belongs in their own workspace.
  // (Supervisors too: they review in the same workspace as administrators.)
  if (homeFor(user.role) !== '/(inspector)') return <Redirect href={homeFor(user.role)} />;

  return (
    <Tabs
      screenOptions={options}
      tabBar={(props) => (
        <ResponsiveTabBar
          {...props}
          items={INSPECTOR_NAV}
          title={t('nav.brand')}
          workspaceLabel={t('nav.inspectorWorkspace')}
          badges={{ actions: openActions, more: openActions }}
        />
      )}
    >
      <Tabs.Screen name="index" options={{ title: t('nav.myOverview') }} />
      <Tabs.Screen name="stadium" options={{ title: t('nav.myStadium') }} />
      <Tabs.Screen name="observations" options={{ title: t('nav.hseObservation') }} />
      <Tabs.Screen name="inspections" options={{ title: t('nav.myChecklists') }} />
      <Tabs.Screen name="eod" options={{ title: t('nav.eodReport') }} />
      <Tabs.Screen name="findings" options={{ title: t('nav.myFindings') }} />
      <Tabs.Screen name="actions" options={{ title: t('nav.myActions') }} />
      <Tabs.Screen name="settings" options={{ title: t('nav.settings') }} />
      <Tabs.Screen name="more" options={{ title: t('nav.more') }} />
    </Tabs>
  );
}
