import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { schema } from './schema';
import { migrations } from './migrations';
import {
  ChecklistItemModel,
  ChecklistModel,
  ChecklistSectionModel,
  ChecklistVersionModel,
  DisciplineModel,
  StadiumModel,
  TournamentModel,
  UserModel,
} from './models/catalog';
import {
  CorrectiveActionModel,
  EodReportModel,
  EodWindowDefaultModel,
  EodWindowModel,
  FindingModel,
  InspectionModel,
  InspectionResponseModel,
  ObservationModel,
} from './models/field-records';
import { EvidenceModel } from './models/evidence';

export { migrations };

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  dbName: 'ahlan',
  // JSI is the fast synchronous bridge; it needs a dev build, which is why
  // Expo Go is not supported.
  jsi: true,
  onSetUpError: (error) => {
    // Nothing useful can be done here beyond surfacing it: the app cannot run
    // without its local database.
    console.error('WatermelonDB failed to open', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    StadiumModel,
    DisciplineModel,
    TournamentModel,
    ChecklistModel,
    ChecklistVersionModel,
    ChecklistSectionModel,
    ChecklistItemModel,
    InspectionModel,
    InspectionResponseModel,
    ObservationModel,
    FindingModel,
    CorrectiveActionModel,
    EodWindowModel,
    EodWindowDefaultModel,
    EodReportModel,
    EvidenceModel,
    UserModel,
  ],
});

/** Typed collection accessors, so screens do not pass table names around. */
export const collections = {
  stadiums: () => database.get<StadiumModel>('stadiums'),
  disciplines: () => database.get<DisciplineModel>('disciplines'),
  tournaments: () => database.get<TournamentModel>('tournaments'),
  checklists: () => database.get<ChecklistModel>('checklists'),
  checklistVersions: () => database.get<ChecklistVersionModel>('checklist_versions'),
  checklistSections: () => database.get<ChecklistSectionModel>('checklist_sections'),
  checklistItems: () => database.get<ChecklistItemModel>('checklist_items'),
  inspections: () => database.get<InspectionModel>('inspections'),
  inspectionResponses: () => database.get<InspectionResponseModel>('inspection_responses'),
  observations: () => database.get<ObservationModel>('observations'),
  findings: () => database.get<FindingModel>('findings'),
  correctiveActions: () => database.get<CorrectiveActionModel>('corrective_actions'),
  eodWindows: () => database.get<EodWindowModel>('eod_windows'),
  eodWindowDefaults: () => database.get<EodWindowDefaultModel>('eod_window_defaults'),
  eodReports: () => database.get<EodReportModel>('eod_reports'),
  evidence: () => database.get<EvidenceModel>('evidence'),
  users: () => database.get<UserModel>('users'),
};

/** Wipes the local database. Used on sign-out so a shared phone is clean. */
export async function resetDatabase(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

export * from './models/catalog';
export * from './models/field-records';
export * from './models/evidence';
export { schema, SCHEMA_VERSION } from './schema';
