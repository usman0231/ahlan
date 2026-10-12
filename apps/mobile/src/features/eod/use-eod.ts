import { useCallback, useMemo, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import {
  addDays,
  allowedEodReportDates,
  uuidv7,
  zonedDateString,
  type IsoDate,
} from '@ahlan/shared';

import { collections, database } from '../../db';
import type {
  EodReportModel,
  EodWindowDefaultModel,
  EodWindowModel,
} from '../../db/models/field-records';
import { useRecords } from '../../hooks/use-watermelon';
import { useNow } from '../../hooks/use-now';
import { useAuthStore } from '../../store/auth';
import { useStadium } from '../catalog/hooks';
import { getCurrentPosition } from '../../hooks/use-location';
import { runSync } from '../../db/sync';
import {
  formFromStored,
  resolveEodWindowState,
  toCount,
  validateEodForm,
  type EodFormValues,
} from './eod-form';
import { rowTotals, rowsToEntries } from './workforce';

export { emptyEodForm, type EodFormValues } from './eod-form';

/**
 * The End-of-Day report, offline first.
 *
 * Drafts and submissions are written to the local database and synced after.
 * The window check runs on the device against synced `eod_windows` and
 * `eod_window_defaults` rows with the same shared functions the API uses, so
 * the submit button is right with no connection - and the API re-checks on
 * arrival, so a device with a wrong clock cannot slip a late report through.
 */
export function useEod(stadiumId: string | null, reportDate: IsoDate | null) {
  const userId = useAuthStore((state) => state.user?.id ?? '');
  const { stadium } = useStadium(stadiumId);
  const [submitting, setSubmitting] = useState(false);
  // Re-evaluates the window (and "today") every 30 seconds.
  const now = useNow(30_000);

  const today = useMemo(
    () => (stadium ? zonedDateString(new Date(now), stadium.timezone) : null),
    [stadium, now],
  );
  const allowedDates = useMemo<IsoDate[]>(
    () => (stadium ? allowedEodReportDates(stadium.timezone, new Date(now)) : []),
    [stadium, now],
  );
  const date = reportDate && allowedDates.includes(reportDate) ? reportDate : today;

  const { records: reports, loading: loadingReport } = useRecords<EodReportModel>(
    () =>
      collections
        .eodReports()
        .query(
          Q.where('stadium_id', stadiumId ?? ''),
          Q.where('inspector_id', userId),
          Q.where('date', date ?? ''),
        ),
    [stadiumId, userId, date],
  );
  const report = reports[0] ?? null;

  const { records: perDate, loading: loadingWindows } = useRecords<EodWindowModel>(
    () =>
      collections
        .eodWindows()
        .query(
          Q.where('date', Q.oneOf(today ? [today, addDays(today, -1)] : [])),
          Q.or(Q.where('stadium_id', stadiumId ?? ''), Q.where('stadium_id', null)),
        ),
    [stadiumId, today],
  );

  const { records: defaults, loading: loadingDefaults } = useRecords<EodWindowDefaultModel>(
    () =>
      collections
        .eodWindowDefaults()
        .query(Q.or(Q.where('stadium_id', stadiumId ?? ''), Q.where('stadium_id', null))),
    [stadiumId],
  );

  const window = useMemo(() => {
    if (!stadium || !stadiumId) return null;
    return resolveEodWindowState({
      stadiumId,
      timeZone: stadium.timezone,
      perDate: perDate.map((row) => ({
        stadiumId: row.stadiumId,
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
        enabled: row.enabled,
      })),
      defaults: defaults.map((row) => ({
        stadiumId: row.stadiumId,
        startTime: row.startTime,
        endTime: row.endTime,
        enabled: row.enabled,
      })),
      now: new Date(now),
    });
  }, [stadium, stadiumId, perDate, defaults, now]);

  const alreadySubmitted = report?.status === 'SUBMITTED';
  const canSubmit = Boolean(window?.check.open) && !alreadySubmitted;

  const write = useCallback(
    async (
      values: EodFormValues,
      submit: { at: number; gps: Awaited<ReturnType<typeof getCurrentPosition>> | null } | null,
    ): Promise<void> => {
      if (!stadiumId || !date) return;
      const now = Date.now();
      const apply = (record: EodReportModel): void => {
        applyValues(record, values);
        if (submit) {
          record.status = 'SUBMITTED';
          record.submittedAt = submit.at;
          record.latitude = submit.gps?.latitude ?? null;
          record.longitude = submit.gps?.longitude ?? null;
          record.gpsAccuracyM = submit.gps?.accuracyM ?? null;
          record.isLocked = true;
          record.syncState = 'LOCAL';
        }
      };

      await database.write(async () => {
        if (report) {
          await report.update(apply);
        } else {
          await collections.eodReports().create((record) => {
            // Device-minted id: a retried sync is idempotent.
            record._raw.id = uuidv7();
            record.stadiumId = stadiumId;
            record.inspectorId = userId;
            record.date = date;
            record.status = 'DRAFT';
            record.clientCreatedAt = now;
            record.nearMisses = 0;
            record.isLocked = false;
            record.syncState = 'LOCAL';
            apply(record);
          });
        }
      });
    },
    [report, stadiumId, date, userId],
  );

  /** Saves progress on the device. Never gated by the window; only submit is. */
  const saveDraft = useCallback(
    async (values: EodFormValues): Promise<void> => {
      if (alreadySubmitted) return;
      await write(values, null);
    },
    [write, alreadySubmitted],
  );

  const submit = useCallback(
    async (values: EodFormValues): Promise<{ synced: boolean }> => {
      if (!stadiumId || !date) throw new Error('VALIDATION_FAILED');
      if (alreadySubmitted) throw new Error('EOD_ALREADY_SUBMITTED');
      if (!window?.check.open) throw new Error('EOD_WINDOW_CLOSED');
      if (Object.keys(validateEodForm(values)).length > 0) throw new Error('VALIDATION_FAILED');

      setSubmitting(true);
      try {
        const gps = await getCurrentPosition().catch(() => null);
        await write(values, { at: Date.now(), gps });
        const outcome = await runSync();
        return { synced: !outcome.error && outcome.rejected.length === 0 };
      } finally {
        setSubmitting(false);
      }
    },
    [stadiumId, date, alreadySubmitted, window, write],
  );

  const initialValues = useMemo<EodFormValues | null>(
    () =>
      report
        ? formFromStored({
            workforce: report.workforce,
            totalSpectators: report.totalSpectators,
            workRelatedMedical: report.workRelatedMedical,
            nonWorkRelatedMedical: report.nonWorkRelatedMedical,
            firstAidCases: report.firstAidCases,
            fireIncidents: report.fireIncidents,
            otherIncidents: report.otherIncidents,
            hseObservationsReported: report.hseObservationsReported,
            recordableIncidents: report.recordableIncidents,
            summary: report.summary,
            concerns: report.concerns,
            actionsMitigation: report.actionsMitigation,
            plannedTomorrow: report.plannedTomorrow,
            additionalRemarks: report.additionalRemarks,
          })
        : null,
    [report],
  );

  return {
    stadium,
    today,
    date,
    allowedDates,
    report,
    window,
    alreadySubmitted,
    canSubmit,
    submitting,
    loading: loadingReport || loadingWindows || loadingDefaults,
    saveDraft,
    submit,
    /** Values from the stored draft, or null when there is none for this date. */
    initialValues,
  };
}

function applyValues(record: EodReportModel, values: EodFormValues): void {
  const entries = rowsToEntries(values.workforce);
  const totals = rowTotals(values.workforce);
  const workRelated = toCount(values.stats.workRelatedMedical);

  record.workforceJson = JSON.stringify(entries);
  record.totalHeadcount = totals.totalHeadcount;
  record.totalManHours = totals.totalManHours;
  record.totalSpectators = values.totalSpectators.trim() === '' ? null : toCount(values.totalSpectators);
  record.workRelatedMedical = workRelated;
  record.nonWorkRelatedMedical = toCount(values.stats.nonWorkRelatedMedical);
  record.firstAidCases = toCount(values.stats.firstAidCases);
  record.fireIncidents = toCount(values.stats.fireIncidents);
  record.otherIncidents = toCount(values.stats.otherIncidents);
  record.hseObservationsReported = toCount(values.stats.hseObservationsReported);
  // Kept for KPIs, reports and AI; the server sets the same on arrival.
  record.recordableIncidents = workRelated;
  record.summary = values.summary.trim() || null;
  record.concerns = values.concerns.trim() || null;
  record.actionsMitigation = values.actionsMitigation.trim() || null;
  record.plannedTomorrow = values.plannedTomorrow.trim() || null;
  record.additionalRemarks = values.additionalRemarks.trim() || null;
}
