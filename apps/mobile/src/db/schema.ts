import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * The on-device schema.
 *
 * Column names are snake_case and match what `sync.mappers.ts` on the API emits,
 * so a pulled record lands without translation. Instants are stored as epoch
 * milliseconds (`number`) and stadium-local calendar days as `YYYY-MM-DD`
 * strings, which is what the UI displays.
 *
 * Bump `version` and add a migration whenever this changes; never edit a shipped
 * version in place.
 */
export const SCHEMA_VERSION = 2;

export const schema = appSchema({
  version: SCHEMA_VERSION,
  tables: [
    tableSchema({
      name: 'stadiums',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'name_ar', type: 'string', isOptional: true },
        { name: 'code', type: 'string', isIndexed: true },
        { name: 'city', type: 'string', isOptional: true },
        { name: 'timezone', type: 'string' },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'is_active', type: 'boolean' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'disciplines',
      columns: [
        { name: 'slug', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'name_ar', type: 'string', isOptional: true },
        { name: 'icon', type: 'string', isOptional: true },
        { name: 'color_token', type: 'string', isOptional: true },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'description_ar', type: 'string', isOptional: true },
        { name: 'sort_order', type: 'number' },
        { name: 'is_active', type: 'boolean' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'tournaments',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'name_ar', type: 'string', isOptional: true },
        { name: 'start_date', type: 'string' },
        { name: 'end_date', type: 'string' },
        { name: 'is_active', type: 'boolean' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'checklists',
      columns: [
        { name: 'title', type: 'string' },
        { name: 'title_ar', type: 'string', isOptional: true },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'discipline_id', type: 'string', isOptional: true, isIndexed: true },
        /** READINESS | DISCIPLINE | GENERAL (v2). Optional: rows pulled before v2 have none. */
        { name: 'category', type: 'string', isOptional: true, isIndexed: true },
        { name: 'current_version_id', type: 'string', isOptional: true },
        { name: 'is_active', type: 'boolean' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'checklist_versions',
      columns: [
        { name: 'checklist_id', type: 'string', isIndexed: true },
        { name: 'version', type: 'number' },
        { name: 'is_published', type: 'boolean' },
        { name: 'item_count', type: 'number' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'checklist_sections',
      columns: [
        { name: 'version_id', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'title_ar', type: 'string', isOptional: true },
        { name: 'sort_order', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'checklist_items',
      columns: [
        { name: 'section_id', type: 'string', isIndexed: true },
        { name: 'code', type: 'string' },
        { name: 'question', type: 'string' },
        { name: 'question_ar', type: 'string', isOptional: true },
        { name: 'guidance', type: 'string', isOptional: true },
        { name: 'default_severity', type: 'string' },
        { name: 'allow_na', type: 'boolean' },
        { name: 'sort_order', type: 'number' },
      ],
    }),

    tableSchema({
      name: 'inspections',
      columns: [
        { name: 'stadium_id', type: 'string', isIndexed: true },
        { name: 'checklist_id', type: 'string' },
        { name: 'checklist_version_id', type: 'string' },
        { name: 'inspector_id', type: 'string', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'local_date', type: 'string', isIndexed: true },
        { name: 'started_at', type: 'number' },
        { name: 'client_created_at', type: 'number' },
        { name: 'submitted_at', type: 'number', isOptional: true },
        { name: 'server_received_at', type: 'number', isOptional: true },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'gps_accuracy_m', type: 'number', isOptional: true },
        { name: 'device_id', type: 'string', isOptional: true },
        { name: 'app_version', type: 'string', isOptional: true },
        { name: 'yes_count', type: 'number' },
        { name: 'no_count', type: 'number' },
        { name: 'na_count', type: 'number' },
        { name: 'compliance_percent', type: 'string', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'location_label', type: 'string', isOptional: true },
        /** Free text at the end of the checklist; not scored. */
        { name: 'other_observations', type: 'string', isOptional: true },
        { name: 'is_locked', type: 'boolean' },
        /** Device-only: LOCAL | SYNCING | SYNCED | FAILED. Never pushed. */
        { name: 'sync_state', type: 'string', isIndexed: true },
        { name: 'sync_error', type: 'string', isOptional: true },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'inspection_responses',
      columns: [
        { name: 'inspection_id', type: 'string', isIndexed: true },
        { name: 'item_id', type: 'string', isIndexed: true },
        { name: 'item_code', type: 'string' },
        { name: 'value', type: 'string' },
        { name: 'comment', type: 'string', isOptional: true },
        { name: 'concern', type: 'string', isOptional: true },
        { name: 'recommendation', type: 'string', isOptional: true },
        { name: 'severity', type: 'string', isOptional: true },
        { name: 'answered_at', type: 'number' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'observations',
      columns: [
        { name: 'stadium_id', type: 'string', isIndexed: true },
        { name: 'discipline_id', type: 'string', isIndexed: true },
        { name: 'inspector_id', type: 'string', isIndexed: true },
        { name: 'type', type: 'string' },
        { name: 'severity', type: 'string' },
        { name: 'risk_rating', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'location_label', type: 'string', isOptional: true },
        { name: 'responsible_party', type: 'string', isOptional: true },
        { name: 'immediate_action', type: 'string', isOptional: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'local_date', type: 'string', isIndexed: true },
        { name: 'observed_at', type: 'number' },
        { name: 'client_created_at', type: 'number' },
        { name: 'submitted_at', type: 'number', isOptional: true },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'gps_accuracy_m', type: 'number', isOptional: true },
        { name: 'device_id', type: 'string', isOptional: true },
        { name: 'app_version', type: 'string', isOptional: true },
        { name: 'is_locked', type: 'boolean' },
        { name: 'sync_state', type: 'string', isIndexed: true },
        { name: 'sync_error', type: 'string', isOptional: true },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'findings',
      columns: [
        { name: 'reference', type: 'string', isIndexed: true },
        { name: 'stadium_id', type: 'string', isIndexed: true },
        { name: 'discipline_id', type: 'string', isOptional: true },
        { name: 'source', type: 'string' },
        { name: 'inspection_id', type: 'string', isOptional: true },
        { name: 'observation_id', type: 'string', isOptional: true },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string' },
        { name: 'severity', type: 'string', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'local_date', type: 'string' },
        { name: 'raised_at', type: 'number' },
        { name: 'closed_at', type: 'number', isOptional: true },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'corrective_actions',
      columns: [
        { name: 'finding_id', type: 'string', isIndexed: true },
        { name: 'assignee_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'responsible_party', type: 'string', isOptional: true },
        { name: 'action', type: 'string' },
        /** `YYYY-MM-DD`; OVERDUE is derived from it, never stored. */
        { name: 'due_date', type: 'string', isOptional: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'closure_note', type: 'string', isOptional: true },
        { name: 'sync_state', type: 'string', isOptional: true },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'eod_windows',
      columns: [
        { name: 'stadium_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'date', type: 'string', isIndexed: true },
        { name: 'start_time', type: 'string' },
        { name: 'end_time', type: 'string' },
        { name: 'enabled', type: 'boolean' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),

    /** Recurring daily EOD windows (v2); stadium_id null = every stadium. */
    tableSchema({
      name: 'eod_window_defaults',
      columns: [
        { name: 'stadium_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'start_time', type: 'string' },
        { name: 'end_time', type: 'string' },
        { name: 'enabled', type: 'boolean' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'eod_reports',
      columns: [
        { name: 'stadium_id', type: 'string', isIndexed: true },
        { name: 'inspector_id', type: 'string', isIndexed: true },
        { name: 'date', type: 'string', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'total_headcount', type: 'number' },
        { name: 'total_man_hours', type: 'string' },
        /** Workforce lines as a JSON string: an editable list, not a table. */
        { name: 'workforce_json', type: 'string', isOptional: true },
        { name: 'recordable_incidents', type: 'number' },
        { name: 'near_misses', type: 'number' },
        { name: 'total_spectators', type: 'number', isOptional: true },
        { name: 'work_related_medical', type: 'number', isOptional: true },
        { name: 'non_work_related_medical', type: 'number', isOptional: true },
        { name: 'first_aid_cases', type: 'number', isOptional: true },
        { name: 'fire_incidents', type: 'number', isOptional: true },
        { name: 'other_incidents', type: 'number', isOptional: true },
        { name: 'hse_observations_reported', type: 'number', isOptional: true },
        { name: 'summary', type: 'string', isOptional: true },
        { name: 'concerns', type: 'string', isOptional: true },
        { name: 'actions_mitigation', type: 'string', isOptional: true },
        { name: 'planned_tomorrow', type: 'string', isOptional: true },
        { name: 'additional_remarks', type: 'string', isOptional: true },
        { name: 'weather', type: 'string', isOptional: true },
        { name: 'client_created_at', type: 'number' },
        { name: 'submitted_at', type: 'number', isOptional: true },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'gps_accuracy_m', type: 'number', isOptional: true },
        { name: 'device_id', type: 'string', isOptional: true },
        { name: 'app_version', type: 'string', isOptional: true },
        { name: 'is_locked', type: 'boolean' },
        { name: 'sync_state', type: 'string', isIndexed: true },
        { name: 'sync_error', type: 'string', isOptional: true },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'evidence',
      columns: [
        { name: 'kind', type: 'string' },
        { name: 'context', type: 'string', isIndexed: true },
        { name: 'context_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'object_key', type: 'string', isOptional: true },
        { name: 'content_type', type: 'string' },
        { name: 'size_bytes', type: 'number' },
        { name: 'width', type: 'number', isOptional: true },
        { name: 'height', type: 'number', isOptional: true },
        { name: 'caption', type: 'string', isOptional: true },
        /** Where the compressed file sits on this device until it is uploaded. */
        { name: 'local_uri', type: 'string', isOptional: true },
        { name: 'checksum', type: 'string', isOptional: true },
        { name: 'captured_at', type: 'number', isOptional: true },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'upload_status', type: 'string', isIndexed: true },
        { name: 'upload_attempts', type: 'number' },
        { name: 'upload_error', type: 'string', isOptional: true },
        { name: 'stadium_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),

    tableSchema({
      name: 'users',
      columns: [
        { name: 'full_name', type: 'string' },
        { name: 'role', type: 'string' },
        { name: 'server_updated_at', type: 'number', isOptional: true },
      ],
    }),
  ],
});
