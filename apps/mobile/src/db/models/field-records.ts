import { Model, Q } from '@nozbe/watermelondb';
import type { Associations } from '@nozbe/watermelondb/Model';
import { children, field, lazy, text, writer } from '@nozbe/watermelondb/decorators';
import type { Query } from '@nozbe/watermelondb';
import {
  compliancePercent,
  isOverdue,
  tallyResponses,
  type ResponseTally,
  type ResponseValue,
  type SyncState,
  type EodWorkforceEntry,
} from '@ahlan/shared';

import type { EvidenceModel } from './evidence';
import { parseWorkforceJson } from '../../features/eod/workforce';

/**
 * The records an inspector creates, which is the part of the database that has
 * to work with no connection at all.
 *
 * `syncState` is device-only and never pushed: it is what the sync badge on
 * each row reads, so the inspector can always tell what is still on the phone.
 */

export class InspectionModel extends Model {
  static override table = 'inspections';
  static override associations: Associations = {
    inspection_responses: { type: 'has_many', foreignKey: 'inspection_id' },
  };

  @text('stadium_id') stadiumId: string;
  @text('checklist_id') checklistId: string;
  @text('checklist_version_id') checklistVersionId: string;
  @text('inspector_id') inspectorId: string;
  @text('status') status: 'DRAFT' | 'SUBMITTED';
  @text('local_date') localDate: string;
  @field('started_at') startedAt: number;
  @field('client_created_at') clientCreatedAt: number;
  @field('submitted_at') submittedAt: number | null;
  @field('server_received_at') serverReceivedAt: number | null;
  @field('latitude') latitude: number | null;
  @field('longitude') longitude: number | null;
  @field('gps_accuracy_m') gpsAccuracyM: number | null;
  @text('device_id') deviceId: string | null;
  @text('app_version') appVersion: string | null;
  @field('yes_count') yesCount: number;
  @field('no_count') noCount: number;
  @field('na_count') naCount: number;
  @text('compliance_percent') compliancePercentRaw: string | null;
  @text('notes') notes: string | null;
  @text('location_label') locationLabel: string | null;
  /** Free text at the end of the checklist; not scored. */
  @text('other_observations') otherObservations: string | null;
  @field('is_locked') isLocked: boolean;
  @text('sync_state') syncState: SyncState;
  @text('sync_error') syncError: string | null;

  @children('inspection_responses') responses: Query<InspectionResponseModel>;

  get compliance(): number | null {
    return this.compliancePercentRaw === null ? null : Number(this.compliancePercentRaw);
  }

  /**
   * Recomputes the tally and compliance from the answers on this device, using
   * the same shared formula the API uses. The draft therefore shows the exact
   * figure it will get once synced.
   */
  @writer
  async recomputeTotals(): Promise<ResponseTally> {
    const responses = await this.responses.fetch();
    const tally = tallyResponses(responses.map((response) => response.value));
    const percent = compliancePercent(tally);

    await this.update((record) => {
      record.yesCount = tally.yes;
      record.noCount = tally.no;
      record.naCount = tally.na;
      record.compliancePercentRaw = percent === null ? null : percent.toFixed(2);
    });

    return tally;
  }

  @writer
  async markSyncState(state: SyncState, error: string | null = null): Promise<void> {
    await this.update((record) => {
      record.syncState = state;
      record.syncError = error;
    });
  }
}

export class InspectionResponseModel extends Model {
  static override table = 'inspection_responses';
  static override associations: Associations = {
    inspections: { type: 'belongs_to', key: 'inspection_id' },
  };

  @text('inspection_id') inspectionId: string;
  @text('item_id') itemId: string;
  @text('item_code') itemCode: string;
  @text('value') value: ResponseValue;
  @text('comment') comment: string | null;
  /** "Concern / observation" on the readiness sheet. */
  @text('concern') concern: string | null;
  /** "Recommendation / action required". */
  @text('recommendation') recommendation: string | null;
  @text('severity') severity: string | null;
  @field('answered_at') answeredAt: number;

  /** Photos attached to this answer. A NO is not submittable without one. */
  @lazy
  evidence = this.collections
    .get<EvidenceModel>('evidence')
    .query(Q.where('context', 'INSPECTION_RESPONSE'), Q.where('context_id', this.id));
}

export class ObservationModel extends Model {
  static override table = 'observations';

  @text('stadium_id') stadiumId: string;
  @text('discipline_id') disciplineId: string;
  @text('inspector_id') inspectorId: string;
  @text('type') type: string;
  @text('severity') severity: string;
  @text('risk_rating') riskRating: string;
  @text('title') title: string;
  @text('description') description: string;
  @text('location_label') locationLabel: string | null;
  @text('responsible_party') responsibleParty: string | null;
  @text('immediate_action') immediateAction: string | null;
  @text('status') status: 'DRAFT' | 'SUBMITTED';
  @text('local_date') localDate: string;
  @field('observed_at') observedAt: number;
  @field('client_created_at') clientCreatedAt: number;
  @field('submitted_at') submittedAt: number | null;
  @field('latitude') latitude: number | null;
  @field('longitude') longitude: number | null;
  @field('gps_accuracy_m') gpsAccuracyM: number | null;
  @text('device_id') deviceId: string | null;
  @text('app_version') appVersion: string | null;
  @field('is_locked') isLocked: boolean;
  @text('sync_state') syncState: SyncState;
  @text('sync_error') syncError: string | null;

