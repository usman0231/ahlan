import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resetPasswordSchema } from '@ahlan/shared';

import { Button, Card, InlineError, PasswordField, Text } from '../../src/components';
import { api, ApiError } from '../../src/api/client';
import { useHaptics } from '../../src/hooks/use-haptics';

/**
 * Step two of a forgotten password: the page the emailed link opens
 * (`/reset-password?token=...`). The token is single-use and expires after an
 * hour; the API also signs the account out everywhere once it is used.
 */
export default function ResetPasswordScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(token ? null : t('auth.resetLinkInvalid'));
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(): Promise<void> {
    setErrors({});
    setFormError(null);
    if (!token) {
      setFormError(t('auth.resetLinkInvalid'));
      return;
    }
    const parsed = resetPasswordSchema.safeParse({ token, newPassword: password });
    if (!parsed.success) {
      const issue = parsed.error.issues.find((candidate) => candidate.path[0] === 'newPassword');
      if (issue) setErrors({ password: issue.message });
      else setFormError(t('auth.resetLinkInvalid'));
      haptics.warning();
      return;
    }
    if (password !== confirm) {
      setErrors({ confirm: t('auth.passwordsDontMatch') });
      haptics.warning();
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/reset-password', parsed.data, { anonymous: true });
      haptics.success();
      setDone(true);
    } catch (error) {
      haptics.error();
      setFormError(
        error instanceof ApiError
          ? error.status === 400 || error.status === 404 || error.status === 410
            ? t('auth.resetLinkInvalid')
            : t(error.translationKey, { defaultValue: t('errors.UNKNOWN') })
          : t('errors.UNKNOWN'),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-bg"
      style={{ paddingTop: insets.top }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-[440px] gap-5 self-center px-gutter py-8">
          {done ? (
            <Card raised className="gap-3">
              <Text variant="title">{t('auth.resetDoneTitle')}</Text>
              <Text variant="body" tone="muted">
                {t('auth.resetDoneBody')}
              </Text>
            </Card>
          ) : (
            <>
              <View className="gap-2">
                <Text variant="title">{t('auth.resetTitle')}</Text>
                <Text variant="callout" tone="muted">
                  {t('auth.resetSubtitle')}
                </Text>
              </View>
              <Card raised className="gap-4">
                <PasswordField
                  label={t('settings.newPassword')}
                  hint={t('auth.passwordRules')}
                  value={password}
                  onChangeText={setPassword}
                  error={errors.password}
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
                <Button
                  label={t('auth.resetPassword')}
                  size="lg"
                  loading={saving}
                  disabled={!token}
                  onPress={() => void handleSubmit()}
                />
              </Card>
            </>
          )}

          <Button
            label={done ? t('auth.signIn') : t('auth.backToSignIn')}
            variant={done ? 'primary' : 'ghost'}
            onPress={() => router.replace('/(auth)/login')}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
