import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { ERROR_CODES } from '@ahlan/shared';

import { AppException } from '../errors/app.exception';
import { STADIUM_SOURCE_KEY, type StadiumScopeOptions } from '../decorators';
import { StadiumScopeGuard } from './stadium-scope.guard';
import type { RequestUser } from '../types/request-user';

const LUSAIL = '01930000-0000-7000-8000-000000000001';
const AL_BAYT = '01930000-0000-7000-8000-000000000002';
const AL_THUMAMA = '01930000-0000-7000-8000-000000000003';

const inspector: RequestUser = {
  id: '01930000-0000-7000-8000-00000000000a',
  email: 'inspector@example.test',
  fullName: 'Test Inspector',
  role: 'INSPECTOR',
  sessionId: '01930000-0000-7000-8000-00000000000b',
  stadiumIds: [LUSAIL, AL_BAYT],
};

const admin: RequestUser = { ...inspector, role: 'ADMIN', stadiumIds: [] };

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function guardWith(options: (StadiumScopeOptions & { source?: string }) | undefined) {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => (key === STADIUM_SOURCE_KEY ? options : undefined) as never);
  return new StadiumScopeGuard(reflector);
}

describe('StadiumScopeGuard', () => {
  it('lets an inspector through for an assigned stadium', () => {
    const guard = guardWith({ source: 'param', field: 'stadiumId' });
    const context = contextFor({ user: inspector, params: { stadiumId: LUSAIL } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks an inspector from a stadium they are not assigned to', () => {
    const guard = guardWith({ source: 'param', field: 'stadiumId' });
    const context = contextFor({ user: inspector, params: { stadiumId: AL_THUMAMA } });

    expect(() => guard.canActivate(context)).toThrow(AppException);
    try {
      guard.canActivate(context);
    } catch (error) {
      expect((error as AppException).code).toBe(ERROR_CODES.STADIUM_OUT_OF_SCOPE);
    }
  });

  it('scopes a supervisor exactly like an inspector', () => {
    const supervisor: RequestUser = { ...inspector, role: 'SUPERVISOR' };
    const guard = guardWith({ source: 'param', field: 'stadiumId' });
    expect(guard.canActivate(contextFor({ user: supervisor, params: { stadiumId: LUSAIL } }))).toBe(
      true,
    );
    expect(() =>
      guard.canActivate(contextFor({ user: supervisor, params: { stadiumId: AL_THUMAMA } })),
    ).toThrow(AppException);
  });

  it('never scopes an admin', () => {
    const guard = guardWith({ source: 'param', field: 'stadiumId' });
    const context = contextFor({ user: admin, params: { stadiumId: AL_THUMAMA } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('finds the id in the body', () => {
    const guard = guardWith({ source: 'body', field: 'stadiumId' });
    expect(
      guard.canActivate(contextFor({ user: inspector, body: { stadiumId: LUSAIL } })),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextFor({ user: inspector, body: { stadiumId: AL_THUMAMA } })),
    ).toThrow(AppException);
  });

  it('finds the id in the query', () => {
    const guard = guardWith({ source: 'query', field: 'stadiumId' });
    expect(() =>
      guard.canActivate(contextFor({ user: inspector, query: { stadiumId: AL_THUMAMA } })),
    ).toThrow(AppException);
  });

  it('checks params, query and body when the source is auto', () => {
    const guard = guardWith({ source: 'auto', field: 'stadiumId' });
    expect(() =>
      guard.canActivate(
        contextFor({
          user: inspector,
          params: { stadiumId: LUSAIL },
          body: { stadiumId: AL_THUMAMA },
        }),
      ),
    ).toThrow(AppException);
  });

  it('rejects a bulk request if any one stadium is out of scope', () => {
    const guard = guardWith({ source: 'body', field: 'stadiumId' });
    expect(() =>
      guard.canActivate(
        contextFor({ user: inspector, body: { stadiumIds: [LUSAIL, AL_THUMAMA] } }),
      ),
    ).toThrow(AppException);
  });

  it('accepts a bulk request where every stadium is in scope', () => {
    const guard = guardWith({ source: 'body', field: 'stadiumId' });
    expect(
      guard.canActivate(contextFor({ user: inspector, body: { stadiumIds: [LUSAIL, AL_BAYT] } })),
    ).toBe(true);
  });

  it('passes through when no stadium is named, leaving it to the query filter', () => {
    const guard = guardWith({ source: 'auto', field: 'stadiumId' });
    expect(guard.canActivate(contextFor({ user: inspector, query: {} }))).toBe(true);
  });

  it('rejects a missing id when the route marks it required', () => {
    const guard = guardWith({ source: 'param', field: 'stadiumId', optional: false });
    expect(() => guard.canActivate(contextFor({ user: inspector, params: {} }))).toThrow(
      AppException,
    );
  });

  it('is inert on a route without the decorator', () => {
    const guard = guardWith(undefined);
    expect(
      guard.canActivate(contextFor({ user: inspector, params: { stadiumId: AL_THUMAMA } })),
    ).toBe(true);
  });

  it('refuses an unauthenticated request', () => {
    const guard = guardWith({ source: 'param', field: 'stadiumId' });
    expect(() => guard.canActivate(contextFor({ params: { stadiumId: LUSAIL } }))).toThrow(
      AppException,
    );
  });

  it('honours a custom field name', () => {
    const guard = guardWith({ source: 'param', field: 'id', optional: false });
    expect(guard.canActivate(contextFor({ user: inspector, params: { id: AL_BAYT } }))).toBe(true);
    expect(() =>
      guard.canActivate(contextFor({ user: inspector, params: { id: AL_THUMAMA } })),
    ).toThrow(AppException);
  });
});
