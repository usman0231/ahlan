import { ROLES } from '@ahlan/shared';

import { canManage, canRequestConsolidatedReport, homeFor, isReviewer } from '../roles';

describe('homeFor', () => {
  it('sends administrators and supervisors to the review workspace', () => {
    expect(homeFor('ADMIN')).toBe('/(admin)');
    expect(homeFor('SUPERVISOR')).toBe('/(admin)');
  });

  it('sends inspectors to the field workspace', () => {
    expect(homeFor('INSPECTOR')).toBe('/(inspector)');
  });

  it('never routes a missing role into the review workspace', () => {
    expect(homeFor(null)).toBe('/(inspector)');
    expect(homeFor(undefined)).toBe('/(inspector)');
  });

  it('has an answer for every role in the shared enum', () => {
    for (const role of ROLES) {
      expect(['/(admin)', '/(inspector)']).toContain(homeFor(role));
    }
  });
});

describe('role capabilities', () => {
  it('lets only an administrator manage users, stadiums and AI', () => {
    expect(canManage('ADMIN')).toBe(true);
    expect(canManage('SUPERVISOR')).toBe(false);
    expect(canManage('INSPECTOR')).toBe(false);
  });

  it('keeps consolidated reports admin-only', () => {
    expect(canRequestConsolidatedReport('ADMIN')).toBe(true);
    expect(canRequestConsolidatedReport('SUPERVISOR')).toBe(false);
  });

  it('treats supervisors as reviewers', () => {
    expect(isReviewer('SUPERVISOR')).toBe(true);
    expect(isReviewer('INSPECTOR')).toBe(false);
  });
});
