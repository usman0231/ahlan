import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Link, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loginSchema } from '@ahlan/shared';

import {
  Appear,
  Button,
  FadeAppear,
  HeroSurface,
  InlineError,
  LogoMark,
  Text,
  PasswordField,
  TextField,
  Wordmark,
} from '../../src/components';
import { Icon } from '../../src/components/icon';
import { elevation } from '../../src/theme/tokens';
import { ApiError } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth';
import { useHaptics } from '../../src/hooks/use-haptics';
import { homeFor } from '../../src/features/admin/roles';

export default function LoginScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const signIn = useAuthStore((state) => state.signIn);
  const signingIn = useAuthStore((state) => state.signingIn);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    setFieldErrors({});

    // Validated with the same schema the API uses, so the keyboard does not
    // have to be dismissed to find out the address was malformed.
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'email') errors.email = issue.message;
        if (key === 'password') errors.password = issue.message;
      }
      setFieldErrors(errors);
      haptics.warning();
      return;
    }

    try {
      const user = await signIn(parsed.data);
      haptics.success();
      router.replace(homeFor(user.role));
    } catch (error) {
      haptics.error();
      setFormError(
        error instanceof ApiError
          ? t(error.translationKey, { defaultValue: t('errors.UNKNOWN') })
          : t('errors.UNKNOWN'),
      );
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-bg"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand hero, full-bleed. The form card overlaps its lower edge, which
            is what gives the screen depth instead of two stacked boxes. */}
        <HeroSurface
          className="rounded-b-[32px]"
          style={{ paddingTop: insets.top + 56, paddingBottom: 96 }}
        >
          <View className="w-full max-w-[440px] gap-6 self-center px-gutter">
            <FadeAppear>
              <View className="flex-row items-center gap-3">
                <LogoMark size={64} />
                <Wordmark size="lg" onHero />
              </View>
            </FadeAppear>
            <Appear index={1} className="gap-2">
              <Text variant="display" tone="onHero">
                {t('auth.welcomeTitle')}
              </Text>
              <Text variant="body" tone="onHero" className="opacity-75">
                {t('auth.signInSubtitle')}
              </Text>
            </Appear>
          </View>
        </HeroSurface>

        <View className="-mt-14 w-full max-w-[440px] self-center px-gutter">
          <Appear index={2}>
            <View
              className="gap-4 rounded-xl border border-border bg-surface p-5"
              style={elevation.floating}
            >
              <TextField
                label={t('auth.email')}
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChangeText={setEmail}
                error={fieldErrors.email}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
              />

              <PasswordField
                label={t('auth.password')}
                value={password}
                onChangeText={setPassword}
                error={fieldErrors.password}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => void handleSubmit()}
              />

              <Link href="/(auth)/forgot-password" asChild>
                <Pressable
                  accessibilityRole="link"
                  className="-mt-2 min-h-touch justify-center self-end"
                >
                  <Text variant="callout" tone="primary">
                    {t('auth.forgotPassword')}
                  </Text>
                </Pressable>
              </Link>

              {formError ? <InlineError message={formError} /> : null}

              <Button
                label={t('auth.signIn')}
                size="lg"
                loading={signingIn}
                onPress={() => void handleSubmit()}
                className="mt-1"
              />
            </View>
          </Appear>

          <Appear index={3} className="mt-4 flex-row items-center justify-center gap-2">
            <Text variant="caption" tone="muted">
              {t('auth.noAccount')}
            </Text>
            <Link href="/(auth)/register" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-touch items-center justify-center px-2"
              >
                <Text variant="callout" tone="primary">
                  {t('auth.requestAccess')}
                </Text>
              </Pressable>
            </Link>
          </Appear>

          <View className="mt-6 flex-row items-center justify-center gap-2 opacity-70">
            <Icon name="check" size={14} tone="muted" />
            <Text variant="caption" tone="subtle">
              {t('auth.trustLine')}
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
