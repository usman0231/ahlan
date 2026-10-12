import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronDown, MessageSquareText } from 'lucide-react-native';

import { Text } from '../../components/text';
import { fonts } from '../../theme/tokens';
import { usePalette } from '../../theme/theme-provider';
import { AutosaveField } from './autosave-field';

/**
 * "Concern / observation" and "Recommendation / action required" for one
 * answer, as on the readiness sheet. Shown open for a NO; folded behind a
 * toggle for YES and N/A (open when either already has text).
 */
export function ResponseNotes({
  concern,
  recommendation,
  locked,
  collapsible = false,
  onSave,
}: {
  concern: string | null;
  recommendation: string | null;
  locked: boolean;
  collapsible?: boolean;
  onSave: (field: 'concern' | 'recommendation', value: string) => void | Promise<void>;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const palette = usePalette();
  const hasText = Boolean(concern || recommendation);
  const [open, setOpen] = useState(!collapsible || hasText);

  // Nothing to read on a locked answer that has no notes.
  if (locked && !hasText) return null;

  const fields = (
    <View className="gap-3">
      <AutosaveField
        label={t('inspections.concern')}
        placeholder={t('inspections.concernPlaceholder')}
        initialValue={concern}
        onSave={(value) => onSave('concern', value)}
        editable={!locked}
        multiline
        maxLength={1000}
        className="min-h-[88px]"
      />
      <AutosaveField
        label={t('inspections.recommendation')}
        placeholder={t('inspections.recommendationPlaceholder')}
        initialValue={recommendation}
        onSave={(value) => onSave('recommendation', value)}
        editable={!locked}
        multiline
        maxLength={1000}
        className="min-h-[88px]"
      />
    </View>
  );

  if (!collapsible) return fields;

  return (
    <View className="gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('inspections.addNotes')}
        onPress={() => setOpen((value) => !value)}
        className="min-h-touch flex-row items-center gap-2 self-start rounded-full px-1 active:opacity-70"
      >
        <MessageSquareText size={18} color={palette.primary} />
        <Text variant="callout" tone="primary" style={{ fontFamily: fonts.semibold }}>
          {hasText ? t('inspections.notesAdded') : t('inspections.addNotes')}
        </Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <ChevronDown size={18} color={palette.primary} />
        </View>
      </Pressable>
      {open ? fields : null}
    </View>
  );
}
