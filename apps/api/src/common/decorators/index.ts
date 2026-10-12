import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import type { Role } from '@ahlan/shared';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { RequestUser } from '../types/request-user';

export const IS_PUBLIC_KEY = 'ahlan:isPublic';
export const ROLES_KEY = 'ahlan:roles';
export const STADIUM_SOURCE_KEY = 'ahlan:stadiumSource';

/** Opts a route out of `JwtAuthGuard`. Used by login, register and health. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to the given roles; enforced by `RolesGuard`. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const AdminOnly = () => Roles('ADMIN');

/** Review routes: admins everywhere, supervisors for their assigned stadiums. */
export const ReviewerRoles = () => Roles('ADMIN', 'SUPERVISOR');

/**
 * Field data entry (inspections, observations, EOD). Supervisors review but never
 * create; the services repeat this check so `/sync/push` is covered too.
 */
export const FieldRoles = () => Roles('ADMIN', 'INSPECTOR');

/**
 * Where `StadiumScopeGuard` should look for the stadium id on this route.
 * Defaults to checking params, then query, then body.
 */
export type StadiumSource = 'param' | 'query' | 'body' | 'auto';

export interface StadiumScopeOptions {
  source?: StadiumSource;
  /** Field name holding the id. Defaults to `stadiumId`. */
  field?: string;
  /** Allow the request through when no stadium id is present. */
  optional?: boolean;
}

export const StadiumScope = (options: StadiumScopeOptions = {}) =>
  SetMetadata(STADIUM_SOURCE_KEY, { source: 'auto', field: 'stadiumId', ...options });

/** The authenticated user, as resolved by `JwtStrategy`. */
export const CurrentUser = createParamDecorator(
  (field: keyof RequestUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);

/** Client IP and user agent, recorded on audit entries. */
export const RequestMeta = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<{
    ip?: string;
    headers: Record<string, string | string[] | undefined>;
  }>();
  const forwarded = request.headers['x-forwarded-for'];
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim()) ?? request.ip;
  const userAgent = request.headers['user-agent'];
  return {
    ip: ip ?? null,
    userAgent: (Array.isArray(userAgent) ? userAgent[0] : userAgent) ?? null,
  };
});

/**
 * Zod -> OpenAPI 3 JSON Schema.
 *
 * The schema is taken as `unknown` and widened on the way in: inferring through
 * these nested unions and `.superRefine()` chains exceeds TypeScript's
 * instantiation depth, and the JSON Schema output is untyped anyway.
 */
function toJsonSchema(schema: unknown): Record<string, unknown> {
  return zodToJsonSchema(schema as Parameters<typeof zodToJsonSchema>[0], {
    target: 'openApi3',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
}

/**
 * Documents a Zod schema in Swagger so /docs stays in step with what the pipe
 * actually accepts, without hand-written DTO classes.
 */
export function ApiZodBody(schema: ZodTypeAny, name?: string) {
  return ApiBody({ schema: toJsonSchema(schema) as never, description: name });
}

/** Documents each top-level key of a query schema as a Swagger query param. */
export function ApiZodQuery(schema: ZodTypeAny) {
  const json = toJsonSchema(schema) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  const properties = json.properties ?? {};
  const required = new Set(json.required ?? []);
  const decorators = Object.entries(properties).map(([key, value]) =>
    ApiQuery({ name: key, required: required.has(key), schema: value as never }),
  );
  return (target: object, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    for (const decorate of decorators) {
      (decorate as (t: object, k?: string | symbol, d?: PropertyDescriptor) => void)(
        target,
        propertyKey,
        descriptor,
      );
    }
  };
}
