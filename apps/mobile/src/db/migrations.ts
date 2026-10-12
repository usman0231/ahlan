import {
  addColumns,
  createTable,
  schemaMigrations,
} from '@nozbe/watermelondb/Schema/migrations';

/**
 * Schema migrations, shared by the SQLite (native) and LokiJS (web) adapters.
 *
 * A shipped migration is never edited: a phone that has been in a drawer for a
 * month replays the whole chain on its next launch. Every step here must match
 * the column list in `schema.ts` exactly.
 *
 * Sync is told the first migrated version (`MIGRATIONS_ENABLED_AT_VERSION`),
 * so the first pull after an upgrade fetches everything again and fills the
 * new columns on rows that were pulled before they existed.
 */
export const MIGRATIONS_ENABLED_AT_VERSION = 1;

export const migrations = schemaMigrations({
  migrations: [
    {
      // v2: client mockups wave - EOD form, readiness checklists, discipline
      // dashboards, recurring EOD window.
      toVersion: 2,
      steps: [
        addColumns({
          table: 'disciplines',
          columns: [
            { name: 'description', type: 'string', isOptional: true },
            { name: 'description_ar', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'checklists',
          columns: [{ name: 'category', type: 'string', isOptional: true, isIndexed: true }],
        }),
        addColumns({
          table: 'inspections',
          columns: [
            { name: 'location_label', type: 'string', isOptional: true },
            { name: 'other_observations', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'inspection_responses',
          columns: [
            { name: 'concern', type: 'string', isOptional: true },
            { name: 'recommendation', type: 'string', isOptional: true },
          ],
        }),
        addColumns({
          table: 'eod_reports',
          columns: [
            { name: 'total_spectators', type: 'number', isOptional: true },
            { name: 'work_related_medical', type: 'number', isOptional: true },
            { name: 'non_work_related_medical', type: 'number', isOptional: true },
            { name: 'first_aid_cases', type: 'number', isOptional: true },
            { name: 'fire_incidents', type: 'number', isOptional: true },
            { name: 'other_incidents', type: 'number', isOptional: true },
            { name: 'hse_observations_reported', type: 'number', isOptional: true },
            { name: 'actions_mitigation', type: 'string', isOptional: true },
            { name: 'additional_remarks', type: 'string', isOptional: true },
          ],
        }),
        createTable({
          name: 'eod_window_defaults',
          columns: [
            { name: 'stadium_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'start_time', type: 'string' },
            { name: 'end_time', type: 'string' },
            { name: 'enabled', type: 'boolean' },
            { name: 'server_updated_at', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
  ],
});
