import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Lock, UserRound } from 'lucide-react-native';
import type { InspectionResponse, InspectionWithResponses, ResponseValue } from '@ahlan/shared';

import {
  AnswerToggle,
  Appear,
  Badge,
  Button,
  Card,
  DetailRow,
  ErrorState,
  InlineError,
  KpiCard,
  Screen,
  Section,
  SkeletonList,
  SkeletonText,
  Text,
  TextField,
} from '../../../../src/components';
import { HeaderBar } from '../../../../src/components/back-button';
import { RemotePhotoGrid } from '../../../../src/components/remote-photo-grid';
import { useInspectionDetail, useChecklistVersion } from '../../../../src/features/admin/hooks';
import {
  useCorrectInspection,
  useRestoreRecord,
  useSoftDeleteRecord,
} from '../../../../src/features/admin/manage-hooks';
import {
  inspectionCorrection,
  inspectionEditsFrom,
  type InspectionEdits,
  type ResponseEdit,
} from '../../../../src/features/admin/record-edits';
import { useReasonDialog } from '../../../../src/features/admin/components/reason-dialog';
import {
  DeletedBadge,
  DeletedNotice,
  RecordAdminActions,
} from '../../../../src/features/admin/components/record-admin';
import { canManage } from '../../../../src/features/admin/roles';
import { useAuthStore } from '../../../../src/store/auth';
import { usePalette } from '../../../../src/theme/theme-provider';
import { formatInt, formatPercent } from '../../../../src/utils/format';

const answerTone: Record<ResponseValue, 'success' | 'danger' | 'neutral'> = {
  YES: 'success',
  NO: 'danger',
  NA: 'neutral',
};

/**
 * A submitted inspection in the wording of the exact checklist version it was
 * answered against: score, header fields, then every answer with its concern,
 * recommendation and photos.
 *
 * Read-only for a supervisor. An administrator can correct answers and notes
 * (the API recomputes compliance and writes the audit log), soft delete the
 * inspection with a reason, and restore it.
 */
