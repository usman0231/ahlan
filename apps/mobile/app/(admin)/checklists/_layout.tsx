import { Stack } from 'expo-router';

/**
 * Checklist templates and who has completed them. Read-only for both
 * reviewer roles: templates are controlled, field inspections are done by
 * the assigned inspectors. A supervisor sees completion for their stadiums.
 */
export default function AdminChecklistsLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
