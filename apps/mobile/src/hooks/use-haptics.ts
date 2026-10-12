import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';

import { useSettingsStore } from '../store/settings';

/**
 * Haptics on answer, submit and status change, as the UI standards require.
 *
 * It matters more here than in most apps: an inspector is often working in
 * gloves, in noise, without looking closely at the screen, and the tap is the
 * confirmation that the answer registered.
 */
export function useHaptics() {
  const enabled = useSettingsStore((state) => state.hapticsEnabled);

  const impact = useCallback(
    (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
      if (!enabled) return;
      void Haptics.impactAsync(style);
    },
    [enabled],
  );

  const notify = useCallback(
    (type: Haptics.NotificationFeedbackType) => {
      if (!enabled) return;
      void Haptics.notificationAsync(type);
    },
    [enabled],
  );

  return {
    /** A checklist answer registered. */
    answer: useCallback(() => impact(Haptics.ImpactFeedbackStyle.Light), [impact]),
    /** A destructive or high-consequence tap. */
    heavy: useCallback(() => impact(Haptics.ImpactFeedbackStyle.Heavy), [impact]),
    /** Something was submitted successfully. */
    success: useCallback(
      () => notify(Haptics.NotificationFeedbackType.Success),
      [notify],
    ),
    /** A rule stopped the action, e.g. a NO with no photo. */
    warning: useCallback(
      () => notify(Haptics.NotificationFeedbackType.Warning),
      [notify],
    ),
    error: useCallback(() => notify(Haptics.NotificationFeedbackType.Error), [notify]),
    enabled,
  };
}
