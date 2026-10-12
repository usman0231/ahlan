import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import type { FindingStatus } from '@ahlan/shared';

import {
  Badge,
  Button,
  Card,
  DetailRow,
  Divider,
  InlineError,
  PhotoStrip,
  EmptyState,
  Screen,
  Section,
  SeverityBadge,
  SkeletonText,
  StatusBadge,
  Text,
  TextField,
} from '../../../src/components';
import {
  useAvailableTransitions,
  useFinding,
  useTransitionAction,
} from '../../../src/features/findings/hooks';
import { useDisciplines, useStadium } from '../../../src/features/catalog/hooks';
import { useSettingsStore } from '../../../src/store/settings';
import { usePhotoCapture } from '../../../src/features/evidence/use-photo-capture';
import { capturePhotoEvidence } from '../../../src/features/evidence/capture';
import {
  uploadEvidenceNow,
  uploadErrorCode,
} from '../../../src/features/evidence/upload-queue';
import { useHaptics } from '../../../src/hooks/use-haptics';
import { collections } from '../../../src/db';
import type { EvidenceModel } from '../../../src/db/models/evidence';
import { useRecords } from '../../../src/hooks/use-watermelon';
import { useSyncStore } from '../../../src/store/sync';
import { confirmDialog } from '../../../src/utils/dialogs';
import { ApiError } from '../../../src/api/client';
import { useAuthStore } from '../../../src/store/auth';

/**
 * A finding and its corrective action.
 *
 * Which buttons appear comes from `allowedTransitionsForRole` in
 * `@ahlan/shared` - the same function the API authorises with - so the UI can
 * never offer a move the server will refuse. Closing is admin-only and needs
 * closure evidence, which is why the photo strip appears for that step.
 */
