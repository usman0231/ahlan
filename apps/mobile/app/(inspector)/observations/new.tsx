import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  OBSERVATION_TYPES,
  RISK_RATINGS,
  SEVERITIES,
  observationRaisesFinding,
  type ObservationType,
  type RiskRating,
  type Severity,
} from '@ahlan/shared';

import {
  Button,
  Card,
  Field,
  InlineError,
  OptionList,
  PhotoStrip,
  Screen,
  SegmentedControl,
  Text,
  TextField,
} from '../../../src/components';
import { useDisciplines, useStadiums } from '../../../src/features/catalog/hooks';
import {
  emptyObservationForm,
  useObservationDraft,
  type ObservationFormValues,
} from '../../../src/features/observations/use-observation-draft';
import { usePhotoCapture } from '../../../src/features/evidence/use-photo-capture';
import { useSettingsStore } from '../../../src/store/settings';
import { useHaptics } from '../../../src/hooks/use-haptics';
import { confirmDialog } from '../../../src/utils/dialogs';

/**
 * Recording an observation.
 *
 * The form reacts to the type: choosing an unsafe act, unsafe condition or near
 * miss makes a photo mandatory and warns that a finding will be raised, while a
 * positive observation needs neither. That is the same rule the shared schema
 * and the API enforce.
 */
export default function NewObservationScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);
  const haptics = useHaptics();
  const params = useLocalSearchParams<{ stadiumId?: string; disciplineId?: string }>();

  const { stadiums } = useStadiums();
  const { disciplines } = useDisciplines();
  const camera = usePhotoCapture();

  const [stadiumId, setStadiumId] = useState<string>(
    params.stadiumId ?? stadiums[0]?.id ?? '',
  );
  const [values, setValues] = useState<ObservationFormValues>({
    ...emptyObservationForm,
    // Opened from a discipline dashboard: start on that discipline.
    disciplineId: params.disciplineId ?? disciplines[0]?.id ?? '',
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const draft = useObservationDraft(null, stadiumId);
  const validation = draft.validate(values);
  const raisesFinding = observationRaisesFinding(values.type);

  function set<K extends keyof ObservationFormValues>(
    key: K,
    value: ObservationFormValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    setSubmitError(null);
  }

  async function addPhoto(): Promise<void> {
    try {
      const uri = await camera.capture();
      if (!uri) return;
      await draft.addPhoto(uri);
      setSubmitError(null);
      haptics.answer();
    } catch (error) {
      // Never let a photo silently fail to appear: say so where the
      // inspector is already looking.
      console.warn('[photo] capture failed', error);
      haptics.error();
      setSubmitError(t('evidence.captureFailed'));
    }
  }

  async function handleSubmit(): Promise<void> {
    setSubmitError(null);

    if (!validation.canSubmit) {
      haptics.warning();
      setSubmitError(
        validation.errors.photos
          ? t('observations.photoRequired')
          : t('errors.VALIDATION_FAILED'),
      );
      return;
    }

    confirmDialog({
      title: t('observations.newTitle'),
      message: raisesFinding ? t('observations.willRaiseFinding') : t('observations.positiveNoPhoto'),
      confirmLabel: t('common.submit'),
      cancelLabel: t('common.cancel'),
      onConfirm: () => {
        void (async () => {
          try {
            await draft.submit(values);
            haptics.success();
            router.replace('/(inspector)/observations');
          } catch (error) {
            haptics.error();
            setSubmitError(
              t(`errors.${(error as Error).message}`, { defaultValue: t('errors.UNKNOWN') }),
            );
          }
        })();
      },
    });
  }

  return (
    <Screen
      title={t('observations.newTitle')}
      headerAction={
        <Button
          label={t('common.cancel')}
          variant="ghost"
          fullWidth={false}
          onPress={() => router.back()}
        />
      }
      footer={
        <View className="gap-2">
          {submitError ? <InlineError message={submitError} /> : null}
          <Button
            label={t('common.submit')}
            size="lg"
            loading={draft.submitting}
            onPress={() => void handleSubmit()}
          />
        </View>
      }
      contentClassName="gap-5"
    >
      {stadiums.length > 1 ? (
        <Field label={t('inspections.chooseStadium')}>
          <OptionList
            options={stadiums.map((stadium) => ({
              value: stadium.id,
              label: stadium.displayName(locale),
            }))}
            value={stadiumId}
            onChange={setStadiumId}
          />
        </Field>
      ) : null}

      <Field label={t('observations.type')}>
        <OptionList
          options={OBSERVATION_TYPES.map((type) => ({
            value: type,
            label: t(`observations.types.${type}`),
            description:
              type === 'POSITIVE'
                ? t('observations.positiveNoPhoto')
                : t('observations.willRaiseFinding'),
          }))}
          value={values.type}
          onChange={(type) => set('type', type as ObservationType)}
        />
      </Field>

      <Field label={t('observations.discipline')} error={validation.errors.disciplineId ? t('common.required') : null}>
        <OptionList
          options={disciplines.map((discipline) => ({
            value: discipline.id,
            label: discipline.displayName(locale),
          }))}
          value={values.disciplineId}
          onChange={(id) => set('disciplineId', id)}
        />
      </Field>

      <TextField
        label={t('observations.observationTitle')}
        placeholder={t('observations.titlePlaceholder')}
        value={values.title}
        onChangeText={(value) => set('title', value)}
        error={validation.errors.title ? t('common.required') : null}
      />

      <TextField
        label={t('observations.description')}
        placeholder={t('observations.descriptionPlaceholder')}
        value={values.description}
        onChangeText={(value) => set('description', value)}
        error={validation.errors.description ? t('common.required') : null}
        multiline
      />

      <Field label={t('observations.riskRating')}>
        <SegmentedControl
          options={RISK_RATINGS.map((rating) => ({
            value: rating,
            label: t(`observations.riskRatings.${rating}`),
          }))}
          value={values.riskRating}
          onChange={(rating) => set('riskRating', rating as RiskRating)}
        />
      </Field>

      <Field label={t('inspections.severity')}>
        <SegmentedControl
          options={SEVERITIES.map((severity) => ({
            value: severity,
            label: t(`findings.severities.${severity}`),
          }))}
          value={values.severity}
          onChange={(severity) => set('severity', severity as Severity)}
        />
      </Field>

      <Card className="gap-3">
        <Text variant="callout">{t('findings.evidence')}</Text>
        <PhotoStrip
          photos={draft.photos}
          required={raisesFinding}
          onAdd={() => void addPhoto()}
          onRemove={(photo) => void draft.removePhoto(photo)}
        />
        <Text variant="caption" tone={raisesFinding ? 'warning' : 'muted'}>
          {raisesFinding ? t('observations.photoRequired') : t('observations.positiveNoPhoto')}
        </Text>
      </Card>

      <TextField
        label={t('observations.location')}
        placeholder={t('observations.locationPlaceholder')}
        value={values.locationLabel}
        onChangeText={(value) => set('locationLabel', value)}
        optional
      />

      <TextField
        label={t('observations.responsibleParty')}
        placeholder={t('observations.responsiblePlaceholder')}
        value={values.responsibleParty}
        onChangeText={(value) => set('responsibleParty', value)}
        optional
      />

      <TextField
        label={t('observations.immediateAction')}
        value={values.immediateAction}
        onChangeText={(value) => set('immediateAction', value)}
        optional
        multiline
      />
    </Screen>
  );
}
