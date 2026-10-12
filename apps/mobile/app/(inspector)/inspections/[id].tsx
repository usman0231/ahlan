import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ResponseValue, Severity } from '@ahlan/shared';

import {
  AnswerToggle,
  Badge,
  Button,
  Card,
  InlineError,
  PhotoStrip,
  Screen,
  SegmentedControl,
  SkeletonList,
  Text,
  TextField,
} from '../../../src/components';
import { ProgressBar } from '../../../src/components/progress-bar';
import { useInspectionDraft } from '../../../src/features/inspections/use-inspection-draft';
import { AutosaveField } from '../../../src/features/inspections/autosave-field';
import { ResponseNotes } from '../../../src/features/inspections/response-notes';
import { usePhotoCapture } from '../../../src/features/evidence/use-photo-capture';
import { Q } from '@nozbe/watermelondb';
import { collections } from '../../../src/db';
import type { ChecklistModel } from '../../../src/db/models/catalog';
import { useRecords } from '../../../src/hooks/use-watermelon';
import { useChecklistVersionContent, useStadium } from '../../../src/features/catalog/hooks';
import { useSettingsStore } from '../../../src/store/settings';
import { useHaptics } from '../../../src/hooks/use-haptics';
import { formatPercent } from '../../../src/utils/format';
import { confirmDialog, infoDialog } from '../../../src/utils/dialogs';
import type { ChecklistItemModel } from '../../../src/db/models/catalog';

/**
 * The checklist runner, and the screen that matters most.
 *
 * Everything is written to the local database as it is answered, so an
 * inspection survives the app being killed, the phone dying, or four hours with
 * no signal. Submit is blocked only by the two rules that genuinely cannot be
 * relaxed: every item answered, and every NO carrying a photo.
 */
