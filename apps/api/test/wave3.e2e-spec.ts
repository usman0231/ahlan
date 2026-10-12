import { ERROR_CODES, uuidv7, zonedDateString } from '@ahlan/shared';
import type { Report } from '@prisma/client';

import { ReportDataService } from '../src/modules/reports/report-data.service';
import {
  api,
  bearer,
  createTestApp,
  seedChecklist,
  seedStadium,
  seedTournament,
  seedUploadedEvidence,
  seedUser,
  type SeededChecklist,
  type SeededUser,
  type TestContext,
} from './helpers';

/**
 * Wave 3: admin full rights. Soft delete / restore of HSE records (and proof
 * that a deleted record vanishes from KPIs, stadium cards, checklist
 * completion, report data and sync pull), catalog deletes, stadium photos,
 * report / AI insight deletes and the permissions around all of it.
 */
describe('Wave 3 admin rights and soft delete (e2e)', () => {
  let ctx: TestContext;
  let tournamentId: string;
  let stadium: { id: string; code: string; timezone: string };
  let admin: SeededUser;
  let supervisor: SeededUser;
  let inspector: SeededUser;
  let checklist: SeededChecklist;
  let disciplineId: string;
  let today: string;

  const REASON = 'Entered against the wrong stadium';

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await ctx.prisma.truncateAll();
    tournamentId = await seedTournament(ctx);
    stadium = await seedStadium(ctx, { code: 'WV3', timezone: 'UTC' });
    admin = await seedUser(ctx, { role: 'ADMIN' });
    supervisor = await seedUser(ctx, { role: 'SUPERVISOR', stadiumIds: [stadium.id] });
    inspector = await seedUser(ctx, { role: 'INSPECTOR', stadiumIds: [stadium.id] });
    checklist = await seedChecklist(ctx, 2);
    await ctx.prisma.checklist.update({
      where: { id: checklist.checklistId },
      data: { category: 'READINESS' },
    });
    disciplineId = uuidv7();
    await ctx.prisma.discipline.create({
      data: { id: disciplineId, slug: `wah-${disciplineId.slice(-6)}`, name: 'Work at Height' },
    });
    today = zonedDateString(new Date(), 'UTC');
  });

  afterAll(async () => {
    await ctx.close();
  });

  /* -------------------------------- helpers ------------------------------- */

  async function submitInspection(withNo = true): Promise<{ id: string; evidenceId: string }> {
    const evidenceId = await seedUploadedEvidence(ctx, {
      uploadedById: inspector.id,
      stadiumId: stadium.id,
    });
    const now = new Date().toISOString();
    const response = await ctx
      .http()
      .post(api('/inspections/submit'))
      .set('Authorization', bearer(inspector))
      .send({
        id: uuidv7(),
        stadiumId: stadium.id,
        checklistId: checklist.checklistId,
        checklistVersionId: checklist.versionId,
        startedAt: now,
        submittedAt: now,
        clientCreatedAt: now,
        gps: { latitude: 25.3, longitude: 51.5, accuracyM: 6 },
        responses: checklist.items.map((item, index) => ({
          id: uuidv7(),
          itemId: item.id,
          value: withNo && index === 1 ? 'NO' : 'YES',
          evidenceIds: withNo && index === 1 ? [evidenceId] : [],
          answeredAt: now,
        })),
      })
      .expect(201);
    return { id: response.body.id as string, evidenceId };
  }

  async function submitObservation(type = 'UNSAFE_CONDITION'): Promise<string> {
    const evidenceId = await seedUploadedEvidence(ctx, {
      uploadedById: inspector.id,
      stadiumId: stadium.id,
    });
    const now = new Date().toISOString();
    const response = await ctx
      .http()
      .post(api('/observations/submit'))
      .set('Authorization', bearer(inspector))
      .send({
        id: uuidv7(),
        stadiumId: stadium.id,
        disciplineId,
        type,
        severity: 'HIGH',
        riskRating: 'HIGH',
        title: 'Unguarded edge on level 3',
        description: 'Handrail missing along the east concourse edge.',
        observedAt: now,
        clientCreatedAt: now,
        gps: { latitude: 25.3, longitude: 51.5 },
        evidenceIds: [evidenceId],
      })
      .expect(201);
    return response.body.id as string;
  }

  async function openEodAllDay(): Promise<void> {
    await ctx
      .http()
      .put(api('/eod/window-default'))
      .set('Authorization', bearer(admin))
      .send({ startTime: '00:00', endTime: '23:59', enabled: true })
      .expect(200);
  }

  async function submitEod(): Promise<string> {
    const now = new Date().toISOString();
    const response = await ctx
      .http()
      .post(api('/eod/submit'))
      .set('Authorization', bearer(inspector))
      .send({
        id: uuidv7(),
        stadiumId: stadium.id,
        date: today,
        submittedAt: now,
        clientCreatedAt: now,
        workforce: [{ category: 'Stewards', personnel: 10, hours: '8.00' }],
        summary: 'Gates opened on time and the day ran without incident.',
        evidenceIds: [],
      })
      .expect(201);
    return response.body.id as string;
  }

  async function findingIdsFor(inspectionId: string): Promise<string[]> {
    const rows = await ctx.prisma.finding.findMany({
      where: { inspectionId, deletedAt: undefined },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async function kpiSummary() {
    const response = await ctx
      .http()
      .get(api('/kpis/summary'))
      .query({ from: today, to: today, compare: 'false' })
      .set('Authorization', bearer(admin))
      .expect(200);
    return response.body as { inspections: number; findingsTotal: number; observations: number; eodSubmitted: number };
  }

  async function card() {
    const response = await ctx
      .http()
      .get(api('/kpis/stadium-cards'))
      .set('Authorization', bearer(admin))
      .expect(200);
    return (response.body as { stadiumId: string; checklistsDone: number; findingsOpen: number }[]).find(
      (row) => row.stadiumId === stadium.id,
    );
  }

  async function completed(): Promise<number> {
    const response = await ctx
      .http()
      .get(api('/checklists/completion'))
      .query({ date: today })
      .set('Authorization', bearer(admin))
      .expect(200);
    const row = (response.body as { checklistId: string; completed: number }[]).find(
      (entry) => entry.checklistId === checklist.checklistId,
    );
    return row?.completed ?? 0;
  }

  async function reportData() {
    const service = ctx.app.get(ReportDataService);
    return service.build({
      id: uuidv7(),
      type: 'WEEKLY',
      scope: 'CONSOLIDATED',
      stadiumId: null,
      tournamentId,
      periodStart: new Date(`${today}T00:00:00.000Z`),
      periodEnd: new Date(`${today}T00:00:00.000Z`),
      status: 'RUNNING',
      includeAiInsights: false,
      locale: 'en',
    } as unknown as Report);
  }

  async function pull(user: SeededUser, lastPulledAt: number) {
    const response = await ctx
      .http()
      .get(api('/sync/pull'))
      .query({ lastPulledAt, schemaVersion: 2 })
      .set('Authorization', bearer(user))
      .expect(200);
    return response.body as {
      changes: Record<string, { updated: { id: string }[]; deleted: string[] }>;
      timestamp: number;
    };
  }

  /* ------------------------ soft delete: inspection ----------------------- */

  describe('a soft-deleted inspection', () => {
    it('vanishes from KPIs, cards, completion, report data, lists and sync, and comes back on restore', async () => {
      const { id, evidenceId } = await submitInspection(true);
      const [findingId] = await findingIdsFor(id);
      expect(findingId).toBeDefined();

      expect(await kpiSummary()).toMatchObject({ inspections: 1, findingsTotal: 1 });
      expect(await card()).toMatchObject({ checklistsDone: 1, findingsOpen: 1 });
      expect(await completed()).toBe(1);
      const before = await reportData();
      expect(before.summary.inspections).toBe(1);
      expect(before.openCriticalFindings).toHaveLength(1);
      const watermark = (await pull(inspector, 0)).timestamp;

      await ctx
        .http()
        .delete(api(`/inspections/${id}`))
        .set('Authorization', bearer(admin))
        .send({ reason: REASON })
        .expect(204);

      expect(await kpiSummary()).toMatchObject({ inspections: 0, findingsTotal: 0 });
      expect(await card()).toMatchObject({ checklistsDone: 0, findingsOpen: 0 });
      expect(await completed()).toBe(0);
      const after = await reportData();
      expect(after.summary.inspections).toBe(0);
      expect(after.openCriticalFindings).toHaveLength(0);
      expect(after.topRepeatFindings).toHaveLength(0);

      // Lists and details.
      const list = await ctx
        .http()
        .get(api('/inspections'))
        .set('Authorization', bearer(inspector))
        .expect(200);
      expect(list.body.items).toHaveLength(0);
      await ctx
        .http()
        .get(api(`/inspections/${id}`))
        .set('Authorization', bearer(inspector))
        .expect(404);
      await ctx
        .http()
        .get(api(`/findings/${findingId}`))
        .set('Authorization', bearer(supervisor))
        .expect(404);
      const sneaky = await ctx
        .http()
        .get(api('/inspections'))
        .query({ includeDeleted: 'true' })
        .set('Authorization', bearer(supervisor))
        .expect(200);
      expect(sneaky.body.items).toHaveLength(0);
      const evidence = await ctx
        .http()
        .get(api(`/evidence/${evidenceId}`))
        .set('Authorization', bearer(inspector));
      expect(evidence.status).toBe(404);

      // The admin still sees it, flagged.
      const adminDetail = await ctx
        .http()
        .get(api(`/inspections/${id}`))
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(adminDetail.body.deletedAt).toBeTruthy();
      expect(adminDetail.body.deleteReason).toBe(REASON);
      const adminList = await ctx
        .http()
        .get(api('/inspections'))
        .query({ includeDeleted: 'true' })
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(adminList.body.items.map((row: { id: string }) => row.id)).toContain(id);
      const adminDefault = await ctx
        .http()
        .get(api('/inspections'))
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(adminDefault.body.items).toHaveLength(0);

      // Devices are told to drop it, with its responses, finding and photo.
      const sync = await pull(inspector, watermark);
      expect(sync.changes.inspections?.deleted).toContain(id);
      expect(sync.changes.inspections?.updated).toHaveLength(0);
      expect(sync.changes.findings?.deleted).toContain(findingId);
      expect(sync.changes.inspection_responses?.deleted).toHaveLength(2);
      expect(sync.changes.evidence?.deleted).toContain(evidenceId);
      // A full pull never ships it.
      const full = await pull(inspector, 0);
      expect(full.changes.inspections?.updated.map((row) => row.id)).not.toContain(id);
      expect(full.changes.evidence?.updated.map((row) => row.id)).not.toContain(evidenceId);

      // Audited with the reason.
      const audit = await ctx.prisma.auditLog.findMany({
        where: { entity: 'inspections', entityId: id, action: 'DELETE' },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]?.reason).toBe(REASON);

      // A device re-sending it cannot resurrect it.
      const resend = await ctx
        .http()
        .patch(api(`/inspections/${id}/correct`))
        .set('Authorization', bearer(admin))
        .send({ reason: 'Fix a typo please', notes: 'x' })
        .expect(409);
      expect(resend.body.code).toBe(ERROR_CODES.RECORD_DELETED);

      // Restore.
      const watermark2 = sync.timestamp;
      const restored = await ctx
        .http()
        .post(api(`/inspections/${id}/restore`))
        .set('Authorization', bearer(admin))
        .send({ reason: 'Deleted by mistake' })
        .expect(200);
      expect(restored.body.deletedAt).toBeNull();
      expect(await kpiSummary()).toMatchObject({ inspections: 1, findingsTotal: 1 });
      expect(await card()).toMatchObject({ checklistsDone: 1, findingsOpen: 1 });
      const back = await pull(inspector, watermark2);
      expect(back.changes.inspections?.updated.map((row) => row.id)).toContain(id);
      expect(back.changes.findings?.updated.map((row) => row.id)).toContain(findingId);
      expect(back.changes.evidence?.updated.map((row) => row.id)).toContain(evidenceId);
      const restoreAudit = await ctx.prisma.auditLog.count({
        where: { entity: 'inspections', entityId: id, action: 'RESTORE' },
      });
      expect(restoreAudit).toBe(1);
    });

    it('needs a reason, an admin, and a submitted record', async () => {
      const { id } = await submitInspection(false);
      for (const user of [inspector, supervisor]) {
        await ctx
          .http()
          .delete(api(`/inspections/${id}`))
          .set('Authorization', bearer(user))
          .send({ reason: REASON })
          .expect(403);
      }
      await ctx
        .http()
        .delete(api(`/inspections/${id}`))
        .set('Authorization', bearer(admin))
        .send({ reason: 'no' })
        .expect(422);
      await ctx.http().delete(api(`/inspections/${id}`)).set('Authorization', bearer(admin)).expect(422);
      await ctx
        .http()
        .post(api(`/inspections/${id}/restore`))
        .set('Authorization', bearer(admin))
        .send({ reason: REASON })
        .expect(409);
    });

    it('treats a re-pushed deleted inspection as already handled', async () => {
      const { id } = await submitInspection(false);
      await ctx
        .http()
        .delete(api(`/inspections/${id}`))
        .set('Authorization', bearer(admin))
        .send({ reason: REASON })
        .expect(204);
      const now = Date.now();
      const response = await ctx
        .http()
        .post(api('/sync/push'))
        .set('Authorization', bearer(inspector))
        .send({
          lastPulledAt: now,
          changes: {
            inspections: {
              created: [],
              updated: [
                {
                  id,
                  stadium_id: stadium.id,
                  checklist_id: checklist.checklistId,
                  checklist_version_id: checklist.versionId,
                  status: 'SUBMITTED',
                  started_at: now,
                  submitted_at: now,
                  client_created_at: now,
                },
              ],
              deleted: [],
            },
          },
        })
        .expect(201);
      expect(response.body.rejected).toHaveLength(0);
      const row = await ctx.prisma.inspection.findFirst({ where: { id, deletedAt: undefined } });
      expect(row?.deletedAt).toBeTruthy();
    });
  });

  /* ------------------------ observations and findings --------------------- */

  describe('observations and findings', () => {
    it('deletes an observation with its finding, and restores both', async () => {
      const id = await submitObservation();
      const finding = await ctx.prisma.finding.findFirst({ where: { observationId: id } });
      expect(finding).toBeTruthy();
      expect(await kpiSummary()).toMatchObject({ observations: 1, findingsTotal: 1 });

      await ctx
        .http()
        .delete(api(`/observations/${id}`))
        .set('Authorization', bearer(admin))
        .send({ reason: REASON })
        .expect(204);
      expect(await kpiSummary()).toMatchObject({ observations: 0, findingsTotal: 0 });
      await ctx.http().get(api(`/observations/${id}`)).set('Authorization', bearer(inspector)).expect(404);
      const dashboard = await ctx
        .http()
        .get(api(`/kpis/disciplines/${disciplineId}`))
        .query({ from: today, to: today })
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(dashboard.body.totals.observations).toBe(0);

      // The finding cannot be restored on its own while its observation is deleted.
      await ctx
        .http()
        .post(api(`/findings/${finding?.id}/restore`))
        .set('Authorization', bearer(admin))
        .send({ reason: 'Bring it back' })
        .expect(409);

      await ctx
        .http()
        .post(api(`/observations/${id}/restore`))
        .set('Authorization', bearer(admin))
        .send({ reason: 'Deleted by mistake' })
        .expect(200);
      expect(await kpiSummary()).toMatchObject({ observations: 1, findingsTotal: 1 });
    });

    it('corrects every observation field, but keeps the type within its group', async () => {
      const id = await submitObservation();
      const response = await ctx
        .http()
        .patch(api(`/observations/${id}/correct`))
        .set('Authorization', bearer(admin))
        .send({
          reason: 'Inspector picked the wrong type',
          type: 'UNSAFE_ACT',
          locationLabel: 'Gate C',
          immediateAction: 'Area cordoned off',
          responsibleParty: 'Contractor X',
        })
        .expect(200);
      expect(response.body).toMatchObject({
        type: 'UNSAFE_ACT',
        locationLabel: 'Gate C',
        immediateAction: 'Area cordoned off',
      });
      await ctx
        .http()
        .patch(api(`/observations/${id}/correct`))
        .set('Authorization', bearer(admin))
        .send({ reason: 'Make it positive', type: 'POSITIVE' })
        .expect(422);
    });

    it('hides a deleted finding and its corrective actions', async () => {
      const { id } = await submitInspection(true);
      const [findingId] = await findingIdsFor(id);
      await ctx
        .http()
        .post(api(`/findings/${findingId}/actions`))
        .set('Authorization', bearer(admin))
        .send({ assigneeId: inspector.id, action: 'Replace the handrail', dueDate: today })
        .expect(201);
      const mine = await ctx
        .http()
        .get(api('/findings/assigned-to-me'))
        .set('Authorization', bearer(inspector))
        .expect(200);
      expect(mine.body).toHaveLength(1);

      for (const user of [inspector, supervisor]) {
        await ctx
          .http()
          .delete(api(`/findings/${findingId}`))
          .set('Authorization', bearer(user))
          .send({ reason: REASON })
          .expect(403);
      }
      await ctx
        .http()
        .delete(api(`/findings/${findingId}`))
        .set('Authorization', bearer(admin))
        .send({ reason: REASON })
        .expect(204);

      const after = await ctx
        .http()
        .get(api('/findings/assigned-to-me'))
        .set('Authorization', bearer(inspector))
        .expect(200);
      expect(after.body).toHaveLength(0);
      const actions = await ctx.prisma.correctiveAction.count({ where: { findingId } });
      expect(actions).toBe(0);
      const raw = await ctx.prisma.correctiveAction.count({
        where: { findingId, finding: { deletedAt: undefined } },
      });
      expect(raw).toBe(1);
      const edit = await ctx
        .http()
        .patch(api(`/findings/${findingId}`))
        .set('Authorization', bearer(admin))
        .send({ reason: 'Tidy the title', title: 'New title here' })
        .expect(409);
      expect(edit.body.code).toBe(ERROR_CODES.RECORD_DELETED);

      const restored = await ctx
        .http()
        .post(api(`/findings/${findingId}/restore`))
        .set('Authorization', bearer(admin))
        .send({ reason: 'Deleted by mistake' })
        .expect(200);
      expect(restored.body.actions).toHaveLength(1);
    });
  });

  /* ---------------------------------- EOD -------------------------------- */

  describe('EOD reports', () => {
    it('frees the day slot on delete and refuses a restore that would collide', async () => {
      await openEodAllDay();
      const first = await submitEod();
      expect(await kpiSummary()).toMatchObject({ eodSubmitted: 1 });

      await ctx
        .http()
        .delete(api(`/eod/${first}`))
        .set('Authorization', bearer(supervisor))
        .send({ reason: REASON })
        .expect(403);
      await ctx
        .http()
        .delete(api(`/eod/${first}`))
        .set('Authorization', bearer(admin))
        .send({ reason: REASON })
        .expect(204);
      expect(await kpiSummary()).toMatchObject({ eodSubmitted: 0 });
      const compliance = await ctx
        .http()
        .get(api('/eod/compliance'))
        .query({ date: today })
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(compliance.body[0]).toMatchObject({ submitted: false });
      const mine = await ctx
        .http()
        .get(api('/eod/mine'))
        .query({ stadiumId: stadium.id, date: today })
        .set('Authorization', bearer(inspector))
        .expect(200);
      expect(mine.body).toEqual({});

      // The inspector can submit again for the same day.
      const second = await submitEod();
      expect(second).not.toBe(first);

      await ctx
        .http()
        .post(api(`/eod/${first}/restore`))
        .set('Authorization', bearer(admin))
        .send({ reason: 'Deleted by mistake' })
        .expect(409);

      await ctx
        .http()
        .delete(api(`/eod/${second}`))
        .set('Authorization', bearer(admin))
        .send({ reason: REASON })
        .expect(204);
      await ctx
        .http()
        .post(api(`/eod/${first}/restore`))
        .set('Authorization', bearer(admin))
        .send({ reason: 'Deleted by mistake' })
        .expect(200);
      expect(await kpiSummary()).toMatchObject({ eodSubmitted: 1 });
    });

    it('lets an admin correct the weather and the wave-2 fields', async () => {
      await openEodAllDay();
      const id = await submitEod();
      const response = await ctx
        .http()
        .patch(api(`/eod/${id}/correct`))
        .set('Authorization', bearer(admin))
        .send({ reason: 'Inspector typo', weather: 'Hot', firstAidCases: 2, totalSpectators: 100 })
        .expect(200);
      expect(response.body).toMatchObject({ weather: 'Hot', firstAidCases: 2, totalSpectators: 100 });
    });
  });

  /* ------------------------------- catalogue ------------------------------- */

  describe('catalogue deletes', () => {
    it('refuses to delete the active tournament and soft-deletes another', async () => {
      await ctx
        .http()
        .delete(api(`/tournaments/${tournamentId}`))
        .set('Authorization', bearer(admin))
        .expect(409);
      const other = await ctx
        .http()
        .post(api('/tournaments'))
        .set('Authorization', bearer(admin))
        .send({ name: 'Old Cup', startDate: '2025-01-01', endDate: '2025-02-01' })
        .expect(201);
      await ctx
        .http()
        .delete(api(`/tournaments/${other.body.id}`))
        .set('Authorization', bearer(supervisor))
        .expect(403);
      await ctx
        .http()
        .delete(api(`/tournaments/${other.body.id}`))
        .set('Authorization', bearer(admin))
        .send({ reason: 'Created by mistake' })
        .expect(204);
      const list = await ctx.http().get(api('/tournaments')).set('Authorization', bearer(admin)).expect(200);
      expect(list.body.map((row: { id: string }) => row.id)).not.toContain(other.body.id);
      await ctx.http().get(api(`/tournaments/${other.body.id}`)).set('Authorization', bearer(admin)).expect(404);
    });

    it('soft-deletes a discipline without orphaning its observations', async () => {
      const observationId = await submitObservation();
      await ctx
        .http()
        .delete(api(`/disciplines/${disciplineId}`))
        .set('Authorization', bearer(inspector))
        .expect(403);
      await ctx
        .http()
        .delete(api(`/disciplines/${disciplineId}`))
        .set('Authorization', bearer(admin))
        .expect(204);
      const list = await ctx
        .http()
        .get(api('/disciplines'))
        .query({ includeInactive: 'true' })
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(list.body.map((row: { id: string }) => row.id)).not.toContain(disciplineId);
      const observation = await ctx
        .http()
        .get(api(`/observations/${observationId}`))
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(observation.body.disciplineName).toBe('Work at Height');
    });

    it('creates a new checklist version from the previous one, re-minting reused ids', async () => {
      const current = await ctx
        .http()
        .get(api(`/checklists/${checklist.checklistId}`))
        .set('Authorization', bearer(admin))
        .expect(200);
      const sections = current.body.version.sections.map(
        (section: { id: string; title: string; items: { id: string; code: string; question: string }[] }) => ({
          id: section.id,
          title: section.title,
          items: [
            ...section.items.map((item) => ({ id: item.id, code: item.code, question: item.question })),
            { code: 'TST-09', question: 'Is the new question answered?', defaultSeverity: 'LOW', allowNa: false },
          ],
        }),
      );
      const next = await ctx
        .http()
        .post(api(`/checklists/${checklist.checklistId}/versions`))
        .set('Authorization', bearer(admin))
        .send({ sections, publish: true, changeNote: 'Added a question' })
        .expect(201);
      expect(next.body.version.version).toBe(2);
      expect(next.body.version.itemCount).toBe(3);
      const newIds = next.body.version.sections[0].items.map((item: { id: string }) => item.id);
      for (const old of checklist.items) expect(newIds).not.toContain(old.id);
      // Version 1 is untouched.
      const v1 = await ctx
        .http()
        .get(api(`/checklists/versions/${checklist.versionId}`))
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(v1.body.itemCount).toBe(2);

      // A draft-only checklist shows its draft.
      const draft = await ctx
        .http()
        .post(api('/checklists'))
        .set('Authorization', bearer(admin))
        .send({
          title: 'Draft checklist',
          category: 'GENERAL',
          sections: [{ title: 'Section A', items: [{ code: 'DR-01', question: 'Is it a draft?' }] }],
          publish: false,
        })
        .expect(201);
      expect(draft.body.version).toMatchObject({ version: 1, isPublished: false });
      await ctx
        .http()
        .delete(api(`/checklists/${draft.body.id}`))
        .set('Authorization', bearer(admin))
        .send({ reason: 'Not needed after all' })
        .expect(204);
    });
  });

  /* ------------------------------ stadium photo ---------------------------- */

  describe('stadium photo', () => {
    it('presigns, verifies, attaches, serves and removes a photo (admin only)', async () => {
      await ctx
        .http()
        .post(api(`/stadiums/${stadium.id}/image/presign`))
        .set('Authorization', bearer(supervisor))
        .send({ contentType: 'image/jpeg', sizeBytes: 1000 })
        .expect(403);
      await ctx
        .http()
        .post(api(`/stadiums/${stadium.id}/image/presign`))
        .set('Authorization', bearer(admin))
        .send({ contentType: 'image/gif', sizeBytes: 1000 })
        .expect(422);
      await ctx
        .http()
        .post(api(`/stadiums/${stadium.id}/image/presign`))
        .set('Authorization', bearer(admin))
        .send({ contentType: 'image/jpeg', sizeBytes: 9 * 1024 * 1024 })
        .expect(422);

      const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
      const presign = await ctx
        .http()
        .post(api(`/stadiums/${stadium.id}/image/presign`))
        .set('Authorization', bearer(admin))
        .send({ contentType: 'image/jpeg', sizeBytes: bytes.length })
        .expect(201);
      expect(presign.body.objectKey).toMatch(new RegExp(`^stadiums/${stadium.id}/`));

      // Not uploaded yet.
      const early = await ctx
        .http()
        .put(api(`/stadiums/${stadium.id}/image`))
        .set('Authorization', bearer(admin))
        .send({ objectKey: presign.body.objectKey })
        .expect(409);
      expect(early.body.code).toBe(ERROR_CODES.OBJECT_NOT_UPLOADED);
      // Someone else's key.
      await ctx
        .http()
        .put(api(`/stadiums/${stadium.id}/image`))
        .set('Authorization', bearer(admin))
        .send({ objectKey: `evidence/${stadium.id}/x.jpg` })
        .expect(422);

      const put = await fetch(presign.body.uploadUrl as string, {
        method: 'PUT',
        headers: presign.body.headers as Record<string, string>,
        body: bytes,
      });
      expect(put.ok).toBe(true);

      const attached = await ctx
        .http()
        .put(api(`/stadiums/${stadium.id}/image`))
        .set('Authorization', bearer(admin))
        .send({ objectKey: presign.body.objectKey })
        .expect(200);
      expect(attached.body.imageUrl).toMatch(/^https?:\/\//);
      expect(attached.body.imageUpdatedAt).toBeTruthy();

      const asInspector = await ctx
        .http()
        .get(api('/kpis/stadium-cards'))
        .set('Authorization', bearer(inspector))
        .expect(200);
      expect(asInspector.body[0].imageUrl).toMatch(/^https?:\/\//);
      const image = await fetch(asInspector.body[0].imageUrl as string);
      expect(image.ok).toBe(true);

      const removed = await ctx
        .http()
        .delete(api(`/stadiums/${stadium.id}/image`))
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(removed.body.imageUrl).toBeNull();
    });

    it('shows inactive stadiums to an admin only', async () => {
      await ctx.prisma.stadium.update({ where: { id: stadium.id }, data: { isActive: false } });
      const adminCards = await ctx
        .http()
        .get(api('/kpis/stadium-cards'))
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(adminCards.body).toEqual([
        expect.objectContaining({ stadiumId: stadium.id, isActive: false, imageUrl: null }),
      ]);
      const inspectorCards = await ctx
        .http()
        .get(api('/kpis/stadium-cards'))
        .set('Authorization', bearer(inspector))
        .expect(200);
      expect(inspectorCards.body).toEqual([]);
    });
  });

  /* --------------------------- reports and AI ------------------------------ */

  describe('reports and AI insights', () => {
    it('deletes a report row (admin only) and refuses a running one', async () => {
      const id = uuidv7();
      const running = uuidv7();
      for (const [reportId, status] of [
        [id, 'COMPLETED'],
        [running, 'RUNNING'],
      ] as const) {
        await ctx.prisma.report.create({
          data: {
            id: reportId,
            type: 'WEEKLY',
            tournamentId,
            periodStart: new Date(`${today}T00:00:00.000Z`),
            periodEnd: new Date(`${today}T00:00:00.000Z`),
            status,
            objectKey: `reports/${tournamentId}/weekly/ALL-${today}-${reportId}.pdf`,
            requestedById: admin.id,
          },
        });
      }
      await ctx.http().delete(api(`/reports/${id}`)).set('Authorization', bearer(supervisor)).expect(403);
      await ctx.http().delete(api(`/reports/${running}`)).set('Authorization', bearer(admin)).expect(409);
      await ctx
        .http()
        .delete(api(`/reports/${id}`))
        .set('Authorization', bearer(admin))
        .send({ reason: 'Wrong period' })
        .expect(204);
      expect(await ctx.prisma.report.count({ where: { id } })).toBe(0);
      expect(
        await ctx.prisma.auditLog.count({ where: { entity: 'reports', entityId: id, action: 'DELETE' } }),
      ).toBe(1);
    });

    it('deletes an AI insight (admin only)', async () => {
      const id = uuidv7();
      await ctx.prisma.aiInsight.create({
        data: {
          id,
          kind: 'TREND_SUMMARY',
          tournamentId,
          periodStart: new Date(`${today}T00:00:00.000Z`),
          periodEnd: new Date(`${today}T00:00:00.000Z`),
          title: 'Trend',
          body: 'Compliance is improving across stadiums.',
          bullets: [],
          model: 'local',
          promptVersion: 'v1',
        },
      });
      await ctx.http().delete(api(`/ai/insights/${id}`)).set('Authorization', bearer(inspector)).expect(403);
      await ctx.http().delete(api(`/ai/insights/${id}`)).set('Authorization', bearer(admin)).expect(204);
      expect(await ctx.prisma.aiInsight.count({ where: { id } })).toBe(0);
    });
  });
});
