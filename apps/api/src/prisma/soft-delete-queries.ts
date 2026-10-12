import type { EvidenceContext, Prisma, PrismaClient } from '@prisma/client';

import { ONLY_DELETED } from './soft-delete';

type Db = Pick<
  PrismaClient,
  'inspection' | 'inspectionResponse' | 'observation' | 'finding' | 'correctiveAction' | 'eodReport'
>;

/**
 * Evidence has a polymorphic parent (no foreign key), so the soft-delete
 * extension cannot hide it on its own. Given evidence rows, returns the
 * context ids whose parent HSE record is soft-deleted; callers drop (or, in
 * sync pull, delete) the evidence attached to them.
 */
export async function deletedEvidenceContextIds(
  db: Db,
  rows: { context: EvidenceContext; contextId: string | null }[],
): Promise<Set<string>> {
  const ids = (contexts: EvidenceContext[]) => [
    ...new Set(
      rows
        .filter((row) => row.contextId && contexts.includes(row.context))
        .map((row) => row.contextId as string),
    ),
  ];
  const responseIds = ids(['INSPECTION_RESPONSE']);
  const observationIds = ids(['OBSERVATION']);
  const findingIds = ids(['FINDING']);
  const actionIds = ids(['CORRECTIVE_ACTION_PROGRESS', 'CORRECTIVE_ACTION_CLOSURE']);
  const eodIds = ids(['EOD']);

  const [responses, observations, findings, actions, eods] = await Promise.all([
    responseIds.length
      ? db.inspectionResponse.findMany({
          where: { id: { in: responseIds }, inspection: ONLY_DELETED },
          select: { id: true },
        })
      : [],
    observationIds.length
      ? db.observation.findMany({ where: { id: { in: observationIds }, ...ONLY_DELETED }, select: { id: true } })
      : [],
    findingIds.length
      ? db.finding.findMany({ where: { id: { in: findingIds }, ...ONLY_DELETED }, select: { id: true } })
      : [],
    actionIds.length
      ? db.correctiveAction.findMany({
          where: { id: { in: actionIds }, finding: ONLY_DELETED },
          select: { id: true },
        })
      : [],
    eodIds.length
      ? db.eodReport.findMany({ where: { id: { in: eodIds }, ...ONLY_DELETED }, select: { id: true } })
      : [],
  ]);

  return new Set(
    [...responses, ...observations, ...findings, ...actions, ...eods].map((row) => row.id),
  );
}

/**
 * Restoring a record must make devices pull its children again: a restored
 * finding's corrective actions and every restored record's evidence were not
 * themselves modified, so their `updatedAt` is bumped here.
 */
export async function touchRestoredChildren(
  tx: Prisma.TransactionClient,
  input: { inspectionIds?: string[]; observationIds?: string[]; findingIds?: string[]; eodIds?: string[] },
): Promise<void> {
  const now = new Date();
  const findingIds = input.findingIds ?? [];
  const responses = input.inspectionIds?.length
    ? await tx.inspectionResponse.findMany({
        where: { inspectionId: { in: input.inspectionIds }, inspection: { deletedAt: undefined } },
        select: { id: true },
      })
    : [];
  const actions = findingIds.length
    ? await tx.correctiveAction.findMany({
        where: { findingId: { in: findingIds }, finding: { deletedAt: undefined } },
        select: { id: true },
      })
    : [];
  if (actions.length > 0) {
    await tx.correctiveAction.updateMany({
      where: { id: { in: actions.map((row) => row.id) } },
      data: { updatedAt: now },
    });
  }
  const contextIds = [
    ...responses.map((row) => row.id),
    ...actions.map((row) => row.id),
    ...findingIds,
    ...(input.observationIds ?? []),
    ...(input.eodIds ?? []),
  ];
  if (contextIds.length > 0) {
    await tx.evidence.updateMany({ where: { contextId: { in: contextIds } }, data: { updatedAt: now } });
  }
}
