import { ERROR_CODES, uuidv7 } from '@ahlan/shared';

import {
  TEST_PASSWORD,
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
 * The SUPERVISOR role: reviews assigned stadiums only, never enters field data,
 * never sees consolidated reports. Plus the admin user-management endpoints
 * that create and maintain supervisors.
 */
describe('Supervisor role and user management (e2e)', () => {
  let ctx: TestContext;
  let admin: SeededUser;
  let inspector: SeededUser;
  let otherInspector: SeededUser;
  let supervisor: SeededUser;
  let stadium: { id: string; code: string; timezone: string };
  let otherStadium: { id: string; code: string; timezone: string };
  let checklist: SeededChecklist;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await ctx.prisma.truncateAll();
    await seedTournament(ctx);
    stadium = await seedStadium(ctx, { code: 'SUA' });
    otherStadium = await seedStadium(ctx, { code: 'SUB' });
    admin = await seedUser(ctx, { role: 'ADMIN' });
    inspector = await seedUser(ctx, { role: 'INSPECTOR', stadiumIds: [stadium.id] });
    otherInspector = await seedUser(ctx, { role: 'INSPECTOR', stadiumIds: [otherStadium.id] });
    supervisor = await seedUser(ctx, { role: 'SUPERVISOR', stadiumIds: [stadium.id] });
    checklist = await seedChecklist(ctx, 2);
  });

  afterAll(async () => {
    await ctx.close();
  });

  function inspectionBody(stadiumId: string) {
    const now = new Date().toISOString();
    return {
      id: uuidv7(),
      stadiumId,
      checklistId: checklist.checklistId,
      checklistVersionId: checklist.versionId,
      startedAt: now,
      submittedAt: now,
      clientCreatedAt: now,
      gps: { latitude: 25.3, longitude: 51.5, accuracyM: 6 },
      responses: checklist.items.map((item) => ({
        id: uuidv7(),
        itemId: item.id,
        value: 'YES',
        evidenceIds: [],
        answeredAt: now,
      })),
    };
  }

  it('cannot submit an inspection', async () => {
    const response = await ctx
      .http()
      .post(api('/inspections/submit'))
      .set('Authorization', bearer(supervisor))
      .send(inspectionBody(stadium.id))
      .expect(403);
    expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN);
    expect(await ctx.prisma.inspection.count()).toBe(0);
  });

  it('cannot submit or draft an EOD report', async () => {
    await ctx
      .http()
      .post(api('/eod/submit'))
      .set('Authorization', bearer(supervisor))
      .send({ id: uuidv7(), stadiumId: stadium.id })
      .expect(403);
    await ctx
      .http()
      .put(api('/eod/draft'))
      .set('Authorization', bearer(supervisor))
      .send({ id: uuidv7(), stadiumId: stadium.id })
      .expect(403);
  });

  it('only lists inspections from assigned stadiums', async () => {
    await ctx
      .http()
      .post(api('/inspections/submit'))
      .set('Authorization', bearer(inspector))
      .send(inspectionBody(stadium.id))
      .expect(201);
    await ctx
      .http()
      .post(api('/inspections/submit'))
      .set('Authorization', bearer(otherInspector))
      .send(inspectionBody(otherStadium.id))
      .expect(201);

    const list = await ctx
      .http()
      .get(api('/inspections'))
      .set('Authorization', bearer(supervisor))
      .expect(200);
    const items = list.body.items as { stadiumId: string }[];
    expect(items).toHaveLength(1);
    expect(items[0]?.stadiumId).toBe(stadium.id);

    const outside = await ctx
      .http()
      .get(api(`/inspections?stadiumId=${otherStadium.id}`))
      .set('Authorization', bearer(supervisor))
      .expect(403);
    expect(outside.body.code).toBe(ERROR_CODES.STADIUM_OUT_OF_SCOPE);
  });

  it('cannot request a consolidated report or one for another stadium', async () => {
    const consolidated = await ctx
      .http()
      .post(api('/reports'))
      .set('Authorization', bearer(supervisor))
      .send({ type: 'WEEKLY', scope: 'CONSOLIDATED' })
      .expect(403);
    expect(consolidated.body.code).toBe(ERROR_CODES.FORBIDDEN);

    const other = await ctx
      .http()
      .post(api('/reports'))
      .set('Authorization', bearer(supervisor))
      .send({ type: 'WEEKLY', scope: 'STADIUM', stadiumId: otherStadium.id })
      .expect(403);
    expect(other.body.code).toBe(ERROR_CODES.STADIUM_OUT_OF_SCOPE);
    expect(await ctx.prisma.report.count()).toBe(0);
  });

  it('cannot manage users', async () => {
    await ctx.http().get(api('/users')).set('Authorization', bearer(supervisor)).expect(403);
  });

  describe('admin user management', () => {
    it('filters the user list by role and returns stadiums', async () => {
      const response = await ctx
        .http()
        .get(api('/users?role=SUPERVISOR'))
        .set('Authorization', bearer(admin))
        .expect(200);
      const items = response.body.items as {
        id: string;
        stadiumIds: string[];
        stadiums: { id: string; code: string }[];
      }[];
      expect(items.map((row) => row.id)).toEqual([supervisor.id]);
      expect(items[0]?.stadiumIds).toEqual([stadium.id]);
      expect(items[0]?.stadiums[0]?.code).toBe('SUA');
    });

    it('creates a supervisor only with a stadium', async () => {
      const body = {
        email: `sup-${uuidv7().slice(-12)}@example.test`,
        password: TEST_PASSWORD,
        fullName: 'New Supervisor',
        role: 'SUPERVISOR',
      };
      const refused = await ctx
        .http()
        .post(api('/users'))
        .set('Authorization', bearer(admin))
        .send(body)
        .expect(422);
      expect(refused.body.code).toBe(ERROR_CODES.VALIDATION_FAILED);

      await ctx
        .http()
        .post(api('/users'))
        .set('Authorization', bearer(admin))
        .send({ ...body, stadiumIds: [stadium.id] })
        .expect(201);
    });

    it('resets a password and signs the user out everywhere', async () => {
      await ctx
        .http()
        .post(api(`/users/${inspector.id}/reset-password`))
        .set('Authorization', bearer(admin))
        .send({ newPassword: 'BrandNew2026!' })
        .expect(204);

      await ctx.http().get(api('/auth/me')).set('Authorization', bearer(inspector)).expect(401);
      await ctx
        .http()
        .post(api('/auth/login'))
        .send({ email: inspector.email, password: 'BrandNew2026!' })
        .expect(200);
    });

    it('signs a user out when their role changes', async () => {
      await ctx
        .http()
        .patch(api(`/users/${inspector.id}`))
        .set('Authorization', bearer(admin))
        .send({ role: 'SUPERVISOR' })
        .expect(200);
      await ctx.http().get(api('/auth/me')).set('Authorization', bearer(inspector)).expect(401);
    });

    it('refuses to make a stadium-less admin a supervisor', async () => {
      const second = await seedUser(ctx, { role: 'ADMIN' });
      const response = await ctx
        .http()
        .patch(api(`/users/${second.id}`))
        .set('Authorization', bearer(admin))
        .send({ role: 'SUPERVISOR' })
        .expect(422);
      expect(response.body.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });

    it('refuses PENDING as an admin-set status', async () => {
      await ctx
        .http()
        .patch(api(`/users/${inspector.id}`))
        .set('Authorization', bearer(admin))
        .send({ status: 'PENDING' })
        .expect(422);
    });
  });
});
