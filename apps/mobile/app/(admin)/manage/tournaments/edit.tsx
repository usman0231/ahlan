import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Trash2, Zap } from 'lucide-react-native';
import { createTournamentSchema, type Tournament } from '@ahlan/shared';

import {
  Button,
  Card,
  ErrorState,
  InlineError,
  Screen,
  Section,
  SkeletonText,
  Text,
  TextField,
} from '../../../../src/components';
import { HeaderBar } from '../../../../src/components/back-button';
import {
  useActivateTournament,
  useCreateTournament,
  useDeleteTournament,
  useTournaments,
  useUpdateTournament,
} from '../../../../src/features/admin/manage-hooks';
import { tournamentRangeProblem } from '../../../../src/features/admin/catalog-form';
import { useReasonDialog } from '../../../../src/features/admin/components/reason-dialog';
import { usePalette } from '../../../../src/theme/theme-provider';
import { confirmDialog } from '../../../../src/utils/dialogs';
import { ApiError } from '../../../../src/api/client';

/** Create or edit a tournament (`?id=` edits), activate it, or delete it. */
export default function TournamentEditScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const tournaments = useTournaments();
  const existing = id ? tournaments.data?.find((row) => row.id === id) : undefined;
  const header = (
    <HeaderBar backLabel={t('manage.tournaments.title')} fallback="/(admin)/manage/tournaments" />
  );

  if (id && tournaments.isError) {
    return (
      <Screen headerAction={header}>
        <ErrorState error={tournaments.error} onRetry={() => void tournaments.refetch()} />
      </Screen>
    );
  }
  if (id && !existing) {
    return (
      <Screen headerAction={header}>
        <SkeletonText lines={6} />
      </Screen>
    );
  }
  return (
    <TournamentForm key={existing?.id ?? 'new'} tournament={existing ?? null} header={header} />
  );
}

function errorText(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return error instanceof ApiError
    ? t(error.translationKey, { defaultValue: t('errors.UNKNOWN') })
    : t('errors.UNKNOWN');
}

function TournamentForm({
  tournament,
  header,
}: {
  tournament: Tournament | null;
  header: React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const create = useCreateTournament();
  const update = useUpdateTournament();
  const activate = useActivateTournament();
  const remove = useDeleteTournament();
  const reason = useReasonDialog();

  const [name, setName] = useState(tournament?.name ?? '');
  const [nameAr, setNameAr] = useState(tournament?.nameAr ?? '');
  const [startDate, setStartDate] = useState(tournament?.startDate ?? '');
  const [endDate, setEndDate] = useState(tournament?.endDate ?? '');
  const [errors, setErrors] = useState<{ name?: string; dates?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  function submit(): void {
    setFormError(null);
    const range = tournamentRangeProblem(startDate.trim(), endDate.trim());
    const parsed = createTournamentSchema.safeParse({
      name,
      nameAr: nameAr.trim() || null,
      startDate: startDate.trim(),
      endDate: endDate.trim(),
      isActive: tournament?.isActive ?? false,
    });
    const nameIssue = parsed.success
      ? undefined
      : parsed.error.issues.find((issue) => issue.path[0] === 'name' || issue.path[0] === 'nameAr');
    if (!parsed.success || range) {
      setErrors({
        name: nameIssue ? t('manage.tournaments.errors.name') : undefined,
        dates: range ? t(`manage.tournaments.errors.${range}`) : undefined,
      });
      return;
    }
    setErrors({});
    const onError = (error: unknown) => setFormError(errorText(error, t));
    if (tournament) {
      const { isActive: _ignored, ...changes } = parsed.data;
      update.mutate({ id: tournament.id, ...changes }, { onSuccess: () => router.back(), onError });
    } else {
      create.mutate(parsed.data, { onSuccess: () => router.back(), onError });
    }
  }

  function confirmActivate(): void {
    if (!tournament) return;
    confirmDialog({
      title: t('manage.tournaments.activateTitle'),
      message: t('manage.tournaments.activateBody', { name: tournament.name }),
      confirmLabel: t('manage.tournaments.activate'),
      cancelLabel: t('common.cancel'),
      onConfirm: () =>
        activate.mutate(tournament.id, { onError: (error) => setFormError(errorText(error, t)) }),
    });
  }

  function confirmDelete(): void {
    if (!tournament) return;
    reason.open({
      title: t('manage.tournaments.deleteTitle'),
      message: t('manage.tournaments.deleteBody', { name: tournament.name }),
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: async (text) => {
        await remove.mutateAsync({ id: tournament.id, reason: text });
        router.back();
      },
    });
  }

  return (
    <Screen
      headerAction={header}
      title={tournament ? t('manage.tournaments.editTitle') : t('manage.tournaments.new')}
      contentClassName="gap-6"
      footer={
        <Button
          label={tournament ? t('common.save') : t('manage.tournaments.create')}
          loading={create.isPending || update.isPending}
          onPress={submit}
        />
      }
    >
      <Section title={t('manage.tournaments.details')}>
        <Card className="gap-4">
          <TextField
            label={t('manage.name')}
            value={name}
            onChangeText={setName}
            error={errors.name}
          />
          <TextField label={t('manage.nameAr')} value={nameAr} onChangeText={setNameAr} optional />
          <TextField
            label={t('manage.tournaments.startDate')}
            placeholder="YYYY-MM-DD"
            value={startDate}
            onChangeText={setStartDate}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />
          <TextField
            label={t('manage.tournaments.endDate')}
            placeholder="YYYY-MM-DD"
            value={endDate}
            onChangeText={setEndDate}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            error={errors.dates}
          />
        </Card>
      </Section>

      {formError ? <InlineError message={formError} /> : null}

      {tournament ? (
        <Section title={t('manage.tournaments.status')}>
          <Card className="gap-3">
            <Text variant="callout" tone="muted">
              {tournament.isActive
                ? t('manage.tournaments.isActiveNote')
                : t('manage.tournaments.notActiveNote')}
            </Text>
            {!tournament.isActive ? (
              <Button
                label={t('manage.tournaments.activate')}
                variant="secondary"
                icon={<Zap size={18} color={palette.primary} />}
                loading={activate.isPending}
                onPress={confirmActivate}
              />
            ) : null}
            <Button
              label={t('manage.tournaments.delete')}
              variant="ghost"
              icon={<Trash2 size={18} color={palette.danger} />}
              disabled={tournament.isActive}
              onPress={confirmDelete}
            />
            {tournament.isActive ? (
              <Text variant="caption" tone="subtle">
                {t('manage.tournaments.cannotDeleteActive')}
              </Text>
            ) : null}
          </Card>
        </Section>
      ) : null}
      {reason.element}
    </Screen>
  );
}