  @lazy
  evidence = this.collections
    .get<EvidenceModel>('evidence')
    .query(Q.where('context', 'OBSERVATION'), Q.where('context_id', this.id));

  @writer
  async markSyncState(state: SyncState, error: string | null = null): Promise<void> {
    await this.update((record) => {
      record.syncState = state;
      record.syncError = error;
    });
  }
}

/** A stored workforce row: { category, personnel, hours, manHours }. */
export type WorkforceLine = EodWorkforceEntry;

export class EodReportModel extends Model {
  static override table = 'eod_reports';

  @text('stadium_id') stadiumId: string;
  @text('inspector_id') inspectorId: string;
  @text('date') date: string;
  @text('status') status: 'DRAFT' | 'SUBMITTED';
  @field('total_headcount') totalHeadcount: number;
  @text('total_man_hours') totalManHours: string;
  @text('workforce_json') workforceJson: string | null;
  @field('recordable_incidents') recordableIncidents: number;
  @field('near_misses') nearMisses: number;
  @field('total_spectators') totalSpectators: number | null;
  @field('work_related_medical') workRelatedMedical: number | null;
  @field('non_work_related_medical') nonWorkRelatedMedical: number | null;
  @field('first_aid_cases') firstAidCases: number | null;
  @field('fire_incidents') fireIncidents: number | null;
  @field('other_incidents') otherIncidents: number | null;
  @field('hse_observations_reported') hseObservationsReported: number | null;
  /** Highlights & key activities. */
  @text('summary') summary: string | null;
  /** Issues / risks. */
  @text('concerns') concerns: string | null;
  @text('actions_mitigation') actionsMitigation: string | null;
  /** Next 24 hours. */
  @text('planned_tomorrow') plannedTomorrow: string | null;
  @text('additional_remarks') additionalRemarks: string | null;
  @text('weather') weather: string | null;
  @field('client_created_at') clientCreatedAt: number;
  @field('submitted_at') submittedAt: number | null;
  @field('latitude') latitude: number | null;
  @field('longitude') longitude: number | null;
  @field('gps_accuracy_m') gpsAccuracyM: number | null;
  @text('device_id') deviceId: string | null;
  @text('app_version') appVersion: string | null;
  @field('is_locked') isLocked: boolean;
  @text('sync_state') syncState: SyncState;
  @text('sync_error') syncError: string | null;

  /**
   * Workforce rows, parsed defensively (a corrupt blob must not crash a
   * screen). Drafts saved by an older build carry the legacy
   * { contractor, headcount, manHours } shape; those are mapped the same way
   * the API maps them, and man-hours are always recomputed.
   */
  get workforce(): WorkforceLine[] {
    return parseWorkforceJson(this.workforceJson);
  }

  @writer
  async markSyncState(state: SyncState, error: string | null = null): Promise<void> {
    await this.update((record) => {
      record.syncState = state;
      record.syncError = error;
    });
  }
}

export class EodWindowModel extends Model {
  static override table = 'eod_windows';

  @text('stadium_id') stadiumId: string | null;
  @text('date') date: string;
  @text('start_time') startTime: string;
  @text('end_time') endTime: string;
  @field('enabled') enabled: boolean;
}

/** The recurring daily EOD window; `stadiumId` null = every stadium. */
export class EodWindowDefaultModel extends Model {
  static override table = 'eod_window_defaults';

  @text('stadium_id') stadiumId: string | null;
  @text('start_time') startTime: string;
  @text('end_time') endTime: string;
  @field('enabled') enabled: boolean;
}

export class FindingModel extends Model {
  static override table = 'findings';
  static override associations: Associations = {
    corrective_actions: { type: 'has_many', foreignKey: 'finding_id' },
  };

  @text('reference') reference: string;
  @text('stadium_id') stadiumId: string;
  @text('discipline_id') disciplineId: string | null;
  @text('source') source: string;
  @text('inspection_id') inspectionId: string | null;
  @text('observation_id') observationId: string | null;
  @text('title') title: string;
  @text('description') description: string;
  @text('severity') severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  @text('status') status:
    | 'OPEN'
    | 'ACTION_ASSIGNED'
    | 'IN_PROGRESS'
    | 'PENDING_VERIFICATION'
    | 'CLOSED';
  @text('local_date') localDate: string;
  @field('raised_at') raisedAt: number;
  @field('closed_at') closedAt: number | null;

  @children('corrective_actions') actions: Query<CorrectiveActionModel>;

  @lazy
  evidence = this.collections
    .get<EvidenceModel>('evidence')
    .query(Q.where('context', 'FINDING'), Q.where('context_id', this.id));
}

export class CorrectiveActionModel extends Model {
  static override table = 'corrective_actions';
  static override associations: Associations = {
    findings: { type: 'belongs_to', key: 'finding_id' },
  };

  @text('finding_id') findingId: string;
  @text('assignee_id') assigneeId: string | null;
  @text('responsible_party') responsibleParty: string | null;
  @text('action') action: string;
  @text('due_date') dueDate: string | null;
  @text('status') status:
    | 'OPEN'
    | 'ACTION_ASSIGNED'
    | 'IN_PROGRESS'
    | 'PENDING_VERIFICATION'
    | 'CLOSED';
  @text('closure_note') closureNote: string | null;

  /**
   * Derived here exactly as it is on the server, so a device that has been
   * offline past a due date still shows the action as overdue.
   */
  get isOverdue(): boolean {
    return isOverdue({ status: this.status, dueDate: this.dueDate });
  }
}
