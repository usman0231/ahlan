import { useEffect, useState } from 'react';

/**
 * A clock that ticks.
 *
 * Reading `Date.now()` during render makes a component impure: the value
 * changes without any state changing, so React can render two different results
 * for the same inputs. Anything that counts down - the EOD submission window,
 * an overdue age - takes its "now" from here instead, which also makes the
 * countdown actually count down rather than freezing until the next re-render.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
