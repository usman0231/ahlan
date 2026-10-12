import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { forgotPasswordSchema } from '@ahlan/shared';

import { Button, Card, InlineError, Text, TextField } from '../../src/components';
import { api, ApiError } from '../../src/api/client';
import { useHaptics } from '../../src/hooks/use-haptics';

/**
 * Step one of a forgotten password: ask for the email and send a reset link.
 *
 * The API answers the same way whether or not the address has an account, so
 * the confirmation says "if an account exists" rather than leaking which
 * emails are registered.
 */
export default function ForgotPasswordScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();

  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    setFieldError(null);
    setFormError(null);
    const parsed = forgotPasswordSchema.safeParse({ email: email.trim() });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? t('errors.VALIDATION_FAILED'));
      haptics.warning();
      return;
    }

    setSending(true);
    try {
      await api.post('/auth/forgot-password', parsed.data, { anonymous: true });
      haptics.success();
      setSentTo(parsed.data.email);
    } catch (error) {
      haptics.error();
      setFormError(
        error instanceof ApiError
          ? t(error.translationKey, { defaultValue: t('errors.UNKNOWN') })
          : t('errors.UNKNOWN'),
      );
    } finally {
      setSending(false);
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
          {sentTo ? (
            <Card raised className="gap-3">
              <Text variant="title">{t('auth.resetLinkSentTitle')}</Text>
              <Text variant="body" tone="muted">
                {t('auth.resetLinkSentBody', { email: sentTo })}
              </Text>
            </Card>
          ) : (
            <>
              <View className="gap-2">
                <Text variant="title">{t('auth.forgotTitle')}</Text>
                <Text variant="callout" tone="muted">
                  {t('auth.forgotSubtitle')}
                </Text>
              </View>
              <Card raised className="gap-4">
                <TextField
                  label={t('auth.email')}
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChangeText={setEmail}
                  error={fieldError}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="send"
                  onSubmitEditing={() => void handleSubmit()}
                />
                {formError ? <InlineError message={formError} /> : null}
                <Button
                  label={t('auth.sendResetLink')}
                  size="lg"
                  loading={sending}
                  onPress={() => void handleSubmit()}
                />
              </Card>
            </>
          )}

          <Button
            label={t('auth.backToSignIn')}
            variant="ghost"
            onPress={() => router.replace('/(auth)/login')}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
