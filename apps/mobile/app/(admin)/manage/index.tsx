import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Inbox, Shapes, Sparkles, Trophy, Users } from 'lucide-react-native';

import { Appear, Screen, Section } from '../../../src/components';
import { NavTile } from '../../../src/components/nav-tile';
import { usePalette } from '../../../src/theme/theme-provider';
import { usePendingAccessRequestCount } from '../../../src/features/admin/hooks';

/**
 * The administrator's management hub.
 *
 * People first, then the catalogue the rest of the app is built on
 * (disciplines, tournaments), then the review queues. Stadiums and
 * checklists have their own tabs on the dock. Each tile is a whole-row tap
 * target.
 */
export default function ManageHubScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const palette = usePalette();
  const { data: pending } = usePendingAccessRequestCount();

  return (
    <Screen title={t('admin.manage')} subtitle={t('admin.manageSubtitle')} contentClassName="gap-6">
      <Section title={t('manage.people')}>
        <Appear index={0}>
          <NavTile
            title={t('users.title')}
            description={t('users.hubDescription')}
            icon={<Users size={22} color={palette.primary} />}
            onPress={() => router.push('/(admin)/manage/users')}
          />
        </Appear>
      </Section>

      <Section title={t('manage.catalogue')}>
        <Appear index={1}>
          <NavTile
            title={t('manage.disciplines.title')}
            description={t('manage.disciplines.hubDescription')}
            icon={<Shapes size={22} color={palette.primary} />}
            onPress={() => router.push('/(admin)/manage/disciplines')}
          />
        </Appear>
        <Appear index={2}>
          <NavTile
            title={t('manage.tournaments.title')}
            description={t('manage.tournaments.hubDescription')}
            icon={<Trophy size={22} color={palette.primary} />}
            onPress={() => router.push('/(admin)/manage/tournaments')}
          />
        </Appear>
      </Section>

      <Section title={t('admin.reviewQueues')}>
        <Appear index={3}>
          <NavTile
            title={t('admin.accessRequests')}
            description={t('admin.accessRequestsDescription')}
            icon={<Inbox size={22} color={palette.primary} />}
            count={pending?.pending}
            onPress={() => router.push('/(admin)/manage/access-requests')}
          />
        </Appear>
        <Appear index={4}>
          <NavTile
            title={t('admin.aiInsights')}
            description={t('admin.aiReviewNote')}
            tone="accent"
            icon={<Sparkles size={22} color={palette.accent} />}
            onPress={() => router.push('/(admin)/manage/ai-insights')}
          />
        </Appear>
      </Section>
    </Screen>
  );
}
