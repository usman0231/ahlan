import { HttpStatus, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '@ahlan/shared';

import { AppException } from '../errors/app.exception';
import { IS_PUBLIC_KEY } from '../decorators';
import { JwtAuthGuard } from './jwt-auth.guard';

function guard(isPublic = false): JwtAuthGuard {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => (key === IS_PUBLIC_KEY ? isPublic : undefined) as never);
  return new JwtAuthGuard(reflector);
}

const context = {
  getHandler: () => () => undefined,
  getClass: () => class {},
  switchToHttp: () => ({ getRequest: () => ({}) }),
} as unknown as ExecutionContext;

/**
 * Passport catches whatever `JwtStrategy.validate()` throws and hands it to
 * `handleRequest` as `err`. Those errors carry the precise reason - the session
 * was revoked, the account is suspended, the account is awaiting approval - and
 * the app maps each code to its own localised message.
 *
 * An earlier version of this guard discarded `err` and threw a generic 401, so
 * a suspended user and a signed-out device both read as "please sign in again"
 * and the pending-approval case could never reach the user at all. These tests
 * pin that down.
 */
describe('JwtAuthGuard.handleRequest', () => {
  it('rethrows the specific error the strategy raised', () => {
    const revoked = AppException.unauthenticated(
      ERROR_CODES.TOKEN_REVOKED,
      'Session has been signed out',
    );

    expect(() => guard().handleRequest(revoked, null, undefined)).toThrow(revoked);
  });

  it('preserves ACCOUNT_SUSPENDED rather than flattening it', () => {
    const suspended = AppException.forbidden(
      'Your account has been suspended',
      ERROR_CODES.ACCOUNT_SUSPENDED,
    );

    try {
      guard().handleRequest(suspended, null, undefined);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as AppException).code).toBe(ERROR_CODES.ACCOUNT_SUSPENDED);
      expect((error as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
  });

  it('preserves ACCOUNT_PENDING_APPROVAL', () => {
    const pending = AppException.forbidden(
      'Waiting for approval',
      ERROR_CODES.ACCOUNT_PENDING_APPROVAL,
    );

    try {
      guard().handleRequest(pending, null, undefined);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as AppException).code).toBe(ERROR_CODES.ACCOUNT_PENDING_APPROVAL);
    }
  });

  it('reports an expired token distinctly, so the app knows to refresh', () => {
    try {
      guard().handleRequest(null, null, { name: 'TokenExpiredError' });
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as AppException).code).toBe(ERROR_CODES.TOKEN_EXPIRED);
    }
  });

  it('falls back to UNAUTHENTICATED when there is no reason to report', () => {
    try {
      guard().handleRequest(null, null, undefined);
      throw new Error('should have thrown');
    } catch (error) {
      expect((error as AppException).code).toBe(ERROR_CODES.UNAUTHENTICATED);
    }
  });

  it('returns the user when authentication succeeded', () => {
    const user = { id: 'u1' };
    expect(guard().handleRequest(null, user, undefined)).toBe(user);
  });
});

describe('JwtAuthGuard.canActivate', () => {
  it('lets a @Public() route through without a token', () => {
    expect(guard(true).canActivate(context)).toBe(true);
  });
});
