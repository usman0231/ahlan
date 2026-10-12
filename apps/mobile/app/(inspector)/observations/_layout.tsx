import { Stack } from 'expo-router';

export default function ObservationsLayout(): React.JSX.Element {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="mine" />
      <Stack.Screen name="discipline/[id]" />
    </Stack>
  );
}
