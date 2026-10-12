import { Stack } from 'expo-router';

/** My Stadium: the venue cards, then one venue's detail. */
export default function StadiumLayout(): React.JSX.Element {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
