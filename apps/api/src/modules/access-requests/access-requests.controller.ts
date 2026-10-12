import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  approveAccessRequestSchema,
  idSchema,
  listAccessRequestsQuerySchema,
  rejectAccessRequestSchema,
  type ApproveAccessRequestInput,
  type ListAccessRequestsQuery,
  type RejectAccessRequestInput,
} from '@ahlan/shared';

import { AdminOnly, ApiZodBody, ApiZodQuery, CurrentUser } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { zodBody, zodParam, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { AccessRequestsService } from './access-requests.service';

/** Admin-only throughout: applicants interact through POST /auth/register. */
@ApiTags('access-requests')
@ApiBearerAuth()
@Controller('access-requests')
@UseGuards(RolesGuard)
@AdminOnly()
export class AccessRequestsController {
  constructor(private readonly accessRequests: AccessRequestsService) {}

  @Get()
  @ApiOperation({ summary: 'List access requests (admin)' })
  @ApiZodQuery(listAccessRequestsQuerySchema)
  list(@Query(zodQuery(listAccessRequestsQuerySchema)) query: ListAccessRequestsQuery) {
    return this.accessRequests.list(query);
  }

  @Get('pending-count')
  @ApiOperation({ summary: 'Pending badge count (admin)' })
  async pendingCount() {
    return { pending: await this.accessRequests.pendingCount() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one access request (admin)' })
  get(@Param('id', zodParam(idSchema)) id: string) {
    return this.accessRequests.get(id);
  }

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve a request and create the account (admin)',
    description: 'The role and stadium scope set here win over what the applicant asked for.',
  })
  @ApiZodBody(approveAccessRequestSchema)
  approve(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(approveAccessRequestSchema)) body: ApproveAccessRequestInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.accessRequests.approve(id, body, actor);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a request (admin)' })
  @ApiZodBody(rejectAccessRequestSchema)
  reject(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(rejectAccessRequestSchema)) body: RejectAccessRequestInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.accessRequests.reject(id, body, actor);
  }
}
