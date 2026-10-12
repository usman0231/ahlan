import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react-native';

import { Button } from '../../../components/button';
import { InlineError } from '../../../components/states';
import { TextField } from '../../../components/input';
import { Text } from '../../../components/text';
import { elevation } from '../../../theme/tokens';
import { usePalette } from '../../../theme/theme-provider';
import { ApiError } from '../../../api/client';
import { reasonProblem, DELETE_REASON_MIN } from '../reason';

export interface ReasonDialogOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  /** Red confirm and a warning icon. */
  destructive?: boolean;
  /** Minimum reason length; defaults to the delete minimum. */
  minLength?: number;
  /** Runs the request; a rejection keeps the dialog open with the error. */
  onConfirm: (reason: string) => Promise<unknown>;
}

/**
 * A confirmation that needs a written reason: every admin delete, restore and
 * correction is audited, and the API refuses one without a reason.
 *
 * A modal rather than `confirmDialog`, which cannot hold a text field on web.
 * Usage: `const reason = useReasonDialog(); reason.open({...}); {reason.element}`.
 */
export function useReasonDialog(): {
  open: (options: ReasonDialogOptions) => void;
  element: React.JSX.Element | null;
} {
  const [options, setOptions] = useState<ReasonDialogOptions | null>(null);
  const open = useCallback((next: ReasonDialogOptions) => setOptions(next), []);
  const element = options ? (
    <ReasonDialog options={options} onClose={() => setOptions(null)} />
  ) : null;
  return { open, element };
}

function ReasonDialog({
  options,
  onClose,
}: {
  options: ReasonDialogOptions;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const min = options.minLength ?? DELETE_REASON_MIN;

  async function confirm(): Promise<void> {
    const problem = reasonProblem(reason, min);
    if (problem) {
      setError(t(`admin.reason.${problem}`, { count: min }));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await options.onConfirm(reason.trim());
      onClose();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? t(failure.translationKey, { defaultValue: t('errors.UNKNOWN') })
          : t('errors.UNKNOWN'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 items-center justify-center px-gutter"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          onPress={busy ? undefined : onClose}
          className="absolute bottom-0 end-0 start-0 top-0"
          style={{ backgroundColor: palette.heroTo, opacity: 0.6 }}
        />
        <View
          accessibilityViewIsModal
          className="w-full gap-4 rounded-lg border border-card-border bg-surface p-5"
          style={[elevation.card, { maxWidth: 480 }]}
        >
          <View className="flex-row items-start gap-3">
            {options.destructive ? (
              <View className="h-11 w-11 items-center justify-center rounded-md bg-danger-soft">
                <TriangleAlert size={20} color={palette.danger} />
              </View>
            ) : null}
            <View className="flex-1 gap-1">
              <Text variant="heading">{options.title}</Text>
              {options.message ? (
                <Text variant="callout" tone="muted">
                  {options.message}
                </Text>
              ) : null}
            </View>
          </View>
          <TextField
            label={t('admin.reason.label')}
            hint={t('admin.reason.hint')}
            placeholder={t('admin.reason.placeholder')}
            value={reason}
            onChangeText={setReason}
            multiline
            autoFocus
            maxLength={500}
          />
          {error ? <InlineError message={error} /> : null}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button
                label={t('common.cancel')}
                variant="secondary"
                disabled={busy}
                onPress={onClose}
              />
            </View>
            <View className="flex-1">
              <Button
                label={options.confirmLabel}
                variant={options.destructive ? 'danger' : 'primary'}
                loading={busy}
                onPress={() => void confirm()}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
