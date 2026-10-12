import {
  AlertTriangle,
  ArrowUpFromLine,
  BarChart3,
  Brush,
  Camera,
  Check,
  ArrowUpRight,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileText,
  Home,
  Inbox,
  Settings,
  Shovel,
  Sparkles,
  Tent,
  TriangleAlert,
  Users,
  Zap,
  PlugZap,
  type LucideIcon,
} from 'lucide-react-native';

import type { ColorValue } from 'react-native';

import { usePalette } from '../theme/theme-provider';

/**
 * The icon set.
 *
 * Mapped by name rather than imported ad hoc so the app ships one consistent
 * family, and so a discipline row from the database - which stores a Lucide
 * name - can resolve to a real icon without the UI hard-coding the list.
 */
const ICONS: Record<string, LucideIcon> = {
  home: Home,
  inspections: ClipboardCheck,
  checklist: ClipboardList,
  observations: Eye,
  findings: TriangleAlert,
  eod: FileText,
  dashboard: BarChart3,
  users: Users,
  settings: Settings,
  inbox: Inbox,
  reports: FileText,
  ai: Sparkles,
  camera: Camera,
  check: Check,
  chevron: ChevronRight,
  'arrow-up-right': ArrowUpRight,
  warning: AlertTriangle,

  // Discipline icons, keyed by the `icon` column on the disciplines table.
  'arrow-up-from-line': ArrowUpFromLine,
  zap: Zap,
  shovel: Shovel,
  'plug-zap': PlugZap,
  tent: Tent,
  'brush-cleaning': Brush,
};

export type IconName = keyof typeof ICONS | string;

export function Icon({
  name,
  size = 22,
  color,
  tone = 'default',
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  /** Navigators pass a `ColorValue`, which may be null. */
  color?: ColorValue;
  tone?:
    | 'default'
    | 'muted'
    | 'primary'
    | 'inverse'
    | 'danger'
    | 'success'
    | 'warning'
    | 'accent'
    | 'onHero'
    | 'onPrimary';
  strokeWidth?: number;
}): React.JSX.Element | null {
  const palette = usePalette();
  const Component = ICONS[name];
  if (!Component) return null;

  const resolved =
    (color as string | undefined) ??
    {
      default: palette.fg,
      muted: palette.fgMuted,
      primary: palette.primary,
      inverse: palette.fgInverse,
      danger: palette.danger,
      success: palette.success,
      warning: palette.warning,
      accent: palette.accent,
      onHero: palette.onHero,
      onPrimary: palette.onPrimary,
    }[tone];

  return <Component size={size} color={resolved} strokeWidth={strokeWidth} />;
}
