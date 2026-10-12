import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import {
  ERROR_CODES,
  STADIUM_REQUIRED_MESSAGE,
  requiresStadiumAssignment,
  uuidv7,
  type AdminResetPasswordInput,
  type AssignStadiumsInput,
  type CreateUserInput,
  type ListUsersQuery,
  type Paginated,
  type UpdateProfileInput,
  type UpdateUserInput,
  type User as UserDto,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { cursorArgs, paginateById } from '../../common/util/cursor';
import { buildDiff, hasChanges } from '../../common/util/diff';
import type { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';

type UserWithStadiums = User & {
  stadiums: { stadiumId: string; stadium?: { name: string; code: string } }[];
};

const withStadiums = {
  stadiums: {
    select: { stadiumId: true, stadium: { select: { name: true, code: true } } },
    orderBy: { stadium: { name: 'asc' } },
  },
} satisfies Prisma.UserInclude;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersQuery): Promise<Paginated<UserDto>> {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      role: query.role,
      status: query.status,
      ...(query.stadiumId ? { stadiums: { some: { stadiumId: query.stadiumId } } } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { organisation: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.user.findMany({
      where,
      include: withStadiums,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
    });

    const page = paginateById(rows, query.limit);
    return { ...page, items: page.items.map(toDto) };
  }

  async get(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: withStadiums,
    });
    if (!user) throw AppException.notFound('User', id);
    return toDto(user);
  }

  /** Admin-created accounts skip the access-request flow and are active at once. */
  async create(input: CreateUserInput, actor: RequestUser): Promise<UserDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw AppException.conflict(
        'A user with this email already exists',
        ERROR_CODES.ALREADY_EXISTS,
      );
    }
    // The shared schema already says so; repeated here so no caller can skip it.
    this.assertStadiumRule(input.role, input.stadiumIds.length);
    await this.assertStadiumsExist(input.stadiumIds);

    const id = uuidv7();
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          id,
          email: input.email,
          passwordHash: await this.passwords.hashPassword(input.password),
          fullName: input.fullName,
          phone: input.phone ?? null,
          role: input.role,
          status: 'ACTIVE',
          organisation: input.organisation ?? null,
          jobTitle: input.jobTitle ?? null,
          locale: input.locale,
          stadiums: {
            create: input.stadiumIds.map((stadiumId) => ({
              stadiumId,
              assignedById: actor.id,
            })),
          },
        },
        include: withStadiums,
      });

      await this.audit.record(
        {
          actor,
          action: 'CREATE',
          entity: 'users',
          entityId: id,
          diff: { email: { from: null, to: input.email }, role: { from: null, to: input.role } },
        },
        tx,
      );

      return created;
    });

    return toDto(user);
  }

  /**
   * Admin edit. A role change revokes the user's sessions so they sign in again
   * into the right workspace; a supervisor or inspector must keep at least one
   * stadium; the last active admin can be neither demoted nor suspended.
   */
  async update(id: string, input: UpdateUserInput, actor: RequestUser): Promise<UserDto> {
    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: withStadiums,
    });
    if (!existing) throw AppException.notFound('User', id);

    const roleChanged = input.role !== undefined && input.role !== existing.role;
    const deactivating = input.status !== undefined && input.status !== 'ACTIVE';

    // An admin must not be able to lock the product out by demoting themselves.
    if (actor.id === id && roleChanged) {
      throw AppException.forbidden('You cannot change your own role');
    }
    if (actor.id === id && deactivating) {
      throw AppException.forbidden('You cannot suspend your own account');
    }
    if (roleChanged && input.role) {
      this.assertStadiumRule(input.role, existing.stadiums.length);
    }
    const removesAnAdmin =
      existing.role === 'ADMIN' && ((roleChanged && input.role !== 'ADMIN') || deactivating);

    const { stadiums: _stadiums, ...existingColumns } = existing;
    const diff = buildDiff(existingColumns, input as Partial<User>);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Inside the transaction so two admins demoting each other cannot both win.
      if (removesAnAdmin) await this.assertNotLastAdmin(id, tx);

      const result = await tx.user.update({
        where: { id },
        data: {
          fullName: input.fullName,
          phone: input.phone,
          role: input.role,
          status: input.status,
          organisation: input.organisation,
          jobTitle: input.jobTitle,
          locale: input.locale,
        },
        include: withStadiums,
      });

      // A suspended user, or one whose role changed, must lose their live
      // sessions immediately: the app picks the workspace at sign-in.
      if (deactivating || roleChanged) {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      if (hasChanges(diff)) {
        await this.audit.record(
          { actor, action: 'UPDATE', entity: 'users', entityId: id, diff },
          tx,
        );
      }
      return result;
    });

    return toDto(updated);
  }

  /** Self-service profile edit: no role, status or stadium changes. */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: input.fullName,
        phone: input.phone,
        locale: input.locale,
      },
      include: withStadiums,
    });
    return toDto(user);
  }

  /** Replaces the assignment wholesale - the admin UI sends the full list. */
  async assignStadiums(
    id: string,
    input: AssignStadiumsInput,
    actor: RequestUser,
  ): Promise<UserDto> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: withStadiums,
    });
    if (!user) throw AppException.notFound('User', id);
    const after = [...new Set(input.stadiumIds)].sort();
    this.assertStadiumRule(user.role, after.length);
    await this.assertStadiumsExist(after);

    const before = user.stadiums.map((row) => row.stadiumId).sort();

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.stadiumAssignment.deleteMany({ where: { userId: id } });
      if (after.length > 0) {
        await tx.stadiumAssignment.createMany({
          data: after.map((stadiumId) => ({ userId: id, stadiumId, assignedById: actor.id })),
        });
      }

      await this.audit.record(
        {
          actor,
          action: 'UPDATE',
          entity: 'users',
          entityId: id,
          reason: 'Stadium assignment changed',
          diff: { stadiumIds: { from: before, to: after } },
        },
        tx,
      );

      return tx.user.findFirstOrThrow({ where: { id }, include: withStadiums });
    });

    return toDto(updated);
  }

  /**
   * Admin sets another user's password (forgotten password, first hand-over).
   * Every session of that user is revoked; admins change their own password
   * through `/auth/change-password`, which checks the current one.
   */
  async resetPassword(
    id: string,
    input: AdminResetPasswordInput,
    actor: RequestUser,
  ): Promise<void> {
    if (actor.id === id) {
      throw AppException.forbidden('Use change password to change your own password');
    }
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw AppException.notFound('User', id);

    const passwordHash = await this.passwords.hashPassword(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // Any emailed reset link still outstanding is now stale.
      await tx.passwordResetToken.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await this.audit.record(
        {
          actor,
          action: 'UPDATE',
          entity: 'users',
          entityId: id,
          reason: 'Password reset by administrator',
        },
        tx,
      );
    });
  }

  /**
   * Soft delete. HSE records keep pointing at the row, so the user is never
   * physically removed - they just stop being able to sign in or be assigned.
   */
  async softDelete(id: string, actor: RequestUser): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw AppException.notFound('User', id);
    if (actor.id === id) throw AppException.forbidden('You cannot delete your own account');
    await this.prisma.$transaction(async (tx) => {
      if (user.role === 'ADMIN') await this.assertNotLastAdmin(id, tx);
      await tx.user.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'SUSPENDED' },
      });
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.stadiumAssignment.deleteMany({ where: { userId: id } });
      await this.audit.record({ actor, action: 'DELETE', entity: 'users', entityId: id }, tx);
    });
  }

  /** Inspectors assigned to a stadium - used to pick an action assignee. */
  async listForStadium(stadiumId: string): Promise<UserDto[]> {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        stadiums: { some: { stadiumId } },
      },
      include: withStadiums,
      orderBy: { fullName: 'asc' },
    });
    return users.map(toDto);
  }

  private async assertStadiumsExist(stadiumIds: string[]): Promise<void> {
    if (stadiumIds.length === 0) return;
    const found = await this.prisma.stadium.count({
      where: { id: { in: stadiumIds }, deletedAt: null },
    });
    if (found !== new Set(stadiumIds).size) {
      throw AppException.badRequest(
        ERROR_CODES.VALIDATION_FAILED,
        'One or more stadium ids do not exist',
      );
    }
  }

  /** A supervisor or inspector with no stadium would see nothing at all. */
  private assertStadiumRule(role: User['role'], stadiumCount: number): void {
    if (requiresStadiumAssignment(role) && stadiumCount === 0) {
      throw AppException.validation(STADIUM_REQUIRED_MESSAGE, { field: 'stadiumIds' });
    }
  }

  /** Losing the last admin would make the product unadministrable. */
  private async assertNotLastAdmin(
    excludingUserId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const remaining = await tx.user.count({
      where: {
        role: 'ADMIN',
        status: 'ACTIVE',
        deletedAt: null,
        id: { not: excludingUserId },
      },
    });
    if (remaining === 0) {
      throw AppException.conflict('There must be at least one active HSE Administrator');
    }
  }
}

function toDto(user: UserWithStadiums): UserDto {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    organisation: user.organisation,
    jobTitle: user.jobTitle,
    avatarUrl: null,
    locale: user.locale,
    stadiumIds: user.stadiums.map((row) => row.stadiumId),
    stadiums: user.stadiums.flatMap((row) =>
      row.stadium ? [{ id: row.stadiumId, name: row.stadium.name, code: row.stadium.code }] : [],
    ),
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
