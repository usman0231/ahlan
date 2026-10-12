import { useState } from 'react';
import {
  Pressable,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from './text';
import { cn } from '../utils/cn';
import { fonts } from '../theme/tokens';
import { usePalette } from '../theme/theme-provider';

export interface FieldProps {
  label: string;
  /** Shown under the label; use for rules, not for restating the label. */
  hint?: string;
  error?: string | null;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Label, hint and error around a control.
 *
 * Errors are text next to the field, not a toast: an inspector who mistyped a
 * man-hours figure needs to see which field and why, not a message that has
 * already disappeared.
 */
export function Field({
  label,
  hint,
  error,
  optional = false,
  children,
  className,
}: FieldProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <View className={cn('gap-2', className)}>
      <View className="flex-row items-center gap-2">
        <Text variant="callout">{label}</Text>
        {optional ? (
          <Text variant="caption" tone="subtle">
            {t('common.optional')}
          </Text>
        ) : null}
      </View>
      {hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export interface TextFieldProps extends Omit<TextInputProps, 'className'> {
  label?: string;
  hint?: string;
  error?: string | null;
  optional?: boolean;
  /** A text area rather than a single line. */
  multiline?: boolean;
  /** Suffix inside the field, e.g. a unit. */
  trailing?: React.ReactNode;
  className?: string;
}

export function TextField({
  label,
  hint,
  error,
  optional,
  multiline = false,
  trailing,
  className,
  ...rest
}: TextFieldProps): React.JSX.Element {
  const palette = usePalette();
  const [focused, setFocused] = useState(false);

  const input = (
    <View
      className={cn(
        // Filled rather than outlined: a field reads as a well to type into,
        // and the focus state (a lit edge on a raised plane) is unmistakable.
        'flex-row items-center gap-2 rounded-md border px-4',
        multiline ? 'min-h-[120px] py-3' : 'min-h-[52px]',
        focused
          ? 'border-primary bg-surface'
          : error
            ? 'border-danger bg-surface-sunken'
            : 'border-border bg-surface-sunken',
        className,
      )}
    >
      <TextInput
        className="flex-1 text-body text-fg"
        // A bare TextInput does not inherit the Text primitive's family.
        style={{ fontFamily: fonts.regular }}
        placeholderTextColor={palette.fgSubtle}
        // The caret has to be visible on both themes.
        selectionColor={palette.primary}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        onFocus={(event) => {
          setFocused(true);
          rest.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          rest.onBlur?.(event);
        }}
        accessibilityLabel={label}
        // Maestro targets fields by id; the label is the stable handle.
        testID={label}
        {...rest}
      />
      {trailing}
    </View>
  );

  if (!label) return input;

  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      {input}
    </Field>
  );
}

/** A stepper for small integer counts, e.g. recordable incidents. */
export function NumberStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}): React.JSX.Element {
  return (
    <Field label={label}>
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: decrease`}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - 1))}
          className={cn(
            'h-touch w-touch items-center justify-center rounded-full border border-border bg-surface',
            value <= min && 'opacity-40',
          )}
        >
          <Text variant="heading">{'−'}</Text>
        </Pressable>

        <View className="min-w-[64px] items-center">
          <Text variant="title" tabular>
            {value}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: increase`}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + 1))}
          className={cn(
            'h-touch w-touch items-center justify-center rounded-full border border-border bg-surface',
            value >= max && 'opacity-40',
          )}
        >
          <Text variant="heading">+</Text>
        </Pressable>
      </View>
    </Field>
  );
}
