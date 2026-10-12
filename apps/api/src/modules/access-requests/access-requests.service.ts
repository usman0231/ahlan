import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ERROR_CODES,
  STADIUM_REQUIRED_MESSAGE,
  requiresStadiumAssignment,
  uuidv7,
  type AccessRequest as AccessRequestDto,
  type ApproveAccessRequestInput,
  type ListAccessRequestsQuery,
  type Paginated,
  type RejectAccessRequestInput,
  type User as UserDto,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { cursorArgs, paginateById } from '../../common/util/cursor';
import type { RequestUser } from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

/**
 * The approval gate. A registration sits here until an admin decides; approval
 * is the moment the User row is created, using the password the applicant chose.
 */
@Injectable()
export class AccessRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  async list(query: ListAccessRequestsQuery): Promise<Paginated<AccessRequestDto>> {
    const where: Prisma.AccessRequestWhereInput = {
      status: query.status,
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

    const rows = await this.prisma.accessRequest.findMany({
      where,
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
    });

    const page = paginateById(rows, query.limit);
    return { ...page, items: page.items.map(toDto) };
  }

  /** Drives the pending badge on the admin home screen. */
  async pendingCount(): Promise<number> {
    return this.prisma.accessRequest.count({ where: { status: 'PENDING' } });
  }

  async get(id: string): Promise<AccessRequestDto> {
    const request = await this.prisma.accessRequest.findUnique({ where: { id } });
    if (!request) throw AppException.notFound('Access request', id);
    return toDto(request);
  }

  /**
   * Creates the user account. The admin sets the real role and stadium scope -
   * what the applicant asked for is only a hint.
   */
  async approve(
    id: string,
    input: ApproveAccessRequestInput,
    actor: RequestUser,
  ): Promise<UserDto> {
    const request = await this.prisma.accessRequest.findUnique({ where: { id } });
    if (!request) throw AppException.notFound('Access request', id);
    if (request.status !== 'PENDING') {
      throw AppException.conflict(`This request has already been ${request.status.toLowerCase()}`);
    }

    const existing = await this.prisma.user.findUnique({ where: { email: request.email } });
    if (existing) {
      throw AppException.conflict(
        'A user with this email already exists',
        ERROR_CODES.ALREADY_EXISTS,
      );
    }

    if (input.stadiumIds.length > 0) {
      const found = await this.prisma.stadium.count({
        where: { id: { in: input.stadiumIds }, deletedAt: null },
      });
      if (found !== new Set(input.stadiumIds).size) {
        throw AppException.badRequest(
          ERROR_CODES.VALIDATION_FAILED,
          'One or more stadium ids do not exist',
        );
      }
    }
    // A supervisor or inspector with no stadium can see nothing at all, which is never intended.
    if (requiresStadiumAssignment(input.role) && input.stadiumIds.length === 0) {
      throw AppException.badRequest(ERROR_CODES.VALIDATION_FAILED, STADIUM_REQUIRED_MESSAGE);
    }

    const userId = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          email: request.email,
          // Carried across unchanged: the applicant keeps the password they chose.
          passwordHash: request.passwordHash,
          fullName: request.fullName,
          phone: request.phone,
          role: input.role,
          status: 'ACTIVE',
          organisation: request.organisation,
          jobTitle: request.jobTitle,
          stadiums: {
            create: input.stadiumIds.map((stadiumId) => ({
              stadiumId,
              assignedById: actor.id,
            })),
          },
        },
      });

      await tx.accessRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          decidedById: actor.id,
          decidedAt: new Date(),
          decisionNote: input.note ?? null,
        },
      });

      await this.audit.record(
        {
          actor,
          action: 'APPROVE',
          entity: 'access_requests',
          entityId: id,
          reason: input.note ?? null,
          diff: {
            status: { from: 'PENDING', to: 'APPROVED' },
            userId: { from: null, to: userId },
            role: { from: null, to: input.role },
            stadiumIds: { from: request.requestedStadiumIds, to: input.stadiumIds },
          },
        },
        tx,
      );
    });

    await this.mail.sendAccessRequestApproved(request.email, request.fullName);
    await this.notifications.notify({
      userId,
      kind: 'ACCESS_REQUEST_APPROVED',
      title: 'Welcome to Ahlan HSE',
      body: 'Your access has been approved. You can start inspecting.',
      route: '/',
    });

    return this.users.get(userId);
  }

  async reject(
    id: string,
    input: RejectAccessRequestInput,
    actor: RequestUser,
  ): Promise<AccessRequestDto> {
    const request = await this.prisma.accessRequest.findUnique({ where: { id } });
    if (!request) throw AppException.notFound('Access request', id);
    if (request.status !== 'PENDING') {
      throw AppException.conflict(`This request has already been ${request.status.toLowerCase()}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.accessRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          decidedById: actor.id,
          decidedAt: new Date(),
          decisionNote: input.note,
          // The rejected applicant must not keep a usable credential on file.
          passwordHash: '',
        },
      });

      await this.audit.record(
        {
          actor,
          action: 'REJECT',
          entity: 'access_requests',
          entityId: id,
          reason: input.note,
          diff: { status: { from: 'PENDING', to: 'REJECTED' } },
        },
        tx,
      );

      return result;
    });

    await this.mail.sendAccessRequestRejected(request.email, request.fullName, input.note);
    return toDto(updated);
  }
}

type AccessRequestRow = Prisma.AccessRequestGetPayload<Record<string, never>>;

function toDto(row: AccessRequestRow): AccessRequestDto {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    organisation: row.organisation,
    jobTitle: row.jobTitle,
    note: row.note,
    requestedStadiumIds: row.requestedStadiumIds,
    status: row.status,
    decidedById: row.decidedById,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
    createdAt: row.createdAt,
  };
}
