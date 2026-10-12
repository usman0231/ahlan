import { z } from 'zod';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ERROR_CODES,
  isClientWritable,
  submitEodSchema,
  submitInspectionSchema,
  submitObservationSchema,
  type PullQuery,
  type PullResponse,
  type PushBody,
  type PushRejection,
  type PushResponse,
  type RawRecord,
  type SyncChanges,
  type SyncTable,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { INCLUDING_DELETED, ONLY_DELETED } from '../../prisma/soft-delete';
import { deletedEvidenceContextIds } from '../../prisma/soft-delete-queries';
import type { RequestUser } from '../../common/types/request-user';
import { AppException } from '../../common/errors/app.exception';
import { EodService } from '../eod/eod.service';
import { InspectionsService } from '../inspections/inspections.service';
import { ObservationsService } from '../observations/observations.service';
import * as map from './sync.mappers';

const EMPTY = { created: [], updated: [], deleted: [] };

/**
 * WatermelonDB sync.
 *
 * Pull is scoped exactly like every other read: an inspector gets their own
 * stadiums and nothing else.
 *
 * Push deliberately does **not** write rows directly. Each pushed record is
 * turned back into the normal submit payload and handed to the service that
 * owns it, so a record that arrives through sync goes through identically the
 * same rules as one submitted online - the photo requirement on a NO, the EOD
 * window, server-side compliance, automatic findings. Anything that fails comes
 * back in `rejected`, keyed by id, and the device marks that row as failed
 * rather than silently losing it.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inspections: InspectionsService,
    private readonly observations: ObservationsService,
    private readonly eod: EodService,
  ) {}

  /* --------------------------------- pull -------------------------------- */

  async pull(query: PullQuery, actor: RequestUser): Promise<PullResponse> {
    // Taken before the queries run: anything committed during the pull will be
    // picked up next time rather than being skipped.
    const timestamp = Date.now();
    const since = new Date(query.lastPulledAt);

    const stadiumIds =
      actor.role === 'ADMIN'
        ? (
            await this.prisma.stadium.findMany({
              where: { deletedAt: null },
              select: { id: true },
            })
          ).map((row) => row.id)
        : actor.stadiumIds;

    if (stadiumIds.length === 0) {
      return { changes: {}, timestamp };
    }

    const changed = { gt: since };

    const [
      stadiums,
      disciplines,
      tournaments,
      checklists,
      inspections,
      observations,
      findings,
      actions,
      eodWindows,
      eodWindowDefaults,
      eodReports,
      evidence,
      users,
    ] = await Promise.all([
      this.prisma.stadium.findMany({
        where: { id: { in: stadiumIds }, updatedAt: changed },
      }),
      this.prisma.discipline.findMany({ where: { updatedAt: changed } }),
      this.prisma.tournament.findMany({ where: { updatedAt: changed } }),
      this.prisma.checklist.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          currentVersionId: { not: null },
          updatedAt: changed,
          OR: [{ stadiums: { some: { stadiumId: { in: stadiumIds } } } }, { stadiums: { none: {} } }],
        },
        include: {
          currentVersion: {
            include: {
              sections: { include: { items: true }, orderBy: { sortOrder: 'asc' } },
            },
          },
        },
      }),
      this.prisma.inspection.findMany({
        where: { stadiumId: { in: stadiumIds }, updatedAt: changed },
        include: { responses: true },
      }),
      this.prisma.observation.findMany({
        where: { stadiumId: { in: stadiumIds }, updatedAt: changed },
      }),
      this.prisma.finding.findMany({
        where: { stadiumId: { in: stadiumIds }, updatedAt: changed },
      }),
      this.prisma.correctiveAction.findMany({
        where: { finding: { stadiumId: { in: stadiumIds } }, updatedAt: changed },
      }),
      this.prisma.eodWindow.findMany({
        where: {
          updatedAt: changed,
          OR: [{ stadiumId: { in: stadiumIds } }, { stadiumId: null }],
        },
      }),
      this.prisma.eodWindowDefault.findMany({
        where: {
          updatedAt: changed,
          OR: [{ stadiumId: { in: stadiumIds } }, { stadiumId: null }],
        },
      }),
      this.prisma.eodReport.findMany({
        where: { stadiumId: { in: stadiumIds }, updatedAt: changed },
        include: { workforce: true },
      }),
      this.prisma.evidence.findMany({
        where: {
          stadiumId: { in: stadiumIds },
          uploadStatus: 'UPLOADED',
          updatedAt: changed,
        },
      }),
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          updatedAt: changed,
          OR: [{ role: 'ADMIN' }, { stadiums: { some: { stadiumId: { in: stadiumIds } } } }],
        },
        select: { id: true, fullName: true, role: true, updatedAt: true },
      }),
    ]);

    // Everything goes in `updated`, including rows the device has never seen.
    //
    // That is not a shortcut: the client syncs with `sendCreatedAsUpdated`,
    // because our tables track `server_updated_at` instead of WatermelonDB's
    // own `_changed` bookkeeping and so cannot tell a create from an update.
    // That option is a two-way contract - it also forbids the server from
    // using the `created` bucket at all, and WatermelonDB logs a diagnostic
    // error on every pull that breaks it. A record in `updated` that is not in
    // the local database is simply created there, so a first pull still lands
    // in one pass.
    const bucket = (records: RawRecord[], deleted: string[] = []) => ({
      created: [],
      updated: records,
      deleted,
    });

    // Admin soft deletes reach devices as `deleted` ids so the rows disappear
    // locally. A first pull has nothing to remove, so it skips the feed.
    const gone =
      query.lastPulledAt > 0 ? await this.deletedSince(stadiumIds, changed) : null;
    // Evidence has no foreign key, so photos of a deleted record are filtered here.
    const deadContexts = await deletedEvidenceContextIds(this.prisma, evidence);
    const liveEvidence = evidence.filter(
      (row) => !row.contextId || !deadContexts.has(row.contextId),
    );

    const versions = checklists.flatMap((checklist) =>
      checklist.currentVersion ? [checklist.currentVersion] : [],
    );
    const sections = versions.flatMap((version) => version.sections);
    const items = sections.flatMap((section) => section.items);

    const changes: SyncChanges = {
      stadiums: bucket(stadiums.map(map.mapStadium)),
      disciplines: bucket(disciplines.map(map.mapDiscipline)),
      tournaments: bucket(
        tournaments.filter((row) => !row.deletedAt).map(map.mapTournament),
        gone ? tournaments.filter((row) => row.deletedAt).map((row) => row.id) : [],
      ),
      checklists: bucket(checklists.map(map.mapChecklist)),
      checklist_versions: bucket(versions.map(map.mapChecklistVersion)),
      checklist_sections: bucket(sections.map(map.mapChecklistSection)),
      checklist_items: bucket(items.map(map.mapChecklistItem)),
      inspections: bucket(inspections.map(map.mapInspection), gone?.inspections),
      inspection_responses: bucket(
        inspections.flatMap((inspection) =>
          inspection.responses.map(map.mapInspectionResponse),
        ),
        gone?.inspectionResponses,
      ),
      observations: bucket(observations.map(map.mapObservation), gone?.observations),
      findings: bucket(findings.map(map.mapFinding), gone?.findings),
      corrective_actions: bucket(actions.map(map.mapCorrectiveAction), gone?.correctiveActions),
      eod_windows: bucket(eodWindows.map(map.mapEodWindow)),
      eod_window_defaults: bucket(eodWindowDefaults.map(map.mapEodWindowDefault)),
      eod_reports: bucket(eodReports.map(map.mapEodReport), gone?.eodReports),
      evidence: bucket(liveEvidence.map(map.mapEvidence), gone?.evidence),
      users: bucket(users.map(map.mapUser)),
    };

    const total = Object.values(changes).reduce(
      (sum, set) =>
        sum + (set?.created.length ?? 0) + (set?.updated.length ?? 0) + (set?.deleted.length ?? 0),
      0,
    );
    this.logger.log(
      `Pull for ${actor.role}:${actor.id} since ${query.lastPulledAt} -> ${total} record(s)`,
    );

    return { changes, timestamp };
  }

  /**
   * Ids of HSE records soft-deleted (or re-deleted) since the watermark in the
   * caller's stadiums, plus the children that go with them: an inspection's
   * responses, a finding's corrective actions and every affected photo.
   */
  private async deletedSince(
    stadiumIds: string[],
    changed: { gt: Date },
  ): Promise<{
    inspections: string[];
    inspectionResponses: string[];
    observations: string[];
    findings: string[];
    correctiveActions: string[];
    eodReports: string[];
    evidence: string[];
  }> {
    const scope = { stadiumId: { in: stadiumIds }, updatedAt: changed, ...ONLY_DELETED };
    const [inspections, observations, findings, eodReports] = await Promise.all([
      this.prisma.inspection.findMany({
        where: scope,
        select: { id: true, responses: { select: { id: true } } },
      }),
      this.prisma.observation.findMany({ where: scope, select: { id: true } }),
      this.prisma.finding.findMany({
        where: scope,
        select: { id: true, actions: { select: { id: true } } },
      }),
      this.prisma.eodReport.findMany({ where: scope, select: { id: true } }),
    ]);

    const inspectionResponses = inspections.flatMap((row) => row.responses.map((r) => r.id));
    const correctiveActions = findings.flatMap((row) => row.actions.map((a) => a.id));
    const contextIds = [
      ...inspectionResponses,
      ...observations.map((row) => row.id),
      ...findings.map((row) => row.id),
      ...correctiveActions,
      ...eodReports.map((row) => row.id),
    ];
    const evidence = contextIds.length
      ? await this.prisma.evidence.findMany({
          where: { contextId: { in: contextIds } },
          select: { id: true },
        })
      : [];

    return {
      inspections: inspections.map((row) => row.id),
      inspectionResponses,
      observations: observations.map((row) => row.id),
      findings: findings.map((row) => row.id),
      correctiveActions,
      eodReports: eodReports.map((row) => row.id),
      evidence: evidence.map((row) => row.id),
    };
  }

  /* --------------------------------- push -------------------------------- */

  async push(body: PushBody, actor: RequestUser): Promise<PushResponse> {
    const rejected: PushRejection[] = [];
    let accepted = 0;

    for (const [table, set] of Object.entries(body.changes)) {
      if (!set) continue;
      if (!isClientWritable(table)) {
        // A read-only table arriving in a push means a device bug, not a user
        // error; reject the rows rather than silently ignoring them.
        for (const record of [...set.created, ...set.updated]) {
          rejected.push({
            table: table as SyncTable,
            id: record.id,
            code: ERROR_CODES.FORBIDDEN,
            message: `${table} is read-only on the device`,
          });
        }
        continue;
      }
      if (set.deleted.length > 0) {
        for (const id of set.deleted) {
          rejected.push({
            table: table as SyncTable,
            id,
            code: ERROR_CODES.FORBIDDEN,
            message: 'HSE records cannot be deleted',
          });
        }
      }
    }

    const responsesByInspection = groupBy(
      [
        ...(body.changes.inspection_responses?.created ?? []),
        ...(body.changes.inspection_responses?.updated ?? []),
      ],
      (record) => str(record.inspection_id) ?? '',
    );

    // Inspections: only submitted ones are pushed; drafts stay on the device.
    for (const record of inbound(body.changes, 'inspections')) {
      if (str(record.status) !== 'SUBMITTED') continue;
      const outcome = await this.pushInspection(
        record,
        responsesByInspection.get(record.id) ?? [],
        actor,
      );
      if (outcome) rejected.push({ table: 'inspections', ...outcome });
      else accepted += 1;
    }

    for (const record of inbound(body.changes, 'observations')) {
      if (str(record.status) !== 'SUBMITTED') continue;
      const outcome = await this.pushObservation(record, actor);
      if (outcome) rejected.push({ table: 'observations', ...outcome });
      else accepted += 1;
    }

    for (const record of inbound(body.changes, 'eod_reports')) {
      if (str(record.status) !== 'SUBMITTED') continue;
      const outcome = await this.pushEod(record, actor);
      if (outcome) rejected.push({ table: 'eod_reports', ...outcome });
      else accepted += 1;
    }

    if (rejected.length > 0) {
      this.logger.warn(
        `Push from ${actor.id}: ${accepted} accepted, ${rejected.length} rejected ` +
          `(${rejected.map((row) => row.code).join(', ')})`,
      );
    }

    return { accepted, rejected, timestamp: Date.now() };
  }

  /* ------------------------------ per record ----------------------------- */


  /**
   * True when the server already holds this record as submitted - or an admin
   * has soft-deleted it (only submitted records can be). Either way the push is
   * a no-op, and a deleted record is removed from the device by the next pull.
   */
  private async alreadySubmitted(
    model: 'inspection' | 'observation' | 'eodReport',
    id: string,
  ): Promise<boolean> {
    if (model === 'inspection') {
      const row = await this.prisma.inspection.findFirst({
        where: { id, ...INCLUDING_DELETED },
        select: { status: true, deletedAt: true },
      });
      return row?.status === 'SUBMITTED' || Boolean(row?.deletedAt);
    }
    if (model === 'observation') {
      const row = await this.prisma.observation.findFirst({
        where: { id, ...INCLUDING_DELETED },
        select: { id: true },
      });
      return row !== null;
    }
    const row = await this.prisma.eodReport.findFirst({
      where: { id, ...INCLUDING_DELETED },
      select: { id: true },
    });
    return row !== null;
  }

  private async pushInspection(
    record: RawRecord,
    responses: RawRecord[],
    actor: RequestUser,
  ): Promise<Omit<PushRejection, 'table'> | null> {
    // Idempotency before validation. A device re-sends a record whenever its
    // local sync bookkeeping is touched, and those re-sends often arrive
    // without the child rows the first push carried. If the server already
    // holds the submitted copy, the only correct answer is "fine", not a
    // validation error about the children it does not need.
    if (await this.alreadySubmitted('inspection', record.id)) return null;

    const evidenceByResponse = await this.evidenceIdsFor(responses.map((row) => row.id));

    const payload = {
      id: record.id,
      stadiumId: str(record.stadium_id),
      checklistId: str(record.checklist_id),
      checklistVersionId: str(record.checklist_version_id),
      startedAt: iso(record.started_at),
      submittedAt: iso(record.submitted_at) ?? new Date().toISOString(),
      clientCreatedAt: iso(record.client_created_at) ?? iso(record.started_at),
      notes: optStr(record.notes),
      locationLabel: optStr(record.location_label),
      otherObservations: optStr(record.other_observations),
      gps: gps(record),
      deviceId: optStr(record.device_id),
      appVersion: optStr(record.app_version),
      responses: responses.map((row) => ({
        id: row.id,
        itemId: str(row.item_id),
        value: str(row.value),
        comment: optStr(row.comment),
        concern: optStr(row.concern),
        recommendation: optStr(row.recommendation),
        severity: optStr(row.severity),
        answeredAt: iso(row.answered_at) ?? iso(record.submitted_at),
        evidenceIds: evidenceByResponse.get(row.id) ?? [],
      })),
    };

    const parsed = submitInspectionSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        id: record.id,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: zodRejectionMessage(parsed.error, 'Invalid inspection'),
      };
    }

    try {
      await this.inspections.submit(parsed.data, actor);
      return null;
    } catch (error) {
      return this.toRejection(record.id, error);
    }
  }

  private async pushObservation(
    record: RawRecord,
    actor: RequestUser,
  ): Promise<Omit<PushRejection, 'table'> | null> {
    if (await this.alreadySubmitted('observation', record.id)) return null;

    const evidenceIds = (await this.evidenceIdsFor([record.id])).get(record.id) ?? [];

    const payload = {
      id: record.id,
      stadiumId: str(record.stadium_id),
      disciplineId: str(record.discipline_id),
      type: str(record.type),
      severity: str(record.severity) ?? 'MEDIUM',
      riskRating: str(record.risk_rating) ?? 'MODERATE',
      title: str(record.title) ?? '',
      description: str(record.description) ?? '',
      locationLabel: optStr(record.location_label),
      responsibleParty: optStr(record.responsible_party),
      immediateAction: optStr(record.immediate_action),
      observedAt: iso(record.observed_at),
      clientCreatedAt: iso(record.client_created_at) ?? iso(record.observed_at),
      gps: gps(record),
      deviceId: optStr(record.device_id),
      appVersion: optStr(record.app_version),
      evidenceIds,
    };

    const parsed = submitObservationSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        id: record.id,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: zodRejectionMessage(parsed.error, 'Invalid observation'),
      };
    }

    try {
      await this.observations.submit(parsed.data, actor);
      return null;
    } catch (error) {
      return this.toRejection(record.id, error);
    }
  }

  private async pushEod(
    record: RawRecord,
    actor: RequestUser,
  ): Promise<Omit<PushRejection, 'table'> | null> {
    if (await this.alreadySubmitted('eodReport', record.id)) return null;

    // Workforce lines ride along as a JSON string: they are an editable list on
    // the device and not worth their own synced table.
    const workforce = parseJsonArray(record.workforce_json);

    const payload = {
      id: record.id,
      stadiumId: str(record.stadium_id),
      date: str(record.date),
      submittedAt: iso(record.submitted_at) ?? new Date().toISOString(),
      clientCreatedAt: iso(record.client_created_at) ?? iso(record.submitted_at),
      gps: gps(record),
      deviceId: optStr(record.device_id),
      appVersion: optStr(record.app_version),
      workforce,
      totalSpectators: num(record.total_spectators),
      // Absent on an older build's record: the service then uses recordable_incidents.
      workRelatedMedical: num(record.work_related_medical) ?? undefined,
      nonWorkRelatedMedical: num(record.non_work_related_medical) ?? 0,
      firstAidCases: num(record.first_aid_cases) ?? 0,
      fireIncidents: num(record.fire_incidents) ?? 0,
      otherIncidents: num(record.other_incidents) ?? 0,
      hseObservationsReported: num(record.hse_observations_reported) ?? 0,
      recordableIncidents: num(record.recordable_incidents) ?? 0,
      nearMisses: num(record.near_misses) ?? 0,
      summary: str(record.summary) ?? '',
      concerns: optStr(record.concerns),
      actionsMitigation: optStr(record.actions_mitigation),
      plannedTomorrow: optStr(record.planned_tomorrow),
      additionalRemarks: optStr(record.additional_remarks),
      weather: optStr(record.weather),
      evidenceIds: (await this.evidenceIdsFor([record.id])).get(record.id) ?? [],
    };

    const parsed = submitEodSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        id: record.id,
        code: ERROR_CODES.VALIDATION_FAILED,
        message: zodRejectionMessage(parsed.error, 'Invalid EOD report'),
      };
    }

    try {
      await this.eod.submit(parsed.data, actor);
      return null;
    } catch (error) {
      return this.toRejection(record.id, error);
    }
  }

  /**
   * Photos are uploaded straight to storage before the push, so the evidence
   * rows already exist; this collects the ones already pointing at each parent.
   */
  private async evidenceIdsFor(contextIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (contextIds.length === 0) return result;

    const rows = await this.prisma.evidence.findMany({
      where: { contextId: { in: contextIds }, uploadStatus: 'UPLOADED' },
      select: { id: true, contextId: true },
    });
    for (const row of rows) {
      if (!row.contextId) continue;
      const bucket = result.get(row.contextId) ?? [];
      bucket.push(row.id);
      result.set(row.contextId, bucket);
    }
    return result;
  }

  private toRejection(id: string, error: unknown): Omit<PushRejection, 'table'> {
    if (error instanceof AppException) {
      return { id, code: error.code, message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        id,
        code: error.code === 'P2002' ? ERROR_CODES.ALREADY_EXISTS : ERROR_CODES.CONFLICT,
        message: 'The server could not store this record',
      };
    }
    this.logger.error(`Unexpected push failure on ${id}: ${(error as Error).message}`);
    return { id, code: ERROR_CODES.INTERNAL_ERROR, message: 'Unexpected server error' };
  }
}

