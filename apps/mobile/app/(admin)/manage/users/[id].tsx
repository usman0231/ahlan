import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ROLES, type Role } from '@ahlan/shared';

import {
  Avatar,
  Button,
  Card,
  DetailRow,
  Divider,
  ErrorState,
  Field,
  InlineError,
  OptionList,
  Screen,
  Section,
  SkeletonText,
  Text,
  PasswordField,
} from '../../../../src/components';
import { HeaderBar } from '../../../../src/components/back-button';
import { RoleBadge, UserStatusBadge } from '../../../../src/components/role-badge';
import {
  useAllStadiums,
  useDeleteUser,
  useResetUserPassword,
  useSaveUserAccess,
  useSetUserStatus,
  useUser,
} from '../../../../src/features/admin/hooks';
import { validateAccess, validateResetPassword } from '../../../../src/features/admin/user-form';
import { useAuthStore } from '../../../../src/store/auth';
import { confirmDialog } from '../../../../src/utils/dialogs';
import { ApiError } from '../../../../src/api/client';
import { formatLongDate } from '../../../../src/utils/format';

function errorText(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return error instanceof ApiError
    ? t(error.translationKey, { defaultValue: t('errors.UNKNOWN') })
    : t('errors.UNKNOWN');
}

/**
 * One user: role, stadium scope, account status, password and removal.
 *
 * An administrator cannot change their own role, suspend or delete
 * themselves from here (the API refuses too) - the controls are replaced by an
 * explanation rather than offered and then rejected.
 */
