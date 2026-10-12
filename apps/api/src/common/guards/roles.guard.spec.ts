import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { Role } from '@ahlan/shared';

import { AppException } from '../errors/app.exception';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';
import { RolesGuard } from './roles.guard';
import type { RequestUser } from '../types/request-user';

const user = (role: Role): RequestUser => ({
  id: '01930000-0000-7000-8000-00000000000a',
  email: 'user@example.test',
  fullName: 'Test User',
  role,
  sessionId: '01930000-0000-7000-8000-00000000000b',
  stadiumIds: [],
});

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function guardWith(metadata: { roles?: Role[]; isPublic?: boolean }) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation(
    (key: unknown) =>
      (key === ROLES_KEY
        ? metadata.roles
        : key === IS_PUBLIC_KEY
          ? metadata.isPublic
          : undefined) as never,
  );
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows an admin on an admin-only route', () => {
    const guard = guardWith({ roles: ['ADMIN'] });
    expect(guard.canActivate(contextFor({ user: user('ADMIN') }))).toBe(true);
  });

  it('blocks an inspector on an admin-only route', () => {
    const guard = guardWith({ roles: ['ADMIN'] });
    expect(() => guard.canActivate(contextFor({ user: user('INSPECTOR') }))).toThrow(AppException);
  });

  it('allows every role when the route names none', () => {
    const guard = guardWith({});
    expect(guard.canActivate(contextFor({ user: user('INSPECTOR') }))).toBe(true);
    expect(guard.canActivate(contextFor({ user: user('SUPERVISOR') }))).toBe(true);
    expect(guard.canActivate(contextFor({ user: user('ADMIN') }))).toBe(true);
  });

  it('blocks a supervisor on an admin-only route', () => {
    const guard = guardWith({ roles: ['ADMIN'] });
    expect(() => guard.canActivate(contextFor({ user: user('SUPERVISOR') }))).toThrow(
      AppException,
    );
  });

  it('lets a supervisor onto a reviewer route but not a field-entry route', () => {
    const reviewer = guardWith({ roles: ['ADMIN', 'SUPERVISOR'] });
    expect(reviewer.canActivate(contextFor({ user: user('SUPERVISOR') }))).toBe(true);
    expect(() => reviewer.canActivate(contextFor({ user: user('INSPECTOR') }))).toThrow(
      AppException,
    );

    const field = guardWith({ roles: ['ADMIN', 'INSPECTOR'] });
    expect(field.canActivate(contextFor({ user: user('INSPECTOR') }))).toBe(true);
    expect(() => field.canActivate(contextFor({ user: user('SUPERVISOR') }))).toThrow(
      AppException,
    );
  });

  it('skips the check entirely on a public route', () => {
    const guard = guardWith({ isPublic: true, roles: ['ADMIN'] });
    expect(guard.canActivate(contextFor({}))).toBe(true);
  });

  it('refuses an unauthenticated request on a guarded route', () => {
    const guard = guardWith({ roles: ['ADMIN'] });
    expect(() => guard.canActivate(contextFor({}))).toThrow(AppException);
  });
});
