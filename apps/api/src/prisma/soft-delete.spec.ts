import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { applySoftDeleteFilter, deletedAtFilter, INCLUDING_DELETED, ONLY_DELETED } from './soft-delete';

describe('applySoftDeleteFilter', () => {
  it.each(['Inspection', 'Observation', 'Finding', 'EodReport'])(
    'hides soft-deleted %s rows on every read',
    (model) => {
      for (const operation of [
        'findFirst',
        'findFirstOrThrow',
        'findMany',
        'findUnique',
        'findUniqueOrThrow',
        'count',
        'aggregate',
        'groupBy',
      ]) {
        expect(applySoftDeleteFilter(model, operation, { where: { stadiumId: 's' } })).toEqual({
          where: { stadiumId: 's', deletedAt: null },
        });
      }
      // No args at all (e.g. count()).
      expect(applySoftDeleteFilter(model, 'count', undefined)).toEqual({ where: { deletedAt: null } });
    },
  );

  it('leaves writes alone', () => {
    for (const operation of ['create', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']) {
      const args = { where: { id: 'x' }, data: {} };
      expect(applySoftDeleteFilter('Inspection', operation, args)).toBe(args);
    }
  });

  it('is switched off by an explicit deletedAt in the where', () => {
    const including = { where: { id: 'x', ...INCLUDING_DELETED } };
    expect(applySoftDeleteFilter('Finding', 'findFirst', including)).toBe(including);
    const only = { where: { id: 'x', ...ONLY_DELETED } };
    expect(applySoftDeleteFilter('Finding', 'findMany', only)).toBe(only);
    expect(deletedAtFilter(true)).toHaveProperty('deletedAt', undefined);
    expect(deletedAtFilter(false)).toEqual({ deletedAt: null });
    expect(deletedAtFilter(undefined)).toEqual({ deletedAt: null });
  });

  it('hides corrective actions and inspection responses with their deleted parent', () => {
    expect(
      applySoftDeleteFilter('CorrectiveAction', 'count', { where: { finding: { stadiumId: 's' } } }),
    ).toEqual({
      where: { finding: { stadiumId: 's' }, AND: [{ finding: { deletedAt: null } }] },
    });
    expect(
      applySoftDeleteFilter('InspectionResponse', 'groupBy', {
        by: ['itemCode'],
        where: { value: 'NO', AND: { itemCode: 'A' } },
      }),
    ).toEqual({
      by: ['itemCode'],
      where: { value: 'NO', AND: [{ itemCode: 'A' }, { inspection: { deletedAt: null } }] },
    });
    // Explicit parent filter on deletedAt opts out.
    const raw = { where: { finding: { deletedAt: undefined } } };
    expect(applySoftDeleteFilter('CorrectiveAction', 'count', raw)).toBe(raw);
  });

  it('ignores every other model', () => {
    const args = { where: { id: 'x' } };
    expect(applySoftDeleteFilter('Stadium', 'findMany', args)).toBe(args);
    expect(applySoftDeleteFilter('Evidence', 'findMany', args)).toBe(args);
  });
});

/**
 * The extension only protects queries made through PrismaService. These
 * guards fail the build if a module bypasses it with its own client, or if a
 * module reads HSE records through a nested relation from another model
 * (which the extension cannot see) without being reviewed.
 */
describe('soft-delete coverage of the source tree', () => {
  const root = join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) files.push(path);
    }
  };
  walk(root);

  it('creates no PrismaClient outside PrismaService', () => {
    const offenders = files.filter(
      (file) =>
        !file.endsWith(join('prisma', 'prisma.service.ts')) &&
        /new PrismaClient\(|extends PrismaClient\b/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('only reads HSE relations nested from reviewed places', () => {
    // `include`/`select` of an HSE relation from another model bypasses the
    // extension. Each of these was reviewed: the parent is itself a live HSE
    // record (so its children are live), or the read is deliberately
    // deletion-aware (restore checks, the sync "deleted" feed, observation
    // toDto dropping a deleted finding).
    const reviewed = new Set([
      'inspections.service.ts', // inspection -> responses (live parent)
      'observations.service.ts', // observation -> finding { deletedAt } handled in toDto
      'findings.service.ts', // finding -> actions (live parent); restore reads parents' deletedAt
      'sync.service.ts', // inspection -> responses; deleted feed reads children of deleted rows
      'report-data.service.ts', // finding -> actions (live parent)
      'corrective-actions.service.ts', // finding.actions (live parent)
      'kpis.service.ts', // relation filters only (covered by the child rule)
      'reminders.processor.ts', // action -> finding (action query is parent-filtered)
      'eod.service.ts', // eod -> workforce (not an HSE model)
    ]);
    const nested =
      /(include|select):\s*\{[^}]*\b(inspections|observations|findings|eodReports|inspection|observation|finding|actions|responses)\s*:/;
    const offenders = files.filter((file) => {
      const name = file.split(/[\\/]/).pop() as string;
      return !reviewed.has(name) && nested.test(readFileSync(file, 'utf8'));
    });
    expect(offenders).toEqual([]);
  });
});
