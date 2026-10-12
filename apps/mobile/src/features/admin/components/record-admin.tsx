import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArchiveRestore, Trash2 } from 'lucide-react-native';

import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Chip } from '../../../components/controls';
import { Text } from '../../../components/text';
import { usePalette } from '../../../theme/theme-provider';

/**
 * Shared pieces of the admin edit / soft delete / restore flow on HSE records
 * (findings, inspections, observations, EOD reports).
 */

/** The small "Deleted" badge for a list row. */
export function DeletedBadge(): React.JSX.Element {
  const { t } = useTranslation();
  return <Badge label={t('admin.records.deleted')} tone="danger" />;
}

/** The banner on a soft-deleted record: who removed it and why, plus Restore. */
export function DeletedNotice({
  reason,
  deletedAt,
  onRestore,
  restoring,
}: {
  reason: string | null | undefined;
  deletedAt: string | Date | null | undefined;
  onRestore?: () => void;
  restoring?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const when = deletedAt ? new Date(deletedAt).toISOString().slice(0, 10) : null;
  return (
    <View
      className="gap-3 rounded-lg border border-danger bg-danger-soft p-4"
      accessibilityRole="alert"
    >
      <View className="flex-row items-center gap-2">
        <Trash2 size={18} color={palette.danger} />
        <Text variant="heading" tone="danger" className="flex-1">
          {t('admin.records.deletedTitle')}
        </Text>
        {when ? (
          <Text variant="caption" tone="danger" tabular>
            {when}
          </Text>
        ) : null}
      </View>
      <Text variant="callout">
        {reason ? t('admin.records.deletedReason', { reason }) : t('admin.records.deletedNoReason')}
      </Text>
      <Text variant="caption" tone="muted">
        {t('admin.records.deletedHint')}
      </Text>
      {onRestore ? (
        <Button
          label={t('admin.records.restore')}
          variant="secondary"
          icon={<ArchiveRestore size={18} color={palette.primary} />}
          loading={restoring}
          onPress={onRestore}
        />
      ) : null}
    </View>
  );
}

/** The admin-only "Show deleted" filter chip for list screens. */
export function ShowDeletedChip({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Chip
      label={t('admin.records.showDeleted')}
      selected={value}
      onPress={() => onChange(!value)}
    />
  );
}

/** Edit + Delete buttons for an admin on a live record. */
export function RecordAdminActions({
  onEdit,
  onDelete,
  editLabel,
}: {
  onEdit?: () => void;
  onDelete: () => void;
  editLabel?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  return (
    <View className="gap-3">
      <Text variant="overline" tone="subtle">
        {t('admin.records.adminActions')}
      </Text>
      <View className="flex-row flex-wrap gap-3">
        {onEdit ? (
          <View className="min-w-[140px] flex-1">
            <Button label={editLabel ?? t('common.edit')} variant="secondary" onPress={onEdit} />
          </View>
        ) : null}
        <View className="min-w-[140px] flex-1">
          <Button
            label={t('admin.records.delete')}
            variant="ghost"
            icon={<Trash2 size={18} color={palette.danger} />}
            onPress={onDelete}
          />
        </View>
      </View>
      <Text variant="caption" tone="muted">
        {t('admin.records.auditNote')}
      </Text>
    </View>
  );
}
