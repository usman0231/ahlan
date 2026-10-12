import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react-native';
import { createDisciplineSchema, type Discipline } from '@ahlan/shared';

import {
  Button,
  Card,
  ErrorState,
  Field,
  InlineError,
  Screen,
  Section,
  SkeletonText,
  TextField,
  ToggleRow,
} from '../../../../src/components';
import { HeaderBar } from '../../../../src/components/back-button';
import { DisciplineIcon } from '../../../../src/features/observations/discipline-icon';
import {
  useCreateDiscipline,
  useDeleteDiscipline,
  useManagedDisciplines,
  useUpdateDiscipline,
} from '../../../../src/features/admin/manage-hooks';
import {
  DISCIPLINE_COLOR_TOKENS,
  DISCIPLINE_ICON_NAMES,
  isColorToken,
  slugFromName,
  type DisciplineColorToken,
} from '../../../../src/features/admin/catalog-form';
import { useReasonDialog } from '../../../../src/features/admin/components/reason-dialog';
import { useHaptics } from '../../../../src/hooks/use-haptics';
import { usePalette } from '../../../../src/theme/theme-provider';
import { cn } from '../../../../src/utils/cn';
import { ApiError } from '../../../../src/api/client';

type FieldName = 'name' | 'nameAr' | 'description' | 'descriptionAr' | 'slug' | 'sortOrder';

/** Create or edit a discipline (`?id=` edits). Administrator only (Manage layout guard). */
export default function DisciplineEditScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const disciplines = useManagedDisciplines();
  const existing = id ? disciplines.data?.find((row) => row.id === id) : undefined;
  const header = (
    <HeaderBar backLabel={t('manage.disciplines.title')} fallback="/(admin)/manage/disciplines" />
  );

  if (id && disciplines.isError) {
    return (
      <Screen headerAction={header}>
        <ErrorState error={disciplines.error} onRetry={() => void disciplines.refetch()} />
      </Screen>
    );
  }
  if (id && !existing) {
    return (
      <Screen headerAction={header}>
        <SkeletonText lines={8} />
      </Screen>
    );
  }
  return (
    <DisciplineForm key={existing?.id ?? 'new'} discipline={existing ?? null} header={header} />
  );
}

