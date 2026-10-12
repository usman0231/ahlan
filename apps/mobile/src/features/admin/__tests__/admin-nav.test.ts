// lucide ships ESM only; the nav rules do not need real icons.
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

import { adminNavFor, moreDestinationsFor } from '../admin-nav';
import { activeRouteFor, itemsFor } from '../../../components/responsive-nav-config';

const DOCK = ['index', 'stadiums', 'checklists', 'review-findings', 'reports', 'more'];
/** Inspector route names: an admin route sharing one would be shadowed by Expo Router. */
const INSPECTOR_ROUTES = ['findings', 'eod', 'stadium', 'inspections', 'observations', 'actions'];

describe('adminNavFor', () => {
  it('puts the same six destinations on the dock for both reviewer roles', () => {
    expect(itemsFor(adminNavFor('ADMIN'), 'phone').map((i) => i.route)).toEqual(DOCK);
    expect(itemsFor(adminNavFor('SUPERVISOR'), 'phone').map((i) => i.route)).toEqual(DOCK);
  });

  it('offers management to the administrator only', () => {
    const admin = itemsFor(adminNavFor('ADMIN'), 'sidebar').map((i) => i.route);
    const supervisor = itemsFor(adminNavFor('SUPERVISOR'), 'sidebar').map((i) => i.route);
    expect(admin).toContain('manage');
    expect(supervisor).not.toContain('manage');
    expect(supervisor).toEqual(
      expect.arrayContaining([
        'index',
        'stadiums',
        'hse',
        'checklists',
        'eod-reports',
        'review-findings',
        'reports',
      ]),
    );
  });

  it('lights up "More" for the destinations it gathers', () => {
    const items = adminNavFor('ADMIN');
    expect(activeRouteFor(items, 'phone', 'hse')).toBe('more');
    expect(activeRouteFor(items, 'phone', 'manage')).toBe('more');
    expect(activeRouteFor(items, 'phone', 'stadiums')).toBe('stadiums');
  });

  it('never reuses an inspector route name', () => {
    const routes = adminNavFor('ADMIN').map((i) => i.route);
    for (const route of INSPECTOR_ROUTES) expect(routes).not.toContain(route);
  });
});

describe('moreDestinationsFor', () => {
  it('lists HSE Observation, EOD reports, Manage and Settings for an administrator', () => {
    expect(moreDestinationsFor('ADMIN')).toEqual(['hse', 'eod-reports', 'manage', 'settings']);
  });

  it('leaves Manage out for a supervisor', () => {
    expect(moreDestinationsFor('SUPERVISOR')).toEqual(['hse', 'eod-reports', 'settings']);
  });
});
