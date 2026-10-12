import { useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { createStadiumSchema, type Stadium } from '@ahlan/shared';

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
  ToggleRow,
} from '../../../src/components';
import { HeaderBar } from '../../../src/components/back-button';
import { StadiumPhotoHeader } from '../../../src/components/stadium-card';
import { useCreateStadium, useStadium, useUpdateStadium } from '../../../src/features/admin/hooks';
import { ApiError } from '../../../src/api/client';
import { StadiumPhotoPanel } from '../../../src/features/admin/components/stadium-photo-panel';
import { canManage } from '../../../src/features/admin/roles';
import { useAuthStore } from '../../../src/store/auth';

type Field = 'name' | 'nameAr' | 'code' | 'city' | 'timezone' | 'capacity';

/**
 * Create or edit a stadium (`?id=` edits), administrator only. Validated with
 * the shared `createStadiumSchema`, the one the API uses, before anything is
 * sent. Editing also offers the photo; a new stadium gets its photo once it
 * exists (the upload is keyed by the stadium id).
 */
export default function StadiumEditScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const role = useAuthStore((state) => state.user?.role);
  const existing = useStadium(canManage(role) ? id : undefined);
  if (!canManage(role)) return <Redirect href="/(admin)/stadiums" />;
  const header = <HeaderBar backLabel={t('stadiums.title')} fallback="/(admin)/stadiums" />;

  if (id && existing.isError) {
    return (
      <Screen headerAction={header}>
        <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />
      </Screen>
    );
  }
  if (id && !existing.data) {
    return (
      <Screen headerAction={header}>
        <SkeletonText lines={8} />
      </Screen>
    );
  }
  // Keyed, so the form state is seeded from the loaded stadium exactly once.
  return (
    <StadiumForm key={existing.data?.id ?? 'new'} venue={existing.data ?? null} header={header} />
  );
}

function StadiumForm({
  venue,
  header,
}: {
  venue: Stadium | null;
  header: React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const id = venue?.id;
  const create = useCreateStadium();
  const update = useUpdateStadium();

  const [name, setName] = useState(venue?.name ?? '');
  const [nameAr, setNameAr] = useState(venue?.nameAr ?? '');
  const [code, setCode] = useState(venue?.code ?? '');
  const [city, setCity] = useState(venue?.city ?? '');
  const [timezone, setTimezone] = useState(venue?.timezone ?? 'Asia/Riyadh');
  const [capacity, setCapacity] = useState(
    venue?.capacity !== null && venue?.capacity !== undefined ? String(venue.capacity) : '',
  );
  const [isActive, setIsActive] = useState(venue?.isActive ?? true);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const editing = Boolean(id);
  const pending = create.isPending || update.isPending;

  function submit(): void {
    setFormError(null);
    const parsed = createStadiumSchema.safeParse({
      name,
      nameAr: nameAr.trim() || null,
      code,
      city: city.trim() || null,
      timezone,
      capacity: capacity.trim() ? capacity.trim() : null,
      isActive,
    });

    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field | undefined;
        if (field && !next[field]) next[field] = t(`stadiums.errors.${field}`);
      }
      setErrors(next);
      return;
    }
    setErrors({});

    const onError = (error: unknown) =>
      setFormError(
        error instanceof ApiError
          ? t(error.translationKey, { defaultValue: t('errors.UNKNOWN') })
          : t('errors.UNKNOWN'),
      );

    if (editing && id) {
      update.mutate({ id, ...parsed.data }, { onSuccess: () => router.back(), onError });
    } else {
      create.mutate(parsed.data, {
        onSuccess: (created) =>
          router.replace({ pathname: '/(admin)/stadiums/[id]', params: { id: created.id } }),
        onError,
      });
    }
  }

  return (
    <Screen
      headerAction={header}
      title={editing ? t('stadiums.editTitle') : t('stadiums.new')}
      contentClassName="gap-6"
      footer={
        <Button
          label={editing ? t('common.save') : t('stadiums.create')}
          loading={pending}
          onPress={submit}
        />
      }
    >
      <>
        {venue ? (
          <StadiumPhotoPanel stadium={venue} />
        ) : (
          <>
            <StadiumPhotoHeader
              code={code.trim().toUpperCase() || '—'}
              name={name || t('stadiums.namePlaceholder')}
              city={city || null}
              inactive={!isActive}
              height={150}
              rounded="all"
            />
            <Text variant="caption" tone="muted">
              {t('stadiums.photo.afterCreate')}
            </Text>
          </>
        )}

        <Section title={t('stadiums.details')}>
          <Card className="gap-4">
            <TextField
              label={t('stadiums.name')}
              value={name}
              onChangeText={setName}
              error={errors.name}
            />
            <TextField
              label={t('stadiums.nameAr')}
              value={nameAr}
              onChangeText={setNameAr}
              error={errors.nameAr}
              optional
            />
            <TextField
              label={t('stadiums.code')}
              hint={t('stadiums.codeHint')}
              value={code}
              onChangeText={(value) => setCode(value.toUpperCase())}
              autoCapitalize="characters"
              maxLength={16}
              error={errors.code}
            />
            <TextField
              label={t('stadiums.city')}
              value={city}
              onChangeText={setCity}
              error={errors.city}
              optional
            />
            <TextField
              label={t('stadiums.timezone')}
              hint={t('stadiums.timezoneHint')}
              value={timezone}
              onChangeText={setTimezone}
              autoCapitalize="none"
              error={errors.timezone}
            />
            <TextField
              label={t('stadiums.capacity')}
              value={capacity}
              onChangeText={(value) => setCapacity(value.replace(/[^\d]/g, ''))}
              keyboardType="number-pad"
              error={errors.capacity}
              optional
            />
          </Card>
          <Card padded={false}>
            <ToggleRow
              label={t('stadiums.active')}
              description={t('stadiums.activeHint')}
              value={isActive}
              onChange={setIsActive}
            />
          </Card>
        </Section>

        {formError ? <InlineError message={formError} /> : null}
      </>
    </Screen>
  );
}
