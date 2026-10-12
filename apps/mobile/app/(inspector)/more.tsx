import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Screen } from '../../src/components';
import { NavTile } from '../../src/components/nav-tile';
import { INSPECTOR_NAV, itemsFor } from '../../src/components/responsive-nav';
import { usePalette } from '../../src/theme/theme-provider';
import { useMyOpenActionCount } from '../../src/features/findings/hooks';

/** Routes reachable from "More" on a phone: everything the dock does not show. */
const MORE_ITEMS = INSPECTOR_NAV.filter(
  (item) => !itemsFor(INSPECTOR_NAV, 'phone').some((visible) => visible.route === item.route),
);

/**
 * "More" on the phone dock: My Findings, My Actions and Settings.
 * On a wide window these sit in the sidebar and this screen is not linked.
 */
export default function MoreScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const openActions = useMyOpenActionCount();

  return (
    <Screen title={t('nav.more')} contentClassName="gap-3">
      <View className="gap-3">
        {MORE_ITEMS.map((item) => {
          const IconComponent = item.icon;
          return (
            <NavTile
              key={item.route}
              title={t(item.labelKey)}
              description={t(`nav.descriptions.${item.route}`)}
              icon={<IconComponent size={22} color={palette.primary} />}
              count={item.route === 'actions' ? openActions : undefined}
              onPress={() => router.navigate(`/(inspector)/${item.route}` as never)}
            />
          );
        })}
      </View>
    </Screen>
  );
}
