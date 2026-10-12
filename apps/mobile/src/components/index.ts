/**
 * The design system.
 *
 * Screens import from here, never from a component file directly, so the set of
 * approved building blocks stays visible in one place.
 */
export { Text } from './text';
export type { TextProps, TextTone, TextVariant } from './text';

export { Button, IconButton } from './button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './button';

export { Card, PressableCard, Section } from './card';
export { Badge, SeverityBadge, StatusBadge, SyncBadge, CountBadge } from './badge';
export { Skeleton, SkeletonText, SkeletonList, SkeletonListItem, SkeletonKpiGrid } from './skeleton';
export { EmptyState, ErrorState, OfflineState, InlineError } from './states';
export { AnswerToggle } from './answer-toggle';
export { KpiCard, ComplianceRing, ComplianceMeter, MetricBar } from './kpi-card';
export { Screen } from './screen';
export { OfflineBanner, SyncStatusLine } from './offline-banner';
export { Field, TextField, NumberStepper } from './input';
export { PasswordField } from './password-field';
export { Chip, ChipRow, SegmentedControl, OptionList, ToggleRow } from './controls';
export type { Option } from './controls';
export { ListItem, Avatar, DetailRow, Divider } from './list-item';
export { PhotoStrip } from './photo-strip';
export { TrendChart, BarSeries } from './trend-chart';
export { Sheet } from './sheet';
export { LogoMark, Wordmark, HeroSurface } from './brand';
export { Appear, FadeAppear, CountUp, Ping, useCountUp } from './motion';
