import {
  Building2,
  CalendarCheck,
  ClipboardList,
  Ellipsis,
  FileText,
  LayoutDashboard,
  ScanEye,
  Settings,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react-native';
import type { Role } from '@ahlan/shared';

import type { NavItem } from '../../components/responsive-nav-config';
import { canManage } from './roles';

/**
 * The review workspace navigation (administrator and supervisor).
 *
 * Phone dock (every width, see `navModeFor`): the six daily destinations -
 * Overview, Stadiums, Checklists, Findings, Reports - plus "More", which
 * gathers HSE Observation, EOD reports, management (administrator only) and
 * settings. `route` is the expo-router screen name in `app/(admin)/_layout.tsx`;
 * none of them may collide with an inspector route (`findings`, `eod`, ...).
 */
const ITEMS: readonly NavItem[] = [
  {
    route: 'index',
    labelKey: 'admin.nav.overview',
    icon: LayoutDashboard,
    placement: 'both',
    phoneOrder: 0,
  },
  {
    route: 'stadiums',
    labelKey: 'admin.nav.stadiums',
    icon: Building2,
    placement: 'both',
    phoneOrder: 1,
  },
  {
    route: 'checklists',
    labelKey: 'admin.nav.checklists',
    icon: ClipboardList,
    placement: 'both',
    phoneOrder: 2,
  },
  {
    route: 'review-findings',
    labelKey: 'admin.nav.findings',
    icon: TriangleAlert,
    placement: 'both',
    phoneOrder: 3,
  },
  {
    route: 'reports',
    labelKey: 'admin.nav.reports',
    icon: FileText,
    placement: 'both',
    phoneOrder: 4,
  },
  {
    route: 'hse',
    labelKey: 'admin.nav.hse',
    shortLabelKey: 'admin.nav.hseShort',
    icon: ScanEye,
    placement: 'sidebar',
  },
  { route: 'eod-reports', labelKey: 'admin.nav.eod', icon: CalendarCheck, placement: 'sidebar' },
  { route: 'manage', labelKey: 'admin.nav.manage', icon: SlidersHorizontal, placement: 'sidebar' },
  { route: 'settings', labelKey: 'admin.nav.settings', icon: Settings, placement: 'sidebar' },
  {
    route: 'more',
    labelKey: 'admin.nav.more',
    icon: Ellipsis,
    placement: 'phone',
    phoneOrder: 5,
    collectsHidden: true,
  },
];

/** The items a role is offered; management is administrator-only. */
export function adminNavFor(role: Role | null | undefined): NavItem[] {
  return ITEMS.filter((item) => item.route !== 'manage' || canManage(role));
}

/** What the "More" screen lists, in order, for a role. */
export type MoreDestination = 'hse' | 'eod-reports' | 'manage' | 'settings';

export function moreDestinationsFor(role: Role | null | undefined): MoreDestination[] {
  return canManage(role)
    ? ['hse', 'eod-reports', 'manage', 'settings']
    : ['hse', 'eod-reports', 'settings'];
}
