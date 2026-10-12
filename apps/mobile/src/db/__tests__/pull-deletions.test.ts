import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { synchronize, type SyncDatabaseChangeSet } from '@nozbe/watermelondb/sync';
import { Q } from '@nozbe/watermelondb';
import logger from '@nozbe/watermelondb/utils/common/logger';

import { schema } from '../schema';
import {
  ChecklistItemModel,
  ChecklistModel,
  ChecklistSectionModel,
  ChecklistVersionModel,
  DisciplineModel,
  StadiumModel,
  TournamentModel,
  UserModel,
} from '../models/catalog';
import {
  CorrectiveActionModel,
  EodReportModel,
  EodWindowDefaultModel,
  EodWindowModel,
  FindingModel,
  InspectionModel,
  InspectionResponseModel,
  ObservationModel,
} from '../models/field-records';
import { EvidenceModel } from '../models/evidence';
import {
  foldSoftDeletedRows,
  reconcileDeletions,
  type LocalLookup,
  type LocalRow,
  type PulledChanges,
} from '../pull-deletions';

/** A lookup over plain arrays, standing in for the local database. */
function fakeLookup(tables: Record<string, LocalRow[]>): LocalLookup {
  return {
    byIds: async (table, ids) => (tables[table] ?? []).filter((row) => ids.includes(row.id)),
    byColumn: async (table, column, values) =>
      (tables[table] ?? []).filter((row) => values.includes(String(row[column]))),
  };
}

const empty = () => ({ created: [], updated: [], deleted: [] as string[] });

describe('reconcileDeletions (U4 soft delete on device)', () => {
  it('keeps a pulled deletion of a synced record', async () => {
    const changes: PulledChanges = { findings: { ...empty(), deleted: ['f1'] } };
    const out = await reconcileDeletions(
      changes,
      fakeLookup({ findings: [{ id: 'f1', _status: 'synced', status: 'OPEN' }] }),
    );
    expect(out.findings?.deleted).toEqual(['f1']);
  });

  it('never removes a local draft or a row with unpushed changes', async () => {
    const changes: PulledChanges = {
      inspections: { ...empty(), deleted: ['draft', 'dirty', 'synced'] },
    };
    const out = await reconcileDeletions(
      changes,
      fakeLookup({
        inspections: [
          { id: 'draft', _status: 'synced', status: 'DRAFT' },
          { id: 'dirty', _status: 'updated', status: 'SUBMITTED' },
          { id: 'synced', _status: 'synced', status: 'SUBMITTED' },
        ],
      }),
    );
    expect(out.inspections?.deleted).toEqual(['synced']);
  });

  it('takes children with a deleted parent: actions and responses, not photos', async () => {
    const changes: PulledChanges = {
      findings: { ...empty(), deleted: ['f1'] },
      inspections: { ...empty(), deleted: ['i1'] },
    };
    const out = await reconcileDeletions(
      changes,
      fakeLookup({
        findings: [{ id: 'f1', _status: 'synced' }],
        inspections: [{ id: 'i1', _status: 'synced', status: 'SUBMITTED' }],
        corrective_actions: [
          { id: 'a1', finding_id: 'f1', _status: 'synced' },
          { id: 'a2', finding_id: 'other', _status: 'synced' },
        ],
        inspection_responses: [{ id: 'r1', inspection_id: 'i1', _status: 'synced' }],
        evidence: [
          { id: 'e1', context_id: 'a1', _status: 'synced' },
          { id: 'e2', context_id: 'i1', _status: 'synced' },
          { id: 'e3', context_id: 'i1', _status: 'created' },
        ],
      }),
    );
    expect(out.corrective_actions?.deleted).toEqual(['a1']);
    expect(out.inspection_responses?.deleted).toEqual(['r1']);
    // Evidence stays, so a restore brings the record back with its photos.
    expect(out.evidence).toBeUndefined();
  });

  it('treats a pulled row with deleted_at as a deletion', () => {
    const out = foldSoftDeletedRows({
      observations: {
        created: [],
        updated: [
          { id: 'o1', deleted_at: 1760000000000 },
          { id: 'o2', deleted_at: null },
        ],
        deleted: [],
      },
    });
    expect(out.observations?.updated.map((row) => row.id)).toEqual(['o2']);
    expect(out.observations?.deleted).toEqual(['o1']);
  });

  it('drops an update for a row that is also being deleted', async () => {
    const out = await reconcileDeletions(
      { eod_reports: { created: [], updated: [{ id: 'd1' }], deleted: ['d1'] } },
      fakeLookup({ eod_reports: [{ id: 'd1', _status: 'synced', status: 'SUBMITTED' }] }),
    );
    expect(out.eod_reports?.updated).toEqual([]);
    expect(out.eod_reports?.deleted).toEqual(['d1']);
  });
});