export default function InspectionRunnerScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);
  const haptics = useHaptics();

  const draft = useInspectionDraft(id);
  const camera = usePhotoCapture();
  const { sections, itemsBySection, loading: loadingContent } = useChecklistVersionContent(
    draft.inspection?.checklistVersionId ?? null,
  );

  // The header names the work, not the module: "Housekeeping Inspection ·
  // Al Bayt Stadium" tells an inspector where they are at a glance.
  const { records: checklistRows } = useRecords<ChecklistModel>(
    () =>
      collections
        .checklists()
        .query(Q.where('id', draft.inspection?.checklistId ?? '')),
    [draft.inspection?.checklistId],
  );
  const { stadium } = useStadium(draft.inspection?.stadiumId);
  const headerTitle = checklistRows[0]?.displayTitle(locale) ?? t('inspections.title');

  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sectionIndex, setSectionIndex] = useState(0);

  const currentSection = sections[sectionIndex] ?? null;
  const currentItems = currentSection ? (itemsBySection.get(currentSection.id) ?? []) : [];

  const addPhoto = useCallback(
    async (item: ChecklistItemModel) => {
      try {
        const uri = await camera.capture();
        if (!uri) {
          if (camera.permissionDenied) {
            infoDialog(t('inspections.addPhoto'), t('errors.FORBIDDEN'));
          }
          return;
        }
        await draft.addPhoto(item, uri);
        haptics.answer();
      } catch (error) {
        // Never let a photo silently fail to appear: say so.
        console.warn('[photo] capture failed', error);
        haptics.error();
        infoDialog(t('inspections.addPhoto'), t('evidence.captureFailed'));
      }
    },
    [camera, draft, haptics, t],
  );

  const handleAnswer = useCallback(
    async (item: ChecklistItemModel, value: ResponseValue) => {
      await draft.answer(item, value);
      setSubmitError(null);
    },
    [draft],
  );

  async function handleSubmit(): Promise<void> {
    setSubmitError(null);

    if (!draft.validation.complete) {
      haptics.warning();
      setSubmitError(t('inspections.incomplete'));
      return;
    }
    if (draft.validation.missingPhotoItemCodes.length > 0) {
      haptics.warning();
      setSubmitError(
        `${t('inspections.photoRequired')}: ${draft.validation.missingPhotoItemCodes.join(', ')}`,
      );
      return;
    }

    const findingCount = draft.validation.noCount;
    confirmDialog({
      title: t('inspections.submitTitle'),
      message:
        findingCount === 0
          ? t('inspections.submitBodyNone')
          : t('inspections.submitBody', { count: findingCount }),
      confirmLabel: t('common.submit'),
      cancelLabel: t('common.cancel'),
      onConfirm: () => {
        void (async () => {
          try {
            await draft.submit(notes);
            haptics.success();
            router.replace('/(inspector)/inspections');
          } catch (error) {
            haptics.error();
            setSubmitError(t(`errors.${(error as Error).message}`, { defaultValue: t('errors.UNKNOWN') }));
          }
        })();
      },
    });
  }

  const progressLabel = useMemo(
    () =>
      t('inspections.progress', {
        answered: draft.validation.answered,
        total: draft.validation.total,
      }),
    [draft.validation.answered, draft.validation.total, t],
  );

  if (draft.loading || loadingContent) {
    return (
      <Screen title={t('inspections.title')}>
        <SkeletonList count={5} />
      </Screen>
    );
  }

  if (!draft.inspection) {
    return (
      <Screen title={t('inspections.title')}>
        <InlineError message={t('errors.NOT_FOUND')} />
      </Screen>
    );
  }

  const locked = draft.inspection.status === 'SUBMITTED';

  return (
    <Screen
      title={headerTitle}
      subtitle={stadium ? `${stadium.displayName(locale)} · ${progressLabel}` : progressLabel}
      headerAction={
        <View className="items-end gap-1">
          <Text variant="heading" tabular>
            {formatPercent(draft.validation.compliancePercent, t('common.noScore'))}
          </Text>
          <Text variant="caption" tone="subtle">
            {t('inspections.compliance')}
          </Text>
        </View>
      }
      footer={
        locked ? (
          <Badge label={t('inspections.locked')} tone="success" />
        ) : (
          <View className="gap-2">
            {submitError ? <InlineError message={submitError} /> : null}
            <Button
              label={t('common.submit')}
              size="lg"
              loading={draft.submitting}
              onPress={() => void handleSubmit()}
            />
          </View>
        )
      }
      contentClassName="gap-5"
    >
      {/* Sheet header: where on site this checklist was walked. */}
      <AutosaveField
        label={t('inspections.location')}
        placeholder={t('inspections.locationPlaceholder')}
        initialValue={draft.inspection.locationLabel}
        onSave={(value) => draft.setInspectionText('locationLabel', value)}
        editable={!locked}
        optional
        maxLength={200}
      />

      {/* Progress bar: how much of the checklist is done. */}
      <ProgressBar
        value={
          draft.validation.total === 0 ? 0 : draft.validation.answered / draft.validation.total
        }
      />

      {sections.length > 1 ? (
        <SegmentedControl
          options={sections.map((section, index) => ({
            value: String(index),
            label: section.displayTitle(locale),
          }))}
          value={String(sectionIndex)}
          onChange={(value) => setSectionIndex(Number(value))}
        />
      ) : null}

      <View className="gap-4">
        {currentItems.map((item) => {
          const response = draft.responseByItem.get(item.id);
          const photos = response ? (draft.photosByResponse.get(response.id) ?? []) : [];
          const needsPhoto = response?.value === 'NO' && photos.length === 0;

          return (
            <Card key={item.id} className="gap-3">
              <View className="flex-row items-start gap-3">
                <Badge label={item.code} tone="neutral" />
                <Text variant="body" className="flex-1">
                  {item.displayQuestion(locale)}
                </Text>
              </View>

              {item.guidance ? (
                <Text variant="caption" tone="muted">
                  {item.guidance}
                </Text>
              ) : null}

              <AnswerToggle
                value={(response?.value as ResponseValue | undefined) ?? null}
                allowNa={item.allowNa}
                disabled={locked}
                onChange={(value) => void handleAnswer(item, value)}
              />

              {/* A NO needs a concern, a severity and at least one photo. */}
              {response?.value === 'NO' ? (
                <View className="gap-3 rounded-sm border-s-[3px] border-danger bg-surface-sunken p-3">
                  <ResponseNotes
                    key={response.id}
                    concern={response.concern ?? response.comment}
                    recommendation={response.recommendation}
                    locked={locked}
                    onSave={(field, value) => draft.setResponseText(item, field, value)}
                  />

                  <View className="gap-2">
                    <Text variant="callout">{t('inspections.severity')}</Text>
                    <SegmentedControl
                      options={(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as Severity[]).map(
                        (severity) => ({
                          value: severity,
                          label: t(`findings.severities.${severity}`),
                        }),
                      )}
                      value={(response.severity as Severity | null) ?? item.defaultSeverity as Severity}
                      onChange={(value) => void draft.setSeverity(item, value as Severity)}
                    />
                  </View>

                  <View className="gap-2">
                    <Text variant="callout">{t('findings.evidence')}</Text>
                    <PhotoStrip
                      photos={photos}
                      required
                      disabled={locked}
                      onAdd={() => void addPhoto(item)}
                      onRemove={(photo) => void draft.removePhoto(photo)}
                    />
                    {needsPhoto ? (
                      <Text variant="caption" tone="danger">
                        {t('inspections.photoRequired')}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {/* YES / N/A: the same notes, folded away until wanted. */}
              {response && response.value !== 'NO' ? (
                <ResponseNotes
                  key={response.id}
                  collapsible
                  concern={response.concern ?? response.comment}
                  recommendation={response.recommendation}
                  locked={locked}
                  onSave={(field, value) => draft.setResponseText(item, field, value)}
                />
              ) : null}

              {/* A YES may carry a photo too (good practice worth recording),
                  but it is never required. */}
              {response?.value === 'YES' && (!locked || photos.length > 0) ? (
                <View className="gap-2">
                  <Text variant="callout" tone="muted">
                    {t('evidence.optionalPhoto')}
                  </Text>
                  <PhotoStrip
                    photos={photos}
                    disabled={locked}
                    onAdd={() => void addPhoto(item)}
                    onRemove={(photo) => void draft.removePhoto(photo)}
                  />
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>

      {/* Section navigation at the foot of the list, for one-thumb use. */}
      {sections.length > 1 ? (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              label={t('common.back')}
              variant="secondary"
              disabled={sectionIndex === 0}
              onPress={() => setSectionIndex((index) => Math.max(0, index - 1))}
            />
          </View>
          <View className="flex-1">
            <Button
              label={t('common.next')}
              variant="secondary"
              disabled={sectionIndex >= sections.length - 1}
              onPress={() =>
                setSectionIndex((index) => Math.min(sections.length - 1, index + 1))
              }
            />
          </View>
        </View>
      ) : null}

      {/* Not scored: anything seen on the walk that no item covers. */}
      <AutosaveField
        label={t('inspections.otherObservations')}
        hint={t('inspections.otherObservationsHint')}
        placeholder={t('inspections.otherObservationsPlaceholder')}
        initialValue={draft.inspection.otherObservations}
        onSave={(value) => draft.setInspectionText('otherObservations', value)}
        editable={!locked}
        optional
        multiline
        maxLength={2000}
      />

      {!locked ? (
        <TextField
          label={t('inspections.notes')}
          value={notes}
          onChangeText={setNotes}
          optional
          multiline
        />
      ) : null}
    </Screen>
  );
}
