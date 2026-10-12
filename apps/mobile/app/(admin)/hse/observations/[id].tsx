import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  OBSERVATION_TYPES,
  RISK_RATINGS,
  SEVERITIES,
  observationRaisesFinding,
  type Observation,
  type ObservationType,
  type RiskRating,
  type Severity,
} from '@ahlan/shared';

import {
  Badge,
  Button,
  Card,
  Chip,
  DetailRow,
  Divider,
  ErrorState,
  Field,
  InlineError,
  Screen,
  Section,
  SeverityBadge,
  SkeletonText,
  Text,
  TextField,
} from '../../../../src/components';
import { HeaderBar } from '../../../../src/components/back-button';
import { RemotePhotoGrid } from '../../../../src/components/remote-photo-grid';
import { useAllStadiums, useDisciplines } from '../../../../src/features/admin/hooks';
import {
  useCorrectObservation,
  useObservationDetail,
  useRestoreRecord,
  useSoftDeleteRecord,
} from '../../../../src/features/admin/manage-hooks';
import { useReasonDialog } from '../../../../src/features/admin/components/reason-dialog';
import {
  DeletedBadge,
  DeletedNotice,
  RecordAdminActions,
} from '../../../../src/features/admin/components/record-admin';
import { canManage } from '../../../../src/features/admin/roles';
import { useAuthStore } from '../../../../src/store/auth';
import { useSettingsStore } from '../../../../src/store/settings';
import { formatDateTime } from '../../../../src/utils/format';

/**
 * One submitted HSE observation. Read-only for a supervisor; an administrator
 * corrects it (audited), soft deletes it with a reason (the finding it
 * raised goes with it) or restores it.
 */
export default function AdminObservationScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);
  const admin = canManage(useAuthStore((state) => state.user?.role));
  const observation = useObservationDetail(id);
  const { data: stadiums } = useAllStadiums();
  const [editing, setEditing] = useState(false);
  const reason = useReasonDialog();
  const remove = useSoftDeleteRecord('observations');
  const restore = useRestoreRecord('observations');

  const header = (
    <HeaderBar backLabel={t('admin.observations.title')} fallback="/(admin)/hse/observations" />
  );

  if (observation.isError) {
    return (
      <Screen headerAction={header}>
        <ErrorState error={observation.error} onRetry={() => void observation.refetch()} />
      </Screen>
    );
  }
  const data = observation.data;
  if (!data) {
    return (
      <Screen headerAction={header}>
        <SkeletonText lines={10} />
      </Screen>
    );
  }

  const stadium = stadiums?.find((row) => row.id === data.stadiumId);
  const deleted = Boolean(data.deletedAt);

  return (
    <Screen
      headerAction={header}
      title={data.title}
      subtitle={data.localDate}
      onRefresh={() => void observation.refetch()}
      contentClassName="gap-6"
    >
      {deleted ? (
        <DeletedNotice
          reason={data.deleteReason}
          deletedAt={data.deletedAt}
          restoring={restore.isPending}
          onRestore={
            admin
              ? () =>
                  reason.open({
                    title: t('admin.records.restoreTitle'),
                    message: t('admin.records.restoreObservation'),
                    confirmLabel: t('admin.records.restore'),
                    onConfirm: (text) => restore.mutateAsync({ id: data.id, reason: text }),
                  })
              : undefined
          }
        />
      ) : null}

      {editing ? (
        <ObservationEditor
          observation={data}
          openReason={reason.open}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
          <Card className="gap-3">
            <View className="flex-row flex-wrap items-center gap-2">
              <SeverityBadge severity={data.severity} />
              <Badge
                label={t(`observations.types.${data.type}`)}
                tone={data.type === 'POSITIVE' ? 'success' : 'warning'}
              />
              <Badge label={t(`observations.riskRatings.${data.riskRating}`)} tone="info" />
              {deleted ? <DeletedBadge /> : null}
            </View>
            <Text variant="body">{data.description}</Text>
          </Card>

          <Card padded={false} className="px-4 py-2">
            <DetailRow label={t('stadiums.stadium')} value={stadium?.name ?? '—'} />
            <Divider />
            <DetailRow label={t('observations.discipline')} value={data.disciplineName ?? '—'} />
            <Divider />
            <DetailRow label={t('findings.raisedBy')} value={data.inspectorName ?? '—'} />
            <Divider />
            <DetailRow
              label={t('admin.observations.observedAt')}
              value={formatDateTime(
                new Date(data.observedAt),
                stadium?.timezone ?? 'Asia/Riyadh',
                locale,
              )}
            />
            <Divider />
            <DetailRow label={t('observations.location')} value={data.locationLabel} />
            <Divider />
            <DetailRow label={t('observations.responsibleParty')} value={data.responsibleParty} />
            <Divider />
            <DetailRow label={t('observations.immediateAction')} value={data.immediateAction} />
          </Card>

          {data.evidence.length > 0 ? (
            <Section title={t('findings.evidence')}>
              <RemotePhotoGrid
                photos={data.evidence.map((photo) => ({ id: photo.id, uri: photo.url }))}
              />
            </Section>
          ) : null}

          {data.findingId ? (
            <Button
              label={t('admin.observations.openFinding')}
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/(admin)/review-findings/[id]',
                  params: { id: data.findingId as string },
                })
              }
            />
          ) : null}

          {admin && !deleted ? (
            <Card>
              <RecordAdminActions
                editLabel={t('admin.records.editObservation')}
                onEdit={() => setEditing(true)}
                onDelete={() =>
                  reason.open({
                    title: t('admin.records.deleteTitle'),
                    message: t('admin.records.deleteObservation'),
                    confirmLabel: t('admin.records.delete'),
                    destructive: true,
                    onConfirm: (text) => remove.mutateAsync({ id: data.id, reason: text }),
                  })
                }
              />
            </Card>
          ) : null}
        </>
      )}
      {reason.element}
    </Screen>
  );
}