/**
 * The real WatermelonDB pull path: an in-memory LokiJS database, a pull that
 * deletes a finding, and a draft inspection that must survive it.
 */
describe('synchronize with server-side soft deletes', () => {
  beforeAll(() => logger.silence());

  function makeDatabase(): Database {
    const adapter = new LokiJSAdapter({
      schema,
      dbName: `pull-deletions-${Math.random()}`,
      useWebWorker: false,
      useIncrementalIndexedDB: false,
      extraLokiOptions: { autosave: false },
    });
    return new Database({
      adapter,
      modelClasses: [
        StadiumModel,
        DisciplineModel,
        TournamentModel,
        ChecklistModel,
        ChecklistVersionModel,
        ChecklistSectionModel,
        ChecklistItemModel,
        UserModel,
        InspectionModel,
        InspectionResponseModel,
        ObservationModel,
        FindingModel,
        CorrectiveActionModel,
        EodWindowModel,
        EodWindowDefaultModel,
        EodReportModel,
        EvidenceModel,
      ],
    });
  }

  function lookupFor(database: Database): LocalLookup {
    return {
      byIds: (table, ids) => database.get(table).query(Q.where('id', Q.oneOf(ids))).unsafeFetchRaw(),
      byColumn: (table, column, values) =>
        database.get(table).query(Q.where(column, Q.oneOf(values))).unsafeFetchRaw(),
    };
  }

  const finding = {
    id: 'f1',
    stadium_id: 's1',
    source: 'INSPECTION',
    title: 'Missing guardrail',
    severity: 'HIGH',
    status: 'OPEN',
    created_at: 1,
  };
  const action = { id: 'a1', finding_id: 'f1', description: 'Fit guardrail', status: 'ACTION_ASSIGNED' };

  async function pull(database: Database, changes: PulledChanges, timestamp: number) {
    await synchronize({
      database,
      sendCreatedAsUpdated: true,
      pullChanges: async () => ({
        changes: (await reconcileDeletions(changes, lookupFor(database))) as unknown as SyncDatabaseChangeSet,
        timestamp,
      }),
      pushChanges: async () => undefined,
    });
  }

  it('removes a soft-deleted finding and its action, and keeps a local draft', async () => {
    const database = makeDatabase();

    await pull(
      database,
      {
        findings: { created: [], updated: [finding], deleted: [] },
        corrective_actions: { created: [], updated: [action], deleted: [] },
      },
      1000,
    );
    expect(await database.get('findings').query().fetchCount()).toBe(1);
    expect(await database.get('corrective_actions').query().fetchCount()).toBe(1);

    // An inspection drafted offline, never pushed.
    await database.write(async () => {
      await database.get<InspectionModel>('inspections').create((row) => {
        (row as unknown as { _raw: Record<string, unknown> })._raw.id = 'draft1';
        Object.assign((row as unknown as { _raw: Record<string, unknown> })._raw, {
          stadium_id: 's1',
          status: 'DRAFT',
          sync_state: 'LOCAL',
        });
      });
    });

    // The admin soft-deletes the finding; a buggy server even names the draft.
    await pull(
      database,
      {
        findings: { created: [], updated: [], deleted: ['f1'] },
        inspections: { created: [], updated: [], deleted: ['draft1'] },
      },
      2000,
    );

    expect(await database.get('findings').query().fetchCount()).toBe(0);
    expect(await database.get('corrective_actions').query().fetchCount()).toBe(0);
    expect(await database.get('inspections').query().fetchCount()).toBe(1);
  });
});
