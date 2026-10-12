import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ERROR_CODES, type JwtPayload } from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import type { AppConfig } from '../../config/configuration';
import type { RequestUser } from '../../common/types/request-user';

/**
 * Validates the access token and rebuilds `request.user` from the database.
 *
 * The stadium assignment is read fresh on every request on purpose: if an admin
 * removes a stadium from an inspector, that has to take effect at once, not when
 * the inspector's 15-minute token happens to expire.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('jwt', { infer: true }).accessSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        stadiums: { select: { stadiumId: true } },
      },
    });

    if (!user) throw AppException.unauthenticated();

    if (user.status === 'PENDING') {
      throw AppException.forbidden(
        'Your account is waiting for administrator approval',
        ERROR_CODES.ACCOUNT_PENDING_APPROVAL,
      );
    }
    if (user.status === 'SUSPENDED') {
      throw AppException.forbidden('Your account has been suspended', ERROR_CODES.ACCOUNT_SUSPENDED);
    }

    // A revoked session must stop working immediately, not at token expiry.
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: { revokedAt: true, expiresAt: true, userId: true },
    });
    if (!session || session.userId !== user.id) {
      throw AppException.unauthenticated(ERROR_CODES.TOKEN_REVOKED, 'Session is no longer valid');
    }
    if (session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw AppException.unauthenticated(ERROR_CODES.TOKEN_REVOKED, 'Session has been signed out');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      sessionId: payload.sid,
      stadiumIds: user.stadiums.map((row) => row.stadiumId),
    };
  }
}
