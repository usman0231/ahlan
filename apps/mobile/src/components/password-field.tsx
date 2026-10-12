import { useState } from 'react';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react-native';

import { TextField, type TextFieldProps } from './input';
import { usePalette } from '../theme/theme-provider';
import { useHaptics } from '../hooks/use-haptics';

/**
 * A password input with a show / hide toggle.
 *
 * Typing a long password on a phone in sunlight is error-prone; seeing it
 * once before submitting saves a failed sign-in. The toggle sits inside the
 * field at the end edge (RTL-safe) and is a full touch target.
 */
export function PasswordField(
  props: Omit<TextFieldProps, 'secureTextEntry' | 'trailing'>,
): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const haptics = useHaptics();
  const [visible, setVisible] = useState(false);
  const Glyph = visible ? EyeOff : Eye;

  return (
    <TextField
      {...props}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          accessibilityState={{ checked: visible }}
          hitSlop={8}
          onPress={() => {
            haptics.answer();
            setVisible((value) => !value);
          }}
          className="min-h-touch min-w-touch -me-3 items-center justify-center"
        >
          <Glyph size={20} color={palette.fgMuted} />
        </Pressable>
      }
    />
  );
}
