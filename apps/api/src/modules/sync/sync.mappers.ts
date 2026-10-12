import type { Prisma } from '@prisma/client';

import { fromDateColumn } from '../../common/util/local-date';
import type { RawRecord } from '@ahlan/shared';

/**
 * Row -> raw WatermelonDB record.
 *
 * The device's columns are snake_case and its types are limited to string,
 * number, boolean and null, so dates go out as epoch milliseconds and decimals
 * as strings. Keeping all of that in one file means the device schema and these
 * mappers can be checked against each other in one sitting.
 */

export function ms(date: Date | null | undefined): number | null {
  return date ? date.getTime() : null;
}

/** `@db.Date` columns travel as the `YYYY-MM-DD` string the device displays. */
export function dateString(date: Date | null | undefined): string | null {
  return date ? fromDateColumn(date) : null;
}

export function decimal(value: Prisma.Decimal | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toFixed(2);
}

export const mapStadium = (row: {
  id: string;
  name: string;
  nameAr: string | null;
  code: string;
  city: string | null;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  updatedAt: Date;
}): RawRecord => ({
  id: row.id,
  name: row.name,
  name_ar: row.nameAr,
  code: row.code,
  city: row.city,
  timezone: row.timezone,
  latitude: row.latitude,
  longitude: row.longitude,
  is_active: row.isActive,
  server_updated_at: ms(row.updatedAt),
});

export const mapDiscipline = (row: {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  icon: string | null;
  colorToken: string | null;
  sortOrder: number;
  isActive: boolean;
  updatedAt: Date;
}): RawRecord => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  name_ar: row.nameAr,
  description: row.description,
  description_ar: row.descriptionAr,
  icon: row.icon,
  color_token: row.colorToken,
  sort_order: row.sortOrder,
  is_active: row.isActive,
  server_updated_at: ms(row.updatedAt),
});

export const mapTournament = (row: {
  id: string;
  name: string;
  nameAr: string | null;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  updatedAt: Date;
}): RawRecord => ({
  id: row.id,
  name: row.name,
  name_ar: row.nameAr,
  start_date: dateString(row.startDate),
  end_date: dateString(row.endDate),
  is_active: row.isActive,
  server_updated_at: ms(row.updatedAt),
});

export const mapChecklist = (row: {
  id: string;
  title: string;
  titleAr: string | null;
  description: string | null;
  category: string;
  disciplineId: string | null;
  currentVersionId: string | null;
  isActive: boolean;
  updatedAt: Date;
}): RawRecord => ({
  id: row.id,
  title: row.title,
  title_ar: row.titleAr,
  description: row.description,
  category: row.category,
  discipline_id: row.disciplineId,
  current_version_id: row.currentVersionId,
  is_active: row.isActive,
  server_updated_at: ms(row.updatedAt),
});

export const mapChecklistVersion = (row: {
  id: string;
  checklistId: string;
  version: number;
  isPublished: boolean;
  itemCount: number;
  createdAt: Date;
}): RawRecord => ({
  id: row.id,
  checklist_id: row.checklistId,
  version: row.version,
  is_published: row.isPublished,
  item_count: row.itemCount,
  server_updated_at: ms(row.createdAt),
});

export const mapChecklistSection = (row: {
  id: string;
  versionId: string;
  title: string;
  titleAr: string | null;
  sortOrder: number;
}): RawRecord => ({
  id: row.id,
  version_id: row.versionId,
  title: row.title,
  title_ar: row.titleAr,
  sort_order: row.sortOrder,
});

export const mapChecklistItem = (row: {
  id: string;
  sectionId: string;
  code: string;
  question: string;
  questionAr: string | null;
  guidance: string | null;
  defaultSeverity: string;
  allowNa: boolean;
  sortOrder: number;
}): RawRecord => ({
  id: row.id,
  section_id: row.sectionId,
  code: row.code,
  question: row.question,
  question_ar: row.questionAr,
  guidance: row.guidance,
  default_severity: row.defaultSeverity,
  allow_na: row.allowNa,
  sort_order: row.sortOrder,
});

