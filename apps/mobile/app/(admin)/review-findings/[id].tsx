import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  SEVERITIES,
  allowedTransitionsForRole,
  assignCorrectiveActionSchema,
  uuidv7,
  zonedDateString,
  type CorrectiveAction,
  type Finding,
  type FindingStatus,
  type Role,
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
  OptionList,
  Screen,
  Section,
  SeverityBadge,
  SkeletonText,
  StatusBadge,
  Text,
  TextField,
} from '../../../src/components';
import { HeaderBar } from '../../../src/components/back-button';
import { RemotePhotoGrid, type RemotePhoto } from '../../../src/components/remote-photo-grid';
import {
  useAllStadiums,
  useAssignAction,
  useFindingDetail,
  useStadiumUsers,
  useTransitionFindingAction,
} from '../../../src/features/admin/hooks';
import { uploadClosurePhoto } from '../../../src/features/admin/closure-upload';
import {
  useCorrectFinding,
  useRestoreRecord,
  useSoftDeleteRecord,
} from '../../../src/features/admin/manage-hooks';
import { useReasonDialog } from '../../../src/features/admin/components/reason-dialog';
import {
  DeletedBadge,
  DeletedNotice,
  RecordAdminActions,
} from '../../../src/features/admin/components/record-admin';
import { useDisciplines } from '../../../src/features/admin/hooks';
import { usePhotoCapture } from '../../../src/features/evidence/use-photo-capture';
import { useAuthStore } from '../../../src/store/auth';
import { useSettingsStore } from '../../../src/store/settings';
import { confirmDialog } from '../../../src/utils/dialogs';
import { formatDateTime } from '../../../src/utils/format';
import { ApiError } from '../../../src/api/client';

const DEFAULT_TZ = 'Asia/Riyadh';

function errorText(
  error: unknown,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return error instanceof ApiError
    ? t(error.translationKey, { defaultValue: t('errors.UNKNOWN') })
    : t('errors.UNKNOWN');
}

/**
 * A finding and its corrective action, read from the API, for an
 * administrator or a supervisor.
 *
 * The buttons come from `allowedTransitionsForRole` in `@ahlan/shared` - the
 * function the API authorises with - so the screen never offers a move the
 * server will refuse. Assigning is its own form (it creates the action);
 * closing needs closure photos, uploaded here directly to object storage.
 */
export default function ReviewFindingScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const locale = useSettingsStore((state) => state.locale);
  const finding = useFindingDetail(id);
  const { data: stadiums } = useAllStadiums();

  const header = <HeaderBar backLabel={t('findings.title')} fallback="/(admin)/review-findings" />;

  if (finding.isError) {
    return (
      <Screen headerAction={header}>
        <ErrorState error={finding.error} onRetry={() => void finding.refetch()} />
      </Screen>
    );
  }
  if (!finding.data || !user) {
    return (
      <Screen headerAction={header}>
        <SkeletonText lines={10} />
      </Screen>
    );
  }

  const data = finding.data;
  const timeZone =
    stadiums?.find((stadium) => stadium.id === data.stadiumId)?.timezone ?? DEFAULT_TZ;

  return (
    <FindingBody
      key={data.id}
      finding={data}
      header={header}
      timeZone={timeZone}
      locale={locale}
      role={user.role}
      userId={user.id}
      onRefresh={() => void finding.refetch()}
    />
  );
}

