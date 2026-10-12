import { LogBox } from 'react-native';
import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';

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

/**
 * The web build of the local database.
 *
 * Metro picks this file over `index.ts` when the platform is web. The native
 * build uses the SQLite JSI adapter, which has no browser equivalent, so the
 * web preview runs WatermelonDB's LokiJS adapter against IndexedDB instead.
 *
 * This exists so the UI can be reviewed in a browser. The shipping app is a
 * native dev build; nothing here is used on a device.
 */
export { migrations };

// LokiJS deletes the IndexedDB store when it sets up an empty database (first
// visit, or after a sign-out wipe). If the old connection has not closed yet the
// browser fires `onblocked` once; the delete still succeeds a moment later, as
// LokiJS's own comment says, but it logs a console.error the dev overlay shows
// as a red toast. Hide only that message.
LogBox.ignoreLogs(["Deleting database failed because it's blocked by another connection"]);

const adapter = new LokiJSAdapter({
  schema,
  migrations,
  dbName: 'ahlan',
  useWebWorker: false,
  useIncrementalIndexedDB: true,
  onQuotaExceededError: (error) => {
    console.error('IndexedDB quota exceeded', error);
  },
  onSetUpError: (error) => {
    console.error('LokiJS failed to open', error);
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

export async function resetDatabase(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

export * from './models/catalog';
export * from './models/field-records';
export * from './models/evidence';
export { schema, SCHEMA_VERSION } from './schema';
