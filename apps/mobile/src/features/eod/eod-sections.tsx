import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  CalendarClock,
  FileText,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Trash,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { EOD_DAILY_STAT_FIELDS, type EodDailyStatField } from '@ahlan/shared';

import { Text } from '../../components/text';
import { TextField } from '../../components/input';
import { HeroSurface } from '../../components/brand';
import { cn } from '../../utils/cn';
import { elevation, fonts } from '../../theme/tokens';
import { usePalette } from '../../theme/theme-provider';
import { formatDecimal } from '../../utils/format';
import {
  EOD_TEXT_MAX_LENGTH,
  sanitizeCountInput,
  type EodFieldErrors,
  type EodTextField,
} from './eod-form';
import {
  categoryKey,
  isDefaultCategory,
  rowManHours,
  sanitizeHoursInput,
  sanitizePersonnelInput,
  type WorkforceRow,
} from './workforce';

/** A white card with the mockup's overline + title header. */
export function FormCard({
  overline,
  title,
  icon: IconComponent,
  action,
  children,
  className,
}: {
  overline: string;
  title?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  const palette = usePalette();
  return (
    <View
      className={cn('gap-4 rounded-lg border border-card-border bg-surface p-5', className)}
      style={elevation.card}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            {IconComponent ? <IconComponent size={18} color={palette.accent} /> : null}
            <Text variant="overline" tone="subtle">
              {overline}
            </Text>
          </View>
          {title ? <Text variant="heading">{title}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

/* ------------------------------- workforce -------------------------------- */

export function WorkforceTable({
  rows,
  readOnly,
  errors,
  onChange,
  onRemove,
  onAdd,
}: {
  rows: WorkforceRow[];
  readOnly: boolean;
  errors: EodFieldErrors;
  onChange: (key: string, patch: Partial<WorkforceRow>) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  // A table on a wide card, stacked rows on a phone.
  const table = width >= 560;

  return (
    <FormCard
      overline={t('eod.workforceOverline')}
      title={t('eod.dailyWorkforce')}
      action={readOnly ? null : <AddButton label={t('eod.addWorkforce')} onPress={onAdd} />}
    >
      <View className="gap-3" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {table ? (
          <View className="flex-row gap-2 border-b border-border px-1 pb-2">
            <HeaderCell flex={2.2} label={t('eod.category')} />
            <HeaderCell flex={1} label={t('eod.personnel')} />
            <HeaderCell flex={1} label={t('eod.hours')} />
            <HeaderCell flex={1} label={t('eod.manHours')} />
            {readOnly ? null : <View className="w-touch" />}
          </View>
        ) : null}

        {rows.length === 0 ? (
          <Text variant="callout" tone="muted">
            {t('eod.noWorkforce')}
          </Text>
        ) : null}

        {rows.map((row) => (
          <WorkforceRowView
            key={row.key}
            row={row}
            table={table}
            readOnly={readOnly}
            hoursError={errors[`hours:${row.key}`]}
            categoryError={errors[`category:${row.key}`]}
            onChange={(patch) => onChange(row.key, patch)}
            onRemove={() => onRemove(row.key)}
          />
        ))}
      </View>
    </FormCard>
  );
}

function HeaderCell({ flex, label }: { flex: number; label: string }): React.JSX.Element {
  return (
    <View style={{ flex }}>
      <Text variant="overline" tone="subtle" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function WorkforceRowView({
  row,
  table,
  readOnly,
  hoursError,
  categoryError,
  onChange,
  onRemove,
}: {
  row: WorkforceRow;
  table: boolean;
  readOnly: boolean;
  hoursError?: string;
  categoryError?: string;
  onChange: (patch: Partial<WorkforceRow>) => void;
  onRemove: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const isDefault = isDefaultCategory(row.category);
  const label = isDefault
    ? t(`eod.workforceCategory.${categoryKey(row.category)}`, { defaultValue: row.category })
    : row.category;
  const manHours = rowManHours(row);
  const rowError = hoursError ?? categoryError;

  const category = isDefault ? (
    <View className="min-h-[52px] justify-center rounded-md border border-border bg-surface px-4">
      <Text variant="body" numberOfLines={1}>
        {label}
      </Text>
    </View>
  ) : (
    <TextField
      value={row.category}
      placeholder={t('eod.customCategoryPlaceholder')}
      onChangeText={(value) => onChange({ category: value.slice(0, 120) })}
      editable={!readOnly}
      className={categoryError ? 'border-danger' : undefined}
      accessibilityLabel={t('eod.category')}
      maxLength={120}
    />
  );

  const personnel = (
    <TextField
      value={row.personnel}
      placeholder="0"
      keyboardType="number-pad"
      inputMode="numeric"
      onChangeText={(value) => onChange({ personnel: sanitizePersonnelInput(value) })}
      editable={!readOnly}
      accessibilityLabel={`${label}: ${t('eod.personnel')}`}
    />
  );

  const hours = (
    <TextField
      value={row.hours}
      placeholder="0"
      keyboardType="decimal-pad"
      inputMode="decimal"
      onChangeText={(value) => onChange({ hours: sanitizeHoursInput(value) })}
      editable={!readOnly}
      className={hoursError ? 'border-danger' : undefined}
      accessibilityLabel={`${label}: ${t('eod.hours')}`}
    />
  );

  const total = <ManHoursPill value={manHours} label={`${label}: ${t('eod.manHours')}`} />;
  const remove = readOnly ? null : (
    <DeleteButton label={t('eod.removeRow', { category: label })} onPress={onRemove} />
  );

  if (table) {
    return (
      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          <View style={{ flex: 2.2 }}>{category}</View>
          <View style={{ flex: 1 }}>{personnel}</View>
          <View style={{ flex: 1 }}>{hours}</View>
          <View style={{ flex: 1 }}>{total}</View>
          {remove}
        </View>
        {rowError ? (
          <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {t(rowError)}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View className="gap-2 rounded-md bg-surface-sunken p-3">
      <View className="flex-row items-center gap-2">
        <View className="flex-1">{category}</View>
        {remove}
      </View>
      <View className="flex-row items-end gap-2">
        <View className="flex-1 gap-1">
          <Text variant="caption" tone="subtle" numberOfLines={1}>
            {t('eod.personnel')}
          </Text>
          {personnel}
        </View>
        <Text variant="heading" tone="subtle" className="pb-3">
          ×
        </Text>
        <View className="flex-1 gap-1">
          <Text variant="caption" tone="subtle" numberOfLines={1}>
            {t('eod.hours')}
          </Text>
          {hours}
        </View>
        <Text variant="heading" tone="subtle" className="pb-3">
          =
        </Text>
        <View className="flex-1 gap-1">
          <Text variant="caption" tone="subtle" numberOfLines={1}>
            {t('eod.manHours')}
          </Text>
          {total}
        </View>
      </View>
      {rowError ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {t(rowError)}
        </Text>
      ) : null}
    </View>
  );
}

function ManHoursPill({ value, label }: { value: string; label: string }): React.JSX.Element {
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${formatDecimal(value)}`}
      className="min-h-[52px] justify-center rounded-md bg-success-soft px-3"
    >
      <Text variant="callout" tone="success" tabular numberOfLines={1} style={{ fontFamily: fonts.bold }}>
        {formatDecimal(value)}
      </Text>
    </View>
  );
}

function DeleteButton({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="h-touch w-touch items-center justify-center rounded-md bg-danger-soft active:opacity-70"
    >
      <Trash size={18} color={palette.danger} />
    </Pressable>
  );
}

export function AddButton({ label, onPress }: { label: string; onPress: () => void }): React.JSX.Element {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-touch flex-row items-center gap-1.5 rounded-full bg-primary-soft px-4 active:opacity-80"
    >
      <Plus size={18} color={palette.primary} />
      <Text variant="callout" tone="primary" style={{ fontFamily: fonts.semibold }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* --------------------------------- totals --------------------------------- */

export function TotalsTiles({
  headcount,
  manHours,
}: {
  headcount: number;
  manHours: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <View className="flex-row gap-3">
      <TotalTile icon={Users} label={t('eod.totalWorkforce')} value={String(headcount)} />
      <TotalTile icon={Activity} label={t('eod.totalManHours')} value={formatDecimal(manHours)} />
    </View>
  );
}

function TotalTile({
  icon: IconComponent,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}): React.JSX.Element {
  const palette = usePalette();
  return (
    <HeroSurface
      glow={false}
      className="flex-1 flex-row items-center gap-3 rounded-md px-4 py-4"
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <IconComponent size={22} color={palette.primaryFill} />
      <View className="flex-1">
        <Text variant="overline" tone="onHero" className="opacity-70" numberOfLines={2}>
          {label}
        </Text>
        <Text variant="title" tone="onHero" tabular numberOfLines={1}>
          {value}
        </Text>
      </View>
    </HeroSurface>
  );
}

/* --------------------------------- stats ---------------------------------- */

export function StatsGrid({
  values,
  readOnly,
  onChange,
}: {
  values: Record<EodDailyStatField, string>;
  readOnly: boolean;
  onChange: (field: EodDailyStatField, value: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const columns = width >= 620 ? 3 : 2;

  return (
    <FormCard overline={t('eod.statsOverline')} title={t('eod.statsTitle')}>
      <View
        className="flex-row flex-wrap"
        style={{ marginHorizontal: -6 }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {EOD_DAILY_STAT_FIELDS.map((field) => (
          <View key={field} style={{ width: `${100 / columns}%`, padding: 6 }}>
            <View className="gap-1.5">
              <Text variant="overline" tone="subtle" numberOfLines={2} className="min-h-[28px]">
                {t(`eod.stats.${field}`)}
              </Text>
              <TextField
                value={values[field]}
                placeholder="0"
                keyboardType="number-pad"
                inputMode="numeric"
                editable={!readOnly}
                onChangeText={(value) => onChange(field, sanitizeCountInput(value, 6))}
                accessibilityLabel={t(`eod.stats.${field}`)}
              />
            </View>
          </View>
        ))}
      </View>
    </FormCard>
  );
}

/* ---------------------------- operational summary --------------------------- */

const SUMMARY_FIELDS: { field: EodTextField; icon: LucideIcon }[] = [
  { field: 'summary', icon: FileText },
  { field: 'concerns', icon: TriangleAlert },
  { field: 'actionsMitigation', icon: ShieldCheck },
  { field: 'plannedTomorrow', icon: CalendarClock },
  { field: 'additionalRemarks', icon: MessageSquareText },
];

export function OperationalSummary({
  values,
  readOnly,
  errors,
  onChange,
}: {
  values: Record<EodTextField, string>;
  readOnly: boolean;
  errors: EodFieldErrors;
  onChange: (field: EodTextField, value: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();

  return (
    <FormCard overline={t('eod.summaryOverline')} title={t('eod.operationalSummary')}>
      {SUMMARY_FIELDS.map(({ field, icon: IconComponent }) => {
        const error = field === 'summary' ? errors.summary : undefined;
        return (
          <View key={field} className="gap-2">
            <View className="flex-row items-center gap-2">
              <IconComponent size={17} color={palette.fgMuted} />
              <Text variant="overline" tone="muted" className="flex-1">
                {t(`eod.fields.${field}`)}
              </Text>
              {field === 'summary' ? (
                <Text variant="caption" tone="subtle">
                  {t('eod.required')}
                </Text>
              ) : null}
            </View>
            <TextField
              value={values[field]}
              placeholder={t(`eod.placeholders.${field}`)}
              onChangeText={(value) => onChange(field, value)}
              editable={!readOnly}
              multiline
              maxLength={EOD_TEXT_MAX_LENGTH}
              error={error ? t(error) : null}
              accessibilityLabel={t(`eod.fields.${field}`)}
              className="min-h-[96px]"
            />
            {error ? (
              <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
                {t(error)}
              </Text>
            ) : null}
          </View>
        );
      })}
    </FormCard>
  );
}
