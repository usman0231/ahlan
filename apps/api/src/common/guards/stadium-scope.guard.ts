import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '@ahlan/shared';

import { IS_PUBLIC_KEY, STADIUM_SOURCE_KEY, type StadiumScopeOptions } from '../decorators';
import { AppException } from '../errors/app.exception';
import { isStadiumScoped, type RequestUser } from '../types/request-user';

interface ScopedRequest {
  user?: RequestUser;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

/**
 * A supervisor or inspector may only ever touch a stadium they are assigned to.
 *
 * This guard is the first of two defences: it rejects a request that names a
 * stadium outside the caller's assignment. The second is the query filter inside
 * each service, which is what protects list endpoints where no id is named.
 * Neither alone is enough, so both exist.
 */
@Injectable()
export class StadiumScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const options = this.reflector.getAllAndOverride<StadiumScopeOptions & { source?: string }>(
      STADIUM_SOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const user = request.user;
    if (!user) throw AppException.unauthenticated();

    // Admins are not stadium-scoped; supervisors and inspectors are.
    if (!isStadiumScoped(user)) return true;

    const field = options.field ?? 'stadiumId';
    const ids = collectIds(request, field, options.source ?? 'auto');

    if (ids.length === 0) {
      if (options.optional === false) {
        throw AppException.badRequest(ERROR_CODES.VALIDATION_FAILED, `${field} is required`);
      }
      // Nothing named: the service's query filter is responsible from here.
      return true;
    }

    const outOfScope = ids.filter((id) => !user.stadiumIds.includes(id));
    if (outOfScope.length > 0) {
      throw AppException.outOfScope(
        outOfScope.length === 1
          ? 'This stadium is not assigned to you'
          : 'One or more of these stadiums is not assigned to you',
      );
    }
    return true;
  }
}

function collectIds(request: ScopedRequest, field: string, source: string): string[] {
  const buckets: (Record<string, unknown> | undefined)[] =
    source === 'param'
      ? [request.params]
      : source === 'query'
        ? [request.query]
        : source === 'body'
          ? [request.body]
          : [request.params, request.query, request.body];

  const found: string[] = [];
  const pluralField = `${field}s`;

  for (const bucket of buckets) {
    if (!bucket) continue;
    const single = bucket[field];
    if (typeof single === 'string' && single.length > 0) found.push(single);

    const many = bucket[pluralField];
    if (Array.isArray(many)) {
      for (const value of many) if (typeof value === 'string' && value) found.push(value);
    }
  }
  return [...new Set(found)];
}