export default function UserDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const me = useAuthStore((state) => state.user?.id);
  const user = useUser(id);
  const { data: stadiums } = useAllStadiums();

  const saveAccess = useSaveUserAccess();
  const setStatus = useSetUserStatus();
  const remove = useDeleteUser();
  const reset = useResetUserPassword();

  // Unsaved edits; null means the form shows the server copy as-is.
  const [draft, setDraft] = useState<{ role: Role; stadiumIds: string[] } | null>(null);
  const role: Role = draft?.role ?? user.data?.role ?? 'INSPECTOR';
  const stadiumIds = draft?.stadiumIds ?? user.data?.stadiumIds ?? [];
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessSaved, setAccessSaved] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordDone, setPasswordDone] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const isSelf = Boolean(user.data && user.data.id === me);
  const dirty = (() => {
    if (!user.data) return false;
    const before = [...user.data.stadiumIds].sort().join(',');
    const after = [...(role === 'ADMIN' ? [] : stadiumIds)].sort().join(',');
    return role !== user.data.role || (role !== 'ADMIN' && before !== after);
  })();

  const header = <HeaderBar backLabel={t('users.title')} fallback="/(admin)/manage/users" />;

  if (user.isError) {
    return (
      <Screen headerAction={header}>
        <ErrorState error={user.error} onRetry={() => void user.refetch()} />
      </Screen>
    );
  }

  const account = user.data;
  if (!account) {
    return (
      <Screen headerAction={header}>
        <SkeletonText lines={10} />
      </Screen>
    );
  }

  function toggleStadium(stadiumId: string): void {
    setAccessSaved(false);
    setDraft({
      role,
      stadiumIds: stadiumIds.includes(stadiumId)
        ? stadiumIds.filter((value) => value !== stadiumId)
        : [...stadiumIds, stadiumId],
    });
  }

  function saveAccessChanges(): void {
    if (!account) return;
    setAccessError(null);
    const invalid = validateAccess(role, stadiumIds);
    if (invalid) {
      setAccessError(t(invalid));
      return;
    }
    const roleChanged = role !== account.role;
    const run = () =>
      saveAccess.mutate(
        { user: account, role, stadiumIds: role === 'ADMIN' ? [] : stadiumIds },
        {
          onSuccess: () => {
            setDraft(null);
            setAccessSaved(true);
          },
          onError: (error) => setAccessError(errorText(error, t)),
        },
      );

    if (!roleChanged) return run();
    // A role change signs the user out everywhere, so it is confirmed.
    confirmDialog({
      title: t('users.changeRoleTitle'),
      message: t('users.changeRoleBody', { name: account.fullName, role: t(`roles.${role}`) }),
      confirmLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
      onConfirm: run,
    });
  }

  function toggleStatus(): void {
    if (!account) return;
    const next = account.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setAccountError(null);
    confirmDialog({
      title: next === 'SUSPENDED' ? t('users.suspend') : t('users.activate'),
      message:
        next === 'SUSPENDED'
          ? t('users.suspendBody', { name: account.fullName })
          : t('users.activateBody', { name: account.fullName }),
      confirmLabel: next === 'SUSPENDED' ? t('users.suspend') : t('users.activate'),
      cancelLabel: t('common.cancel'),
      destructive: next === 'SUSPENDED',
      onConfirm: () =>
        setStatus.mutate(
          { id: account.id, status: next },
          { onError: (error) => setAccountError(errorText(error, t)) },
        ),
    });
  }

  function resetPassword(): void {
    if (!account) return;
    setPasswordError(null);
    setPasswordDone(false);
    const result = validateResetPassword(password);
    if (!result.ok) {
      setPasswordError(t(result.error));
      return;
    }
    confirmDialog({
      title: t('users.resetPassword'),
      message: t('users.resetPasswordBody', { name: account.fullName }),
      confirmLabel: t('users.resetPassword'),
      cancelLabel: t('common.cancel'),
      onConfirm: () =>
        reset.mutate(
          { id: account.id, newPassword: result.newPassword },
          {
            onSuccess: () => {
              setPassword('');
              setPasswordDone(true);
            },
            onError: (error) => setPasswordError(errorText(error, t)),
          },
        ),
    });
  }

  function deleteUser(): void {
    if (!account) return;
    setAccountError(null);
    confirmDialog({
      title: t('users.delete'),
      message: t('users.deleteBody', { name: account.fullName }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      onConfirm: () =>
        remove.mutate(account.id, {
          onSuccess: () => router.replace('/(admin)/manage/users'),
          onError: (error) => setAccountError(errorText(error, t)),
        }),
    });
  }

  return (
    <Screen
      headerAction={header}
      onRefresh={() => void user.refetch()}
      contentClassName="gap-6"
      footer={
        dirty ? (
          <View className="gap-2">
            {accessError ? <InlineError message={accessError} /> : null}
            <Button
              label={t('users.saveAccess')}
              loading={saveAccess.isPending}
              onPress={saveAccessChanges}
            />
          </View>
        ) : undefined
      }
    >
      {/* Identity */}
      <Card className="gap-4">
        <View className="flex-row items-center gap-4">
          <Avatar name={account.fullName} size={56} />
          <View className="flex-1 gap-1">
            <Text variant="title" numberOfLines={2}>
              {account.fullName}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {account.email}
            </Text>
          </View>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <RoleBadge role={account.role} />
          <UserStatusBadge status={account.status} />
          {isSelf ? (
            <Text variant="caption" tone="subtle">
              {t('users.you')}
            </Text>
          ) : null}
        </View>
        <View>
          <DetailRow label={t('auth.phone')} value={account.phone} />
          <Divider />
          <DetailRow label={t('auth.organisation')} value={account.organisation} />
          <Divider />
          <DetailRow label={t('auth.jobTitle')} value={account.jobTitle} />
          <Divider />
          <DetailRow
            label={t('users.lastLogin')}
            value={
              account.lastLoginAt
                ? formatLongDate(new Date(account.lastLoginAt), i18n.language)
                : t('sync.never')
            }
          />
        </View>
      </Card>

      {/* Access */}
      <Section title={t('users.access')}>
        <Card className="gap-5">
          <Field
            label={t('admin.approveRole')}
            hint={isSelf ? t('users.selfRoleLocked') : undefined}
          >
            {isSelf ? (
              <RoleBadge role={account.role} />
            ) : (
              <OptionList
                options={ROLES.map((value) => ({
                  value,
                  label: t(`roles.${value}`),
                  description: t(`users.roleDescriptions.${value}`),
                }))}
                value={role}
                onChange={(value) => {
                  setAccessSaved(false);
                  setDraft({ role: value as Role, stadiumIds });
                }}
              />
            )}
          </Field>

          {role === 'ADMIN' ? (
            <Text variant="callout" tone="muted">
              {t('users.adminAllStadiums')}
            </Text>
          ) : (
            <Field
              label={t('admin.approveStadiums')}
              hint={t('users.stadiumHint', { count: stadiumIds.length })}
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
                onChange={toggleStadium}
              />
            </Field>
          )}

          {accessSaved && !dirty ? (
            <Text variant="caption" tone="success">
              {t('users.saved')}
            </Text>
          ) : null}
        </Card>
      </Section>

      {/* Password */}
      {!isSelf ? (
        <Section title={t('users.resetPassword')}>
          <Card className="gap-4">
            <PasswordField
              label={t('settings.newPassword')}
              hint={t('auth.passwordRules')}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setPasswordDone(false);
              }}
              autoComplete="new-password"
              error={passwordError}
            />
            <Text variant="caption" tone="muted">
              {t('users.resetPasswordNote')}
            </Text>
            {passwordDone ? (
              <Text variant="caption" tone="success">
                {t('users.passwordReset')}
              </Text>
            ) : null}
            <Button
              label={t('users.resetPassword')}
              variant="secondary"
              loading={reset.isPending}
              disabled={password.length === 0}
              onPress={resetPassword}
            />
          </Card>
        </Section>
      ) : null}

      {/* Account */}
      <Section title={t('settings.account')}>
        {isSelf ? (
          <Card>
            <Text variant="callout" tone="muted">
              {t('users.selfAccountLocked')}
            </Text>
          </Card>
        ) : (
          <Card className="gap-3">
            {accountError ? <InlineError message={accountError} /> : null}
            <Button
              label={account.status === 'ACTIVE' ? t('users.suspend') : t('users.activate')}
              variant={account.status === 'ACTIVE' ? 'secondary' : 'success'}
              loading={setStatus.isPending}
              onPress={toggleStatus}
            />
            <Button
              label={t('users.delete')}
              variant="danger"
              loading={remove.isPending}
              onPress={deleteUser}
            />
            <Text variant="caption" tone="subtle">
              {t('users.deleteNote')}
            </Text>
          </Card>
        )}
      </Section>
    </Screen>
  );
}