function FindingBody({
  finding,
  header,
  timeZone,
  locale,
  role,
  userId,
  onRefresh,
}: {
  finding: Finding;
  header: React.ReactNode;
  timeZone: string;
  locale: string;
  role: Role;
  userId: string;
  onRefresh: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const action: CorrectiveAction | null = finding.actions[0] ?? null;
  const status: FindingStatus = finding.status;
  const isAssignee = Boolean(action?.assigneeId && action.assigneeId === userId);

  const deleted = Boolean(finding.deletedAt);
  const admin = role === 'ADMIN';
  const [editing, setEditing] = useState(false);
  const reason = useReasonDialog();
  const remove = useSoftDeleteRecord('findings');
  const restore = useRestoreRecord('findings');

  const rules = deleted ? [] : allowedTransitionsForRole(status, role, isAssignee);
  const canAssign = rules.some((rule) => rule.to === 'ACTION_ASSIGNED');
  const moves = action ? rules.filter((rule) => rule.to !== 'ACTION_ASSIGNED') : [];

  const sourcePhotos: RemotePhoto[] = finding.evidence.map((photo) => ({
    id: photo.id,
    uri: photo.url,
  }));
  const actionPhotos: RemotePhoto[] = (action?.evidence ?? []).map((photo) => ({
    id: photo.id,
    uri: photo.url,
  }));

  return (
    <Screen
      headerAction={header}
      title={finding.reference}
      onRefresh={onRefresh}
      contentClassName="gap-6"
    >
      {deleted ? (
        <DeletedNotice
          reason={finding.deleteReason}
          deletedAt={finding.deletedAt}
          restoring={restore.isPending}
          onRestore={
            admin
              ? () =>
                  reason.open({
                    title: t('admin.records.restoreTitle'),
                    message: t('admin.records.restoreFinding', { reference: finding.reference }),
                    confirmLabel: t('admin.records.restore'),
                    onConfirm: (text) => restore.mutateAsync({ id: finding.id, reason: text }),
                  })
              : undefined
          }
        />
      ) : null}

      {editing ? (
        <FindingEditCard
          finding={finding}
          onDone={() => setEditing(false)}
          openReason={reason.open}
        />
      ) : null}

      <Card className="gap-3">
        <View className="flex-row flex-wrap items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <StatusBadge status={status} isOverdue={finding.isOverdue} />
          {deleted ? <DeletedBadge /> : null}
        </View>
        <Text variant="heading">{finding.title}</Text>
        <Text variant="body" tone="muted">
          {finding.description}
        </Text>
      </Card>

      <Card padded={false} className="px-4 py-2">
        <DetailRow label={t('stadiums.stadium')} value={finding.stadiumName ?? '—'} />
        <Divider />
        <DetailRow label={t('findings.raisedOn')} value={finding.localDate} />
        <Divider />
        <DetailRow label={t('findings.raisedBy')} value={finding.raisedByName ?? '—'} />
        <Divider />
        <DetailRow
          label={t('findings.source')}
          value={
            finding.source === 'INSPECTION'
              ? t('inspections.title')
              : finding.source === 'OBSERVATION'
                ? t('observations.title')
                : t('admin.review.manual')
          }
        />
      </Card>

      {sourcePhotos.length > 0 ? (
        <Section title={t('findings.evidence')}>
          <RemotePhotoGrid photos={sourcePhotos} />
        </Section>
      ) : null}

      {action ? (
        <Section title={t('findings.correctiveAction')}>
          <Card className="gap-3">
            <Text variant="body">{action.action}</Text>
            <Divider />
            <DetailRow
              label={t('findings.assignee')}
              value={action.assigneeName ?? action.responsibleParty ?? '—'}
            />
            <DetailRow label={t('findings.dueDate')} value={action.dueDate} />
            {action.isOverdue ? (
              <Badge label={t('findings.statuses.OVERDUE')} tone="danger" />
            ) : null}
            {action.closureNote ? (
              <>
                <Divider />
                <DetailRow label={t('findings.closureNote')} value={action.closureNote} />
              </>
            ) : null}
            {actionPhotos.length > 0 ? (
              <>
                <Divider />
                <Text variant="caption" tone="muted">
                  {t('admin.review.actionEvidence')}
                </Text>
                <RemotePhotoGrid photos={actionPhotos} />
              </>
            ) : null}
          </Card>
        </Section>
      ) : null}

      <Section title={t('findings.history')}>
        <Timeline finding={finding} action={action} timeZone={timeZone} locale={locale} />
      </Section>

      {canAssign ? <AssignForm finding={finding} timeZone={timeZone} /> : null}

      {moves.length > 0 && action ? (
        <TransitionPanel finding={finding} action={action} moves={moves.map((rule) => rule.to)} />
      ) : null}

      {admin && !deleted && !editing ? (
        <Card>
          <RecordAdminActions
            editLabel={t('admin.records.editFinding')}
            onEdit={() => setEditing(true)}
            onDelete={() =>
              reason.open({
                title: t('admin.records.deleteTitle'),
                message: t('admin.records.deleteFinding', { reference: finding.reference }),
                confirmLabel: t('admin.records.delete'),
                destructive: true,
                onConfirm: (text) => remove.mutateAsync({ id: finding.id, reason: text }),
              })
            }
          />
        </Card>
      ) : null}
      {reason.element}

      {status === 'PENDING_VERIFICATION' && role !== 'ADMIN' ? (
        <Card>
          <Text variant="caption" tone="muted">
            {t('findings.onlyAdminCanClose')}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

function Timeline({
  finding,
  action,
  timeZone,
  locale,
}: {
  finding: Finding;
  action: CorrectiveAction | null;
  timeZone: string;
  locale: string;
}): React.JSX.Element {
  const { t } = useTranslation();

  const events = useMemo(() => {
    const rows: { key: string; at: Date; label: string; detail?: string }[] = [
      {
        key: 'raised',
        at: new Date(finding.raisedAt),
        label: t('admin.review.timeline.raised'),
        detail: finding.raisedByName,
      },
    ];
    if (action) {
      rows.push({
        key: 'assigned',
        at: new Date(action.createdAt),
        label: t('admin.review.timeline.assigned'),
        detail: action.assigneeName ?? action.responsibleParty ?? undefined,
      });
      if (action.startedAt)
        rows.push({
          key: 'started',
          at: new Date(action.startedAt),
          label: t('admin.review.timeline.started'),
        });
      if (action.completedAt)
        rows.push({
          key: 'completed',
          at: new Date(action.completedAt),
          label: t('admin.review.timeline.completed'),
        });
      if (action.verifiedAt)
        rows.push({
          key: 'verified',
          at: new Date(action.verifiedAt),
          label: t('admin.review.timeline.verified'),
        });
    }
    if (finding.closedAt && !action?.verifiedAt)
      rows.push({
        key: 'closed',
        at: new Date(finding.closedAt),
        label: t('findings.statuses.CLOSED'),
      });
    return rows.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [finding, action, t]);

  return (
    <Card className="gap-0">
      {events.map((event, index) => {
        const last = index === events.length - 1;
        return (
          <View key={event.key} className="flex-row gap-3">
            <View className="items-center" style={{ width: 16 }}>
              <View
                className={
                  last
                    ? 'mt-1 h-3 w-3 rounded-full bg-primary-fill'
                    : 'mt-1 h-3 w-3 rounded-full bg-border-strong'
                }
              />
              {last ? null : <View className="w-0.5 flex-1 bg-border" />}
            </View>
            <View className="flex-1 gap-0.5 pb-4">
              <Text variant="callout">{event.label}</Text>
              <Text variant="caption" tone="muted">
                {[formatDateTime(event.at, timeZone, locale), event.detail]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function AssignForm({
  finding,
  timeZone,
}: {
  finding: Finding;
  timeZone: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const people = useStadiumUsers(finding.stadiumId);
  const assign = useAssignAction(finding.id);

  const today = zonedDateString(new Date(), timeZone);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [responsibleParty, setResponsibleParty] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(addDays(today, 7));
  const [error, setError] = useState<string | null>(null);

  function submit(): void {
    setError(null);
    const parsed = assignCorrectiveActionSchema.safeParse({
      id: uuidv7(),
      assigneeId,
      responsibleParty: responsibleParty.trim() || null,
      action: description,
      dueDate,
    });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      setError(
        field === 'dueDate'
          ? t('admin.review.errors.dueDate')
          : field === 'action'
            ? t('admin.review.errors.action')
            : t('admin.review.errors.assignee'),
      );
      return;
    }
    if (parsed.data.dueDate < today) {
      setError(t('admin.review.errors.dueDate'));
      return;
    }
    assign.mutate(parsed.data, {
      onError: (mutationError) => setError(errorText(mutationError, t)),
    });
  }

  return (
    <Section title={t('findings.assignAction')}>
      <Card className="gap-5">
        <Field label={t('findings.assignee')} hint={t('admin.review.assigneeHint')}>
          {people.isLoading ? (
            <SkeletonText lines={3} />
          ) : (people.data ?? []).length === 0 ? (
            <Text variant="caption" tone="muted">
              {t('admin.review.noAssignees')}
            </Text>
          ) : (
            <OptionList
              options={(people.data ?? []).map((person) => ({
                value: person.id,
                label: person.fullName,
                description: t(`roles.${person.role}`),
              }))}
              value={assigneeId}
              onChange={(value) => setAssigneeId(value === assigneeId ? null : value)}
            />
          )}
        </Field>
        <TextField
          label={t('observations.responsibleParty')}
          placeholder={t('observations.responsiblePlaceholder')}
          value={responsibleParty}
          onChangeText={setResponsibleParty}
          optional
        />
        <TextField
          label={t('findings.actionDescription')}
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <Field label={t('findings.dueDate')} hint={t('admin.review.dueDateHint')}>
          <View className="flex-row flex-wrap gap-2">
            {[3, 7, 14].map((days) => {
              const value = addDays(today, days);
              return (
                <Chip
                  key={days}
                  label={t('admin.review.inDays', { count: days })}
                  selected={dueDate === value}
                  onPress={() => setDueDate(value)}
                />
              );
            })}
          </View>
          <TextField
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            accessibilityLabel={t('findings.dueDate')}
          />
        </Field>
        {error ? <InlineError message={error} /> : null}
        <Button label={t('findings.assignAction')} loading={assign.isPending} onPress={submit} />
      </Card>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */

function TransitionPanel({
  finding,
  action,
  moves,
}: {
  finding: Finding;
  action: CorrectiveAction;
  moves: FindingStatus[];
}): React.JSX.Element {
  const { t } = useTranslation();
  const transition = useTransitionFindingAction();
  const camera = usePhotoCapture();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<RemotePhoto[]>([]);
  const [uploading, setUploading] = useState(false);

  const canClose = moves.includes('CLOSED');
  const existingClosure = action.evidence.filter(
    (photo) => photo.context === 'CORRECTIVE_ACTION_CLOSURE',
  );
  const closureCount = existingClosure.length + photos.length;

  async function addPhoto(source: 'camera' | 'library'): Promise<void> {
    setError(null);
    const uri = source === 'camera' ? await camera.capture() : await camera.pickFromLibrary();
    if (!uri) {
      if (camera.permissionDenied) setError(t('admin.review.errors.photoPermission'));
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadClosurePhoto({
        sourceUri: uri,
        actionId: action.id,
        stadiumId: finding.stadiumId,
      });
      setPhotos((current) => [...current, { id: uploaded.id, uri: uploaded.previewUri }]);
    } catch (uploadError) {
      setError(errorText(uploadError, t));
    } finally {
      setUploading(false);
    }
  }

  function run(to: FindingStatus): void {
    setError(null);
    const needsNote =
      to === 'OPEN' || (to === 'IN_PROGRESS' && action.status === 'PENDING_VERIFICATION');
    if (needsNote && note.trim().length === 0) {
      setError(to === 'OPEN' ? t('admin.review.reopenReason') : t('findings.sendBackReason'));
      return;
    }
    if (to === 'CLOSED' && closureCount === 0) {
      setError(t('findings.closureEvidenceRequired'));
      return;
    }
    confirmDialog({
      title: labelFor(to, action.status, t),
      message: finding.title,
      confirmLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
      destructive: to === 'OPEN',
      onConfirm: () =>
        transition.mutate(
          {
            actionId: action.id,
            to,
            note: note.trim() || undefined,
            evidenceIds: to === 'CLOSED' ? photos.map((photo) => photo.id) : [],
          },
          {
            onSuccess: () => {
              setNote('');
              setPhotos([]);
            },
            onError: (mutationError) => setError(errorText(mutationError, t)),
          },
        ),
    });
  }

  return (
    <Section title={t('admin.review.review')}>
      <Card className="gap-4">
        {canClose ? (
          <Field label={t('findings.closureEvidence')} hint={t('admin.review.closureEvidenceHint')}>
            <RemotePhotoGrid
              photos={[
                ...existingClosure.map((photo) => ({ id: photo.id, uri: photo.url })),
                ...photos,
              ]}
              onAdd={() => void addPhoto('camera')}
              addLabel={t('admin.review.takePhoto')}
              adding={uploading}
            />
            <Button
              label={t('admin.review.chooseFromLibrary')}
              variant="ghost"
              size="sm"
              disabled={uploading}
              onPress={() => void addPhoto('library')}
            />
          </Field>
        ) : null}

        <TextField
          label={
            moves.includes('OPEN')
              ? t('admin.review.reopenReason')
              : canClose
                ? t('findings.closureNote')
                : t('admin.review.reviewNote')
          }
          value={note}
          onChangeText={setNote}
          optional={
            !moves.includes('OPEN') &&
            !(moves.includes('IN_PROGRESS') && action.status === 'PENDING_VERIFICATION')
          }
          multiline
        />

        {error ? <InlineError message={error} /> : null}

        {moves.map((to) => (
          <Button
            key={to}
            label={labelFor(to, action.status, t)}
            variant={
              to === 'CLOSED'
                ? 'success'
                : to === 'OPEN' ||
                    (to === 'IN_PROGRESS' && action.status === 'PENDING_VERIFICATION')
                  ? 'secondary'
                  : 'primary'
            }
            loading={transition.isPending}
            disabled={uploading}
            onPress={() => run(to)}
          />
        ))}
      </Card>
    </Section>
  );
}

function labelFor(to: FindingStatus, from: FindingStatus, t: (key: string) => string): string {
  if (to === 'IN_PROGRESS' && from === 'PENDING_VERIFICATION') return t('findings.sendBack');
  if (to === 'IN_PROGRESS') return t('findings.startWork');
  if (to === 'PENDING_VERIFICATION') return t('findings.markComplete');
  if (to === 'CLOSED') return t('findings.verifyAndClose');
  if (to === 'OPEN') return t('admin.review.reopen');
  return t(`findings.statuses.${to}`);
}

/* -------------------------------------------------------------------------- */

/**
 * Administrator correction of a finding: title, description, severity and
 * discipline. Saved through `PATCH /findings/:id` with an audited reason.
 */
function FindingEditCard({
  finding,
  onDone,
  openReason,
}: {
  finding: Finding;
  onDone: () => void;
  openReason: ReturnType<typeof useReasonDialog>['open'];
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const arabic = i18n.language.startsWith('ar');
  const correct = useCorrectFinding();
  const disciplines = useDisciplines();
  const [title, setTitle] = useState(finding.title);
  const [description, setDescription] = useState(finding.description);
  const [severity, setSeverity] = useState<Severity>(finding.severity);
  const [disciplineId, setDisciplineId] = useState<string | null>(finding.disciplineId ?? null);
  const [error, setError] = useState<string | null>(null);

  function save(): void {
    setError(null);
    if (title.trim().length < 3) return setError(t('admin.records.errors.title'));
    if (description.trim().length < 10) return setError(t('admin.records.errors.description'));
    const changes = {
      ...(title.trim() !== finding.title ? { title: title.trim() } : {}),
      ...(description.trim() !== finding.description ? { description: description.trim() } : {}),
      ...(severity !== finding.severity ? { severity } : {}),
      ...(disciplineId !== (finding.disciplineId ?? null) ? { disciplineId } : {}),
    };
    if (Object.keys(changes).length === 0) return onDone();
    openReason({
      title: t('admin.records.saveCorrection'),
      message: t('admin.records.correctionBody'),
      confirmLabel: t('common.save'),
      onConfirm: async (reason) => {
        await correct.mutateAsync({ id: finding.id, reason, ...changes });
        onDone();
      },
    });
  }

  return (
    <Section title={t('admin.records.editFinding')}>
      <Card className="gap-4">
        <TextField label={t('admin.records.fields.title')} value={title} onChangeText={setTitle} />
        <TextField
          label={t('admin.records.fields.description')}
          value={description}
          onChangeText={setDescription}
          multiline
        />
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
        <Field label={t('admin.records.fields.discipline')} optional>
          <View className="flex-row flex-wrap gap-2">
            {(disciplines.data ?? []).map((discipline) => (
              <Chip
                key={discipline.id}
                label={arabic && discipline.nameAr ? discipline.nameAr : discipline.name}
                selected={disciplineId === discipline.id}
                onPress={() =>
                  setDisciplineId(disciplineId === discipline.id ? null : discipline.id)
                }
              />
            ))}
          </View>
        </Field>
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
