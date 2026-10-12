import { Alert, Platform } from 'react-native';

/**
 * Confirm and info dialogs that actually exist on every platform.
 *
 * React Native's `Alert.alert` is a silent no-op in a browser, which turned
 * every confirmation - signing out, submitting an inspection - into a button
 * that did nothing on web. Native keeps the platform dialog; web falls back
 * to the browser's own confirm/alert, which is plain but never mute.
 */
export function confirmDialog(options: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
}): void {
  if (Platform.OS === 'web') {
    const text = options.message ? `${options.title}\n\n${options.message}` : options.title;
    if (globalThis.confirm(text)) options.onConfirm();
    return;
  }

  Alert.alert(options.title, options.message, [
    { text: options.cancelLabel, style: 'cancel' },
    {
      text: options.confirmLabel,
      style: options.destructive ? 'destructive' : 'default',
      onPress: options.onConfirm,
    },
  ]);
}

export function infoDialog(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
