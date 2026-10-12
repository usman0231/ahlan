import type { Paginated } from '@ahlan/shared';

/**
 * Cursor pagination.
 *
 * Offset pagination drifts while inspectors keep submitting, so lists are keyed
 * on a stable sort column. The cursor is just the last row's id, base64url
 * encoded so it is opaque to clients.
 */

export function encodeCursor(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): string | undefined {
  if (!cursor) return undefined;
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  return decoded.length > 0 ? decoded : undefined;
}

/**
 * Takes `limit + 1` rows, uses the extra one to decide `hasMore`, and returns
 * the page plus the next cursor.
 */
export function paginateById<T extends { id: string }>(rows: T[], limit: number): Paginated<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor(last.id) : null,
  };
}

/** `skip`/`cursor` arguments for a Prisma `findMany` keyed on id. */
export function cursorArgs(cursor: string | undefined): {
  skip?: number;
  cursor?: { id: string };
} {
  const id = decodeCursor(cursor);
  return id ? { skip: 1, cursor: { id } } : {};
}

/** Maps the rows of a page while keeping the cursor metadata. */
export function mapPage<T extends { id: string }, R>(
  page: Paginated<T>,
  map: (row: T) => R,
): Paginated<R> {
  return {
    items: page.items.map(map),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  };
}
