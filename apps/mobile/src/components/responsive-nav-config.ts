import {
  CalendarCheck,
  ClipboardList,
  Ellipsis,
  LayoutDashboard,
  ListChecks,
  ScanEye,
  Landmark,
  Settings,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * Navigation items for the responsive tab bar, kept free of React so the
 * placement rules can be unit tested.
 *
 * One list describes both layouts: a phone shows the `phone` items as a
 * bottom dock (with a "More" entry gathering the rest), a wide window shows
 * the `sidebar` items as a vertical rail. `route` is the expo-router screen
 * name inside the Tabs layout.
 */
export type NavPlacement = 'both' | 'phone' | 'sidebar';

export interface NavItem {
  route: string;
  /** i18n key for the visible label. */
  labelKey: string;
  /** Shorter i18n key for the six-across phone dock, when it differs. */
  shortLabelKey?: string;
  icon: LucideIcon;
  placement: NavPlacement;
  /** Position on the phone dock when it differs from the sidebar order. */
  phoneOrder?: number;
  /**
   * Phone only: the dock item that stands in for routes not on the dock
   * (the "More" entry), so it lights up while one of them is open.
   */
  collectsHidden?: boolean;
}

export type NavMode = 'phone' | 'sidebar';

/**
 * Every window width keeps the bottom dock: the product's navigation is the
 * floating dock, on a phone and in a wide browser alike. The sidebar rendering
 * stays available in `ResponsiveTabBar` but is not selected.
 */
export function navModeFor(_width: number): NavMode {
  return 'phone';
}

export function itemsFor(items: readonly NavItem[], mode: NavMode): NavItem[] {
  const visible = items.filter((item) => item.placement === 'both' || item.placement === mode);
  if (mode === 'sidebar') return visible;
  // Stable: items without a phoneOrder keep their list position.
  return visible
    .map((item, index) => ({ item, order: item.phoneOrder ?? index }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

/**
 * Which item is highlighted for the focused route.
 *
 * On a phone, a route reached through "More" (My Stadium, My Actions, ...)
 * highlights "More", so the dock never shows nothing selected.
 */
export function activeRouteFor(
  items: readonly NavItem[],
  mode: NavMode,
  focusedRoute: string,
): string | null {
  const visible = itemsFor(items, mode);
  if (visible.some((item) => item.route === focusedRoute)) return focusedRoute;
  if (mode === 'phone') return visible.find((item) => item.collectsHidden)?.route ?? null;
  return null;
}

/**
 * The Venue Inspector workspace (client mockup): My Overview, My Stadium,
 * HSE Observation, My Checklists, EOD Report, My Findings, My Actions and
 * Settings. The dock (U1) shows Overview, My Stadium, Checklists, HSE Obs.,
 * EOD and "More"; "More" gathers My Findings, My Actions and Settings.
 */
export const INSPECTOR_NAV: readonly NavItem[] = [
  {
    route: 'index',
    labelKey: 'nav.myOverview',
    shortLabelKey: 'nav.overview',
    icon: LayoutDashboard,
    placement: 'both',
    phoneOrder: 0,
  },
  {
    route: 'stadium',
    labelKey: 'nav.myStadium',
    icon: Landmark,
    placement: 'both',
    phoneOrder: 1,
  },
  {
    route: 'observations',
    labelKey: 'nav.hseObservation',
    shortLabelKey: 'nav.observationShort',
    icon: ScanEye,
    placement: 'both',
    phoneOrder: 3,
  },
  {
    route: 'inspections',
    labelKey: 'nav.myChecklists',
    shortLabelKey: 'nav.checklists',
    icon: ClipboardList,
    placement: 'both',
    phoneOrder: 2,
  },
  {
    route: 'eod',
    labelKey: 'nav.eodReport',
    shortLabelKey: 'nav.eod',
    icon: CalendarCheck,
    placement: 'both',
    phoneOrder: 4,
  },
  { route: 'findings', labelKey: 'nav.myFindings', icon: TriangleAlert, placement: 'sidebar' },
  { route: 'actions', labelKey: 'nav.myActions', icon: ListChecks, placement: 'sidebar' },
  { route: 'settings', labelKey: 'nav.settings', icon: Settings, placement: 'sidebar' },
  {
    route: 'more',
    labelKey: 'nav.more',
    icon: Ellipsis,
    placement: 'phone',
    phoneOrder: 5,
    collectsHidden: true,
  },
];