export const mapInspection = (row: {
  id: string;
  stadiumId: string;
  checklistId: string;
  checklistVersionId: string;
  inspectorId: string;
  status: string;
  localDate: Date;
  startedAt: Date;
  submittedAt: Date | null;
  serverReceivedAt: Date | null;
  yesCount: number;
  noCount: number;
  naCount: number;
  compliancePercent: Prisma.Decimal | null;
  notes: string | null;
  locationLabel: string | null;
  otherObservations: string | null;
  isLocked: boolean;
  updatedAt: Date;
}): RawRecord => ({
  id: row.id,
  stadium_id: row.stadiumId,
  checklist_id: row.checklistId,
  checklist_version_id: row.checklistVersionId,
  inspector_id: row.inspectorId,
  status: row.status,
  local_date: dateString(row.localDate),
  started_at: ms(row.startedAt),
  submitted_at: ms(row.submittedAt),
  server_received_at: ms(row.serverReceivedAt),
  yes_count: row.yesCount,
  no_count: row.noCount,
  na_count: row.naCount,
  compliance_percent: decimal(row.compliancePercent),
  notes: row.notes,
  location_label: row.locationLabel,
  other_observations: row.otherObservations,
  is_locked: row.isLocked,
  sync_state: 'SYNCED',
  server_updated_at: ms(row.updatedAt),
});

export const mapInspectionResponse = (row: {
  id: string;
  inspectionId: string;
  itemId: string;
  itemCode: string;
  value: string;
  comment: string | null;
  concern: string | null;
  recommendation: string | null;
  severity: string | null;
  answeredAt: Date;
  updatedAt: Date;
}): RawRecord => ({
  id: row.id,
  inspection_id: row.inspectionId,
  item_id: row.itemId,
  item_code: row.itemCode,
  value: row.value,
  comment: row.comment,
  concern: row.concern,
  recommendation: row.recommendation,
  severity: row.severity,
  answered_at: ms(row.answeredAt),
  server_updated_at: ms(row.updatedAt),
});

export const mapObservation = (row: {
  id: string;
  stadiumId: string;
  disciplineId: string;
  inspectorId: string;
  type: string;
  severity: string;
  riskRating: string;
  title: string;
  description: string;
  locationLabel: string | null;
  responsibleParty: string | null;
  immediateAction: string | null;
  status: string;
  localDate: Date;
  observedAt: Date;
  submittedAt: Date | null;
  isLocked: boolean;
  updatedAt: Date;
}): RawRecord => ({
  id: row.id,
  stadium_id: row.stadiumId,
  discipline_id: row.disciplineId,
  inspector_id: row.inspectorId,
  type: row.type,
  severity: row.severity,
  risk_rating: row.riskRating,
  title: row.title,
  description: row.description,
  location_label: row.locationLabel,
  responsible_party: row.responsibleParty,
  immediate_action: row.immediateAction,
  status: row.status,
  local_date: dateString(row.localDate),
  observed_at: ms(row.observedAt),
  submitted_at: ms(row.submittedAt),
  is_locked: row.isLocked,
  sync_state: 'SYNCED',
  server_updated_at: ms(row.updatedAt),
});

export const mapFinding = (row: {
  id: string;
  reference: string;
  stadiumId: string;
  disciplineId: string | null;
  source: string;
  inspectionId: string | null;
  observationId: string | null;
  title: string;
  description: string;
  severity: string;
  status: string;
  localDate: Date;
  raisedAt: Date;
  closedAt: Date | null;
  updatedAt: Date;
}): RawRecord => ({
  id: row.id,
  reference: row.reference,
  stadium_id: row.stadiumId,
  discipline_id: row.disciplineId,
  source: row.source,
  inspection_id: row.inspectionId,
  observation_id: row.observationId,
  title: row.title,
  description: row.description,
  severity: row.severity,
  status: row.status,
  local_date: dateString(row.localDate),
  raised_at: ms(row.raisedAt),
  closed_at: ms(row.closedAt),
  server_updated_at: ms(row.updatedAt),
});

export const mapCorrectiveAction = (row: {
  id: string;
  findingId: string;
  assigneeId: string | null;
  responsibleParty: string | null;
  action: string;
  dueDate: Date | null;
  status: string;
  closureNote: string | null;
  updatedAt: Date;
}): RawRecord => ({
  id: row.id,
  finding_id: row.findingId,
  assignee_id: row.assigneeId,
  responsible_party: row.responsibleParty,
  action: row.action,
  // Sent as a date string; the device derives OVERDUE from it rather than
  // storing a status, exactly as the API does.
  due_date: dateString(row.dueDate),
  status: row.status,
  closure_note: row.closureNote,
  server_updated_at: ms(row.updatedAt),
});

