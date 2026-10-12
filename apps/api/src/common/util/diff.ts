import { Prisma } from '@prisma/client';

export type FieldDiff = Record<string, { from: unknown; to: unknown }>;

/**
 * Only the fields that actually changed, in `{ field: { from, to } }` shape.
 * Audit rows record this rather than a full before/after copy, so a reviewer can
 * see at a glance what an admin correction touched.
 */
export function buildDiff<T extends object>(before: T, after: Partial<T>): FieldDiff {
  const diff: FieldDiff = {};
  for (const [key, next] of Object.entries(after)) {
    if (next === undefined) continue;
    const previous = (before as Record<string, unknown>)[key];
    if (!isEqual(previous, next)) {
      diff[key] = { from: normalise(previous), to: normalise(next) };
    }
  }
  return diff;
}

export function hasChanges(diff: FieldDiff): boolean {
  return Object.keys(diff).length > 0;
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Prisma.Decimal || b instanceof Prisma.Decimal) {
    return String(normalise(a)) === String(normalise(b));
  }
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
  }
  return false;
}

/** Dates and Decimals become strings so the diff is plain JSON. */
function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toFixed(2);
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalise(v)]),
    );
  }
  return value;
}
