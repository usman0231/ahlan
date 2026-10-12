import { ERROR_CODES, uuidv7, zonedDateString } from '@ahlan/shared';

import {
  api,
  bearer,
  createTestApp,
  seedChecklist,
  seedStadium,
  seedTournament,
  seedUser,
  type SeededChecklist,
  type SeededUser,
  type TestContext,
} from './helpers';

/**
 * Wave 2 (client mockups): the extended EOD form, the recurring EOD window
 * default, stadium cards, checklist completion and the discipline dashboard -
 * each with its stadium scoping.
 */
describe('Wave 2 client requirements (e2e)', () => {
  let ctx: TestContext;
  let admin: SeededUser;
  let inspector: SeededUser;
  let supervisor: SeededUser;
  let stadium: { id: string; code: string; timezone: string };
  let other: { id: string; code: string; timezone: string };
  let today: string;
  let tournamentId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await ctx.prisma.truncateAll();
    tournamentId = await seedTournament(ctx);
    stadium = await seedStadium(ctx, { code: 'WAV', timezone: 'UTC' });
    other = await seedStadium(ctx, { code: 'OTH', timezone: 'UTC' });
    admin = await seedUser(ctx, { role: 'ADMIN' });
    inspector = await seedUser(ctx, { role: 'INSPECTOR', stadiumIds: [stadium.id] });
    supervisor = await seedUser(ctx, { role: 'SUPERVISOR', stadiumIds: [stadium.id] });
    today = zonedDateString(new Date(), 'UTC');
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** A global default that is open all day, so submission is about the payload. */
  async function openAllDay(): Promise<void> {
    await ctx
      .http()
      .put(api('/eod/window-default'))
      .set('Authorization', bearer(admin))
      .send({ startTime: '00:00', endTime: '23:59', enabled: true })
      .expect(200);
  }

  async function readiness(count: number): Promise<SeededChecklist[]> {
    const lists: SeededChecklist[] = [];
    for (let n = 0; n < count; n += 1) {
      const checklist = await seedChecklist(ctx, 2);
      await ctx.prisma.checklist.update({
        where: { id: checklist.checklistId },
        data: { category: 'READINESS', title: `Readiness ${n + 1}` },
      });
      lists.push(checklist);
    }
    return lists;
  }

  async function submittedInspection(
    checklist: SeededChecklist,
    stadiumId: string,
    inspectorId: string,
  ): Promise<string> {
    const id = uuidv7();
    const now = new Date();
    await ctx.prisma.inspection.create({
      data: {
        id,
        stadiumId,
        tournamentId,
        checklistId: checklist.checklistId,
        checklistVersionId: checklist.versionId,
        inspectorId,
        status: 'SUBMITTED',
        localDate: new Date(`${today}T00:00:00.000Z`),
        startedAt: now,
        clientCreatedAt: now,
        submittedAt: now,
        serverReceivedAt: now,
        yesCount: 1,
        noCount: 1,
        compliancePercent: '50.00',
        isLocked: true,
        responses: {
          create: checklist.items.map((item, index) => ({
            id: uuidv7(),
            itemId: item.id,
            itemCode: item.code,
            value: index === 0 ? 'YES' : 'NO',
            answeredAt: now,
          })),
        },
      },
    });
    return id;
  }

  /* ------------------------------- EOD form ------------------------------ */

  describe('EOD with the new form fields', () => {
    function body(overrides: Record<string, unknown> = {}) {
      const now = new Date().toISOString();
      return {
        id: uuidv7(),
        stadiumId: stadium.id,
        date: today,
        submittedAt: now,
        clientCreatedAt: now,
        workforce: [
          { category: 'Stewards', personnel: 120, hours: '8.50', manHours: '1.00' },
          { category: 'Volunteers', personnel: 30, hours: 6 },
        ],
        totalSpectators: 41000,
        workRelatedMedical: 1,
        nonWorkRelatedMedical: 3,
        firstAidCases: 9,
        fireIncidents: 0,
        otherIncidents: 1,
        hseObservationsReported: 4,
        summary: 'Gates opened on time and the match ran without a major incident.',
        concerns: 'Queueing at Gate C.',
        actionsMitigation: 'Two extra stewards moved to Gate C.',
        plannedTomorrow: 'Post-match walk-through.',
        additionalRemarks: 'Hot afternoon.',
        evidenceIds: [],
        ...overrides,
      };
    }

    it('stores the new fields and recomputes man-hours server-side', async () => {
      await openAllDay();
      const response = await ctx
        .http()
        .post(api('/eod/submit'))
        .set('Authorization', bearer(inspector))
        .send(body())
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'SUBMITTED',
        totalHeadcount: 150,
        // 120 x 8.50 + 30 x 6.00; the device's "1.00" is ignored
        totalManHours: '1200.00',
        totalSpectators: 41000,
        workRelatedMedical: 1,
        recordableIncidents: 1,
        nonWorkRelatedMedical: 3,
        firstAidCases: 9,
        otherIncidents: 1,
        hseObservationsReported: 4,
        actionsMitigation: 'Two extra stewards moved to Gate C.',
        additionalRemarks: 'Hot afternoon.',
      });
      expect(response.body.workforce).toEqual([
        { category: 'Stewards', personnel: 120, hours: '8.50', manHours: '1020.00' },
        { category: 'Volunteers', personnel: 30, hours: '6.00', manHours: '180.00' },
      ]);
    });

    it('rejects a report date older than yesterday', async () => {
      await openAllDay();
      const old = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
      const response = await ctx
        .http()
        .post(api('/eod/submit'))
        .set('Authorization', bearer(inspector))
        .send(body({ date: old }))
        .expect(400);
      expect(response.body.code).toBe(ERROR_CODES.EOD_DATE_NOT_ALLOWED);
    });

    it('rejects hours above 24', async () => {
      await openAllDay();
      await ctx
        .http()
        .post(api('/eod/submit'))
        .set('Authorization', bearer(inspector))
        .send(body({ workforce: [{ category: 'Stewards', personnel: 1, hours: '25' }] }))
        .expect(422);
    });

    it('accepts a legacy report pushed through sync and returns workforce_json on pull', async () => {
      await openAllDay();
      const id = uuidv7();
      const push = await ctx
        .http()
        .post(api('/sync/push'))
        .set('Authorization', bearer(inspector))
        .send({
          lastPulledAt: 0,
          changes: {
            eod_reports: {
              created: [
                {
                  id,
                  stadium_id: stadium.id,
                  date: today,
                  status: 'SUBMITTED',
                  submitted_at: Date.now(),
                  client_created_at: Date.now(),
                  workforce_json: JSON.stringify([
                    { contractor: 'Alpha', headcount: 24, manHours: '192.00' },
                  ]),
                  recordable_incidents: 2,
                  near_misses: 0,
                  summary: 'Legacy build report with enough text.',
                },
              ],
              updated: [],
              deleted: [],
            },
          },
        })
        .expect(201);
      expect(push.body).toMatchObject({ rejected: [], accepted: 1 });

      const pull = await ctx
        .http()
        .get(api('/sync/pull'))
        .query({ lastPulledAt: 0 })
        .set('Authorization', bearer(inspector))
        .expect(200);
      const record = pull.body.changes.eod_reports.updated.find(
        (row: { id: string }) => row.id === id,
      );
      expect(record).toMatchObject({
        total_headcount: 24,
        total_man_hours: '192.00',
        work_related_medical: 2,
        recordable_incidents: 2,
      });
      expect(JSON.parse(record.workforce_json)).toEqual([
        { category: 'Alpha', personnel: 24, hours: '8.00', manHours: '192.00' },
      ]);
      expect(pull.body.changes.eod_window_defaults.updated).toHaveLength(1);
      expect(pull.body.changes.eod_window_defaults.updated[0]).toMatchObject({
        stadium_id: null,
        start_time: '00:00',
        end_time: '23:59',
        enabled: true,
      });
    });

    it('a disabled default closes submission', async () => {
      await ctx
        .http()
        .put(api('/eod/window-default'))
        .set('Authorization', bearer(admin))
        .send({ startTime: '00:00', endTime: '23:59', enabled: false })
        .expect(200);
      const response = await ctx
        .http()
        .post(api('/eod/submit'))
        .set('Authorization', bearer(inspector))
        .send(body())
        .expect(400);
      expect(response.body.code).toBe(ERROR_CODES.EOD_WINDOW_CLOSED);
    });
  });

  /* ---------------------------- window default --------------------------- */

  describe('EOD window default', () => {
    it('reports DISABLED with the fallback times before anything is saved', async () => {
      const response = await ctx
        .http()
        .get(api('/eod/window-default'))
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(response.body).toMatchObject({
        stadiumId: null,
        startTime: '18:00',
        endTime: '23:00',
        enabled: false,
        status: 'DISABLED',
        timezone: 'Asia/Riyadh',
        updatedAt: null,
      });
    });

    it('lets the admin save it once and update it in place, audited', async () => {
      const first = await ctx
        .http()
        .put(api('/eod/window-default'))
        .set('Authorization', bearer(admin))
        .send({ startTime: '00:00', endTime: '23:59', enabled: true })
        .expect(200);
      expect(first.body).toMatchObject({ enabled: true, status: 'OPEN' });

      await ctx
        .http()
        .put(api('/eod/window-default'))
        .set('Authorization', bearer(admin))
        .send({ startTime: '18:00', endTime: '23:30', enabled: true })
        .expect(200);

      expect(await ctx.prisma.eodWindowDefault.count()).toBe(1);
      const read = await ctx
        .http()
        .get(api('/eod/window-default'))
        .set('Authorization', bearer(inspector))
        .expect(200);
      expect(read.body).toMatchObject({ startTime: '18:00', endTime: '23:30' });
      expect(read.body.updatedAt).toBeTruthy();
      expect(
        await ctx.prisma.auditLog.count({ where: { entity: 'eod_window_defaults' } }),
      ).toBe(2);
    });

    it('is admin-only to change', async () => {
      for (const user of [inspector, supervisor]) {
        await ctx
          .http()
          .put(api('/eod/window-default'))
          .set('Authorization', bearer(user))
          .send({ startTime: '18:00', endTime: '23:00', enabled: true })
          .expect(403);
      }
    });

    it('keeps a stadium query in scope', async () => {
      await ctx
        .http()
        .get(api('/eod/window-default'))
        .query({ stadiumId: other.id })
        .set('Authorization', bearer(inspector))
        .expect(403);
    });
  });

  /* ----------------------------- stadium cards --------------------------- */

  describe('stadium cards', () => {
    it('shows readiness progress, open findings and assigned inspectors', async () => {
      const lists = await readiness(3);
      await submittedInspection(lists[0]!, stadium.id, inspector.id);
      await submittedInspection(lists[0]!, stadium.id, inspector.id); // same checklist twice
      await submittedInspection(lists[1]!, stadium.id, inspector.id);

      const response = await ctx
        .http()
        .get(api('/kpis/stadium-cards'))
        .set('Authorization', bearer(admin))
        .expect(200);

      const cards = response.body as { code: string }[];
      expect(cards.map((card) => card.code).sort()).toEqual(['OTH', 'WAV']);
      expect(cards.find((card) => card.code === 'WAV')).toMatchObject({
        date: today,
        checklistsDone: 2,
        checklistsExpected: 3,
        progressPercent: 66.67,
        compliancePercent: 50,
        assignedInspectors: [{ id: inspector.id }],
      });
      expect(cards.find((card) => card.code === 'OTH')).toMatchObject({
        checklistsDone: 0,
        checklistsExpected: 3,
        compliancePercent: null,
        assignedInspectors: [],
      });
    });

    it('is scoped for inspectors and supervisors', async () => {
      for (const user of [inspector, supervisor]) {
        const response = await ctx
          .http()
          .get(api('/kpis/stadium-cards'))
          .set('Authorization', bearer(user))
          .expect(200);
        expect((response.body as { stadiumId: string }[]).map((card) => card.stadiumId)).toEqual([
          stadium.id,
        ]);
      }
    });
  });

  /* -------------------------- checklist completion ----------------------- */

  describe('checklist completion', () => {
    it('lists expected / completed / pending per inspector', async () => {
      const lists = await readiness(2);
      const otherInspector = await seedUser(ctx, { role: 'INSPECTOR', stadiumIds: [other.id] });
      const inspectionId = await submittedInspection(lists[0]!, stadium.id, inspector.id);

      const response = await ctx
        .http()
        .get(api('/checklists/completion'))
        .query({ date: today })
        .set('Authorization', bearer(admin))
        .expect(200);

      const rows = response.body as {
        checklistId: string;
        expected: number;
        completed: number;
        pending: number;
        inspectors: { userId: string; status: string; inspectionId: string | null }[];
      }[];
      expect(rows).toHaveLength(2);
      const first = rows.find((row) => row.checklistId === lists[0]!.checklistId)!;
      expect(first).toMatchObject({ expected: 2, completed: 1, pending: 1 });
      expect(first.inspectors.find((row) => row.userId === inspector.id)).toMatchObject({
        status: 'COMPLETED',
        inspectionId,
      });
      expect(first.inspectors.find((row) => row.userId === otherInspector.id)?.status).toBe('PENDING');
    });

    it('is scoped for a supervisor and closed to inspectors', async () => {
      await readiness(1);
      await seedUser(ctx, { role: 'INSPECTOR', stadiumIds: [other.id] });

      const response = await ctx
        .http()
        .get(api('/checklists/completion'))
        .set('Authorization', bearer(supervisor))
        .expect(200);
      expect(response.body[0]).toMatchObject({ expected: 1 });
      expect(response.body[0].inspectors[0].userId).toBe(inspector.id);

      await ctx
        .http()
        .get(api('/checklists/completion'))
        .query({ stadiumId: other.id })
        .set('Authorization', bearer(supervisor))
        .expect(403);

      await ctx
        .http()
        .get(api('/checklists/completion'))
        .set('Authorization', bearer(inspector))
        .expect(403);
    });
  });

  /* ------------------------- discipline dashboard ------------------------ */

  describe('discipline dashboard', () => {
    it('returns the dashboard and keeps stadium queries in scope', async () => {
      const disciplineId = uuidv7();
      await ctx.prisma.discipline.create({
        data: {
          id: disciplineId,
          slug: 'excavation',
          name: 'Excavation',
          description: 'Excavations, trenches, access, barriers and ground conditions.',
        },
      });
      const now = new Date();
      for (const [stadiumId, type] of [
        [stadium.id, 'NEAR_MISS'],
        [other.id, 'UNSAFE_ACT'],
      ] as const) {
        await ctx.prisma.observation.create({
          data: {
            id: uuidv7(),
            stadiumId,
            tournamentId,
            disciplineId,
            inspectorId: inspector.id,
            type,
            title: 'Open trench',
            description: 'Barrier missing',
            status: 'SUBMITTED',
            localDate: new Date(`${today}T00:00:00.000Z`),
            observedAt: now,
            clientCreatedAt: now,
            submittedAt: now,
            isLocked: true,
          },
        });
      }

      const adminView = await ctx
        .http()
        .get(api(`/kpis/disciplines/${disciplineId}`))
        .query({ from: today, to: today })
        .set('Authorization', bearer(admin))
        .expect(200);
      expect(adminView.body.discipline.description).toContain('trenches');
      expect(adminView.body.totals.observations).toBe(2);
      expect(adminView.body.daily).toEqual([{ date: today, observations: 2, findings: 0 }]);

      const scoped = await ctx
        .http()
        .get(api(`/kpis/disciplines/${disciplineId}`))
        .query({ from: today, to: today })
        .set('Authorization', bearer(supervisor))
        .expect(200);
      expect(scoped.body.totals.observations).toBe(1);
      expect(scoped.body.byType.find((row: { type: string }) => row.type === 'NEAR_MISS').count).toBe(1);
      expect(scoped.body.byStadium.map((row: { stadiumId: string }) => row.stadiumId)).toEqual([
        stadium.id,
      ]);

      await ctx
        .http()
        .get(api(`/kpis/disciplines/${disciplineId}`))
        .query({ stadiumId: other.id })
        .set('Authorization', bearer(inspector))
        .expect(403);
    });
  });

  /* ---------------------------- query booleans --------------------------- */

  it('treats isActive=false on GET /stadiums as false', async () => {
    await ctx.prisma.stadium.update({ where: { id: other.id }, data: { isActive: false } });
    const response = await ctx
      .http()
      .get(api('/stadiums'))
      .query({ isActive: 'false' })
      .set('Authorization', bearer(admin))
      .expect(200);
    const codes = (response.body.items as { code: string }[]).map((row) => row.code);
    expect(codes).toEqual(['OTH']);
  });
});
