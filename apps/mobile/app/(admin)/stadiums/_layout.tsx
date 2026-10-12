import { Stack } from 'expo-router';

/**
 * The Stadiums tab: the venue card grid, one venue, and the administrator's
 * create / edit form. A supervisor reads the same screens for their assigned
 * stadiums (the API scopes the data); the form itself guards its own route.
 */
export default function AdminStadiumsLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
