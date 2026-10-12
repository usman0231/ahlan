import { Redirect, Stack } from 'expo-router';

import { useAuthStore } from '../../../src/store/auth';
import { canManage } from '../../../src/features/admin/roles';

/**
 * The management hub: users, stadiums, access requests, AI review.
 *
 * Administrator-only. The tab is hidden for a supervisor, and this guard
 * covers a deep link as well, so a supervisor never even issues the request
 * the API would refuse.
 */
export default function ManageLayout(): React.JSX.Element {
  const role = useAuthStore((state) => state.user?.role);
  if (!canManage(role)) return <Redirect href="/(admin)" />;

  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
