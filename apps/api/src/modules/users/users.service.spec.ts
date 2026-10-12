import { ERROR_CODES } from '@ahlan/shared';

import { UsersService } from './users.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { PasswordService } from '../auth/password.service';
import type { RequestUser } from '../../common/types/request-user';

const STADIUM = '01930000-0000-7000-8000-000000000001';
const TARGET = '01930000-0000-7000-8000-000000000051';

const admin: RequestUser = {
  id: '01930000-0000-7000-8000-00000000000a',
  email: 'admin@example.test',
  fullName: 'Test Admin',
  role: 'ADMIN',
  sessionId: '01930000-0000-7000-8000-00000000000b',
  stadiumIds: [],
};

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET,
    email: 'target@example.test',
    fullName: 'Target User',
    phone: null,
    role: 'INSPECTOR',
    status: 'ACTIVE',
    organisation: null,
    jobTitle: null,
    locale: 'en',
    lastLoginAt: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    deletedAt: null,
    passwordHash: 'old-hash',
    stadiums: [{ stadiumId: STADIUM, stadium: { name: 'Test Stadium', code: 'TST' } }],
    ...overrides,
  };
}

function harness(options: { otherActiveAdmins?: number } = {}) {
  const tx = {
    user: {
      update: jest.fn(async () => userRow()),
      count: jest.fn().mockResolvedValue(options.otherActiveAdmins ?? 1),
      findFirstOrThrow: jest.fn(async () => userRow()),
    },
    session: { updateMany: jest.fn() },
    passwordResetToken: { updateMany: jest.fn() },
    stadiumAssignment: { deleteMany: jest.fn(), createMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma = {
    user: {
      findFirst: jest.fn(async () => userRow()),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(options.otherActiveAdmins ?? 1),
    },
    stadium: { count: jest.fn().mockResolvedValue(1) },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const passwords = { hashPassword: jest.fn().mockResolvedValue('new-hash') };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const service = new UsersService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
    audit as unknown as AuditService,
  );
  return { service, prisma, tx, passwords, audit };
}

describe('admin password reset', () => {
  it('sets the new hash, revokes every session and audits it', async () => {
    const { service, tx, audit } = harness();

    await service.resetPassword(TARGET, { newPassword: 'Stadium2026!' }, admin);

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: TARGET },
      data: { passwordHash: 'new-hash' },
    });
    expect(tx.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: TARGET, revokedAt: null } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'users', entityId: TARGET }),
      tx,
    );
  });

  it('refuses an admin resetting their own password this way', async () => {
    const { service } = harness();
    await expect(
      service.resetPassword(admin.id, { newPassword: 'Stadium2026!' }, admin),
    ).rejects.toMatchObject({ code: ERROR_CODES.FORBIDDEN });
  });

  it('404s on an unknown or deleted user', async () => {
    const { service, prisma } = harness();
    prisma.user.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      service.resetPassword(TARGET, { newPassword: 'Stadium2026!' }, admin),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
  });
});

describe('changing a role', () => {
  it('revokes the user’s sessions so they sign in to the right workspace', async () => {
    const { service, tx } = harness();
    await service.update(TARGET, { role: 'SUPERVISOR' }, admin);
    expect(tx.session.updateMany).toHaveBeenCalled();
  });

  it('does not revoke sessions for a plain profile edit', async () => {
    const { service, tx } = harness();
    await service.update(TARGET, { fullName: 'Renamed User' }, admin);
    expect(tx.session.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a non-admin role for a user with no stadium', async () => {
    const { service, prisma } = harness();
    prisma.user.findFirst.mockResolvedValueOnce(userRow({ role: 'ADMIN', stadiums: [] }));
    await expect(service.update(TARGET, { role: 'SUPERVISOR' }, admin)).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_FAILED,
    });
  });

  it('refuses changing your own role', async () => {
    const { service, prisma } = harness();
    prisma.user.findFirst.mockResolvedValueOnce(userRow({ id: admin.id, role: 'ADMIN' }));
    await expect(service.update(admin.id, { role: 'INSPECTOR' }, admin)).rejects.toMatchObject({
      code: ERROR_CODES.FORBIDDEN,
    });
  });
});

describe('the last active admin', () => {
  it('cannot be demoted to supervisor', async () => {
    const { service, prisma, tx } = harness({ otherActiveAdmins: 0 });
    prisma.user.findFirst.mockResolvedValueOnce(userRow({ role: 'ADMIN' }));
    await expect(service.update(TARGET, { role: 'SUPERVISOR' }, admin)).rejects.toMatchObject({
      code: ERROR_CODES.CONFLICT,
    });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('cannot be suspended', async () => {
    const { service, prisma } = harness({ otherActiveAdmins: 0 });
    prisma.user.findFirst.mockResolvedValueOnce(userRow({ role: 'ADMIN' }));
    await expect(service.update(TARGET, { status: 'SUSPENDED' }, admin)).rejects.toMatchObject({
      code: ERROR_CODES.CONFLICT,
    });
  });

  it('can be demoted when another active admin remains', async () => {
    const { service, prisma, tx } = harness({ otherActiveAdmins: 1 });
    prisma.user.findFirst.mockResolvedValueOnce(userRow({ role: 'ADMIN' }));
    await service.update(TARGET, { role: 'SUPERVISOR' }, admin);
    expect(tx.user.update).toHaveBeenCalled();
  });
});

describe('stadium assignment', () => {
  it('refuses to leave a supervisor with no stadium', async () => {
    const { service, prisma } = harness();
    prisma.user.findFirst.mockResolvedValueOnce(userRow({ role: 'SUPERVISOR' }));
    await expect(service.assignStadiums(TARGET, { stadiumIds: [] }, admin)).rejects.toMatchObject(
      { code: ERROR_CODES.VALIDATION_FAILED },
    );
  });

  it('lets an admin have no stadium', async () => {
    const { service, prisma, tx } = harness();
    prisma.user.findFirst.mockResolvedValueOnce(userRow({ role: 'ADMIN' }));
    await service.assignStadiums(TARGET, { stadiumIds: [] }, admin);
    expect(tx.stadiumAssignment.deleteMany).toHaveBeenCalled();
  });

  it('refuses to create an inspector without a stadium', async () => {
    const { service } = harness();
    await expect(
      service.create(
        {
          email: 'new@example.test',
          password: 'Stadium2026!',
          fullName: 'New User',
          role: 'INSPECTOR',
          locale: 'en',
          stadiumIds: [],
        },
        admin,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_FAILED });
  });
});
