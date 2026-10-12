import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@ahlan/shared';

import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';
import { AppException } from '../errors/app.exception';
import type { RequestUser } from '../types/request-user';

/**
 * Enforces `@Roles(...)`. Routes without the decorator are open to every
 * authenticated role, so field-entry routes must say `@FieldRoles()`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<{ user?: RequestUser }>().user;
    if (!user) throw AppException.unauthenticated();

    if (!required.includes(user.role)) {
      throw AppException.forbidden(`This action requires role: ${required.join(' or ')}`);
    }
    return true;
  }
}