function ObservationEditor({
  observation,
  openReason,
  onDone,
}: {
  observation: Observation;
  openReason: ReturnType<typeof useReasonDialog>['open'];
  onDone: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const arabic = i18n.language.startsWith('ar');
  const correct = useCorrectObservation();
  const disciplines = useDisciplines();
  const [type, setType] = useState<ObservationType>(observation.type);
  const [disciplineId, setDisciplineId] = useState(observation.disciplineId);
  const [severity, setSeverity] = useState<Severity>(observation.severity);
  const [riskRating, setRiskRating] = useState<RiskRating>(observation.riskRating);
  const [title, setTitle] = useState(observation.title);
  const [description, setDescription] = useState(observation.description);
  const [locationLabel, setLocationLabel] = useState(observation.locationLabel ?? '');
  const [responsibleParty, setResponsibleParty] = useState(observation.responsibleParty ?? '');
  const [immediateAction, setImmediateAction] = useState(observation.immediateAction ?? '');
  const [error, setError] = useState<string | null>(null);

  // The API only lets the type move within the "raises a finding" group.
  const raises = observationRaisesFinding(observation.type);
  const types = OBSERVATION_TYPES.filter((value) => observationRaisesFinding(value) === raises);

  function save(): void {
    setError(null);
    if (title.trim().length < 3) return setError(t('admin.records.errors.title'));
    if (description.trim().length < 10) return setError(t('admin.records.errors.description'));
    const text = (value: string, original: string | null) =>
      value.trim() !== (original ?? '').trim() ? value.trim() || null : undefined;
    const changes = Object.fromEntries(
      Object.entries({
        type: type !== observation.type ? type : undefined,
        disciplineId: disciplineId !== observation.disciplineId ? disciplineId : undefined,
        severity: severity !== observation.severity ? severity : undefined,
        riskRating: riskRating !== observation.riskRating ? riskRating : undefined,
        title: title.trim() !== observation.title ? title.trim() : undefined,
        description:
          description.trim() !== observation.description ? description.trim() : undefined,
        locationLabel: text(locationLabel, observation.locationLabel),
        responsibleParty: text(responsibleParty, observation.responsibleParty),
        immediateAction: text(immediateAction, observation.immediateAction),
      }).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(changes).length === 0) return onDone();
    openReason({
      title: t('admin.records.saveCorrection'),
      message: t('admin.records.correctionBody'),
      confirmLabel: t('common.save'),
      onConfirm: async (reason) => {
        await correct.mutateAsync({ id: observation.id, reason, ...changes });
        onDone();
      },
    });
  }

  return (
    <Section title={t('admin.records.editObservation')}>
      <Card className="gap-4">
        <Field label={t('observations.type')}>
          <View className="flex-row flex-wrap gap-2">
            {types.map((value) => (
              <Chip
                key={value}
                label={t(`observations.types.${value}`)}
                selected={type === value}
                onPress={() => setType(value)}
              />
            ))}
          </View>
        </Field>
        <Field label={t('observations.discipline')}>
          <View className="flex-row flex-wrap gap-2">
            {(disciplines.data ?? []).map((discipline) => (
              <Chip
                key={discipline.id}
                label={arabic && discipline.nameAr ? discipline.nameAr : discipline.name}
                selected={disciplineId === discipline.id}
                onPress={() => setDisciplineId(discipline.id)}
              />
            ))}
          </View>
        </Field>
        <Field label={t('admin.records.fields.severity')}>
          <View className="flex-row flex-wrap gap-2">
            {SEVERITIES.map((value) => (
              <Chip
                key={value}
                label={t(`findings.severities.${value}`)}
                selected={severity === value}
                onPress={() => setSeverity(value)}
              />
            ))}
          </View>
        </Field>
        <Field label={t('observations.riskRating')}>
          <View className="flex-row flex-wrap gap-2">
            {RISK_RATINGS.map((value) => (
              <Chip
                key={value}
                label={t(`observations.riskRatings.${value}`)}
                selected={riskRating === value}
                onPress={() => setRiskRating(value)}
              />
            ))}
          </View>
        </Field>
        <TextField
          label={t('observations.observationTitle')}
          value={title}
          onChangeText={setTitle}
        />
        <TextField
          label={t('observations.description')}
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <TextField
          label={t('observations.location')}
          value={locationLabel}
          onChangeText={setLocationLabel}
          optional
        />
        <TextField
          label={t('observations.responsibleParty')}
          value={responsibleParty}
          onChangeText={setResponsibleParty}
          optional
        />
        <TextField
          label={t('observations.immediateAction')}
          value={immediateAction}
          onChangeText={setImmediateAction}
          multiline
          optional
        />
        {error ? <InlineError message={error} /> : null}
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button label={t('common.cancel')} variant="secondary" onPress={onDone} />
          </View>
          <View className="flex-1">
            <Button label={t('common.save')} loading={correct.isPending} onPress={save} />
          </View>
        </View>
      </Card>
    </Section>
  );
}
