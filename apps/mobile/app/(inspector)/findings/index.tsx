import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SEVERITIES } from '@ahlan/shared';
import type { FindingStatus, Severity } from '@ahlan/shared';

import {
  Chip,
  ChipRow,
  EmptyState,
  ListItem,
  Screen,
  SeverityBadge,
  StatusBadge,
  SkeletonList,
  Text,
} from '../../../src/components';
import { Icon } from '../../../src/components/icon';
import { useFindings } from '../../../src/features/findings/hooks';
import { useStadiums } from '../../../src/features/catalog/hooks';

/**
 * Findings at the inspector's stadiums.
 *
 * The overdue and assigned-to-me filters come in as query params so the home
 * screen cards can deep-link straight to the filtered list.
 */
export default function FindingsListScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ overdue?: string; assignedToMe?: string }>();
  const { stadiums } = useStadiums();

  const [severity, setSeverity] = useState<Severity | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(params.overdue === '1');
  const [assignedToMe, setAssignedToMe] = useState(params.assignedToMe === '1');

  const { rows, loading } = useFindings({ severity, overdueOnly, assignedToMe });

  const stadiumName = useMemo(() => {
    const map = new Map(stadiums.map((stadium) => [stadium.id, stadium.name]));
    return (id: string) => map.get(id) ?? '';
  }, [stadiums]);

  return (
    <Screen title={t('findings.title')} scroll={false}>
      <View className="gap-3 pb-4">
        <ChipRow
          options={SEVERITIES.map((value) => ({
            value,
            label: t(`findings.severities.${value}`),
          }))}
          value={severity}
          onChange={(value) => setSeverity(value as Severity | null)}
        />

        <View className="flex-row gap-2 px-gutter">
          <Chip
            label={t('findings.filterOverdue')}
            selected={overdueOnly}
            onPress={() => setOverdueOnly((value) => !value)}
          />
          <Chip
            label={t('home.myActions')}
            selected={assignedToMe}
            onPress={() => setAssignedToMe((value) => !value)}
          />
        </View>
      </View>

      <View className="flex-1 px-gutter">
        {loading ? (
          <SkeletonList count={6} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t('findings.emptyTitle')}
            body={t('findings.emptyBody')}
            icon={<Icon name="findings" size={40} tone="muted" />}
          />
        ) : (
          <View className="gap-3">
            {rows.map(({ finding, actions, isOverdue }, index) => {
              const action = actions[0];
              return (
                <ListItem
                  key={finding.id}
                  index={index}
                  title={finding.title}
                  subtitle={stadiumName(finding.stadiumId)}
                  meta={`${finding.reference} · ${finding.localDate}`}
                  trailing={
                    <View className="items-end gap-1">
                      <SeverityBadge severity={finding.severity} />
                      <StatusBadge status={finding.status as FindingStatus} isOverdue={isOverdue} />
                      {action?.dueDate ? (
                        <Text variant="caption" tone={isOverdue ? 'danger' : 'subtle'}>
                          {action.dueDate}
                        </Text>
                      ) : null}
                    </View>
                  }
                  onPress={() => router.push(`/(inspector)/findings/${finding.id}`)}
                />
              );
            })}
          </View>
        )}
      </View>
    </Screen>
  );
}
