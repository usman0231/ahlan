import { useTranslation } from 'react-i18next';
import type { StadiumCardKpi } from '@ahlan/shared';

import { StadiumCard } from '../../components/stadium-card';
import { useSettingsStore } from '../../store/settings';

/**
 * A StadiumCard fed by the D5 KPI row; shared with the stadium detail. The
 * uploaded photo (`imageUrl`, presigned per request) wins; StadiumCard falls
 * back to the bundled photo by code, then the branded placeholder.
 */
export function StadiumKpiCard({
  card,
  onOpen,
}: {
  card: StadiumCardKpi;
  onOpen: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);

  return (
    <StadiumCard
      code={card.code}
      name={locale === 'ar' && card.nameAr ? card.nameAr : card.name}
      city={card.city}
      imageUrl={card.imageUrl}
      inactive={!card.isActive}
      assignee={
        card.assignedInspectors.length > 0
          ? card.assignedInspectors.map((inspector) => inspector.fullName).join(', ')
          : null
      }
      stats={{
        inspections: card.checklistsDone,
        inspectionsExpected: card.checklistsExpected,
        findings: card.findingsOpen,
        compliancePercent: card.compliancePercent,
        progress: card.progressPercent === null ? null : card.progressPercent / 100,
        progressLabel: t('stadium.checklistProgress'),
      }}
      onOpen={onOpen}
    />
  );
}
