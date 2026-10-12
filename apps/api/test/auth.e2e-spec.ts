import { ERROR_CODES, uuidv7 } from '@ahlan/shared';

import {
  TEST_PASSWORD,
  api,
  bearer,
  createTestApp,
  seedStadium,
  seedUser,
  type TestContext,
} from './helpers';

/**
 * The access-request gate: a self-registered user cannot sign in until an admin
 * approves them, and approval is what creates the account.
 */
describe('Auth and access requests (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(async () => {
    await ctx.prisma.truncateAll();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('signs in a seeded user and returns their stadium scope', async () => {
    const stadium = await seedStadium(ctx);
    const inspector = await seedUser(ctx, { role: 'INSPECTOR', stadiumIds: [stadium.id] });

    const response = await ctx
      .http()
      .get(api('/auth/me'))
      .set('Authorization', bearer(inspector))
      .expect(200);

    expect(response.body).toMatchObject({
      email: inspector.email,
      role: 'INSPECTOR',
      status: 'ACTIVE',
      stadiumIds: [stadium.id],
    });
  });

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    const user = await seedUser(ctx, { role: 'ADMIN' });

    const response = await ctx
      .http()
      .post(api('/auth/login'))
      .send({ email: user.email, password: 'definitely-not-it' })
      .expect(401);

    expect(response.body.code).toBe(ERROR_CODES.INVALID_CREDENTIALS);
  });

  it('gives the same answer for an unknown address, so accounts cannot be enumerated', async () => {
    const response = await ctx
      .http()
      .post(api('/auth/login'))
      .send({ email: 'nobody@example.test', password: TEST_PASSWORD })
      .expect(401);

    expect(response.body.code).toBe(ERROR_CODES.INVALID_CREDENTIALS);
  });

  it('refuses an unauthenticated request to a guarded route', async () => {
    const response = await ctx.http().get(api('/stadiums')).expect(401);
    expect(response.body.code).toBe(ERROR_CODES.UNAUTHENTICATED);
  });

  describe('registration', () => {
    const applicant = {
      email: 'applicant@example.test',
      password: TEST_PASSWORD,
      fullName: 'Test Applicant',
    };

    it('creates a pending request rather than an account', async () => {
      await ctx.http().post(api('/auth/register')).send(applicant).expect(202);

      const requests = await ctx.prisma.accessRequest.findMany();
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ email: applicant.email, status: 'PENDING' });
      expect(await ctx.prisma.user.count({ where: { email: applicant.email } })).toBe(0);
    });

    it('does not let the applicant sign in before approval', async () => {
      await ctx.http().post(api('/auth/register')).send(applicant).expect(202);

      const response = await ctx
        .http()
        .post(api('/auth/login'))
        .send({ email: applicant.email, password: applicant.password })
        .expect(401);

      // No account exists yet, so this is indistinguishable from a bad login.
      expect(response.body.code).toBe(ERROR_CODES.INVALID_CREDENTIALS);
    });

    it('answers identically for a duplicate registration', async () => {
      await ctx.http().post(api('/auth/register')).send(applicant).expect(202);
      await ctx.http().post(api('/auth/register')).send(applicant).expect(202);

      expect(await ctx.prisma.accessRequest.count()).toBe(1);
    });

    it('rejects a weak password', async () => {
      const response = await ctx
        .http()
        .post(api('/auth/register'))
        .send({ ...applicant, password: 'short' })
        .expect(422);

      expect(response.body.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    });

    it('lets the applicant sign in with their own password once approved', async () => {
      const stadium = await seedStadium(ctx);
      const admin = await seedUser(ctx, { role: 'ADMIN' });

      await ctx.http().post(api('/auth/register')).send(applicant).expect(202);
      const [pending] = await ctx.prisma.accessRequest.findMany();

      await ctx
        .http()
        .post(api(`/access-requests/${pending!.id}/approve`))
        .set('Authorization', bearer(admin))
        .send({ role: 'INSPECTOR', stadiumIds: [stadium.id] })
        .expect(201);

      const login = await ctx
        .http()
        .post(api('/auth/login'))
        .send({ email: applicant.email, password: applicant.password })
        .expect(200);

      expect(login.body.user).toMatchObject({
        email: applicant.email,
        role: 'INSPECTOR',
        stadiumIds: [stadium.id],
      });
    });

    it('refuses to approve an inspector with no stadium', async () => {
      const admin = await seedUser(ctx, { role: 'ADMIN' });
      await ctx.http().post(api('/auth/register')).send(applicant).expect(202);
      const [pending] = await ctx.prisma.accessRequest.findMany();

      const response = await ctx
        .http()
        .post(api(`/access-requests/${pending!.id}/approve`))
        .set('Authorization', bearer(admin))
        .send({ role: 'INSPECTOR', stadiumIds: [] })
        .expect(400);

      expect(response.body.message).toMatch(/at least one stadium/i);
    });

    it('does not create an account on rejection, and clears the stored password', async () => {
      const admin = await seedUser(ctx, { role: 'ADMIN' });
      await ctx.http().post(api('/auth/register')).send(applicant).expect(202);
      const [pending] = await ctx.prisma.accessRequest.findMany();

      await ctx
        .http()
        .post(api(`/access-requests/${pending!.id}/reject`))
        .set('Authorization', bearer(admin))
        .send({ note: 'Not a member of the venue team.' })
        .expect(201);

      expect(await ctx.prisma.user.count({ where: { email: applicant.email } })).toBe(0);
      const after = await ctx.prisma.accessRequest.findUniqueOrThrow({
        where: { id: pending!.id },
      });
      expect(after.status).toBe('REJECTED');
      expect(after.passwordHash).toBe('');
    });

    it('cannot be decided twice', async () => {
      const stadium = await seedStadium(ctx);
      const admin = await seedUser(ctx, { role: 'ADMIN' });
      await ctx.http().post(api('/auth/register')).send(applicant).expect(202);
      const [pending] = await ctx.prisma.accessRequest.findMany();

      await ctx
        .http()
        .post(api(`/access-requests/${pending!.id}/approve`))
        .set('Authorization', bearer(admin))
        .send({ role: 'INSPECTOR', stadiumIds: [stadium.id] })
        .expect(201);

      await ctx
        .http()
        .post(api(`/access-requests/${pending!.id}/approve`))
        .set('Authorization', bearer(admin))
        .send({ role: 'INSPECTOR', stadiumIds: [stadium.id] })
        .expect(409);
    });

    it('keeps the access-request screens admin-only', async () => {
      const inspector = await seedUser(ctx, { role: 'INSPECTOR' });
      const response = await ctx
        .http()
        .get(api('/access-requests'))
        .set('Authorization', bearer(inspector))
        .expect(403);

      expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN);
    });
  });

  describe('tokens', () => {
    it('rotates the refresh token and invalidates the used one', async () => {
      const user = await seedUser(ctx, { role: 'ADMIN' });

      const login = await ctx
        .http()
        .post(api('/auth/login'))
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(200);

      const first = login.body.tokens.refreshToken as string;

      const refreshed = await ctx
        .http()
        .post(api('/auth/refresh'))
        .send({ refreshToken: first })
        .expect(200);

      expect(refreshed.body.tokens.refreshToken).not.toBe(first);

      // Replaying the old token kills the session rather than issuing more.
      const replay = await ctx
        .http()
        .post(api('/auth/refresh'))
        .send({ refreshToken: first })
        .expect(401);
      expect(replay.body.code).toBe(ERROR_CODES.TOKEN_REVOKED);
    });

    it('changes the password, keeping this session and ending every other one', async () => {
      const user = await seedUser(ctx, { role: 'ADMIN' });
      const otherDevice = await ctx
        .http()
        .post(api('/auth/login'))
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(200);
      const newPassword = 'Changed-Pass-2026';

      await ctx
        .http()
        .post(api('/auth/change-password'))
        .set('Authorization', bearer(user))
        .send({ currentPassword: TEST_PASSWORD, newPassword })
        .expect(204);

      // The device that made the change stays signed in...
      await ctx.http().get(api('/auth/me')).set('Authorization', bearer(user)).expect(200);
      // ...while one authorised under the old password is out.
      await ctx
        .http()
        .get(api('/auth/me'))
        .set('Authorization', `Bearer ${otherDevice.body.tokens.accessToken as string}`)
        .expect(401);
      await ctx
        .http()
        .post(api('/auth/login'))
        .send({ email: user.email, password: newPassword })
        .expect(200);
    });

    it('answers a wrong current password with 400, not 401, so the app keeps the session', async () => {
      const user = await seedUser(ctx, { role: 'INSPECTOR', stadiumIds: [(await seedStadium(ctx)).id] });

      const response = await ctx
        .http()
        .post(api('/auth/change-password'))
        .set('Authorization', bearer(user))
        .send({ currentPassword: 'Not-The-Password-1', newPassword: 'Changed-Pass-2026' })
        .expect(400);

      expect(response.body.code).toBe(ERROR_CODES.INVALID_CREDENTIALS);
      await ctx.http().get(api('/auth/me')).set('Authorization', bearer(user)).expect(200);
    });

    it('stops accepting an access token after sign-out', async () => {
      const user = await seedUser(ctx, { role: 'ADMIN' });

      await ctx
        .http()
        .post(api('/auth/logout'))
        .set('Authorization', bearer(user))
        .expect(204);

      const response = await ctx
        .http()
        .get(api('/auth/me'))
        .set('Authorization', bearer(user))
        .expect(401);

      expect(response.body.code).toBe(ERROR_CODES.TOKEN_REVOKED);
    });

    it('rejects a token for a user that no longer exists', async () => {
      const user = await seedUser(ctx, { role: 'ADMIN' });
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });

      await ctx.http().get(api('/auth/me')).set('Authorization', bearer(user)).expect(401);
    });

    it('rejects a malformed refresh token', async () => {
      await ctx
        .http()
        .post(api('/auth/refresh'))
        .send({ refreshToken: `${uuidv7()}.not-the-secret` })
        .expect(401);
    });
  });
});
