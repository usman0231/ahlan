import { useCallback, useMemo, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import {
  compliancePercent,
  isChecklistComplete,
  tallyResponses,
  uuidv7,
  zonedDateString,
  type ResponseTally,
  type ResponseValue,
  type Severity,
} from '@ahlan/shared';

import { collections, database } from '../../db';
import type { InspectionModel, InspectionResponseModel } from '../../db/models/field-records';
import type { ChecklistItemModel } from '../../db/models/catalog';
import { useRecords } from '../../hooks/use-watermelon';
import { useAuthStore } from '../../store/auth';
import { capturePhotoEvidence, discardEvidence } from '../evidence/capture';
import type { EvidenceModel } from '../../db/models/evidence';
import { getCurrentPosition } from '../../hooks/use-location';
import { forceRepush, runSync } from '../../db/sync';

export interface DraftValidation {
  complete: boolean;
  answered: number;
  total: number;
  /** Items answered NO that still have no photo. These block submission. */
  missingPhotoItemCodes: string[];
  tally: ResponseTally;
  compliancePercent: number | null;
  noCount: number;
}

/**
 * The inspection draft.
 *
 * Everything here writes to the local database first and syncs afterwards, so
 * the whole inspection can be completed with no connection at all. The figures
 * come from the same `@ahlan/shared` formulas the API uses, which is why the
 * compliance shown on the device matches what comes back after syncing.
 */
export function useInspectionDraft(inspectionId: string) {
  const [submitting, setSubmitting] = useState(false);

  const { records: inspections, loading: loadingInspection } = useRecords<InspectionModel>(
    () => collections.inspections().query(Q.where('id', inspectionId)),
    [inspectionId],
  );
  const inspection = inspections[0] ?? null;

  const { records: responses } = useRecords<InspectionResponseModel>(
    () => collections.inspectionResponses().query(Q.where('inspection_id', inspectionId)),
    [inspectionId],
  );

  const { records: items, loading: loadingItems } = useRecords<ChecklistItemModel>(
    () =>
      collections
        .checklistItems()
        .query(
          Q.on('checklist_sections', 'version_id', inspection?.checklistVersionId ?? ''),
          Q.sortBy('sort_order', Q.asc),
        ),
    [inspection?.checklistVersionId],
  );

  const { records: photos } = useRecords<EvidenceModel>(
    () =>
      collections
        .evidence()
        .query(
          Q.where('context', 'INSPECTION_RESPONSE'),
          Q.where('context_id', Q.oneOf(responses.map((response) => response.id))),
        ),
    [responses.map((response) => response.id).join(',')],
  );

  const responseByItem = useMemo(() => {
    const map = new Map<string, InspectionResponseModel>();
    for (const response of responses) map.set(response.itemId, response);
    return map;
  }, [responses]);

  const photosByResponse = useMemo(() => {
    const map = new Map<string, EvidenceModel[]>();
    for (const photo of photos) {
      if (!photo.contextId) continue;
      const bucket = map.get(photo.contextId) ?? [];
      bucket.push(photo);
      map.set(photo.contextId, bucket);
    }
    return map;
  }, [photos]);

  /** Answers an item, creating the response row the first time. */
  const answer = useCallback(
    async (item: ChecklistItemModel, value: ResponseValue): Promise<void> => {
      if (!inspection || inspection.status === 'SUBMITTED') return;

      const existing = responseByItem.get(item.id);

      await database.write(async () => {
        if (existing) {
          await existing.update((record) => {
            record.value = value;
            record.answeredAt = Date.now();
          });
        } else {
          await collections.inspectionResponses().create((record) => {
            // Device-minted id: the photos attach to it before it ever syncs.
            record._raw.id = uuidv7();
            record.inspectionId = inspection.id;
            record.itemId = item.id;
            record.itemCode = item.code;
            record.value = value;
            record.answeredAt = Date.now();
          });
        }
      });

      await inspection.recomputeTotals();
    },
    [inspection, responseByItem],
  );

  const setComment = useCallback(
    async (item: ChecklistItemModel, comment: string): Promise<void> => {
      const existing = responseByItem.get(item.id);
      if (!existing) return;
      await database.write(async () => {
        await existing.update((record) => {
          record.comment = comment.trim() || null;
        });
      });
    },
    [responseByItem],
  );

  /**
   * Concern / observation and recommendation / action required, per answer.
   * The concern is mirrored into the legacy `comment` column: the API builds
   * a NO answer's finding description from it, and older builds read it.
   */
  const setResponseText = useCallback(
    async (
      item: ChecklistItemModel,
      field: 'concern' | 'recommendation',
      value: string,
    ): Promise<void> => {
      const existing = responseByItem.get(item.id);
      if (!existing || inspection?.status === 'SUBMITTED') return;
      const text = value.trim().slice(0, 1000) || null;
      if (existing[field] === text) return;
      await database.write(async () => {
        await existing.update((record) => {
          record[field] = text;
          if (field === 'concern') record.comment = text;
        });
      });
    },
    [responseByItem, inspection?.status],
  );

  /** Header "Location" and the unscored "Other observations" at the end. */
  const setInspectionText = useCallback(
    async (field: 'locationLabel' | 'otherObservations', value: string): Promise<void> => {
      if (!inspection || inspection.status === 'SUBMITTED') return;
      const max = field === 'locationLabel' ? 200 : 2000;
      const text = value.trim().slice(0, max) || null;
      if (inspection[field] === text) return;
      await database.write(async () => {
        await inspection.update((record) => {
          record[field] = text;
        });
      });
    },
    [inspection],
  );

  const setSeverity = useCallback(
    async (item: ChecklistItemModel, severity: Severity): Promise<void> => {
      const existing = responseByItem.get(item.id);
      if (!existing) return;
      await database.write(async () => {
        await existing.update((record) => {
          record.severity = severity;
        });
      });
    },
    [responseByItem],
  );

  /** Compresses and stores a photo against an answer. */
  const addPhoto = useCallback(
    async (item: ChecklistItemModel, sourceUri: string): Promise<void> => {
      if (!inspection) return;
      const existing = responseByItem.get(item.id);
      if (!existing) return;

      await capturePhotoEvidence({
        sourceUri,
        context: 'INSPECTION_RESPONSE',
        contextId: existing.id,
        stadiumId: inspection.stadiumId,
      });
    },
    [inspection, responseByItem],
  );

  const removePhoto = useCallback(async (photo: EvidenceModel): Promise<void> => {
    await discardEvidence(photo);
  }, []);

  /** Everything the submit button needs to decide whether it can be pressed. */
  const validation = useMemo<DraftValidation>(() => {
    const tally = tallyResponses(responses.map((response) => response.value));
    const missingPhotoItemCodes: string[] = [];

    for (const response of responses) {
      if (response.value !== 'NO') continue;
      const attached = photosByResponse.get(response.id) ?? [];
      if (attached.length === 0) missingPhotoItemCodes.push(response.itemCode);
    }

    return {
      answered: responses.length,
      total: items.length,
      complete: isChecklistComplete(responses.length, items.length),
      missingPhotoItemCodes,
      tally,
      compliancePercent: compliancePercent(tally),
      noCount: tally.no,
    };
  }, [responses, items.length, photosByResponse]);

  /**
   * Marks the draft submitted locally, then tries to sync.
   *
   * The local write happens first and unconditionally: the inspector is done,
   * and whether the network is available is not their problem. The record shows
   * "saved on device" until a sync pass gets it through.
   */
  const submit = useCallback(
    async (notes: string | null): Promise<{ synced: boolean }> => {
      if (!inspection) return { synced: false };
      if (!validation.complete) throw new Error('INCOMPLETE_CHECKLIST');
      if (validation.missingPhotoItemCodes.length > 0) throw new Error('EVIDENCE_REQUIRED');

      setSubmitting(true);
      try {
        const gps = await getCurrentPosition().catch(() => null);
        const stadium = await collections.stadiums().find(inspection.stadiumId);
        const now = Date.now();

        await database.write(async () => {
          await inspection.update((record) => {
            record.status = 'SUBMITTED';
            record.submittedAt = now;
            record.localDate = zonedDateString(new Date(now), stadium.timezone);
            record.notes = notes?.trim() || null;
            record.latitude = gps?.latitude ?? record.latitude;
            record.longitude = gps?.longitude ?? record.longitude;
            record.gpsAccuracyM = gps?.accuracyM ?? record.gpsAccuracyM;
            record.isLocked = true;
            record.syncState = 'LOCAL';
          });

          // Answers sync ahead of a draft, so by submit time they are marked
          // synced and would not ride along - and the server can only rebuild
          // an inspection from the responses in the same push. Force the lot
          // back into the next one.
          await forceRepush(responses);
        });

        const outcome = await runSync();
        return { synced: !outcome.error && outcome.rejected.length === 0 };
      } finally {
        setSubmitting(false);
      }
    },
    [inspection, validation, responses],
  );

  return {
    inspection,
    items,
    responses,
    responseByItem,
    photosByResponse,
    validation,
    loading: loadingInspection || loadingItems,
    submitting,
    answer,
    setComment,
    setResponseText,
    setInspectionText,
    setSeverity,
    addPhoto,
    removePhoto,
    submit,
  };
}

/**
 * Starts a new inspection locally and returns its id.
 *
 * The id is a UUID v7 minted on the device, which is what makes a retried sync
 * idempotent rather than creating a second inspection.
 */
export async function startInspection(input: {
  stadiumId: string;
  checklistId: string;
  checklistVersionId: string;
}): Promise<string> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('UNAUTHENTICATED');

  const stadium = await collections.stadiums().find(input.stadiumId);
  const gps = await getCurrentPosition().catch(() => null);
  const now = Date.now();
  const id = uuidv7();

  await database.write(async () => {
    await collections.inspections().create((record) => {
      record._raw.id = id;
      record.stadiumId = input.stadiumId;
      record.checklistId = input.checklistId;
      record.checklistVersionId = input.checklistVersionId;
      record.inspectorId = user.id;
      record.status = 'DRAFT';
      record.localDate = zonedDateString(new Date(now), stadium.timezone);
      record.startedAt = now;
      record.clientCreatedAt = now;
      record.latitude = gps?.latitude ?? null;
      record.longitude = gps?.longitude ?? null;
      record.gpsAccuracyM = gps?.accuracyM ?? null;
      record.yesCount = 0;
      record.noCount = 0;
      record.naCount = 0;
      record.isLocked = false;
      record.syncState = 'LOCAL';
    });
  });

  return id;
}

/** Discards a draft the inspector abandoned, and its photos with it. */
export async function discardInspection(inspection: InspectionModel): Promise<void> {
  if (inspection.status === 'SUBMITTED') return;

  const responses = await inspection.responses.fetch();
  const photos = await collections
    .evidence()
    .query(
      Q.where('context', 'INSPECTION_RESPONSE'),
      Q.where('context_id', Q.oneOf(responses.map((response) => response.id))),
    )
    .fetch();

  for (const photo of photos) await discardEvidence(photo);

  await database.write(async () => {
    await database.batch(
      ...responses.map((response) => response.prepareDestroyPermanently()),
      inspection.prepareDestroyPermanently(),
    );
  });
}
