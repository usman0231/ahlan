import { useCallback, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import {
  observationRaisesFinding,
  uuidv7,
  zonedDateString,
  type ObservationType,
  type RiskRating,
  type Severity,
} from '@ahlan/shared';

import { collections, database } from '../../db';
import type { ObservationModel } from '../../db/models/field-records';
import type { EvidenceModel } from '../../db/models/evidence';
import { useRecords } from '../../hooks/use-watermelon';
import { useAuthStore } from '../../store/auth';
import { capturePhotoEvidence, discardEvidence } from '../evidence/capture';
import { getCurrentPosition } from '../../hooks/use-location';
import { runSync } from '../../db/sync';

export interface ObservationFormValues {
  disciplineId: string;
  type: ObservationType;
  severity: Severity;
  riskRating: RiskRating;
  title: string;
  description: string;
  locationLabel: string;
  responsibleParty: string;
  immediateAction: string;
}

export const emptyObservationForm: ObservationFormValues = {
  disciplineId: '',
  type: 'UNSAFE_CONDITION',
  severity: 'MEDIUM',
  riskRating: 'MODERATE',
  title: '',
  description: '',
  locationLabel: '',
  responsibleParty: '',
  immediateAction: '',
};

export interface ObservationValidation {
  canSubmit: boolean;
  requiresPhoto: boolean;
  errors: Partial<Record<keyof ObservationFormValues | 'photos', string>>;
}

/**
 * The observation form, saved locally and synced afterwards.
 *
 * The draft row exists from the first keystroke, so an inspector who is called
 * away mid-observation finds it waiting rather than losing it.
 */
export function useObservationDraft(observationId: string | null, stadiumId: string) {
  const [submitting, setSubmitting] = useState(false);
  const [draftId] = useState(() => observationId ?? uuidv7());

  const { records: observations, loading } = useRecords<ObservationModel>(
    () => collections.observations().query(Q.where('id', draftId)),
    [draftId],
  );
  const observation = observations[0] ?? null;

  const { records: photos } = useRecords<EvidenceModel>(
    () =>
      collections
        .evidence()
        .query(Q.where('context', 'OBSERVATION'), Q.where('context_id', draftId)),
    [draftId],
  );

  const addPhoto = useCallback(
    async (sourceUri: string) => {
      await capturePhotoEvidence({
        sourceUri,
        context: 'OBSERVATION',
        contextId: draftId,
        stadiumId,
      });
    },
    [draftId, stadiumId],
  );

  const removePhoto = useCallback(async (photo: EvidenceModel) => {
    await discardEvidence(photo);
  }, []);

  /**
   * Validates the form. The photo rule is the important one: an unsafe act,
   * unsafe condition or near miss raises a finding and must carry evidence,
   * while a positive observation is praise and needs neither.
   */
  const validate = useCallback(
    (values: ObservationFormValues): ObservationValidation => {
      const errors: ObservationValidation['errors'] = {};
      const requiresPhoto = observationRaisesFinding(values.type);

      if (!values.disciplineId) errors.disciplineId = 'required';
      if (values.title.trim().length < 3) errors.title = 'required';
      if (values.description.trim().length < 10) errors.description = 'required';
      if (requiresPhoto && photos.length === 0) errors.photos = 'photoRequired';

      return {
        requiresPhoto,
        errors,
        canSubmit: Object.keys(errors).length === 0,
      };
    },
    [photos.length],
  );

  const submit = useCallback(
    async (values: ObservationFormValues): Promise<{ synced: boolean }> => {
      const user = useAuthStore.getState().user;
      if (!user) throw new Error('UNAUTHENTICATED');

      const validation = validate(values);
      if (!validation.canSubmit) throw new Error('VALIDATION_FAILED');

      setSubmitting(true);
      try {
        const stadium = await collections.stadiums().find(stadiumId);
        const gps = await getCurrentPosition().catch(() => null);
        const now = Date.now();
        const localDate = zonedDateString(new Date(now), stadium.timezone);

        await database.write(async () => {
          if (observation) {
            await observation.update((record) => {
              applyValues(record, values);
              record.status = 'SUBMITTED';
              record.submittedAt = now;
              record.localDate = localDate;
              record.latitude = gps?.latitude ?? null;
              record.longitude = gps?.longitude ?? null;
              record.gpsAccuracyM = gps?.accuracyM ?? null;
              record.isLocked = true;
              record.syncState = 'LOCAL';
            });
          } else {
            await collections.observations().create((record) => {
              record._raw.id = draftId;
              record.stadiumId = stadiumId;
              record.inspectorId = user.id;
              applyValues(record, values);
              record.status = 'SUBMITTED';
              record.localDate = localDate;
              record.observedAt = now;
              record.clientCreatedAt = now;
              record.submittedAt = now;
              record.latitude = gps?.latitude ?? null;
              record.longitude = gps?.longitude ?? null;
              record.gpsAccuracyM = gps?.accuracyM ?? null;
              record.isLocked = true;
              record.syncState = 'LOCAL';
            });
          }
        });

        const outcome = await runSync();
        return { synced: !outcome.error && outcome.rejected.length === 0 };
      } finally {
        setSubmitting(false);
      }
    },
    [draftId, observation, stadiumId, validate],
  );

  return {
    draftId,
    observation,
    photos,
    loading,
    submitting,
    addPhoto,
    removePhoto,
    validate,
    submit,
  };
}

function applyValues(record: ObservationModel, values: ObservationFormValues): void {
  record.disciplineId = values.disciplineId;
  record.type = values.type;
  record.severity = values.severity;
  record.riskRating = values.riskRating;
  record.title = values.title.trim();
  record.description = values.description.trim();
  record.locationLabel = values.locationLabel.trim() || null;
  record.responsibleParty = values.responsibleParty.trim() || null;
  record.immediateAction = values.immediateAction.trim() || null;
}

/** The inspector's own observations, newest first. */
export function useMyObservations(stadiumId: string | null) {
  const userId = useAuthStore((state) => state.user?.id ?? '');

  const { records, loading } = useRecords<ObservationModel>(
    () =>
      collections
        .observations()
        .query(
          Q.where('inspector_id', userId),
          ...(stadiumId ? [Q.where('stadium_id', stadiumId)] : []),
          Q.sortBy('observed_at', Q.desc),
          Q.take(100),
        ),
    [userId, stadiumId],
  );

  return { observations: records, loading };
}
