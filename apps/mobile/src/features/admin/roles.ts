import type { Role } from '@ahlan/shared';

/**
 * Which workspace a role lives in, and what it may do there.
 *
 * Every routing decision (the entry redirect, sign-in, the auth layout and the
 * guards on each workspace layout) goes through `homeFor`, so adding a role
 * means changing one function rather than hunting for ternaries.
 */

export type Workspace = '/(admin)' | '/(inspector)';

/**
 * ADMIN and SUPERVISOR share the review workspace (a supervisor simply sees
 * fewer tabs); INSPECTOR has the offline field workspace.
 */
export function homeFor(role: Role | null | undefined): Workspace {
  return role === 'ADMIN' || role === 'SUPERVISOR' ? '/(admin)' : '/(inspector)';
}

/** May open the review workspace at all. */
export function isReviewer(role: Role | null | undefined): boolean {
  return homeFor(role) === '/(admin)';
}

/** Users, stadiums, access requests and AI review are administrator-only. */
export function canManage(role: Role | null | undefined): boolean {
  return role === 'ADMIN';
}

/** Consolidated (all-stadium) reports are administrator-only. */
export function canRequestConsolidatedReport(role: Role | null | undefined): boolean {
  return role === 'ADMIN';
}
