import { Pressable, View } from 'react-native';

import { Text } from './text';
import { Appear } from './motion';
import { cn } from '../utils/cn';
import { elevation } from '../theme/tokens';
import { initials } from '../utils/format';

/**
 * The standard list row.
 *
 * Height is driven by content but never drops below 48dp, so every row in the
 * app is a legal touch target without each screen having to remember.
 */
export function ListItem({
  title,
  subtitle,
  meta,
  leading,
  trailing,
  onPress,
  disabled,
  className,
  index,
}: {
  /** Position in its list; the first rows stagger in, later ones just appear. */
  index?: number;
  title: string;
  subtitle?: string;
  /** Third line, for a timestamp or a reference. */
  meta?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
}): React.JSX.Element {
  const content = (
    <View className="min-h-touch flex-row items-center gap-3">
      {leading}
      <View className="flex-1 gap-0.5">
        <Text variant="body" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="caption" tone="subtle" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing ? <View className="items-end gap-1">{trailing}</View> : null}
    </View>
  );

  const row = !onPress ? (
    <View
      className={cn('rounded-lg border border-card-border bg-surface p-4', className)}
      style={elevation.card}
    >
      {content}
    </View>
  ) : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'rounded-lg border border-card-border bg-surface p-4 active:bg-surface-sunken',
        disabled && 'opacity-50',
        className,
      )}
      style={elevation.card}
    >
      {content}
    </Pressable>
  );

  // Only the first screenful animates: replaying an entrance on every row
  // scrolled into view reads as lag, not polish.
  return index !== undefined && index < 8 ? <Appear index={index}>{row}</Appear> : row;
}

/** Initials avatar. No photo upload for users, so initials are the identity. */
export function Avatar({
  name,
  size = 40,
}: {
  name: string;
  size?: number;
}): React.JSX.Element {
  return (
    <View
      accessibilityElementsHidden
      // Violet, not volt: a list full of lime avatars would shout over the
      // one primary action on the screen.
      className="items-center justify-center rounded-full bg-accent-soft"
      style={{ width: size, height: size }}
    >
      <Text variant="callout" tone="accent">
        {initials(name)}
      </Text>
    </View>
  );
}

/** A label / value pair, for detail screens. */
export function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View className="flex-row items-start justify-between gap-4 py-2">
      <Text variant="caption" tone="muted" className="flex-1">
        {label}
      </Text>
      <View className="flex-[1.6] items-end">
        {children ?? (
          <Text variant="callout" className="text-end">
            {value ?? '—'}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Horizontal rule between detail rows. */
export function Divider({ className }: { className?: string }): React.JSX.Element {
  return <View className={cn('h-px bg-border', className)} />;
}
