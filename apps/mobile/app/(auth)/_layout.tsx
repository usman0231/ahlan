import { Redirect, Stack } from 'expo-router';

import { useAuthStore } from '../../src/store/auth';
import { homeFor } from '../../src/features/admin/roles';

/** Signed-in users never see the auth screens. */
export default function AuthLayout(): React.JSX.Element {
  const user = useAuthStore((state) => state.user);

  if (user) {
    return <Redirect href={homeFor(user.role)} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_bottom' }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
