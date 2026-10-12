import { useMemo, useReducer, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GitBranch } from 'lucide-react-native';
import type { ChecklistWithVersion } from '@ahlan/shared';

import {
  Button,
  Card,
  ErrorState,
  InlineError,
  Screen,
  SkeletonText,
  Text,
  TextField,
} from '../../../src/components';
import { HeaderBar } from '../../../src/components/back-button';
import { InfoBanner } from '../../../src/features/admin/components/admin-ui';
import { ChecklistEditorForm } from '../../../src/features/admin/components/checklist-editor-form';
import {
  checklistEditorReducer,
  draftFromChecklist,
  emptyDraft,
  itemCount,
  metaChanged,
  metaPayload,
  questionsChanged,
  toCreateInput,
  toVersionInput,
  validateDraft,
  type ChecklistDraft,
} from '../../../src/features/admin/checklist-editor';
import {
  useAllStadiums,
  useChecklistDetail,
  useDisciplines,
} from '../../../src/features/admin/hooks';
import {
  useCreateChecklist,
  useCreateChecklistVersion,
  useUpdateChecklistMeta,
} from '../../../src/features/admin/manage-hooks';
import { canManage } from '../../../src/features/admin/roles';
import { useAuthStore } from '../../../src/store/auth';
import { ApiError } from '../../../src/api/client';

/**
 * Create a checklist, or edit one (`?id=`), administrator only.
 *
 * Editing never rewrites what inspectors answered: question changes are
 * saved as the next version (published now or kept as a draft), and every
 * completed inspection keeps pointing at the version it was answered
 * against. Title, category, discipline and stadiums are metadata, saved in
 * place. The screen says this before anyone presses Save.
 */
export default function ChecklistEditScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useTranslation();
  const role = useAuthStore((state) => state.user?.role);
  const admin = canManage(role);
  const checklist = useChecklistDetail(admin ? id : undefined);

  const header = (
    <HeaderBar
      backLabel={t('checklists.title')}
      fallback={
        id ? { pathname: '/(admin)/checklists/[id]', params: { id } } : '/(admin)/checklists'
      }
    />
  );

  if (!admin) return <Redirect href="/(admin)/checklists" />;
  if (id && checklist.isError) {
    return (
      <Screen headerAction={header}>
        <ErrorState error={checklist.error} onRetry={() => void checklist.refetch()} />
      </Screen>
    );
  }
  if (id && !checklist.data) {
    return (
      <Screen headerAction={header}>
        <SkeletonText lines={10} />
      </Screen>
    );
  }
  return (
    <ChecklistEditor
      key={checklist.data?.id ?? 'new'}
      checklist={checklist.data ?? null}
      header={header}
    />
  );
}

function ChecklistEditor({
  checklist,
  header,
}: {
  checklist: ChecklistWithVersion | null;
  header: React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  const disciplines = useDisciplines();
  const stadiums = useAllStadiums();
  const create = useCreateChecklist();
  const createVersion = useCreateChecklistVersion();
  const updateMeta = useUpdateChecklistMeta();

  const original = useMemo<ChecklistDraft>(
    () => (checklist ? draftFromChecklist(checklist) : emptyDraft()),
    [checklist],
  );
  const [draft, dispatch] = useReducer(checklistEditorReducer, original);
  const [changeNote, setChangeNote] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const errors = useMemo(() => (showErrors ? validateDraft(draft) : {}), [draft, showErrors]);
  const editing = Boolean(checklist);
  const currentVersion = checklist?.version?.version ?? checklist?.currentVersion ?? 0;
  const nextVersion = currentVersion + 1;
  const questions = editing ? questionsChanged(draft, original) : true;
  const meta = editing ? metaChanged(draft, original) : true;
  const pending = create.isPending || createVersion.isPending || updateMeta.isPending;

  const onError = (error: unknown) =>
    setFormError(
      error instanceof ApiError
        ? t(error.translationKey, { defaultValue: t('errors.UNKNOWN') })
        : t('errors.UNKNOWN'),
    );

  async function save(publish: boolean): Promise<void> {
    setFormError(null);
    setShowErrors(true);
    if (Object.keys(validateDraft(draft)).length > 0) {
      setFormError(t('checklists.editor.fixErrors'));
      return;
    }
    try {
      if (!checklist) {
        const body = toCreateInput(draft, publish);
        if (!body.ok) return setFormError(t('checklists.editor.fixErrors'));
        const created = await create.mutateAsync(body.input);
        router.replace({ pathname: '/(admin)/checklists/[id]', params: { id: created.id } });
        return;
      }
      if (meta) await updateMeta.mutateAsync({ id: checklist.id, ...metaPayload(draft) });
      if (questions) {
        const body = toVersionInput(draft, publish, changeNote);
        if (!body.ok) return setFormError(t('checklists.editor.fixErrors'));
        await createVersion.mutateAsync({ id: checklist.id, ...body.input });
      }
      router.back();
    } catch (error) {
      onError(error);
    }
  }

  const footer = (
    <View className="flex-row gap-3">
      {questions ? (
        <>
          <View className="flex-1">
            <Button
              label={t('checklists.editor.saveDraft')}
              variant="secondary"
              disabled={pending}
              onPress={() => void save(false)}
            />
          </View>
          <View className="flex-1">
            <Button
              label={
                editing
                  ? t('checklists.editor.publishVersion', { version: nextVersion })
                  : t('checklists.editor.publish')
              }
              loading={pending}
              onPress={() => void save(true)}
            />
          </View>
        </>
      ) : (
        <View className="flex-1">
          <Button
            label={t('common.save')}
            loading={pending}
            disabled={!meta}
            onPress={() => void save(true)}
          />
        </View>
      )}
    </View>
  );

  return (
    <Screen
      headerAction={header}
      title={editing ? t('checklists.editor.editTitle') : t('checklists.editor.newTitle')}
      subtitle={t('checklists.editor.summary', {
        sections: draft.sections.length,
        count: itemCount(draft),
      })}
      wide
      contentClassName="gap-6"
      footer={footer}
    >
      <InfoBanner
        icon={GitBranch}
        title={
          editing
            ? t('checklists.editor.versionTitle', { current: currentVersion, next: nextVersion })
            : t('checklists.editor.newVersionTitle')
        }
        body={editing ? t('checklists.editor.versionBody') : t('checklists.editor.newVersionBody')}
      />

      <ChecklistEditorForm
        draft={draft}
        dispatch={dispatch}
        errors={errors}
        disciplines={(disciplines.data ?? []).filter((discipline) => discipline.isActive)}
        stadiums={stadiums.data ?? []}
      />

      {editing && questions ? (
        <Card className="gap-2">
          <Text variant="heading">
            {t('checklists.editor.changeNoteTitle', { version: nextVersion })}
          </Text>
          <TextField
            label={t('checklists.editor.changeNote')}
            value={changeNote}
            onChangeText={setChangeNote}
            multiline
            optional
          />
        </Card>
      ) : null}

      {formError ? <InlineError message={formError} /> : null}
    </Screen>
  );
}
