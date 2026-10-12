import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adminResetPasswordSchema,
  assignStadiumsSchema,
  createUserSchema,
  idSchema,
  listUsersQuerySchema,
  updateProfileSchema,
  updateUserSchema,
  type AdminResetPasswordInput,
  type AssignStadiumsInput,
  type CreateUserInput,
  type ListUsersQuery,
  type UpdateProfileInput,
  type UpdateUserInput,
} from '@ahlan/shared';

import { AdminOnly, ApiZodBody, ApiZodQuery, CurrentUser, StadiumScope } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StadiumScopeGuard } from '../../common/guards/stadium-scope.guard';
import { zodBody, zodParam, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(RolesGuard, StadiumScopeGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @AdminOnly()
  @ApiOperation({ summary: 'List users (admin)' })
  @ApiZodQuery(listUsersQuerySchema)
  list(@Query(zodQuery(listUsersQuerySchema)) query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update your own name, phone or language' })
  @ApiZodBody(updateProfileSchema)
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.users.updateProfile(user.id, body);
  }

  /**
   * Inspectors may read this for a stadium they are assigned to, so they can see
   * who else covers it; the guard enforces the scope.
   */
  @Get('by-stadium/:stadiumId')
  @StadiumScope({ source: 'param', field: 'stadiumId', optional: false })
  @ApiOperation({ summary: 'Active users assigned to a stadium' })
  listForStadium(@Param('stadiumId', zodParam(idSchema)) stadiumId: string) {
    return this.users.listForStadium(stadiumId);
  }

  @Get(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Get one user (admin)' })
  get(@Param('id', zodParam(idSchema)) id: string) {
    return this.users.get(id);
  }

  @Post()
  @AdminOnly()
  @ApiOperation({
    summary: 'Create a user (admin)',
    description: 'Bypasses the access-request flow; the account is active immediately.',
  })
  @ApiZodBody(createUserSchema)
  create(
    @Body(zodBody(createUserSchema)) body: CreateUserInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.users.create(body, actor);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update a user (admin)' })
  @ApiZodBody(updateUserSchema)
  update(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(updateUserSchema)) body: UpdateUserInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.users.update(id, body, actor);
  }

  @Patch(':id/stadiums')
  @AdminOnly()
  @ApiOperation({
    summary: "Replace a user's stadium assignment (admin)",
    description:
      'Takes effect on the user’s very next request. A supervisor or inspector must keep at least one stadium (422 VALIDATION_FAILED).',
  })
  @ApiZodBody(assignStadiumsSchema)
  assignStadiums(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(assignStadiumsSchema)) body: AssignStadiumsInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.users.assignStadiums(id, body, actor);
  }

  @Post(':id/reset-password')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Set another user's password (admin)",
    description:
      'Revokes every session of that user and writes an audit entry. Not for your own account: use /auth/change-password.',
  })
  @ApiZodBody(adminResetPasswordSchema)
  async resetPassword(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(adminResetPasswordSchema)) body: AdminResetPasswordInput,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.users.resetPassword(id, body, actor);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete a user (admin)',
    description: 'The row stays so historical HSE records keep their author.',
  })
  async remove(@Param('id', zodParam(idSchema)) id: string, @CurrentUser() actor: RequestUser) {
    await this.users.softDelete(id, actor);
  }
}
