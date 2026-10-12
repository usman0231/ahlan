import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2, Upload } from 'lucide-react-native';
import type { ChecklistItem, ChecklistWithVersion } from '@ahlan/shared';

import {
  Appear,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  Section,
  SkeletonList,
  SkeletonText,
  Text,
  Button,
  Divider,
  InlineError,
} from '../../../src/components';
import { HeaderBar } from '../../../src/components/back-button';
import { useChecklistDetail } from '../../../src/features/admin/hooks';
import {
  useChecklistVersions,
  useDeleteChecklist,
  usePublishChecklistVersion,
  type ChecklistVersionSummary,
} from '../../../src/features/admin/manage-hooks';
import { useReasonDialog } from '../../../src/features/admin/components/reason-dialog';
import { canManage } from '../../../src/features/admin/roles';
import { useAuthStore } from '../../../src/store/auth';
import { usePalette } from '../../../src/theme/theme-provider';
import { confirmDialog } from '../../../src/utils/dialogs';
import { ApiError } from '../../../src/api/client';

/**
 * One checklist template: every item with its code, grouped by section, in
 * the wording of the current version. Read-only for a supervisor; an
 * administrator also edits it (as a new version), publishes a draft version
 * and deletes it (soft, with a reason).
 */
export default function ChecklistTemplateScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const checklist = useChecklistDetail(id);
  const arabic = i18n.language.startsWith('ar');
  const role = useAuthStore((state) => state.user?.role);
  const admin = canManage(role);

  const header = (
    <HeaderBar backLabel={t('checklists.title')} fallback="/(admin)/checklists">
      {admin && checklist.data ? (
        <Button
          label={t('common.edit')}
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={() =>
            router.push({ pathname: '/(admin)/checklists/edit', params: { id: checklist.data.id } })
          }
        />
      ) : null}
    </HeaderBar>
  );

  if (checklist.isError) {
    return (
      <Screen headerAction={header}>
        <ErrorState error={checklist.error} onRetry={() => void checklist.refetch()} />
      </Screen>
    );
  }

  const data = checklist.data;
  const version = data?.version ?? null;
  const title = data ? (arabic && data.titleAr ? data.titleAr : data.title) : '';

  return (
    <Screen
      headerAction={header}
      wide
      onRefresh={() => void checklist.refetch()}
      contentClassName="gap-6"
    >
      {!data ? (
        <View className="gap-4">
          <SkeletonText lines={2} />
          <SkeletonList count={6} />
        </View>
      ) : (
        <>
          <Appear index={0} className="gap-2">
            <Text variant="overline" tone="subtle">
              {t(`checklists.categories.${data.category}`)}
            </Text>
            <Text variant="display">{title}</Text>
            <View className="flex-row flex-wrap items-center gap-2 pt-1">
              <Badge label={t('checklists.masterTemplate')} tone="info" />
              {version ? (
                <Badge label={t('checklists.version', { version: version.version })} />
              ) : null}
              {version && !version.isPublished ? (
                <Badge label={t('checklists.draftBadge')} tone="warning" />
              ) : null}
              {!data.isActive ? <Badge label={t('manage.inactive')} /> : null}
              <Text variant="caption" tone="muted">
                {t('checklists.checks', { count: version?.itemCount ?? 0 })}
              </Text>
            </View>
            {data.description ? (
              <Text variant="callout" tone="muted">
                {data.description}
              </Text>
            ) : null}
          </Appear>

          {!version || version.sections.length === 0 ? (
            <EmptyState title={t('checklists.noItems')} />
          ) : (
            version.sections.map((section) => (
              <Section
                key={section.id}
                title={
                  version.sections.length > 1
                    ? arabic && section.titleAr
                      ? section.titleAr
                      : section.title
                    : undefined
                }
              >
                <Card padded={false}>
                  {section.items.map((item, index) => (
                    <ItemRow key={item.id} item={item} first={index === 0} arabic={arabic} />
                  ))}
                </Card>
              </Section>
            ))
          )}

          {admin ? <ChecklistAdminPanel checklist={data} /> : null}
        </>
      )}
    </Screen>
  );
}

