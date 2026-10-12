import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  changePasswordSchema,
  idSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@ahlan/shared';

import { ApiZodBody, CurrentUser, Public, RequestMeta } from '../../common/decorators';
import { zodBody, zodParam } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { AuthService } from './auth.service';

interface Meta {
  ip: string | null;
  userAgent: string | null;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  // Registration is unauthenticated, so it is rate limited harder than the rest.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Request access',
    description:
      'Creates a pending access request. The applicant cannot sign in until an HSE Administrator approves it.',
  })
  @ApiZodBody(registerSchema)
  @ApiResponse({ status: 202, description: 'Request recorded' })
  register(@Body(zodBody(registerSchema)) body: RegisterInput, @RequestMeta() meta: Meta) {
    return this.auth.register(body, meta);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in and receive an access + refresh token' })
  @ApiZodBody(loginSchema)
  login(@Body(zodBody(loginSchema)) body: LoginInput, @RequestMeta() meta: Meta) {
    return this.auth.login(body, meta);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the refresh token',
    description: 'Refresh tokens are single use; the response contains the replacement.',
  })
  @ApiZodBody(refreshSchema)
  refresh(@Body(zodBody(refreshSchema)) body: RefreshInput, @RequestMeta() meta: Meta) {
    return this.auth.refresh(body, meta);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out of this device' })
  async logout(@CurrentUser() user: RequestUser, @RequestMeta() meta: Meta) {
    await this.auth.logout(user, user.sessionId, meta);
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @ApiOperation({ summary: 'Sign out of every device' })
  async logoutAll(@CurrentUser() user: RequestUser) {
    return { revoked: await this.auth.logoutAll(user.id) };
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'The signed-in user, with their stadium scope' })
  me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user.id);
  }

  @ApiBearerAuth()
  @Get('sessions')
  @ApiOperation({ summary: 'Devices currently signed in' })
  sessions(@CurrentUser() user: RequestUser) {
    return this.auth.listSessions(user.id);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Change password',
    description: 'Signs out every other device; the calling session stays signed in.',
  })
  @ApiZodBody(changePasswordSchema)
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(changePasswordSchema)) body: ChangePasswordInput,
    @RequestMeta() meta: Meta,
  ) {
    await this.auth.changePassword(user.id, body, meta, user.sessionId);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @ApiOperation({
    summary: 'Send a password reset link',
    description: 'Always returns 202, whether or not the address has an account.',
  })
  @ApiZodBody(forgotPasswordSchema)
  async forgotPassword(@Body(zodBody(forgotPasswordSchema)) body: ForgotPasswordInput) {
    await this.auth.forgotPassword(body);
    return { sent: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  @ApiZodBody(resetPasswordSchema)
  async resetPassword(@Body(zodBody(resetPasswordSchema)) body: ResetPasswordInput) {
    await this.auth.resetPassword(body);
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out one other device' })
  async revokeSession(
    @CurrentUser() user: RequestUser,
    @Param('id', zodParam(idSchema)) sessionId: string,
    @RequestMeta() meta: Meta,
  ) {
    await this.auth.logout(user, sessionId, meta);
  }
}
