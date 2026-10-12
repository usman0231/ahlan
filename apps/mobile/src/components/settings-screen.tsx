import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { KeyRound } from 'lucide-react-native';

import { Button } from './button';
import { Card, Section } from './card';
import { Divider, DetailRow, ListItem } from './list-item';
import { OptionList, ToggleRow } from './controls';
import { Screen } from './screen';
import { SyncStatusLine } from './offline-banner';
import { Text } from './text';
import { useSettingsStore, type Locale, type ThemePreference } from '../store/settings';
import { useAuthStore } from '../store/auth';
import { useManualSync } from '../hooks/use-sync';
import { useSyncStore } from '../store/sync';
import { resetDatabase } from '../db';
import { confirmDialog } from '../utils/dialogs';
import { applyLocale } from '../i18n';
import { usePalette } from '../theme/theme-provider';

/**
 * Settings, shared by both workspaces.
 *
 * The high-contrast theme lives here deliberately: it is the setting an
 * inspector actually needs on a bright day, so it is the first thing on the
 * screen rather than buried under an accessibility submenu.
 */
export function SettingsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const { sync, syncing } = useManualSync();
  const pendingCount = useSyncStore((state) => state.pendingCount);

  const theme = useSettingsStore((state) => state.theme);
  const locale = useSettingsStore((state) => state.locale);
  const haptics = useSettingsStore((state) => state.hapticsEnabled);
  const wifiOnly = useSettingsStore((state) => state.wifiOnlyUploads);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setLocale = useSettingsStore((state) => state.setLocale);
  const setHaptics = useSettingsStore((state) => state.setHapticsEnabled);
  const setWifiOnly = useSettingsStore((state) => state.setWifiOnlyUploads);

  function handleSignOut(): void {
    // Signing out wipes the local database, so unsynced work has to be
    // called out explicitly rather than silently discarded.
    const message =
      pendingCount > 0 ? t('states.pendingBanner', { count: pendingCount }) : t('settings.account');

    confirmDialog({
      title: t('common.signOut'),
      message,
      confirmLabel: t('common.signOut'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: () => {
        void (async () => {
          await signOut();

          // The session is already gone by this point, so the wipe must not
          // be able to strand the user on a signed-out screen. It can fail
          // for reasons that have nothing to do with them - a second tab
          // holding the database open, a disk error - and the only honest
          // response is to land them on sign-in anyway and say the local
          // copy is still there.
          try {
            await resetDatabase();
          } catch (error) {
            console.warn('[settings] local database wipe failed', error);
          }

          router.replace('/(auth)/login');
        })();
      },
    });
  }

  return (
    <Screen title={t('settings.title')} contentClassName="gap-6">
      {/* Who is signed in */}
      <Card className="gap-1">
        <Text variant="heading">{user?.fullName}</Text>
        <Text variant="caption" tone="muted">
          {user?.email}
        </Text>
        <Text variant="caption" tone="subtle">
          {user ? t(`roles.${user.role}`) : t('common.appName')}
        </Text>
      </Card>

      <Section title={t('settings.appearance')}>
        <Card padded={false}>
          <View className="px-4 pt-3">
            <Text variant="callout">{t('settings.theme')}</Text>
          </View>
          <View className="p-3">
            <OptionList
              options={(['system', 'light', 'dark', 'contrast'] as ThemePreference[]).map(
                (value) => ({ value, label: t(`settings.themes.${value}`) }),
              )}
              value={theme}
              onChange={(value) => setTheme(value as ThemePreference)}
            />
          </View>
        </Card>

        <Card padded={false}>
          <View className="px-4 pt-3">
            <Text variant="callout">{t('settings.language')}</Text>
          </View>
          <View className="p-3">
            <OptionList
              options={(['en', 'ar'] as Locale[]).map((value) => ({
                value,
                label: t(`settings.languages.${value}`),
              }))}
              value={locale}
              onChange={(value) => {
                setLocale(value as Locale);
                applyLocale(value as Locale);
              }}
            />
          </View>
        </Card>

        <Card padded={false}>
          <ToggleRow label={t('settings.haptics')} value={haptics} onChange={setHaptics} />
          <Divider />
          <ToggleRow
            label={t('settings.wifiOnlyUploads')}
            value={wifiOnly}
            onChange={setWifiOnly}
          />
        </Card>
      </Section>

      <Section title={t('settings.account')}>
        <ListItem
          title={t('settings.changePassword')}
          subtitle={t('settings.changePasswordSubtitle')}
          leading={<KeyRound size={20} color={palette.primary} />}
          onPress={() => router.push('/change-password')}
        />
      </Section>

      <Section title={t('settings.data')}>
        <Card className="gap-3">
          <SyncStatusLine />
          <Button
            label={t('sync.syncNow')}
            variant="secondary"
            loading={syncing}
            onPress={() => void sync()}
          />
        </Card>
      </Section>

      <Section title={t('settings.about')}>
        <Card padded={false} className="px-4 py-2">
          <DetailRow
            label={t('settings.version')}
            value={Constants.expoConfig?.version ?? '0.1.0'}
          />
        </Card>
      </Section>

      <Button label={t('common.signOut')} variant="danger" onPress={handleSignOut} />
    </Screen>
  );
}
