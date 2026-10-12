import { Redirect } from 'expo-router';

import { useAuthStore } from '../src/store/auth';
import { homeFor } from '../src/features/admin/roles';

/**
 * The entry point: send the user to the workspace their role belongs in.
 *
 * Field work and review are completely different apps - an inspector never
 * sees a report builder, a reviewer never sees a checklist runner - so routing
 * is by role (see `homeFor`). Admin and supervisor share the review workspace.
 */
export default function Index(): React.JSX.Element {
  const user = useAuthStore((state) => state.user);

  if (!user) return <Redirect href="/(auth)/login" />;
  return <Redirect href={homeFor(user.role)} />;
}
