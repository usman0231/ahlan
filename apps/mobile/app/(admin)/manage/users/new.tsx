import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ROLES, type Role } from '@ahlan/shared';

import {
  Button,
  Card,
  Field,
  InlineError,
  OptionList,
  Screen,
  Section,
  Text,
  PasswordField,
  TextField,
} from '../../../../src/components';
import { HeaderBar } from '../../../../src/components/back-button';
import { useAllStadiums, useCreateUser } from '../../../../src/features/admin/hooks';
import {
  validateCreateUser,
  type CreateUserField,
  type FieldErrors,
} from '../../../../src/features/admin/user-form';
import { ApiError } from '../../../../src/api/client';

/**
 * Create an account directly, skipping the access-request flow: the user can
 * sign in immediately with the password set here. Validated with the shared
 * `createUserSchema`, including "a supervisor or inspector needs a stadium".
 */
export default function NewUserScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { data: stadiums } = useAllStadiums();
  const create = useCreateUser();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('INSPECTOR');
  const [stadiumIds, setStadiumIds] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<CreateUserField>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function submit(): void {
    setFormError(null);
    const result = validateCreateUser({ fullName, email, phone, role, stadiumIds, password });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    create.mutate(result.data, {
      onSuccess: (user) =>
        router.replace({ pathname: '/(admin)/manage/users/[id]', params: { id: user.id } }),
      onError: (error) =>
        setFormError(
          error instanceof ApiError
            ? t(error.translationKey, { defaultValue: t('errors.UNKNOWN') })
            : t('errors.UNKNOWN'),
        ),
    });
  }

  const tr = (key: string | undefined) => (key ? t(key) : undefined);

  return (
    <Screen
      headerAction={<HeaderBar backLabel={t('users.title')} fallback="/(admin)/manage/users" />}
      title={t('users.new')}
      contentClassName="gap-6"
      footer={<Button label={t('users.create')} loading={create.isPending} onPress={submit} />}
    >
      <Text variant="callout" tone="muted">
        {t('users.createIntro')}
      </Text>

      <Section title={t('users.profile')}>
        <Card className="gap-4">
          <TextField
            label={t('auth.fullName')}
            value={fullName}
            onChangeText={setFullName}
            autoComplete="name"
            error={tr(errors.fullName)}
          />
          <TextField
            label={t('auth.email')}
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            error={tr(errors.email)}
          />
          <TextField
            label={t('auth.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            optional
            error={tr(errors.phone)}
          />
        </Card>
      </Section>

      <Section title={t('users.access')}>
        <Card className="gap-5">
          <Field label={t('admin.approveRole')}>
            <OptionList
              options={ROLES.map((value) => ({
                value,
                label: t(`roles.${value}`),
                description: t(`users.roleDescriptions.${value}`),
              }))}
              value={role}
              onChange={(value) => setRole(value as Role)}
            />
          </Field>
          {role === 'ADMIN' ? (
            <Text variant="callout" tone="muted">
              {t('users.adminAllStadiums')}
            </Text>
          ) : (
            <Field
              label={t('admin.approveStadiums')}
              hint={t('users.stadiumHint', { count: stadiumIds.length })}
              error={tr(errors.stadiumIds)}
            >
              <OptionList
                multiple
                options={(stadiums ?? []).map((stadium) => ({
                  value: stadium.id,
                  label: stadium.name,
                  description: stadium.isActive
                    ? stadium.code
                    : `${stadium.code} · ${t('stadiums.inactive')}`,
                }))}
                selectedValues={stadiumIds}
                onChange={(id) =>
                  setStadiumIds((current) =>
                    current.includes(id)
                      ? current.filter((value) => value !== id)
                      : [...current, id],
                  )
                }
              />
            </Field>
          )}
        </Card>
      </Section>

      <Section title={t('users.initialPassword')}>
        <Card className="gap-4">
          <PasswordField
            label={t('auth.password')}
            hint={t('auth.passwordRules')}
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
            error={tr(errors.password)}
          />
        </Card>
      </Section>

      {formError ? <InlineError message={formError} /> : null}
    </Screen>
  );
}