export const mapEodWindow = (row: {
  id: string;
  stadiumId: string | null;
  date: Date;
  startTime: string;
  endTime: string;
  enabled: boolean;
  updatedAt: Date;
}): RawRecord => ({
  id: row.id,
  stadium_id: row.stadiumId,
  date: dateString(row.date),
  start_time: row.startTime,
  end_time: row.endTime,
  enabled: row.enabled,
  server_updated_at: ms(row.updatedAt),
});

/** Recurring daily EOD window; stadium_id null = global default. */
export const mapEodWindowDefault = (row: {
  id: string;
  stadiumId: string | null;
  startTime: string;
  endTime: string;
  enabled: boolean;
  updatedAt: Date;
}): RawRecord => ({
  id: row.id,
  stadium_id: row.stadiumId,
  start_time: row.startTime,
  end_time: row.endTime,
  enabled: row.enabled,
  server_updated_at: ms(row.updatedAt),
});

export const mapEodReport = (row: {
  id: string;
  stadiumId: string;
  inspectorId: string;
  date: Date;
  status: string;
  totalHeadcount: number;
  totalManHours: Prisma.Decimal;
  totalSpectators: number | null;
  workRelatedMedical: number;
  nonWorkRelatedMedical: number;
  firstAidCases: number;
  fireIncidents: number;
  otherIncidents: number;
  hseObservationsReported: number;
  recordableIncidents: number;
  nearMisses: number;
  summary: string | null;
  concerns: string | null;
  actionsMitigation: string | null;
  plannedTomorrow: string | null;
  additionalRemarks: string | null;
  weather: string | null;
  clientCreatedAt: Date;
  submittedAt: Date | null;
  isLocked: boolean;
  updatedAt: Date;
  workforce: {
    category: string;
    personnel: number;
    hours: Prisma.Decimal;
    manHours: Prisma.Decimal;
    sortOrder: number;
  }[];
}): RawRecord => ({
  id: row.id,
  stadium_id: row.stadiumId,
  inspector_id: row.inspectorId,
  date: dateString(row.date),
  status: row.status,
  total_headcount: row.totalHeadcount,
  total_man_hours: decimal(row.totalManHours),
  // Same JSON shape the device pushes; without it a re-installed device would
  // show a submitted report with no workforce lines.
  workforce_json: JSON.stringify(
    [...row.workforce]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((entry) => ({
        category: entry.category,
        personnel: entry.personnel,
        hours: entry.hours.toFixed(2),
        manHours: entry.manHours.toFixed(2),
      })),
  ),
  total_spectators: row.totalSpectators,
  work_related_medical: row.workRelatedMedical,
  non_work_related_medical: row.nonWorkRelatedMedical,
  first_aid_cases: row.firstAidCases,
  fire_incidents: row.fireIncidents,
  other_incidents: row.otherIncidents,
  hse_observations_reported: row.hseObservationsReported,
  recordable_incidents: row.recordableIncidents,
  near_misses: row.nearMisses,
  summary: row.summary,
  concerns: row.concerns,
  actions_mitigation: row.actionsMitigation,
  planned_tomorrow: row.plannedTomorrow,
  additional_remarks: row.additionalRemarks,
  weather: row.weather,
  client_created_at: ms(row.clientCreatedAt),
  submitted_at: ms(row.submittedAt),
  is_locked: row.isLocked,
  sync_state: 'SYNCED',
  server_updated_at: ms(row.updatedAt),
});

export const mapEvidence = (row: {
  id: string;
  kind: string;
  context: string;
  contextId: string | null;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  caption: string | null;
  uploadStatus: string;
  stadiumId: string | null;
  updatedAt: Date;
}): RawRecord => ({
  id: row.id,
  kind: row.kind,
  context: row.context,
  context_id: row.contextId,
  object_key: row.objectKey,
  content_type: row.contentType,
  size_bytes: row.sizeBytes,
  caption: row.caption,
  upload_status: row.uploadStatus,
  stadium_id: row.stadiumId,
  // Deliberately absent: the presigned URL is short-lived and must not be
  // cached on the device. The app asks for one when it renders the image.
  server_updated_at: ms(row.updatedAt),
});

/** Only what the app needs to show an author's name. */
export const mapUser = (row: {
  id: string;
  fullName: string;
  role: string;
  updatedAt: Date;
}): RawRecord => ({
  id: row.id,
  full_name: row.fullName,
  role: row.role,
  server_updated_at: ms(row.updatedAt),
});