function DisciplineForm({
  discipline,
  header,
}: {
  discipline: Discipline | null;
  header: React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const haptics = useHaptics();
  const create = useCreateDiscipline();
  const update = useUpdateDiscipline();
  const remove = useDeleteDiscipline();
  const reason = useReasonDialog();
  const editing = Boolean(discipline);

  const [name, setName] = useState(discipline?.name ?? '');
  const [nameAr, setNameAr] = useState(discipline?.nameAr ?? '');
  const [description, setDescription] = useState(discipline?.description ?? '');
  const [descriptionAr, setDescriptionAr] = useState(discipline?.descriptionAr ?? '');
  const [slug, setSlug] = useState(discipline?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(editing);
  const [icon, setIcon] = useState<string>(discipline?.icon ?? DISCIPLINE_ICON_NAMES[0]);
  const [color, setColor] = useState<DisciplineColorToken>(
    isColorToken(discipline?.colorToken) ? discipline.colorToken : 'accent',
  );
  const [sortOrder, setSortOrder] = useState(String(discipline?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(discipline?.isActive ?? true);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveSlug = slugTouched ? slug : slugFromName(name);

  function submit(): void {
    setFormError(null);
    const parsed = createDisciplineSchema.safeParse({
      slug: effectiveSlug,
      name,
      nameAr: nameAr.trim() || null,
      description: description.trim() || null,
      descriptionAr: descriptionAr.trim() || null,
      icon,
      colorToken: color,
      sortOrder: sortOrder.trim() || '0',
      isActive,
    });
    if (!parsed.success) {
      const next: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as FieldName | undefined;
        if (field && !next[field]) next[field] = t(`manage.disciplines.errors.${field}`);
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
    if (discipline) {
      update.mutate(
        { id: discipline.id, ...parsed.data },
        { onSuccess: () => router.back(), onError },
      );
    } else {
      create.mutate(parsed.data, { onSuccess: () => router.back(), onError });
    }
  }

  function confirmDelete(): void {
    if (!discipline) return;
    reason.open({
      title: t('manage.disciplines.deleteTitle'),
      message: t('manage.disciplines.deleteBody', { name: discipline.name }),
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: async (text) => {
        await remove.mutateAsync({ id: discipline.id, reason: text });
        router.back();
      },
    });
  }

  return (
    <Screen
      headerAction={header}
      title={editing ? t('manage.disciplines.editTitle') : t('manage.disciplines.new')}
      contentClassName="gap-6"
      footer={
        <Button
          label={editing ? t('common.save') : t('manage.disciplines.create')}
          loading={create.isPending || update.isPending}
          onPress={submit}
        />
      }
    >
      <Section title={t('manage.disciplines.details')}>
        <Card className="gap-4">
          <TextField
            label={t('manage.name')}
            value={name}
            onChangeText={setName}
            error={errors.name}
          />
          <TextField
            label={t('manage.nameAr')}
            value={nameAr}
            onChangeText={setNameAr}
            error={errors.nameAr}
            optional
          />
          <TextField
            label={t('manage.description')}
            value={description}
            onChangeText={setDescription}
            error={errors.description}
            multiline
            optional
          />
          <TextField
            label={t('manage.descriptionAr')}
            value={descriptionAr}
            onChangeText={setDescriptionAr}
            error={errors.descriptionAr}
            multiline
            optional
          />
          <TextField
            label={t('manage.disciplines.slug')}
            hint={t('manage.disciplines.slugHint')}
            value={effectiveSlug}
            onChangeText={(value) => {
              setSlugTouched(true);
              setSlug(value.toLowerCase());
            }}
            autoCapitalize="none"
            editable={!editing}
            error={errors.slug}
          />
          <TextField
            label={t('manage.sortOrder')}
            value={sortOrder}
            onChangeText={(value) => setSortOrder(value.replace(/[^\d]/g, ''))}
            keyboardType="number-pad"
            error={errors.sortOrder}
          />
        </Card>
      </Section>

      <Section title={t('manage.disciplines.appearance')}>
        <Card className="gap-5">
          <Field label={t('manage.disciplines.icon')}>
            <View className="flex-row flex-wrap gap-3">
              {DISCIPLINE_ICON_NAMES.map((option) => {
                const selected = icon === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="radio"
                    accessibilityLabel={t(`manage.disciplines.icons.${option}`)}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      haptics.answer();
                      setIcon(option);
                    }}
                    className={cn(
                      'h-14 w-14 items-center justify-center rounded-md border-2',
                      selected
                        ? 'border-primary bg-primary-soft'
                        : 'border-border bg-surface-sunken',
                    )}
                  >
                    <DisciplineIcon name={option} size={24} color={palette[color]} />
                  </Pressable>
                );
              })}
            </View>
          </Field>
          <Field label={t('manage.disciplines.color')}>
            <View className="flex-row flex-wrap gap-3">
              {DISCIPLINE_COLOR_TOKENS.map((token) => {
                const selected = color === token;
                return (
                  <Pressable
                    key={token}
                    accessibilityRole="radio"
                    accessibilityLabel={t(`manage.disciplines.colors.${token}`)}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      haptics.answer();
                      setColor(token);
                    }}
                    className={cn(
                      'h-touch w-touch items-center justify-center rounded-full border-2',
                      selected ? 'border-fg' : 'border-transparent',
                    )}
                  >
                    <View
                      className="h-9 w-9 rounded-full"
                      style={{ backgroundColor: palette[token] }}
                    />
                  </Pressable>
                );
              })}
            </View>
          </Field>
        </Card>
        <Card padded={false}>
          <ToggleRow
            label={t('manage.active')}
            description={t('manage.disciplines.activeHint')}
            value={isActive}
            onChange={setIsActive}
          />
        </Card>
      </Section>

      {formError ? <InlineError message={formError} /> : null}

      {discipline ? (
        <Button
          label={t('manage.disciplines.delete')}
          variant="ghost"
          icon={<Trash2 size={18} color={palette.danger} />}
          onPress={confirmDelete}
        />
      ) : null}
      {reason.element}
    </Screen>
  );
}
