import { isStadiumScopedRole, type Role } from '@ahlan/shared';

import { AppException } from '../errors/app.exception';

/**
 * What `JwtStrategy` puts on `request.user`.
 *
 * `stadiumIds` is loaded from the database on every request rather than read
 * from the token: revoking an inspector's stadium must take effect immediately,
 * not when their access token happens to expire.
 */
export interface RequestUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  /** Session id, so one device can be signed out without touching the others. */
  sessionId: string;
  stadiumIds: string[];
}

export function isAdmin(user: RequestUser | undefined): boolean {
  return user?.role === 'ADMIN';
}

/**
 * True when the actor only sees their assigned stadiums (supervisors and
 * inspectors). Every service query filter must go through this rather than
 * comparing against a single role, so a new role is scoped by default.
 */
export function isStadiumScoped(user: Pick<RequestUser, 'role'>): boolean {
  return isStadiumScopedRole(user.role);
}

/** Admins see every stadium; everyone else only their assignment. */
export function canAccessStadium(user: RequestUser, stadiumId: string): boolean {
  return !isStadiumScoped(user) || user.stadiumIds.includes(stadiumId);
}

/**
 * Prisma filter fragment limiting a query to the actor's stadiums, or nothing
 * for an admin. `field` is the column holding the stadium id.
 */
export function stadiumScopeWhere(user: RequestUser): { stadiumId?: { in: string[] } };
export function stadiumScopeWhere(user: RequestUser, field: 'id'): { id?: { in: string[] } };
export function stadiumScopeWhere(
  user: RequestUser,
  field: 'stadiumId' | 'id' = 'stadiumId',
): { stadiumId?: { in: string[] } } | { id?: { in: string[] } } {
  if (!isStadiumScoped(user)) return {};
  return field === 'id' ? { id: { in: user.stadiumIds } } : { stadiumId: { in: user.stadiumIds } };
}

/** Field data entry (inspections, observations, EOD) is for inspectors and admins only. */
export function canEnterFieldData(user: Pick<RequestUser, 'role'>): boolean {
  return user.role === 'ADMIN' || user.role === 'INSPECTOR';
}

/**
 * Called at the top of every field-entry service method, so the online routes
 * and `/sync/push` (which reuses the same services) reject a supervisor alike.
 */
export function assertCanEnterFieldData(user: Pick<RequestUser, 'role'>): void {
  if (!canEnterFieldData(user)) {
    throw AppException.forbidden('Supervisors review records; they cannot create or submit them');
  }
}