/* --------------------------------- helpers -------------------------------- */

function inbound(changes: SyncChanges, table: SyncTable): RawRecord[] {
  const set = changes[table] ?? EMPTY;
  return [...set.created, ...set.updated];
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const bucket = result.get(key(item)) ?? [];
    bucket.push(item);
    result.set(key(item), bucket);
  }
  return result;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * For optional fields. `str(x) ?? undefined` was a bug twice over: `str`
 * never returns null, so the `??` was dead, and a device null arrived at the
 * schema as `''` - which an enum like severity rejects, failing the whole
 * inspection. Absent means absent.
 */
function optStr(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Device timestamps are epoch milliseconds. */
function iso(value: unknown): string {
  const millis = num(value);
  return millis === null ? new Date().toISOString() : new Date(millis).toISOString();
}

function gps(record: RawRecord): { latitude: number; longitude: number; accuracyM: number | null } | undefined {
  const latitude = num(record.latitude);
  const longitude = num(record.longitude);
  if (latitude === null || longitude === null) return undefined;
  return { latitude, longitude, accuracyM: num(record.gps_accuracy_m) };
}

/**
 * Workforce lines are handed to the submit schema as-is: it accepts the current
 * `{category, personnel, hours}` shape and maps the legacy
 * `{contractor, headcount, manHours}` one, so a report queued by an older build
 * still lands.
 */
function parseJsonArray(value: unknown): Record<string, unknown>[] {
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' && entry !== null && !Array.isArray(entry),
    );
  } catch {
    // A malformed blob becomes "no workforce lines"; the submit schema then
    // rejects or accepts the report on its own terms.
    return [];
  }
}

/**
 * "responses.2.value: Invalid enum value" instead of a bare "Invalid enum
 * value": the path is the half of a Zod issue that tells a developer - or a
 * support engineer reading a device's sync log - what actually broke.
 */
function zodRejectionMessage(error: z.ZodError, fallback: string): string {
  const issue = error.issues[0];
  if (!issue) return fallback;
  return issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message;
}
