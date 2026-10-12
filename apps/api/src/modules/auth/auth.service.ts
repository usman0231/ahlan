import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ERROR_CODES,
  uuidv7,
  type AuthSession,
  type AuthTokens,
  type AuthUser,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type JwtPayload,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@ahlan/shared';
import type { User } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import type { AppConfig } from '../../config/configuration';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { RequestUser } from '../../common/types/request-user';
import { PasswordService } from './password.service';

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
}

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Self-registration creates an access request, never a usable account. The
   * chosen password is hashed and parked on the request until an admin approves.
   */
  async register(input: RegisterInput, context: RequestContext): Promise<{ status: 'PENDING' }> {
    const existingUser = await this.prisma.user.findUnique({ where: { email: input.email } });
    const existingRequest = await this.prisma.accessRequest.findFirst({
      where: { email: input.email, status: 'PENDING' },
    });

    // Deliberately the same answer either way: registration must not confirm
    // whether an address already has an account.
    if (existingUser || existingRequest) {
      this.logger.log(`Duplicate registration attempt for ${input.email}`);
      return { status: 'PENDING' };
    }

    const id = uuidv7();
    await this.prisma.accessRequest.create({
      data: {
        id,
        email: input.email,
        passwordHash: await this.passwords.hashPassword(input.password),
        fullName: input.fullName,
        phone: input.phone ?? null,
        organisation: input.organisation ?? null,
        jobTitle: input.jobTitle ?? null,
        note: input.note ?? null,
        requestedStadiumIds: input.requestedStadiumIds,
        status: 'PENDING',
      },
    });

    await this.audit.record({
      action: 'CREATE',
      entity: 'access_requests',
      entityId: id,
      reason: 'Self-registration',
      ip: context.ip,
      userAgent: context.userAgent,
    });

    await this.notifications.notifyAllAdmins({
      kind: 'ACCESS_REQUEST_SUBMITTED',
      title: 'New access request',
      body: `${input.fullName} has requested access to Ahlan HSE.`,
      route: '/manage/access-requests',
      data: { accessRequestId: id },
    });

    return { status: 'PENDING' };
  }

  async login(input: LoginInput, context: RequestContext): Promise<AuthSession> {
    const user = await this.prisma.user.findFirst({
      where: { email: input.email, deletedAt: null },
    });

    // Same error whether the address is unknown or the password is wrong.
    if (!user || !(await this.passwords.verifyPassword(input.password, user.passwordHash))) {
      throw AppException.unauthenticated(
        ERROR_CODES.INVALID_CREDENTIALS,
        'Email or password is incorrect',
      );
    }

    if (user.status === 'PENDING') {
      throw AppException.forbidden(
        'Your account is waiting for administrator approval',
        ERROR_CODES.ACCOUNT_PENDING_APPROVAL,
      );
    }
    if (user.status === 'SUSPENDED') {
      throw AppException.forbidden(
        'Your account has been suspended',
        ERROR_CODES.ACCOUNT_SUSPENDED,
      );
    }

    const tokens = await this.issueSession(user, {
      ...context,
      deviceId: input.deviceId ?? context.deviceId,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.record({
      actor: { id: user.id, role: user.role },
      action: 'LOGIN',
      entity: 'users',
      entityId: user.id,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { user: await this.toAuthUser(user), tokens };
  }

  /** Refresh rotates the token: a leaked refresh token is single-use. */
  async refresh(input: RefreshInput, context: RequestContext): Promise<AuthSession> {
    const decoded = this.decodeRefreshToken(input.refreshToken);

    const session = await this.prisma.session.findUnique({
      where: { id: decoded.sessionId },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw AppException.unauthenticated(ERROR_CODES.TOKEN_REVOKED, 'Please sign in again');
    }
    if (!this.passwords.tokenMatches(decoded.secret, session.refreshTokenHash)) {
      // Either a forgery or a replay of an already-rotated token: kill the
      // session rather than letting the holder keep trying.
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(`Refresh token reuse detected on session ${session.id}`);
      throw AppException.unauthenticated(ERROR_CODES.TOKEN_REVOKED, 'Please sign in again');
    }
    if (session.user.deletedAt || session.user.status !== 'ACTIVE') {
      throw AppException.forbidden('This account can no longer sign in');
    }

    const secret = this.passwords.generateToken();
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: this.passwords.hashToken(secret),
        lastUsedAt: new Date(),
        expiresAt: this.refreshExpiry(),
        ip: context.ip ?? session.ip,
        userAgent: context.userAgent ?? session.userAgent,
      },
    });

    return {
      user: await this.toAuthUser(session.user),
      tokens: {
        accessToken: await this.signAccessToken(session.user, session.id),
        refreshToken: this.encodeRefreshToken(session.id, secret),
        expiresIn: this.accessTtlSeconds(),
      },
    };
  }

  async logout(
    user: Pick<RequestUser, 'id' | 'role'>,
    sessionId: string,
    context: RequestContext,
  ): Promise<void> {
    // Scoped to the caller, so one user can never revoke another's session.
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      actor: user,
      action: 'LOGOUT',
      entity: 'sessions',
      entityId: sessionId,
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  /** Signs out every device. Offered after a password change. */
  /** Revokes every session of the user, optionally keeping one (the caller's). */
  async logoutAll(userId: string, keepSessionId?: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    context: RequestContext,
    currentSessionId?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw AppException.notFound('User', userId);

    if (!(await this.passwords.verifyPassword(input.currentPassword, user.passwordHash))) {
      // 400, not 401: the session is fine, the form is wrong. A 401 makes the
      // app treat the session as dead and sign the user out mid-typing.
      throw AppException.badRequest(ERROR_CODES.INVALID_CREDENTIALS, 'Current password is incorrect');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hashPassword(input.newPassword) },
    });

    // Every other device was authorised under the old password. The device
    // making the change stays signed in: signing it out too would force-wipe
    // its offline records that have not synced yet.
    await this.logoutAll(userId, currentSessionId);

    await this.audit.record({
      actor: { id: userId, role: user.role },
      action: 'UPDATE',
      entity: 'users',
      entityId: userId,
      reason: 'Password changed',
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  /** Always reports success, so the endpoint cannot be used to enumerate emails. */
  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: input.email, deletedAt: null, status: 'ACTIVE' },
    });
    if (!user) {
      this.logger.log(`Password reset requested for unknown address ${input.email}`);
      return;
    }

    const token = this.passwords.generateToken(32);
    await this.prisma.passwordResetToken.create({
      data: {
        id: uuidv7(),
        userId: user.id,
        tokenHash: this.passwords.hashToken(token),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    await this.mail.sendPasswordReset(user.email, user.fullName, token);
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.passwords.hashToken(input.token) },
      include: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw AppException.badRequest(
        ERROR_CODES.TOKEN_EXPIRED,
        'This reset link is no longer valid. Request a new one.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await this.passwords.hashPassword(input.newPassword) },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit.record({
      actor: { id: record.userId, role: record.user.role },
      action: 'UPDATE',
      entity: 'users',
      entityId: record.userId,
      reason: 'Password reset',
    });
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw AppException.notFound('User', userId);
    return this.toAuthUser(user);
  }

  async listSessions(userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceId: true,
        userAgent: true,
        ip: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    return sessions;
  }

  /* --------------------------- internals --------------------------- */

  private async issueSession(user: User, context: RequestContext): Promise<AuthTokens> {
    const sessionId = uuidv7();
    const secret = this.passwords.generateToken();

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: this.passwords.hashToken(secret),
        deviceId: context.deviceId ?? null,
        userAgent: context.userAgent ?? null,
        ip: context.ip ?? null,
        expiresAt: this.refreshExpiry(),
        lastUsedAt: new Date(),
      },
    });

    return {
      accessToken: await this.signAccessToken(user, sessionId),
      refreshToken: this.encodeRefreshToken(sessionId, secret),
      expiresIn: this.accessTtlSeconds(),
    };
  }

  private signAccessToken(user: User, sessionId: string): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sid: sessionId,
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.get('jwt', { infer: true }).accessSecret,
      expiresIn: this.config.get('jwt', { infer: true }).accessTtl,
    });
  }

  /**
   * The refresh token is `<sessionId>.<secret>`: the session id tells us which
   * row to look up without having to index every possible hash.
   */
  private encodeRefreshToken(sessionId: string, secret: string): string {
    return `${sessionId}.${secret}`;
  }

  private decodeRefreshToken(token: string): { sessionId: string; secret: string } {
    const separator = token.indexOf('.');
    if (separator <= 0) {
      throw AppException.unauthenticated(ERROR_CODES.TOKEN_REVOKED, 'Malformed refresh token');
    }
    return {
      sessionId: token.slice(0, separator),
      secret: token.slice(separator + 1),
    };
  }

  private async toAuthUser(user: User): Promise<AuthUser> {
    const assignments = await this.prisma.stadiumAssignment.findMany({
      where: { userId: user.id },
      select: { stadiumId: true },
    });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      avatarUrl: null,
      locale: user.locale,
      stadiumIds: assignments.map((row) => row.stadiumId),
    };
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + durationToMs(this.config.get('jwt', { infer: true }).refreshTtl));
  }

  private accessTtlSeconds(): number {
    return Math.floor(durationToMs(this.config.get('jwt', { infer: true }).accessTtl) / 1000);
  }
}

/** Parses the `15m` / `30d` style durations used in configuration. */
export function durationToMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration);
  if (!match) throw new Error(`Invalid duration: ${duration}`);
  const amount = Number.parseInt(match[1] as string, 10);
  switch (match[2]) {
    case 'ms':
      return amount;
    case 's':
      return amount * 1000;
    case 'm':
      return amount * 60_000;
    case 'h':
      return amount * 3_600_000;
    default:
      return amount * 86_400_000;
  }
}
