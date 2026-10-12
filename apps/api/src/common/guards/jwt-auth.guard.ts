import { Injectable, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ERROR_CODES } from '@ahlan/shared';

import { IS_PUBLIC_KEY } from '../decorators';
import { AppException } from '../errors/app.exception';

/**
 * Applied globally. A route has to opt out with `@Public()`, so a new controller
 * is authenticated by default rather than by remembering to add a guard.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  override handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    if (err || !user) {
      /**
       * Passport catches whatever `JwtStrategy.validate()` throws and hands it
       * back here as `err`. Those are already precise - the session was
       * revoked, the account is suspended, the account is still awaiting
       * approval - and the app maps each code to its own localised message, so
       * they must be rethrown rather than flattened into a generic 401.
       */
      if (err instanceof AppException) throw err;

      const name = (info as { name?: string } | undefined)?.name;
      if (name === 'TokenExpiredError') {
        throw AppException.unauthenticated(ERROR_CODES.TOKEN_EXPIRED, 'Access token has expired');
      }
      throw AppException.unauthenticated();
    }
    return user;
  }
}
