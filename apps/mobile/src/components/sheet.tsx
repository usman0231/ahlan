import { forwardRef, useCallback, useMemo } from 'react';
import { View } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from './text';
import { usePalette } from '../theme/theme-provider';

export interface SheetProps {
  title?: string;
  snapPoints?: (string | number)[];
  onClose?: () => void;
  children: React.ReactNode;
}

/**
 * The bottom sheet used for pickers, confirmations and quick forms.
 *
 * Wrapped rather than used directly so the backdrop, handle and theming are
 * decided once; a screen just provides a title and content.
 */
export const Sheet = forwardRef<BottomSheet, SheetProps>(function Sheet(
  { title, snapPoints, onClose, children },
  ref,
) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const points = useMemo(() => snapPoints ?? ['60%'], [snapPoints]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.4}
      />
    ),
    [],
  );

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={points}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: palette.surface }}
      handleIndicatorStyle={{ backgroundColor: palette.borderStrong }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 20) + 8,
          gap: 16,
        }}
      >
        {title ? (
          <View className="pb-1">
            <Text variant="heading">{title}</Text>
          </View>
        ) : null}
        {children}
      </BottomSheetScrollView>
    </BottomSheet>
  );
});
