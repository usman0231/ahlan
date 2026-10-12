import { Stack } from 'expo-router';

/** HSE Observation for reviewers: discipline cards, then each discipline's dashboard. */
export default function AdminHseLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
