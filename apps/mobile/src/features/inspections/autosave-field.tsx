import { useEffect, useRef, useState } from 'react';

import { TextField, type TextFieldProps } from '../../components/input';

const DELAY_MS = 600;

/**
 * A text field that writes itself to the local database: a moment after the
 * inspector stops typing, and again on blur. Controlled locally so typing
 * never waits on a database write; `onEndEditing` alone is not enough because
 * the web renderer never fires it.
 */
export function AutosaveField({
  initialValue,
  onSave,
  ...rest
}: Omit<TextFieldProps, 'value' | 'defaultValue' | 'onChangeText'> & {
  initialValue: string | null;
  onSave: (value: string) => void | Promise<void>;
}): React.JSX.Element {
  const [value, setValue] = useState(initialValue ?? '');
  const [dirty, setDirty] = useState(false);
  const saveRef = useRef(onSave);

  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      void saveRef.current(value);
      setDirty(false);
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [value, dirty]);

  return (
    <TextField
      {...rest}
      value={value}
      onChangeText={(text) => {
        setValue(text);
        setDirty(true);
      }}
      onBlur={(event) => {
        if (dirty) {
          void saveRef.current(value);
          setDirty(false);
        }
        rest.onBlur?.(event);
      }}
    />
  );
}
