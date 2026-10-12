import { useCallback, useState } from 'react';
import * as Location from 'expo-location';

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
}

/**
 * A single GPS fix, for the traceability stamp on every field record.
 *
 * `Balanced` accuracy rather than `Highest`: we need to know which stadium and
 * roughly where in it, not a survey-grade position, and the battery has to last
 * a full match day.
 */
/**
 * How long a capture may hold up the inspector. GPS is traceability, not a
 * gate: a basement with no fix, or a permission prompt nobody answers, must
 * never stop an inspection from starting or a record from being submitted.
 */
const FIX_TIMEOUT_MS = 6_000;

/** Resolves `null` instead of waiting past the deadline. */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export async function getCurrentPosition(): Promise<GeoFix | null> {
  return withDeadline(
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) return null;

      // A recent fix is good enough for traceability and returns instantly.
      const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }).catch(
        () => null,
      );
      const position =
        last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy ?? null,
      };
    })(),
    FIX_TIMEOUT_MS,
  );
}

/**
 * GPS as a hook. Deliberately never throws: a refused permission or an indoor
 * fix must not stop an inspector submitting, so the record is stored with a
 * null location instead.
 */
export function useLocation() {
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);

  const capture = useCallback(async (): Promise<GeoFix | null> => {
    setLoading(true);
    try {
      const next = await getCurrentPosition();
      if (!next) setDenied(true);
      setFix(next);
      return next;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fix, loading, denied, capture };
}
