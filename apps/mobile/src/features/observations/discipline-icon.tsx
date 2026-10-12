import { createElement } from 'react';
import {
  ArrowUpFromLine,
  Brush,
  Construction,
  HardHat,
  LayoutPanelLeft,
  PlugZap,
  Power,
  ShieldCheck,
  Shovel,
  Sparkles,
  Tent,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * Discipline icons, keyed by the Lucide name stored in `disciplines.icon`.
 * Includes the names the seed used before the client mockups, so a device
 * that has not re-synced still shows a sensible icon.
 */
const DISCIPLINE_ICONS: Record<string, LucideIcon> = {
  'hard-hat': HardHat,
  zap: Zap,
  construction: Construction,
  power: Power,
  'layout-panel-left': LayoutPanelLeft,
  sparkles: Sparkles,
  // Earlier seed names.
  'arrow-up-from-line': ArrowUpFromLine,
  shovel: Shovel,
  'plug-zap': PlugZap,
  tent: Tent,
  'brush-cleaning': Brush,
};

export function disciplineIcon(name: string | null | undefined): LucideIcon {
  return (name ? DISCIPLINE_ICONS[name] : undefined) ?? ShieldCheck;
}

/**
 * Renders a discipline's icon by its stored name. Use this rather than
 * `const Icon = disciplineIcon(name)` in a component body, which the React
 * compiler lint reads as creating a component during render.
 */
export function DisciplineIcon({
  name,
  size = 24,
  color,
}: {
  name: string | null | undefined;
  size?: number;
  color: string;
}): React.JSX.Element {
  return createElement(disciplineIcon(name), { size, color });
}
