import { useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { changePasswordSchema } from '@ahlan/shared';

import { Button, Card, InlineError, PasswordField, Screen, Text } from '../src/components';
import { HeaderBar } from '../src/components/back-button';
import { api, ApiError } from '../src/api/client';
import { useAuthStore } from '../src/store/auth';
import { useHaptics } from '../src/hooks/use-haptics';
import { homeFor } from '../src/features/admin/roles';

type Errors = { current?: string; next?: string; confirm?: string };

/**
 * Change password, opened from Settings in either workspace.
 *
 * The API signs out every other device but keeps this session, so the user
 * stays signed in here and nothing unsynced on this phone is touched.
 */
export default function ChangePasswordScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const haptics = useHaptics();
  const user = useAuthStore((state) => state.user);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  if (!user) return <Redirect href="/(auth)/login" />;
  const settingsHref = `${homeFor(user.role)}/settings` as const;

  async function handleSubmit(): Promise<void> {
    setErrors({});
    setFormError(null);
    setDone(false);

    const parsed = changePasswordSchema.safeParse({ currentPassword: current, newPassword: next });
    if (!parsed.success) {
      const found: Errors = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'currentPassword') found.current = issue.message;
        else found.next = issue.message;
      }
      setErrors(found);
      haptics.warning();
      return;
    }
    if (next !== confirm) {
      setErrors({ confirm: t('auth.passwordsDontMatch') });
      haptics.warning();
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/change-password', parsed.data);
      haptics.success();
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (error) {
      haptics.error();
      if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') {
        setErrors({ current: t('auth.invalidCredentials') });
      } else {
        setFormError(
          error instanceof ApiError
            ? t(error.translationKey, { defaultValue: t('errors.UNKNOWN') })
            : t('errors.UNKNOWN'),
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      headerAction={<HeaderBar backLabel={t('settings.title')} fallback={settingsHref} />}
    >
      <View className="w-full max-w-[560px] gap-5 self-center">
        <View className="gap-2">
          <Text variant="title">{t('settings.changePassword')}</Text>
          <Text variant="callout" tone="muted">
            {t('settings.changePasswordSubtitle')}
          </Text>
        </View>

        <Card className="gap-4">
          <PasswordField
            label={t('settings.currentPassword')}
            value={current}
            onChangeText={setCurrent}
            error={errors.current}
            autoComplete="current-password"
            textContentType="password"
          />
          <PasswordField
            label={t('settings.newPassword')}
            hint={t('auth.passwordRules')}
            value={next}
            onChangeText={setNext}
            error={errors.next}
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <PasswordField
            label={t('auth.confirmPassword')}
            value={confirm}
            onChangeText={setConfirm}
            error={errors.confirm}
            autoComplete="new-password"
            returnKeyType="go"
            onSubmitEditing={() => void handleSubmit()}
          />
          {formError ? <InlineError message={formError} /> : null}
          {done ? (
            <Text variant="callout" tone="success" accessibilityLiveRegion="polite">
              {t('settings.passwordChanged')}
            </Text>
          ) : null}
          <Button
            label={t('settings.savePassword')}
            size="lg"
            loading={saving}
            onPress={() => void handleSubmit()}
          />
        </Card>
      </View>
    </Screen>
  );
}
