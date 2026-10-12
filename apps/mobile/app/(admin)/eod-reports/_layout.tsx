import { Stack } from 'expo-router';

/**
 * End-of-Day reports for reviewers: the window settings (administrator only),
 * who has submitted today, and every submitted report read-only.
 * A supervisor gets the same screens scoped to their stadiums by the API.
 */
export default function AdminEodLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
