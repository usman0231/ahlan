import { ERROR_CODES, uuidv7, zonedDateString } from '@ahlan/shared';

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
 * The end-to-end rule set that matters most: submit an inspection, have a NO
 * raise a finding, walk that finding to CLOSED, and prove an inspector cannot
 * reach another stadium's data along the way.
 */
describe('Inspections, findings and scoping (e2e)', () => {
  let ctx: TestContext;
  let admin: SeededUser;
  let inspector: SeededUser;
  let otherInspector: SeededUser;
  let stadium: { id: string; code: string; timezone: string };
  let otherStadium: { id: string; code: string; timezone: string };
  let checklist: SeededChecklist;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await ctx.prisma.truncateAll();
    await seedTournament(ctx);
    stadium = await seedStadium(ctx, { code: 'AAA' });
    otherStadium = await seedStadium(ctx, { code: 'BBB' });
    admin = await seedUser(ctx, { role: 'ADMIN' });
    inspector = await seedUser(ctx, { role: 'INSPECTOR', stadiumIds: [stadium.id] });
    otherInspector = await seedUser(ctx, {
      role: 'INSPECTOR',
      stadiumIds: [otherStadium.id],
    });
    checklist = await seedChecklist(ctx, 2);
  });

  afterAll(async () => {
    await ctx.close();
  });

  function submitBody(
    answers: { value: 'YES' | 'NO' | 'NA'; evidenceIds?: string[] }[],
    overrides: Record<string, unknown> = {},
  ) {
    const now = new Date().toISOString();
    return {
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
        value: answers[index]?.value ?? 'YES',
        evidenceIds: answers[index]?.evidenceIds ?? [],
        answeredAt: now,
      })),
      ...overrides,
    };
  }

  it('submits a fully compliant inspection and locks it', async () => {
    const response = await ctx
      .http()
      .post(api('/inspections/submit'))
      .set('Authorization', bearer(inspector))
      .send(submitBody([{ value: 'YES' }, { value: 'YES' }]))
      .expect(201);

    expect(response.body).toMatchObject({
      status: 'SUBMITTED',
      yesCount: 2,
      noCount: 0,
      compliancePercent: 100,
      isLocked: true,
    });
    expect(response.body.serverReceivedAt).toBeTruthy();
    expect(await ctx.prisma.finding.count()).toBe(0);
  });

  it('excludes NA from compliance', async () => {
    const photo = await seedUploadedEvidence(ctx, {
      uploadedById: inspector.id,
      stadiumId: stadium.id,
    });

    const response = await ctx
      .http()
      .post(api('/inspections/submit'))
      .set('Authorization', bearer(inspector))
      .send(submitBody([{ value: 'NO', evidenceIds: [photo] }, { value: 'NA' }]))
      .expect(201);

    // 0 YES, 1 NO, 1 NA -> 0%, not 50%
    expect(response.body.compliancePercent).toBe(0);
    expect(response.body.naCount).toBe(1);
  });

  it('rejects a NO without a photo', async () => {
    const response = await ctx
      .http()
      .post(api('/inspections/submit'))
      .set('Authorization', bearer(inspector))
      .send(submitBody([{ value: 'NO', evidenceIds: [] }, { value: 'YES' }]))
      .expect(422);

    expect(response.body.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    expect(JSON.stringify(response.body.details)).toMatch(/at least one photo/i);
    expect(await ctx.prisma.inspection.count()).toBe(0);
  });

  it('rejects an incomplete checklist', async () => {
    const body = submitBody([{ value: 'YES' }, { value: 'YES' }]);
    body.responses = body.responses.slice(0, 1);

    const response = await ctx
      .http()
      .post(api('/inspections/submit'))
      .set('Authorization', bearer(inspector))
      .send(body)
      .expect(400);

    expect(response.body.code).toBe(ERROR_CODES.INCOMPLETE_CHECKLIST);
  });

  it('raises exactly one finding per NO, with a printable reference', async () => {
    const photo = await seedUploadedEvidence(ctx, {
      uploadedById: inspector.id,
      stadiumId: stadium.id,
    });

    await ctx
      .http()
      .post(api('/inspections/submit'))
      .set('Authorization', bearer(inspector))
      .send(submitBody([{ value: 'NO', evidenceIds: [photo] }, { value: 'YES' }]))
      .expect(201);

    const findings = await ctx.prisma.finding.findMany();
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      status: 'OPEN',
      source: 'INSPECTION',
      severity: 'HIGH', // the item default
      reference: `F-${stadium.code}-00001`,
    });
  });

  it('is idempotent on a retried submit', async () => {
    const body = submitBody([{ value: 'YES' }, { value: 'YES' }]);

    await ctx
      .http()
      .post(api('/inspections/submit'))
      .set('Authorization', bearer(inspector))
      .send(body)
      .expect(201);

    await ctx
      .http()
      .post(api('/inspections/submit'))
      .set('Authorization', bearer(inspector))
      .send(body)
      .expect(201);

    expect(await ctx.prisma.inspection.count()).toBe(1);
    expect(await ctx.prisma.inspectionResponse.count()).toBe(2);
  });

  it('stamps the stadium-local date', async () => {
    const response = await ctx
      .http()
      .post(api('/inspections/submit'))
      .set('Authorization', bearer(inspector))
      .send(submitBody([{ value: 'YES' }, { value: 'YES' }]))
      .expect(201);

    expect(response.body.localDate).toBe(zonedDateString(new Date(), stadium.timezone));
  });

  describe('stadium scoping', () => {
    it('refuses a submit for a stadium the inspector is not assigned to', async () => {
      const response = await ctx
        .http()
        .post(api('/inspections/submit'))
        .set('Authorization', bearer(inspector))
        .send(submitBody([{ value: 'YES' }, { value: 'YES' }], { stadiumId: otherStadium.id }))
        .expect(403);

      expect(response.body.code).toBe(ERROR_CODES.STADIUM_OUT_OF_SCOPE);
    });

    it("hides another stadium's inspection from the list", async () => {
      await ctx
        .http()
        .post(api('/inspections/submit'))
        .set('Authorization', bearer(inspector))
        .send(submitBody([{ value: 'YES' }, { value: 'YES' }]))
        .expect(201);

      const mine = await ctx
        .http()
        .get(api('/inspections'))
        .set('Authorization', bearer(inspector))
        .expect(200);
      expect(mine.body.items).toHaveLength(1);

      const theirs = await ctx
        .http()
        .get(api('/inspections'))
        .set('Authorization', bearer(otherInspector))
        .expect(200);
      expect(theirs.body.items).toHaveLength(0);
    });

    it("refuses to read another stadium's inspection by id", async () => {
      const created = await ctx
        .http()
        .post(api('/inspections/submit'))
        .set('Authorization', bearer(inspector))
        .send(submitBody([{ value: 'YES' }, { value: 'YES' }]))
        .expect(201);

      await ctx
        .http()
        .get(api(`/inspections/${created.body.id}`))
        .set('Authorization', bearer(otherInspector))
        .expect(403);
    });

    it('lets an admin see every stadium', async () => {
      await ctx
        .http()
        .post(api('/inspections/submit'))
        .set('Authorization', bearer(inspector))
        .send(submitBody([{ value: 'YES' }, { value: 'YES' }]))
        .expect(201);

      const response = await ctx
        .http()
        .get(api('/inspections'))
        .set('Authorization', bearer(admin))
        .expect(200);

      expect(response.body.items).toHaveLength(1);
    });

    it('does not let a stadium filter widen an inspector’s scope', async () => {
      await ctx
        .http()
        .get(api('/inspections'))
        .query({ stadiumId: otherStadium.id })
        .set('Authorization', bearer(inspector))
        .expect(403);
    });
  });

  describe('the corrective action lifecycle', () => {
    async function raiseFinding(): Promise<string> {
      const photo = await seedUploadedEvidence(ctx, {
        uploadedById: inspector.id,
        stadiumId: stadium.id,
      });
      await ctx
        .http()
        .post(api('/inspections/submit'))
        .set('Authorization', bearer(inspector))
        .send(submitBody([{ value: 'NO', evidenceIds: [photo] }, { value: 'YES' }]))
        .expect(201);

      const finding = await ctx.prisma.finding.findFirstOrThrow();
      return finding.id;
    }

    it('walks OPEN -> ACTION_ASSIGNED -> IN_PROGRESS -> PENDING_VERIFICATION -> CLOSED', async () => {
      const findingId = await raiseFinding();

      const assigned = await ctx
        .http()
        .post(api(`/findings/${findingId}/actions`))
        .set('Authorization', bearer(admin))
        .send({
          assigneeId: inspector.id,
          action: 'Fit the missing guardrail and photograph it.',
          dueDate: '2026-12-01',
        })
        .expect(201);

      expect(assigned.body.status).toBe('ACTION_ASSIGNED');
      const actionId = assigned.body.actions[0].id as string;

      const started = await ctx
        .http()
        .post(api(`/corrective-actions/${actionId}/transition`))
        .set('Authorization', bearer(inspector))
        .send({ to: 'IN_PROGRESS', evidenceIds: [] })
        .expect(201);
      expect(started.body.status).toBe('IN_PROGRESS');

      const awaiting = await ctx
        .http()
        .post(api(`/corrective-actions/${actionId}/transition`))
        .set('Authorization', bearer(inspector))
        .send({ to: 'PENDING_VERIFICATION', evidenceIds: [] })
        .expect(201);
      expect(awaiting.body.status).toBe('PENDING_VERIFICATION');

      const closurePhoto = await seedUploadedEvidence(ctx, {
        uploadedById: admin.id,
        stadiumId: stadium.id,
      });

      const closed = await ctx
        .http()
        .post(api(`/corrective-actions/${actionId}/transition`))
        .set('Authorization', bearer(admin))
        .send({ to: 'CLOSED', note: 'Verified on site.', evidenceIds: [closurePhoto] })
        .expect(201);

      expect(closed.body.status).toBe('CLOSED');
      expect(closed.body.closedAt).toBeTruthy();
    });

    it('will not let an inspector close an action', async () => {
      const findingId = await raiseFinding();

      const assigned = await ctx
        .http()
        .post(api(`/findings/${findingId}/actions`))
        .set('Authorization', bearer(admin))
        .send({ assigneeId: inspector.id, action: 'Fix it.', dueDate: '2026-12-01' })
        .expect(201);
      const actionId = assigned.body.actions[0].id as string;

      await ctx
        .http()
        .post(api(`/corrective-actions/${actionId}/transition`))
        .set('Authorization', bearer(inspector))
        .send({ to: 'IN_PROGRESS', evidenceIds: [] })
        .expect(201);
      await ctx
        .http()
        .post(api(`/corrective-actions/${actionId}/transition`))
        .set('Authorization', bearer(inspector))
        .send({ to: 'PENDING_VERIFICATION', evidenceIds: [] })
        .expect(201);

      const photo = await seedUploadedEvidence(ctx, {
        uploadedById: inspector.id,
        stadiumId: stadium.id,
      });

      const response = await ctx
        .http()
        .post(api(`/corrective-actions/${actionId}/transition`))
        .set('Authorization', bearer(inspector))
        .send({ to: 'CLOSED', evidenceIds: [photo] })
        .expect(409);

      expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN);
    });

    it('will not close without closure evidence', async () => {
      const findingId = await raiseFinding();

      const assigned = await ctx
        .http()
        .post(api(`/findings/${findingId}/actions`))
        .set('Authorization', bearer(admin))
        .send({ assigneeId: inspector.id, action: 'Fix it.', dueDate: '2026-12-01' })
        .expect(201);
      const actionId = assigned.body.actions[0].id as string;

      await ctx
        .http()
        .post(api(`/corrective-actions/${actionId}/transition`))
        .set('Authorization', bearer(admin))
        .send({ to: 'IN_PROGRESS', evidenceIds: [] })
        .expect(201);
      await ctx
        .http()
        .post(api(`/corrective-actions/${actionId}/transition`))
        .set('Authorization', bearer(admin))
        .send({ to: 'PENDING_VERIFICATION', evidenceIds: [] })
        .expect(201);

      const response = await ctx
        .http()
        .post(api(`/corrective-actions/${actionId}/transition`))
        .set('Authorization', bearer(admin))
        .send({ to: 'CLOSED', evidenceIds: [] })
        .expect(409);

      expect(response.body.code).toBe(ERROR_CODES.CLOSURE_EVIDENCE_REQUIRED);
    });

    it('rejects skipping straight to CLOSED', async () => {
      const findingId = await raiseFinding();
      const photo = await seedUploadedEvidence(ctx, {
        uploadedById: admin.id,
        stadiumId: stadium.id,
      });

      const assigned = await ctx
        .http()
        .post(api(`/findings/${findingId}/actions`))
        .set('Authorization', bearer(admin))
        .send({ assigneeId: inspector.id, action: 'Fix it.', dueDate: '2026-12-01' })
        .expect(201);
      const actionId = assigned.body.actions[0].id as string;

      const response = await ctx
        .http()
        .post(api(`/corrective-actions/${actionId}/transition`))
        .set('Authorization', bearer(admin))
        .send({ to: 'CLOSED', evidenceIds: [photo] })
        .expect(409);

      expect(response.body.code).toBe(ERROR_CODES.INVALID_STATUS_TRANSITION);
    });

    it('derives OVERDUE from the due date rather than storing it', async () => {
      const findingId = await raiseFinding();

      await ctx
        .http()
        .post(api(`/findings/${findingId}/actions`))
        .set('Authorization', bearer(admin))
        .send({ assigneeId: inspector.id, action: 'Fix it.', dueDate: '2020-01-01' })
        .expect(201);

      const response = await ctx
        .http()
        .get(api(`/findings/${findingId}`))
        .set('Authorization', bearer(admin))
        .expect(200);

      expect(response.body.isOverdue).toBe(true);
      expect(response.body.status).toBe('ACTION_ASSIGNED');
      expect(response.body.actions[0].isOverdue).toBe(true);

      const overdueOnly = await ctx
        .http()
        .get(api('/findings'))
        .query({ overdueOnly: true })
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(overdueOnly.body.items).toHaveLength(1);
    });

    it('keeps assignment admin-only', async () => {
      const findingId = await raiseFinding();

      await ctx
        .http()
        .post(api(`/findings/${findingId}/actions`))
        .set('Authorization', bearer(inspector))
        .send({ assigneeId: inspector.id, action: 'Self-assigning.', dueDate: '2026-12-01' })
        .expect(403);
    });
  });

  describe('locking and admin correction', () => {
    it('refuses an inspector editing a submitted inspection', async () => {
      const created = await ctx
        .http()
        .post(api('/inspections/submit'))
        .set('Authorization', bearer(inspector))
        .send(submitBody([{ value: 'YES' }, { value: 'YES' }]))
        .expect(201);

      const response = await ctx
        .http()
        .put(api(`/inspections/${created.body.id}/draft`))
        .set('Authorization', bearer(inspector))
        .send({ responses: [], notes: 'trying to edit' })
        .expect(409);

      expect(response.body.code).toBe(ERROR_CODES.RECORD_LOCKED);
    });

    it('lets an admin correct it with a reason, and audits the change', async () => {
      const created = await ctx
        .http()
        .post(api('/inspections/submit'))
        .set('Authorization', bearer(inspector))
        .send(submitBody([{ value: 'YES' }, { value: 'YES' }]))
        .expect(201);

      const responseId = created.body.responses[0].id as string;

      const corrected = await ctx
        .http()
        .patch(api(`/inspections/${created.body.id}/correct`))
        .set('Authorization', bearer(admin))
        .send({
          reason: 'Inspector confirmed WAH-01 was answered in error.',
          responses: [{ id: responseId, value: 'NA' }],
        })
        .expect(200);

      // 1 YES, 0 NO, 1 NA -> still 100%, but the counts moved.
      expect(corrected.body.yesCount).toBe(1);
      expect(corrected.body.naCount).toBe(1);

      const audit = await ctx.prisma.auditLog.findMany({
        where: { entity: 'inspections', action: 'ADMIN_CORRECTION' },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]?.reason).toMatch(/answered in error/);
      expect(audit[0]?.diff).toBeTruthy();
    });

    it('requires a reason for a correction', async () => {
      const created = await ctx
        .http()
        .post(api('/inspections/submit'))
        .set('Authorization', bearer(inspector))
        .send(submitBody([{ value: 'YES' }, { value: 'YES' }]))
        .expect(201);

      await ctx
        .http()
        .patch(api(`/inspections/${created.body.id}/correct`))
        .set('Authorization', bearer(admin))
        .send({ responses: [] })
        .expect(422);
    });
  });
});
