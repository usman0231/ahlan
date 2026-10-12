import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerSchema } from '@ahlan/shared';

import { Button, Card, InlineError, Text, PasswordField,
  TextField } from '../../src/components';
import { ApiError } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';
import { useHaptics } from '../../src/hooks/use-haptics';

/**
 * Self-registration.
 *
 * This creates an access request, not an account. The copy says so plainly,
 * because somebody who thinks they have signed up and then cannot sign in will
 * assume the app is broken.
 */
export default function RegisterScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const register = useAuthStore((state) => state.register);

  const [values, setValues] = useState({
    fullName: '',
    email: '',
    password: '',
    phone: '',
    organisation: '',
    jobTitle: '',
    note: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  function set(key: keyof typeof values, value: string): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    setErrors({});

    const parsed = registerSchema.safeParse({
      fullName: values.fullName,
      email: values.email,
      password: values.password,
      phone: values.phone || undefined,
      organisation: values.organisation || undefined,
      jobTitle: values.jobTitle || undefined,
      note: values.note || undefined,
      requestedStadiumIds: [],
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      haptics.warning();
      return;
    }

    setSubmitting(true);
    try {
      await register(parsed.data);
      haptics.success();
      setSent(true);
    } catch (error) {
      haptics.error();
      setFormError(
        error instanceof ApiError
          ? t(error.translationKey, { defaultValue: t('errors.UNKNOWN') })
          : t('errors.UNKNOWN'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <View
        className="flex-1 justify-center gap-6 bg-bg px-gutter"
        style={{ paddingTop: insets.top }}
      >
        <Card raised className="gap-3">
          <Text variant="title">{t('auth.requestSentTitle')}</Text>
          <Text variant="body" tone="muted">
            {t('auth.requestSentBody')}
          </Text>
        </Card>
        <Button label={t('auth.signIn')} onPress={() => router.replace('/(auth)/login')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-bg"
      style={{ paddingTop: insets.top }}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-2">
          <Text variant="title">{t('auth.registerTitle')}</Text>
          <Text variant="callout" tone="muted">
            {t('auth.registerSubtitle')}
          </Text>
        </View>

        <View className="gap-4">
          <TextField
            label={t('auth.fullName')}
            value={values.fullName}
            onChangeText={(value) => set('fullName', value)}
            error={errors.fullName}
            autoComplete="name"
            textContentType="name"
          />
          <TextField
            label={t('auth.email')}
            placeholder={t('auth.emailPlaceholder')}
            value={values.email}
            onChangeText={(value) => set('email', value)}
            error={errors.email}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          <PasswordField
            label={t('auth.password')}
            hint={t('auth.passwordRules')}
            value={values.password}
            onChangeText={(value) => set('password', value)}
            error={errors.password}
            autoComplete="new-password"
          />
          <TextField
            label={t('auth.phone')}
            value={values.phone}
            onChangeText={(value) => set('phone', value)}
            error={errors.phone}
            optional
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          <TextField
            label={t('auth.organisation')}
            value={values.organisation}
            onChangeText={(value) => set('organisation', value)}
            optional
          />
          <TextField
            label={t('auth.jobTitle')}
            value={values.jobTitle}
            onChangeText={(value) => set('jobTitle', value)}
            optional
          />
          <TextField
            label={t('auth.note')}
            value={values.note}
            onChangeText={(value) => set('note', value)}
            optional
            multiline
          />

          {formError ? <InlineError message={formError} /> : null}

          <Button
            label={t('auth.submitRequest')}
            size="lg"
            loading={submitting}
            onPress={() => void handleSubmit()}
          />
          <Button
            label={t('common.cancel')}
            variant="ghost"
            onPress={() => router.back()}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