export default function AdminInspectionScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const palette = usePalette();
  const admin = canManage(useAuthStore((state) => state.user?.role));
  const inspection = useInspectionDetail(id);
  const version = useChecklistVersion(inspection.data?.checklistVersionId);
  const arabic = i18n.language.startsWith('ar');
  const [editing, setEditing] = useState(false);
  const reason = useReasonDialog();
  const remove = useSoftDeleteRecord('inspections');
  const restore = useRestoreRecord('inspections');

  const questions = useMemo(() => {
    const map = new Map<string, { text: string; allowNa: boolean }>();
    for (const section of version.data?.sections ?? []) {
      for (const item of section.items) {
        map.set(item.id, {
          text: arabic && item.questionAr ? item.questionAr : item.question,
          allowNa: item.allowNa,
        });
      }
    }
    return map;
  }, [version.data, arabic]);

  const header = <HeaderBar backLabel={t('common.back')} fallback="/(admin)/checklists" />;

  if (inspection.isError) {
    return (
      <Screen headerAction={header}>
        <ErrorState error={inspection.error} onRetry={() => void inspection.refetch()} />
      </Screen>
    );
  }

  const data = inspection.data;
  const deleted = Boolean(data?.deletedAt);

  return (
    <Screen
      headerAction={header}
      wide
      onRefresh={() => void inspection.refetch()}
      contentClassName="gap-6"
    >
      {!data ? (
        <View className="gap-4">
          <SkeletonText lines={3} />
          <SkeletonList count={5} />
        </View>
      ) : (
        <>
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
                        message: t('admin.records.restoreInspection'),
                        confirmLabel: t('admin.records.restore'),
                        onConfirm: (text) => restore.mutateAsync({ id: data.id, reason: text }),
                      })
                  : undefined
              }
            />
          ) : null}

          <Appear index={0} className="gap-2">
            <Text variant="overline" tone="subtle">
              {t('checklists.inspectionOverline', { version: data.checklistVersion })}
            </Text>
            <Text variant="display" numberOfLines={2}>
              {data.checklistTitle}
            </Text>
            <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
              <View className="flex-row items-center gap-1.5">
                <UserRound size={15} color={palette.fgMuted} />
                <Text variant="callout" tone="muted">
                  {data.inspectorName ?? '—'}
                </Text>
              </View>
              <Text variant="callout" tone="muted" tabular>
                {data.localDate}
              </Text>
              {data.isLocked ? (
                <View className="flex-row items-center gap-1.5">
                  <Lock size={14} color={palette.fgSubtle} />
                  <Text variant="caption" tone="subtle">
                    {t('admin.eodDetail.locked')}
                  </Text>
                </View>
              ) : null}
              {deleted ? <DeletedBadge /> : null}
            </View>
          </Appear>

          <Appear index={1} className="flex-row flex-wrap gap-3">
            <KpiCard
              label={t('kpi.compliance')}
              value={formatPercent(data.compliancePercent, '—')}
            />
            <KpiCard label={t('common.yes')} value={formatInt(data.yesCount)} />
            <KpiCard
              label={t('common.no')}
              value={formatInt(data.noCount)}
              tone={data.noCount > 0 ? 'danger' : 'default'}
            />
            <KpiCard label={t('common.na')} value={formatInt(data.naCount)} />
          </Appear>

          {editing ? (
            <InspectionEditor
              key={data.updatedAt ? String(data.updatedAt) : data.id}
              inspection={data}
              questions={questions}
              openReason={reason.open}
              onDone={() => setEditing(false)}
            />
          ) : (
            <>
              {data.locationLabel || data.otherObservations || data.notes ? (
                <Card padded={false} className="px-4 py-2">
                  {data.locationLabel ? (
                    <DetailRow label={t('checklists.location')} value={data.locationLabel} />
                  ) : null}
                  {data.otherObservations ? (
                    <View className="gap-1 py-3">
                      <Text variant="caption" tone="muted">
                        {t('checklists.otherObservations')}
                      </Text>
                      <Text variant="body">{data.otherObservations}</Text>
                    </View>
                  ) : null}
                  {data.notes ? (
                    <View className="gap-1 py-3">
                      <Text variant="caption" tone="muted">
                        {t('admin.records.fields.notes')}
                      </Text>
                      <Text variant="body">{data.notes}</Text>
                    </View>
                  ) : null}
                </Card>
              ) : null}

              <Section title={t('checklists.answers')}>
                <View className="gap-3">
                  {data.responses.map((response, index) => (
                    <AnswerRow
                      key={response.id}
                      response={response}
                      question={questions.get(response.itemId)?.text}
                      index={index}
                    />
                  ))}
                </View>
              </Section>

              {admin && !deleted ? (
                <Card>
                  <RecordAdminActions
                    editLabel={t('admin.records.editInspection')}
                    onEdit={() => setEditing(true)}
                    onDelete={() =>
                      reason.open({
                        title: t('admin.records.deleteTitle'),
                        message: t('admin.records.deleteInspection'),
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
        </>
      )}
      {reason.element}
    </Screen>
  );
}

function AnswerRow({
  response,
  question,
  index,
}: {
  response: InspectionResponse;
  question: string | undefined;
  index: number;
}): React.JSX.Element {
  const { t } = useTranslation();
  const concern = response.concern ?? response.comment;
  return (
    <Appear index={Math.min(index, 8)}>
      <Card className="gap-3">
        <View className="flex-row items-start gap-3">
          <View className="flex-1 gap-1">
            <Text variant="caption" tone="subtle" tabular>
              {response.itemCode}
            </Text>
            <Text variant="body">{question ?? '…'}</Text>
          </View>
          <Badge
            label={t(`common.${response.value.toLowerCase()}`)}
            tone={answerTone[response.value]}
          />
        </View>
        {concern ? (
          <View className="gap-0.5">
            <Text variant="overline" tone="subtle">
              {t('checklists.concern')}
            </Text>
            <Text variant="callout">{concern}</Text>
          </View>
        ) : null}
        {response.recommendation ? (
          <View className="gap-0.5">
            <Text variant="overline" tone="subtle">
              {t('checklists.recommendation')}
            </Text>
            <Text variant="callout">{response.recommendation}</Text>
          </View>
        ) : null}
        {response.evidence.length > 0 ? (
          <RemotePhotoGrid
            photos={response.evidence.map((photo) => ({ id: photo.id, uri: photo.url }))}
          />
        ) : null}
      </Card>
    </Appear>
  );
}

/**
 * The administrator's correction form: answers, concerns, recommendations
 * and the header notes. Only changed fields are sent (`inspectionCorrection`).
 */
function InspectionEditor({
  inspection,
  questions,
  openReason,
  onDone,
}: {
  inspection: InspectionWithResponses;
  questions: Map<string, { text: string; allowNa: boolean }>;
  openReason: ReturnType<typeof useReasonDialog>['open'];
  onDone: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const correct = useCorrectInspection();
  const [edits, setEdits] = useState<InspectionEdits>(() => inspectionEditsFrom(inspection));
  const [error, setError] = useState<string | null>(null);

  const setResponse = (id: string, patch: Partial<ResponseEdit>): void =>
    setEdits((current) => {
      const existing = current.responses[id];
      if (!existing) return current;
      return { ...current, responses: { ...current.responses, [id]: { ...existing, ...patch } } };
    });

  function save(): void {
    setError(null);
    const body = inspectionCorrection(inspection, edits);
    if (!body) {
      onDone();
      return;
    }
    openReason({
      title: t('admin.records.saveCorrection'),
      message: t('admin.records.inspectionCorrectionBody'),
      confirmLabel: t('common.save'),
      onConfirm: async (reason) => {
        await correct.mutateAsync({ id: inspection.id, reason, ...body });
        onDone();
      },
    });
  }

  return (
    <Section title={t('admin.records.editInspection')}>
      <Card className="gap-4">
        <TextField
          label={t('checklists.location')}
          value={edits.locationLabel}
          onChangeText={(locationLabel) => setEdits((current) => ({ ...current, locationLabel }))}
          optional
        />
        <TextField
          label={t('checklists.otherObservations')}
          value={edits.otherObservations}
          onChangeText={(otherObservations) =>
            setEdits((current) => ({ ...current, otherObservations }))
          }
          multiline
          optional
        />
        <TextField
          label={t('admin.records.fields.notes')}
          value={edits.notes}
          onChangeText={(notes) => setEdits((current) => ({ ...current, notes }))}
          multiline
          optional
        />
      </Card>
      {inspection.responses.map((response) => {
        const edit = edits.responses[response.id];
        if (!edit) return null;
        const question = questions.get(response.itemId);
        return (
          <Card key={response.id} className="gap-3">
            <Text variant="caption" tone="subtle" tabular>
              {response.itemCode}
            </Text>
            <Text variant="body">{question?.text ?? '…'}</Text>
            <AnswerToggle
              value={edit.value}
              allowNa={question?.allowNa ?? true}
              onChange={(value) => setResponse(response.id, { value })}
            />
            <TextField
              label={t('checklists.concern')}
              value={edit.concern}
              onChangeText={(concern) => setResponse(response.id, { concern })}
              optional
            />
            <TextField
              label={t('checklists.recommendation')}
              value={edit.recommendation}
              onChangeText={(recommendation) => setResponse(response.id, { recommendation })}
              optional
            />
          </Card>
        );
      })}
      <Text variant="caption" tone="muted">
        {t('admin.records.answerChangeHint')}
      </Text>
      {error ? <InlineError message={error} /> : null}
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button label={t('common.cancel')} variant="secondary" onPress={onDone} />
        </View>
        <View className="flex-1">
          <Button label={t('common.save')} loading={correct.isPending} onPress={save} />
        </View>
      </View>
    </Section>
  );
}