export default function FindingDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const online = useSyncStore((state) => state.online);
  const camera = usePhotoCapture();

  const { finding, actions, loading } = useFinding(id);
  const { stadium } = useStadium(finding?.stadiumId);
  const { disciplines } = useDisciplines();
  const locale = useSettingsStore((state) => state.locale);
  const action = actions[0] ?? null;

  const transitions = useAvailableTransitions(
    (finding?.status as FindingStatus | undefined) ?? 'OPEN',
    action?.assigneeId ?? null,
  );
  const transition = useTransitionAction(id);

  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Closure photos still being sent before a CLOSED transition. */
  const [closureUpload, setClosureUpload] = useState<{ done: number; total: number } | null>(
    null,
  );
  const haptics = useHaptics();

  const { records: evidence } = useRecords<EvidenceModel>(
    () =>
      collections
        .evidence()
        // Evidence can hang off the finding itself, off the observation that
        // raised it, or off the corrective action's closure.
        .query(Q.where('context_id', Q.oneOf([id, action?.id ?? '', finding?.observationId ?? '']))),
    [id, action?.id, finding?.observationId],
  );

  const closureEvidence = evidence.filter(
    (photo) => photo.context === 'CORRECTIVE_ACTION_CLOSURE',
  );
  const sourceEvidence = evidence.filter(
    (photo) => photo.context !== 'CORRECTIVE_ACTION_CLOSURE',
  );

  async function addClosurePhoto(): Promise<void> {
    if (!action || !finding) return;
    try {
      const uri = await camera.capture();
      if (!uri) return;
      await capturePhotoEvidence({
        sourceUri: uri,
        context: 'CORRECTIVE_ACTION_CLOSURE',
        contextId: action.id,
        stadiumId: finding.stadiumId,
      });
      setError(null);
      haptics.answer();
    } catch (captureError) {
      console.warn('[photo] capture failed', captureError);
      haptics.error();
      setError(t('evidence.captureFailed'));
    }
  }

  /**
   * The API only closes with closure photos that have landed in storage, so
   * any still on this device are sent now - one by one, with progress - rather
   * than letting the close fail with "still uploading".
   */
  async function uploadClosurePhotos(): Promise<boolean> {
    const pending = closureEvidence.filter((photo) => photo.uploadStatus !== 'UPLOADED');
    if (pending.length === 0) return true;

    setClosureUpload({ done: 0, total: pending.length });
    try {
      const stuck: string[] = [];
      for (const [index, photo] of pending.entries()) {
        const { notUploaded } = await uploadEvidenceNow([photo.id]);
        stuck.push(...notUploaded);
        setClosureUpload({ done: index + 1, total: pending.length });
      }
      if (stuck.length === 0) return true;

      const reason = pending.find((photo) => stuck.includes(photo.id))?.uploadError ?? null;
      const code = uploadErrorCode(reason) ?? 'UNKNOWN';
      setError(
        `${t('evidence.closureUploadFailed')} ${t(`evidence.errors.${code}`, {
          defaultValue: t('evidence.errors.UNKNOWN'),
        })}`,
      );
      haptics.error();
      return false;
    } finally {
      setClosureUpload(null);
    }
  }

  function runTransition(to: FindingStatus): void {
    if (!action) return;
    setError(null);

    // A status change has to be authorised by the server, so it is not queued
    // for later like a field record is.
    if (!online) {
      setError(t('errors.NETWORK'));
      return;
    }

    const needsNote = to === 'IN_PROGRESS' && finding?.status === 'PENDING_VERIFICATION';
    if (needsNote && note.trim().length === 0) {
      setError(t('findings.sendBackReason'));
      return;
    }
    if (to === 'CLOSED' && closureEvidence.length === 0) {
      setError(t('findings.closureEvidenceRequired'));
      return;
    }

    confirmDialog({
      title: t(`findings.statuses.${to}`),
      message: finding?.title ?? '',
      confirmLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
      onConfirm: () => {
        void (async () => {
          if (to === 'CLOSED' && !(await uploadClosurePhotos())) return;
          transition.mutate(
            {
              actionId: action.id,
              to,
              note: note.trim() || undefined,
              evidenceIds: to === 'CLOSED' ? closureEvidence.map((photo) => photo.id) : [],
            },
            {
              onError: (mutationError) =>
                setError(
                  mutationError instanceof ApiError
                    ? t(mutationError.translationKey, { defaultValue: t('errors.UNKNOWN') })
                    : t('errors.UNKNOWN'),
                ),
              onSuccess: () => setNote(''),
            },
          );
        })();
      },
    });
  }

  if (loading) {
    return (
      <Screen title={t('findings.title')}>
        <SkeletonText lines={8} />
      </Screen>
    );
  }

  if (!finding) {
    return (
      <Screen title={t('findings.title')}>
        <InlineError message={t('errors.NOT_FOUND')} />
      </Screen>
    );
  }

  const isOverdue = action?.isOverdue ?? false;

  return (
    <Screen
      title={finding.reference}
      subtitle={stadium?.name}
      contentClassName="gap-5"
      footer={
        transitions.length > 0 ? (
          <View className="gap-2">
            {closureUpload ? (
              <Text variant="caption" tone="muted" accessibilityLiveRegion="polite">
                {t('evidence.uploadingForClose', closureUpload)}
              </Text>
            ) : null}
            {error ? <InlineError message={error} /> : null}
            {transitions.map((to) => (
              <Button
                key={to}
                label={labelFor(to, finding.status as FindingStatus, t)}
                variant={to === 'CLOSED' ? 'success' : to === 'OPEN' ? 'secondary' : 'primary'}
                loading={transition.isPending || closureUpload !== null}
                onPress={() => runTransition(to)}
              />
            ))}
          </View>
        ) : finding.status === 'CLOSED' ? (
          <Badge label={t('findings.statuses.CLOSED')} tone="success" />
        ) : user?.role === 'INSPECTOR' ? (
          <Text variant="caption" tone="muted">
            {t('findings.onlyAdminCanClose')}
          </Text>
        ) : null
      }
    >
      <Card className="gap-3">
        <View className="flex-row items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <StatusBadge status={finding.status as FindingStatus} isOverdue={isOverdue} />
        </View>
        <Text variant="heading">{finding.title}</Text>
        <Text variant="body" tone="muted">
          {finding.description}
        </Text>
      </Card>

      <Card padded={false} className="px-4 py-2">
        <DetailRow label={t('findings.raisedOn')} value={finding.localDate} />
        <Divider />
        <DetailRow label={t('findings.severity')}>
          <SeverityBadge severity={finding.severity} />
        </DetailRow>
        <Divider />
        <DetailRow
          label={t('observations.discipline')}
          value={
            disciplines.find((row) => row.id === finding.disciplineId)?.displayName(locale) ?? '—'
          }
        />
        <Divider />
        {/* Where the finding came from. Separate from the discipline above:
            one says what kind of hazard it is, the other says which piece of
            work raised it. */}
        <DetailRow
          label={t('findings.source')}
          value={finding.source === 'INSPECTION' ? t('inspections.title') : t('observations.title')}
        />
      </Card>

      {sourceEvidence.length > 0 ? (
        <Section title={t('findings.evidence')}>
          <PhotoStrip photos={sourceEvidence} disabled />
        </Section>
      ) : null}

      {action ? (
        <Section title={t('findings.correctiveAction')}>
          <Card className="gap-3">
            <Text variant="body">{action.action}</Text>
            <Divider />
            <DetailRow
              label={t('findings.dueDate')}
              value={action.dueDate ?? undefined}
            />
            {isOverdue ? (
              <Text variant="caption" tone="danger">
                {t('findings.statuses.OVERDUE')}
              </Text>
            ) : null}
            <DetailRow
              label={t('findings.assignee')}
              value={action.responsibleParty ?? undefined}
            />
            {action.closureNote ? (
              <>
                <Divider />
                <DetailRow label={t('findings.closureNote')} value={action.closureNote} />
              </>
            ) : null}
          </Card>

          {/* Closure evidence, only where it is actually needed. */}
          {action.status === 'PENDING_VERIFICATION' && user?.role === 'ADMIN' ? (
            <Card className="gap-3">
              <Text variant="callout">{t('findings.closureEvidence')}</Text>
              <PhotoStrip
                photos={closureEvidence}
                required
                onAdd={() => void addClosurePhoto()}
              />
              <TextField
                label={t('findings.closureNote')}
                value={note}
                onChangeText={setNote}
                optional
                multiline
              />
            </Card>
          ) : null}

          {action.status === 'PENDING_VERIFICATION' && user?.role === 'ADMIN' ? null : action.status !==
            'CLOSED' ? (
            <TextField
              label={t('findings.sendBackReason')}
              value={note}
              onChangeText={setNote}
              optional
              multiline
            />
          ) : null}
        </Section>
      ) : (
        /* Not a button: assigning the action is an administrator's job, so an
           inspector gets an explanation rather than a control that would fail. */
        <EmptyState
          title={t('findings.noActionTitle')}
          body={t('findings.noActionBody')}
        />
      )}
    </Screen>
  );
}

function labelFor(
  to: FindingStatus,
  from: FindingStatus,
  t: (key: string) => string,
): string {
  if (to === 'IN_PROGRESS' && from === 'PENDING_VERIFICATION') return t('findings.sendBack');
  if (to === 'IN_PROGRESS') return t('findings.startWork');
  if (to === 'PENDING_VERIFICATION') return t('findings.markComplete');
  if (to === 'CLOSED') return t('findings.verifyAndClose');
  return t(`findings.statuses.${to}`);
}
