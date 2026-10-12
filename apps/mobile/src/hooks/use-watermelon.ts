import { useEffect, useRef, useState } from 'react';
import type { Model, Query } from '@nozbe/watermelondb';

/**
 * WatermelonDB queries as hooks.
 *
 * The inspector-facing screens read from the local database, not from the API,
 * and these subscriptions are what make that feel live: a record written during
 * a sync, or a photo finishing its upload, re-renders the list without anybody
 * asking it to.
 *
 * `deps` controls when the subscription is rebuilt. Pass the values the query
 * was built from - a Watermelon `Query` object is a new instance on every
 * render, so it cannot be the dependency itself. Deps must be primitives
 * (strings, numbers, booleans, null); they are serialised to form the cache key.
 */
function depsKey(deps: readonly unknown[]): string {
  return JSON.stringify(deps);
}

/**
 * Holds the latest query builder without re-subscribing when the closure
 * changes identity. The ref is written in an effect rather than during render,
 * so a render is never a side effect.
 */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

interface RecordsState<T> {
  key: string;
  /** `null` while the first result for this key is still loading. */
  records: T[] | null;
}

export function useRecords<T extends Model>(
  build: () => Query<T>,
  deps: readonly unknown[],
): { records: T[]; loading: boolean } {
  const key = depsKey(deps);
  const buildRef = useLatest(build);
  const [state, setState] = useState<RecordsState<T>>({ key, records: null });

  // The query changed, so the previous result no longer applies. Resetting
  // during render means the screen shows its skeleton rather than one frame of
  // the wrong stadium's data.
  if (state.key !== key) {
    setState({ key, records: null });
  }

  useEffect(() => {
    const subscription = buildRef
      .current()
      .observe()
      .subscribe({
        next: (records) => setState({ key, records }),
        error: () => setState({ key, records: [] }),
      });

    return () => subscription.unsubscribe();
  }, [key, buildRef]);

  return {
    records: state.key === key ? (state.records ?? []) : [],
    loading: state.key !== key || state.records === null,
  };
}

/** A single record, or null while it loads or if it is gone. */
export function useRecord<T extends Model>(
  build: () => Query<T>,
  deps: readonly unknown[],
): { record: T | null; loading: boolean } {
  const { records, loading } = useRecords(build, deps);
  return { record: records[0] ?? null, loading };
}

/**
 * A live count. Cheaper than fetching the rows when a screen only needs the
 * number, which is the case for every badge in the app.
 */
export function useRecordCount<T extends Model>(
  build: () => Query<T>,
  deps: readonly unknown[],
): number {
  const key = depsKey(deps);
  const buildRef = useLatest(build);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const subscription = buildRef
      .current()
      .observeCount()
      .subscribe({
        next: setCount,
        error: () => setCount(0),
      });

    return () => subscription.unsubscribe();
  }, [key, buildRef]);

  return count;
}

/**
 * Observes one record's own column changes.
 *
 * `useRecords` re-emits when the result set changes, but a detail screen
 * holding a single model needs `observe()` on the model itself to notice a
 * field being edited in place - which is what a sync pull does.
 */
export function useObservedRecord<T extends Model>(model: T | null): T | null {
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!model) return;
    const subscription = model.observe().subscribe({
      next: () => setVersion((value) => value + 1),
      error: () => undefined,
    });
    return () => subscription.unsubscribe();
  }, [model]);

  return model;
}
