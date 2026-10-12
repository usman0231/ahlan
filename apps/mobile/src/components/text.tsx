import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from '../utils/cn';
import { typography } from '../theme/tokens';

export type TextVariant =
  /** The hero figure: one per screen at most. */
  | 'numeral'
  | 'display'
  | 'title'
  | 'heading'
  | 'body'
  | 'callout'
  | 'caption'
  | 'overline'
  | 'metric';

export type TextTone =
  | 'default'
  | 'muted'
  | 'subtle'
  | 'inverse'
  | 'primary'
  | 'danger'
  | 'success'
  | 'warning'
  | 'accent'
  /** White ink on the graphite hero, whatever the theme. */
  | 'onHero'
  /** Dark ink on a volt fill, whatever the theme. */
  | 'onPrimary';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  /** Tabular figures, so a column of numbers does not jitter as it updates. */
  tabular?: boolean;
  className?: string;
}

const variantClass: Record<TextVariant, string> = {
  numeral: 'text-numeral',
  display: 'text-display',
  title: 'text-title',
  heading: 'text-heading',
  body: 'text-body',
  callout: 'text-callout',
  caption: 'text-caption',
  overline: 'text-overline uppercase',
  // The big figure on a KPI card.
  metric: 'text-[30px] leading-[34px] tracking-[-1.1px]',
};

/**
 * Every variant names its font file directly instead of setting a CSS
 * `fontWeight`: React Native picks the glyphs from the named file, so this is
 * the one way the same weight renders on iOS, Android and web alike.
 */
const variantFamily: Record<TextVariant, string> = {
  numeral: typography.numeral.fontFamily,
  display: typography.display.fontFamily,
  title: typography.title.fontFamily,
  heading: typography.heading.fontFamily,
  body: typography.body.fontFamily,
  callout: typography.callout.fontFamily,
  caption: typography.caption.fontFamily,
  overline: typography.overline.fontFamily,
  metric: typography.metric.fontFamily,
};

const toneClass: Record<TextTone, string> = {
  default: 'text-fg',
  muted: 'text-fg-muted',
  subtle: 'text-fg-subtle',
  inverse: 'text-fg-inverse',
  primary: 'text-primary',
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
  accent: 'text-accent',
  onHero: 'text-on-hero',
  onPrimary: 'text-on-primary',
};

/**
 * The only text primitive.
 *
 * Nothing in the app renders a bare `<Text>`: going through here is what keeps
 * type scale, colour tokens and dark mode consistent, and what makes a single
 * change to the scale apply everywhere.
 */
export function Text({
  variant = 'body',
  tone = 'default',
  tabular = false,
  className,
  ...rest
}: TextProps): React.JSX.Element {
  return (
    <RNText
      className={cn(variantClass[variant], toneClass[tone], className)}
      style={[
        { fontFamily: variantFamily[variant] },
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        rest.style,
      ]}
      // Caps runaway OS font scaling so a KPI card cannot push its own value
      // off the card, while still respecting a user who needs larger text.
      maxFontSizeMultiplier={variant === 'numeral' || variant === 'display' || variant === 'metric' ? 1.3 : 1.6}
      {...rest}
    />
  );
}
