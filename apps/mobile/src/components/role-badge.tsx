import { useTranslation } from 'react-i18next';
import type { Role, UserStatus } from '@ahlan/shared';

import { Badge, type BadgeTone } from './badge';

const roleTone: Record<Role, BadgeTone> = {
  ADMIN: 'primary',
  SUPERVISOR: 'info',
  INSPECTOR: 'neutral',
};

const statusTone: Record<UserStatus, BadgeTone> = {
  ACTIVE: 'success',
  PENDING: 'warning',
  SUSPENDED: 'danger',
};

/** A user's role, always through `roles.*` so it is translated everywhere. */
export function RoleBadge({
  role,
  className,
}: {
  role: Role;
  className?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  return <Badge label={t(`roles.${role}`)} tone={roleTone[role]} className={className} />;
}

export function UserStatusBadge({
  status,
  className,
}: {
  status: UserStatus;
  className?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Badge label={t(`users.statuses.${status}`)} tone={statusTone[status]} className={className} />
  );
}
