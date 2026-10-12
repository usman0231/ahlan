import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CircleCheck, ClipboardList, PencilLine } from 'lucide-react-native';

import { Text } from '../../components/text';
import { PressableCard } from '../../components/card';
import { Skeleton } from '../../components/skeleton';
import { cn } from '../../utils/cn';
import { usePalette } from '../../theme/theme-provider';
import { fonts } from '../../theme/tokens';
import { useSettingsStore } from '../../store/settings';
import type { ChecklistCardEntry } from './use-checklist-cards';

/**
 * Checklists as cards: title, number of checks, and today's state at the
 * stadium (done, draft in progress, or still to do). Two across on a phone,
 * three or four on a wide window.
 */
export function ChecklistCardGrid({
  entries,
  loading,
  disabled,
  onPress,
}: {
  entries: ChecklistCardEntry[];
  loading?: boolean;
  disabled?: boolean;
  onPress: (entry: ChecklistCardEntry) => void;
}): React.JSX.Element {
  const [width, setWidth] = useState(0);
  const columns = width >= 900 ? 4 : width >= 560 ? 3 : 2;
  const cell = { width: `${100 / columns}%` as const, padding: 6 };

  return (
    <View
      className="flex-row flex-wrap"
      style={{ marginHorizontal: -6 }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {loading
        ? Array.from({ length: 6 }).map((_, index) => (
            <View key={index} style={cell}>
              <Skeleton height={148} rounded="md" />
            </View>
          ))
        : entries.map((entry) => (
            <View key={entry.checklist.id} style={cell}>
              <ChecklistCard entry={entry} disabled={disabled} onPress={() => onPress(entry)} />
            </View>
          ))}
    </View>
  );
}

function ChecklistCard({
  entry,
  disabled,
  onPress,
}: {
  entry: ChecklistCardEntry;
  disabled?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const locale = useSettingsStore((state) => state.locale);
  const title = entry.checklist.displayTitle(locale);
  const status = entry.doneToday
    ? t('inspections.cards.doneToday')
    : entry.draftId
      ? t('inspections.cards.inProgress')
      : t('inspections.cards.toDo');

  return (
    <PressableCard
      accessibilityLabel={`${title}, ${t('inspections.cards.checks', { count: entry.version.itemCount })}, ${status}`}
      disabled={disabled}
      onPress={onPress}
      className="min-h-[148px] gap-3 p-4"
    >
      <View className="flex-row items-start justify-between gap-2">
        <View
          className={cn(
            'h-11 w-11 items-center justify-center rounded-md',
            entry.doneToday ? 'bg-success-soft' : 'bg-accent-soft',
          )}
        >
          {entry.doneToday ? (
            <CircleCheck size={22} color={palette.success} />
          ) : entry.draftId ? (
            <PencilLine size={21} color={palette.warning} />
          ) : (
            <ClipboardList size={21} color={palette.accent} />
          )}
        </View>
      </View>
      <View className="flex-1 justify-end gap-1">
        <Text variant="heading" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="caption" tone="muted">
          {t('inspections.cards.checks', { count: entry.version.itemCount })}
        </Text>
        <Text
          variant="caption"
          tone={entry.doneToday ? 'success' : entry.draftId ? 'warning' : 'subtle'}
          style={{ fontFamily: fonts.semibold }}
          numberOfLines={1}
        >
          {entry.doneToday ? `✓ ${status}` : status}
        </Text>
      </View>
    </PressableCard>
  );
}
