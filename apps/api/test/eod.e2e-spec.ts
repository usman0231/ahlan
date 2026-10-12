import { ERROR_CODES, addDays, uuidv7, zonedDateString } from '@ahlan/shared';

import {
  api,
  bearer,
  createTestApp,
  seedEodWindow,
  seedStadium,
  seedTournament,
  seedUser,
  type SeededUser,
  type TestContext,
} from './helpers';

/**
 * The EOD rules: submission only inside an open window, one report per
 * inspector per stadium per stadium-local day, and the figures recomputed from
 * what actually happened rather than taken from the device.
 */
describe('End of Day reports (e2e)', () => {
  let ctx: TestContext;
  let admin: SeededUser;
  let inspector: SeededUser;
  let stadium: { id: string; code: string; timezone: string };
  let today: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await ctx.prisma.truncateAll();
    await seedTournament(ctx);
    // UTC keeps "now" and "the stadium's today" aligned, so the window maths in
    // these tests is about the window and not about zone conversion.
    stadium = await seedStadium(ctx, { code: 'EOD', timezone: 'UTC' });
    admin = await seedUser(ctx, { role: 'ADMIN' });
    inspector = await seedUser(ctx, { role: 'INSPECTOR', stadiumIds: [stadium.id] });
    today = zonedDateString(new Date(), stadium.timezone);
  });

  afterAll(async () => {
    await ctx.close();
  });

  function submitBody(overrides: Record<string, unknown> = {}) {
    const now = new Date().toISOString();
    return {
      id: uuidv7(),
      stadiumId: stadium.id,
      date: today,
      submittedAt: now,
      clientCreatedAt: now,
      gps: { latitude: 25.3, longitude: 51.5, accuracyM: 7 },
      workforce: [
        { category: 'Stewards', personnel: 24, hours: '8.00' },
        { category: 'Marshals', personnel: 10, hours: '8.85' },
      ],
      recordableIncidents: 0,
      nearMisses: 1,
      summary: 'All works completed without incident across the north and east stands.',
      evidenceIds: [],
      ...overrides,
    };
  }

  /** A window that is open right now, whatever time the test runs at. */
  async function openWindowNow(): Promise<void> {
    await seedEodWindow(ctx, {
      stadiumId: stadium.id,
      date: today,
      startTime: '00:00',
      endTime: '23:59',
    });
  }

  it('rejects a submission when no window exists for the date', async () => {
    const response = await ctx
      .http()
      .post(api('/eod/submit'))
      .set('Authorization', bearer(inspector))
      .send(submitBody())
      .expect(400);

    expect(response.body.code).toBe(ERROR_CODES.EOD_WINDOW_CLOSED);
    expect(await ctx.prisma.eodReport.count()).toBe(0);
  });

  it('rejects a submission when the admin disabled the window', async () => {
    await seedEodWindow(ctx, {
      stadiumId: stadium.id,
      date: today,
      startTime: '00:00',
      endTime: '23:59',
      enabled: false,
    });

    const response = await ctx
      .http()
      .post(api('/eod/submit'))
      .set('Authorization', bearer(inspector))
      .send(submitBody())
      .expect(400);

    expect(response.body.code).toBe(ERROR_CODES.EOD_WINDOW_CLOSED);
  });

  it('rejects a submission outside the window hours', async () => {
    // A window that closed at the very start of the day.
    await seedEodWindow(ctx, {
      stadiumId: stadium.id,
      date: today,
      startTime: '00:00',
      endTime: '00:01',
    });

    const response = await ctx
      .http()
      .post(api('/eod/submit'))
      .set('Authorization', bearer(inspector))
      .send(submitBody())
      .expect(400);

    expect(response.body.code).toBe(ERROR_CODES.EOD_WINDOW_CLOSED);
  });

  it('accepts a submission inside the window and sums man-hours exactly', async () => {
    await openWindowNow();

    const response = await ctx
      .http()
      .post(api('/eod/submit'))
      .set('Authorization', bearer(inspector))
      .send(submitBody())
      .expect(201);

    expect(response.body).toMatchObject({
      status: 'SUBMITTED',
      totalHeadcount: 34,
      // 24 x 8.00 + 10 x 8.85 = 192.00 + 88.50, in fixed point
      totalManHours: '280.50',
      isLocked: true,
    });
  });

  it('allows only one report per inspector, per stadium, per day', async () => {
    await openWindowNow();

    await ctx
      .http()
      .post(api('/eod/submit'))
      .set('Authorization', bearer(inspector))
      .send(submitBody())
      .expect(201);

    const response = await ctx
      .http()
      .post(api('/eod/submit'))
      .set('Authorization', bearer(inspector))
      .send(submitBody())
      .expect(409);

    expect(response.body.code).toBe(ERROR_CODES.EOD_ALREADY_SUBMITTED);
    expect(await ctx.prisma.eodReport.count()).toBe(1);
  });

  it('lets a second inspector at the same stadium submit their own', async () => {
    await openWindowNow();
    const second = await seedUser(ctx, { role: 'INSPECTOR', stadiumIds: [stadium.id] });

    await ctx
      .http()
      .post(api('/eod/submit'))
      .set('Authorization', bearer(inspector))
      .send(submitBody())
      .expect(201);

    await ctx
      .http()
      .post(api('/eod/submit'))
      .set('Authorization', bearer(second))
      .send(submitBody())
      .expect(201);

    expect(await ctx.prisma.eodReport.count()).toBe(2);
  });

  it('reports window status so the app can gate its submit button', async () => {
    const status = await ctx
      .http()
      .get(api('/eod/window-status'))
      .query({ stadiumId: stadium.id, date: today })
      .set('Authorization', bearer(inspector))
      .expect(200);

    expect(status.body).toMatchObject({ open: false, alreadySubmitted: false });
    expect(status.body.reason).toBeTruthy();

    await openWindowNow();

    const reopened = await ctx
      .http()
      .get(api('/eod/window-status'))
      .query({ stadiumId: stadium.id, date: today })
      .set('Authorization', bearer(inspector))
      .expect(200);

    expect(reopened.body.open).toBe(true);
    expect(reopened.body.closesAt).toBeTruthy();
  });

  it('saves a draft without a window, because only submission is gated', async () => {
    const response = await ctx
      .http()
      .put(api('/eod/draft'))
      .set('Authorization', bearer(inspector))
      .send({
        id: uuidv7(),
        stadiumId: stadium.id,
        date: today,
        workforce: [{ contractor: 'Alpha', headcount: 5, manHours: '40.00' }],
        recordableIncidents: 0,
        nearMisses: 0,
        evidenceIds: [],
      })
      .expect(200);

    expect(response.body.status).toBe('DRAFT');
  });

  it('rejects negative man-hours', async () => {
    await openWindowNow();

    await ctx
      .http()
      .post(api('/eod/submit'))
      .set('Authorization', bearer(inspector))
      .send(
        submitBody({
          workforce: [{ contractor: 'Alpha', headcount: 5, manHours: '-40.00' }],
        }),
      )
      .expect(422);
  });

  it('refuses a submission for a stadium outside the inspector’s scope', async () => {
    const other = await seedStadium(ctx, { code: 'OTH', timezone: 'UTC' });
    await seedEodWindow(ctx, {
      stadiumId: other.id,
      date: today,
      startTime: '00:00',
      endTime: '23:59',
    });

    const response = await ctx
      .http()
      .post(api('/eod/submit'))
      .set('Authorization', bearer(inspector))
      .send(submitBody({ stadiumId: other.id }))
      .expect(403);

    expect(response.body.code).toBe(ERROR_CODES.STADIUM_OUT_OF_SCOPE);
  });

  describe('windows as the admin manages them', () => {
    it('opens a window across a date range in one call', async () => {
      const response = await ctx
        .http()
        .post(api('/eod/windows/bulk'))
        .set('Authorization', bearer(admin))
        .send({
          stadiumIds: [stadium.id],
          from: today,
          to: addDays(today, 2),
          startTime: '18:00',
          endTime: '23:30',
          enabled: true,
        })
        .expect(201);

      expect(response.body.written).toBe(3);
      expect(await ctx.prisma.eodWindow.count()).toBe(3);
    });

    it('updates the existing window rather than duplicating it', async () => {
      const payload = {
        stadiumId: stadium.id,
        date: today,
        startTime: '18:00',
        endTime: '23:00',
        enabled: true,
      };

      await ctx
        .http()
        .put(api('/eod/windows'))
        .set('Authorization', bearer(admin))
        .send(payload)
        .expect(200);
      await ctx
        .http()
        .put(api('/eod/windows'))
        .set('Authorization', bearer(admin))
        .send({ ...payload, endTime: '23:45' })
        .expect(200);

      const windows = await ctx.prisma.eodWindow.findMany();
      expect(windows).toHaveLength(1);
      expect(windows[0]?.endTime).toBe('23:45');
    });

    it('keeps window management admin-only', async () => {
      await ctx
        .http()
        .put(api('/eod/windows'))
        .set('Authorization', bearer(inspector))
        .send({
          stadiumId: stadium.id,
          date: today,
          startTime: '18:00',
          endTime: '23:00',
          enabled: true,
        })
        .expect(403);
    });

    it('lists who still owes a report', async () => {
      await openWindowNow();
      const second = await seedUser(ctx, { role: 'INSPECTOR', stadiumIds: [stadium.id] });

      await ctx
        .http()
        .post(api('/eod/submit'))
        .set('Authorization', bearer(inspector))
        .send(submitBody())
        .expect(201);

      const response = await ctx
        .http()
        .get(api('/eod/compliance'))
        .query({ date: today })
        .set('Authorization', bearer(admin))
        .expect(200);

      const rows = response.body as { inspectorId: string; submitted: boolean }[];
      expect(rows.find((row) => row.inspectorId === inspector.id)?.submitted).toBe(true);
      expect(rows.find((row) => row.inspectorId === second.id)?.submitted).toBe(false);
    });
  });
});
