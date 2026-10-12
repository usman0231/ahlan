// Lucide ships ESM-only .mjs that this Jest setup does not transform.
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

import {
  INSPECTOR_NAV,
  activeRouteFor,
  itemsFor,
  navModeFor,
} from '../responsive-nav-config';

/** The inspector navigation as the client mockup and D9 define it. */
describe('inspector navigation', () => {
  it('shows the six-item phone dock in U1 order, My Stadium included', () => {
    expect(itemsFor(INSPECTOR_NAV, 'phone').map((item) => item.route)).toEqual([
      'index',
      'stadium',
      'inspections',
      'observations',
      'eod',
      'more',
    ]);
  });

  it('shows the sidebar in mockup order, without "More"', () => {
    expect(itemsFor(INSPECTOR_NAV, 'sidebar').map((item) => item.route)).toEqual([
      'index',
      'stadium',
      'observations',
      'inspections',
      'eod',
      'findings',
      'actions',
      'settings',
    ]);
  });

  it('keeps the bottom dock at every width', () => {
    expect(navModeFor(400)).toBe('phone');
    expect(navModeFor(1024)).toBe('phone');
    expect(navModeFor(1920)).toBe('phone');
  });

  it('lights "More" on a phone for routes reached through it', () => {
    expect(activeRouteFor(INSPECTOR_NAV, 'phone', 'actions')).toBe('more');
    expect(activeRouteFor(INSPECTOR_NAV, 'phone', 'findings')).toBe('more');
    expect(activeRouteFor(INSPECTOR_NAV, 'phone', 'settings')).toBe('more');
    expect(activeRouteFor(INSPECTOR_NAV, 'phone', 'stadium')).toBe('stadium');
    expect(activeRouteFor(INSPECTOR_NAV, 'phone', 'eod')).toBe('eod');
  });

  it('puts exactly My Findings, My Actions and Settings behind "More"', () => {
    const dock = itemsFor(INSPECTOR_NAV, 'phone').map((item) => item.route);
    expect(
      INSPECTOR_NAV.filter((item) => !dock.includes(item.route)).map((item) => item.route),
    ).toEqual(['findings', 'actions', 'settings']);
  });

  it('lights the route itself in the sidebar, and nothing for "More"', () => {
    expect(activeRouteFor(INSPECTOR_NAV, 'sidebar', 'actions')).toBe('actions');
    expect(activeRouteFor(INSPECTOR_NAV, 'sidebar', 'more')).toBeNull();
  });

  it('gives every item an i18n label in the nav namespace', () => {
    for (const item of INSPECTOR_NAV) expect(item.labelKey.startsWith('nav.')).toBe(true);
  });
});
