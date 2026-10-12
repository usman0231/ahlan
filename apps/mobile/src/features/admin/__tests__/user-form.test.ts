import { uuidv7 } from '@ahlan/shared';

import {
  validateAccess,
  validateCreateUser,
  validateResetPassword,
  type CreateUserFormValues,
} from '../user-form';

const stadium = uuidv7();

function values(overrides: Partial<CreateUserFormValues> = {}): CreateUserFormValues {
  return {
    fullName: 'Demo Inspector',
    email: 'Demo.Inspector@Example.com ',
    phone: '',
    role: 'INSPECTOR',
    stadiumIds: [stadium],
    password: 'Stadium2026!',
    ...overrides,
  };
}

describe('validateCreateUser', () => {
  it('accepts a complete inspector and normalises the email', () => {
    const result = validateCreateUser(values());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.email).toBe('demo.inspector@example.com');
      expect(result.data.phone).toBeUndefined();
      expect(result.data.stadiumIds).toEqual([stadium]);
    }
  });

  it.each(['INSPECTOR', 'SUPERVISOR'] as const)('requires a stadium for a %s', (role) => {
    const result = validateCreateUser(values({ role, stadiumIds: [] }));
    expect(result).toEqual({ ok: false, errors: { stadiumIds: 'users.errors.stadiumRequired' } });
  });

  it('does not require (and drops) stadiums for an administrator', () => {
    const result = validateCreateUser(values({ role: 'ADMIN', stadiumIds: [stadium] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.stadiumIds).toEqual([]);
  });

  it('reports each bad field with an i18n key, not the schema sentence', () => {
    const result = validateCreateUser(
      values({ fullName: 'A', email: 'nope', phone: '12', password: 'short' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual({
        fullName: 'users.errors.fullName',
        email: 'users.errors.email',
        phone: 'users.errors.phone',
        password: 'users.errors.password',
      });
    }
  });

  it('applies the shared password rules', () => {
    expect(validateCreateUser(values({ password: 'alllowercase1' })).ok).toBe(false);
    expect(validateCreateUser(values({ password: 'NoDigitsHere!' })).ok).toBe(false);
  });
});

describe('validateResetPassword', () => {
  it('accepts a password that meets the shared rules', () => {
    expect(validateResetPassword('Stadium2026!')).toEqual({
      ok: true,
      newPassword: 'Stadium2026!',
    });
  });

  it('rejects a weak password', () => {
    expect(validateResetPassword('weak')).toEqual({ ok: false, error: 'users.errors.password' });
  });
});

describe('validateAccess', () => {
  it('blocks a scoped role with no stadium', () => {
    expect(validateAccess('SUPERVISOR', [])).toBe('users.errors.stadiumRequired');
    expect(validateAccess('INSPECTOR', [])).toBe('users.errors.stadiumRequired');
  });

  it('allows an administrator with no stadium', () => {
    expect(validateAccess('ADMIN', [])).toBeNull();
    expect(validateAccess('INSPECTOR', [stadium])).toBeNull();
  });
});