function ItemRow({
  item,
  first,
  arabic,
}: {
  item: ChecklistItem;
  first: boolean;
  arabic: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View
      className={`flex-row items-start gap-3 px-4 py-3.5 ${first ? '' : 'border-t border-border'}`}
    >
      <View className="min-w-[64px] rounded-sm bg-surface-sunken px-2 py-1">
        <Text variant="caption" tone="muted" tabular className="text-center">
          {item.code}
        </Text>
      </View>
      <View className="flex-1 gap-1">
        <Text variant="body">{arabic && item.questionAr ? item.questionAr : item.question}</Text>
        {item.guidance ? (
          <Text variant="caption" tone="subtle">
            {item.guidance}
          </Text>
        ) : null}
        {!item.allowNa ? (
          <Text variant="caption" tone="subtle">
            {t('checklists.naNotAllowed')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Administrator controls: version history with Publish on a draft, Edit, and
 * Delete. Deleting hides the checklist from inspectors; completed
 * inspections keep their answers and their version.
 */
function ChecklistAdminPanel({
  checklist,
}: {
  checklist: ChecklistWithVersion;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const versions = useChecklistVersions(checklist.id);
  const publish = usePublishChecklistVersion();
  const remove = useDeleteChecklist();
  const reason = useReasonDialog();
  const [error, setError] = useState<string | null>(null);
  const rows: ChecklistVersionSummary[] = [...(versions.data ?? [])].sort(
    (a, b) => b.version - a.version,
  );

  function confirmPublish(version: ChecklistVersionSummary): void {
    setError(null);
    confirmDialog({
      title: t('checklists.publishTitle', { version: version.version }),
      message: t('checklists.publishBody'),
      confirmLabel: t('checklists.publish'),
      cancelLabel: t('common.cancel'),
      onConfirm: () =>
        publish.mutate(version.id, {
          onError: (failure) =>
            setError(
              failure instanceof ApiError
                ? t(failure.translationKey, { defaultValue: t('errors.UNKNOWN') })
                : t('errors.UNKNOWN'),
            ),
        }),
    });
  }

  function confirmDelete(): void {
    reason.open({
      title: t('checklists.deleteTitle'),
      message: t('checklists.deleteBody', { title: checklist.title }),
      confirmLabel: t('common.delete'),
      destructive: true,
      onConfirm: async (text) => {
        await remove.mutateAsync({ id: checklist.id, reason: text });
        router.replace('/(admin)/checklists');
      },
    });
  }

  return (
    <Section title={t('checklists.manageSection')}>
      <Card className="gap-4">
        <Text variant="overline" tone="subtle">
          {t('checklists.versions')}
        </Text>
        {versions.isLoading ? (
          <SkeletonText lines={2} />
        ) : (
          rows.map((version, index) => (
            <View key={version.id} className="gap-3">
              {index > 0 ? <Divider /> : null}
              <View className="flex-row items-center gap-3">
                <View className="flex-1 gap-0.5">
                  <Text variant="callout">
                    {t('checklists.version', { version: version.version })}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {t('checklists.checks', { count: version.itemCount })}
                  </Text>
                </View>
                {version.isPublished ? (
                  <Badge
                    label={
                      version.version === checklist.currentVersion
                        ? t('checklists.current')
                        : t('checklists.published')
                    }
                    tone={version.version === checklist.currentVersion ? 'success' : 'neutral'}
                  />
                ) : (
                  <Button
                    label={t('checklists.publish')}
                    size="sm"
                    fullWidth={false}
                    icon={<Upload size={16} color={palette.onPrimary} />}
                    loading={publish.isPending && publish.variables === version.id}
                    onPress={() => confirmPublish(version)}
                  />
                )}
              </View>
            </View>
          ))
        )}
        {error ? <InlineError message={error} /> : null}
        <Text variant="caption" tone="muted">
          {t('checklists.versionsHint')}
        </Text>
        <Divider />
        <Button
          label={t('checklists.editAsNewVersion')}
          variant="secondary"
          icon={<Pencil size={18} color={palette.primary} />}
          onPress={() =>
            router.push({ pathname: '/(admin)/checklists/edit', params: { id: checklist.id } })
          }
        />
        <Button
          label={t('checklists.delete')}
          variant="ghost"
          icon={<Trash2 size={18} color={palette.danger} />}
          onPress={confirmDelete}
        />
      </Card>
      {reason.element}
    </Section>
  );
}
