import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '../theme/tokens';
import { usePalette } from '../theme/theme-provider';

/**
 * A thin determinate progress bar that glides to each new value.
 *
 * Animated in measured pixels with inline styles: a percentage width string
 * and a className on an Animated view are both unreliable on the web renderer.
 */
export function ProgressBar({ value }: { value: number }): React.JSX.Element {
  const palette = usePalette();
  const [trackWidth, setTrackWidth] = useState(0);
  const width = useSharedValue(0);
  const clamped = Math.max(0, Math.min(1, value));

  useEffect(() => {
    width.value = withTiming(trackWidth * clamped, {
      duration: motion.slow,
      easing: Easing.out(Easing.cubic),
    });
  }, [clamped, trackWidth, width]);

  const fill = useAnimatedStyle(() => ({ width: width.value }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[{ height: 6, borderRadius: 999, backgroundColor: palette.primaryFill }, fill]}
      />
    </View>
  );
}
