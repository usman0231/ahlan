/**
 * @ahlan/shared - the single source of truth for enums, validation and KPI maths.
 *
 * The API and the mobile app both depend on this package; nothing in here may be
 * duplicated on either side.
 */

export * from './enums';
export * from './errors';
export * from './ids';
export * from './time';
export * from './decimal';
export * from './kpi';
export * from './transitions';
export * from './eod-window';
export * from './eod-rules';
export * from './completion';

export * from './schemas/common';
export * from './schemas/auth';
export * from './schemas/user';
export * from './schemas/catalog';
export * from './schemas/checklist';
export * from './schemas/evidence';
export * from './schemas/inspection';
export * from './schemas/observation';
export * from './schemas/finding';
export * from './schemas/eod';
export * from './schemas/report';
export * from './schemas/kpi';
export * from './schemas/ai';
export * from './schemas/notification';
export * from './schemas/sync';
export * from './schemas/audit';
export * from './schemas/admin';
