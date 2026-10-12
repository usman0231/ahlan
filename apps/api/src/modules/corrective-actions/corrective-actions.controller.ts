import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assignCorrectiveActionSchema,
  idSchema,
  transitionCorrectiveActionSchema,
  updateCorrectiveActionSchema,
  type AssignCorrectiveActionInput,
  type TransitionCorrectiveActionInput,
  type UpdateCorrectiveActionInput,
} from '@ahlan/shared';

import { ApiZodBody, CurrentUser, ReviewerRoles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StadiumScopeGuard } from '../../common/guards/stadium-scope.guard';
import { zodBody, zodParam } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { CorrectiveActionsService } from './corrective-actions.service';

@ApiTags('corrective-actions')
@ApiBearerAuth()
@Controller()
@UseGuards(RolesGuard, StadiumScopeGuard)
export class CorrectiveActionsController {
  constructor(private readonly actions: CorrectiveActionsService) {}

  @Post('findings/:findingId/actions')
  @ReviewerRoles()
  @ApiOperation({
    summary: 'Assign a corrective action (admin, supervisor)',
    description:
      'Moves the finding from OPEN to ACTION_ASSIGNED. A supervisor may only act on findings at their own stadiums.',
  })
  @ApiZodBody(assignCorrectiveActionSchema)
  assign(
    @Param('findingId', zodParam(idSchema)) findingId: string,
    @Body(zodBody(assignCorrectiveActionSchema)) body: AssignCorrectiveActionInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.actions.assign(findingId, body, actor);
  }

  @Patch('corrective-actions/:id')
  @ReviewerRoles()
  @ApiOperation({
    summary: 'Change the assignee, wording or due date (admin, supervisor)',
    description: 'A supervisor may only edit actions at their own stadiums.',
  })
  @ApiZodBody(updateCorrectiveActionSchema)
  update(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(updateCorrectiveActionSchema)) body: UpdateCorrectiveActionInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.actions.update(id, body, actor);
  }

  @Post('corrective-actions/:id/transition')
  @ApiOperation({
    summary: 'Move a corrective action to the next status',
    description:
      'Validated against the shared state machine. Only an admin can reach CLOSED, and only with closure evidence.',
  })
  @ApiZodBody(transitionCorrectiveActionSchema)
  transition(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(transitionCorrectiveActionSchema)) body: TransitionCorrectiveActionInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.actions.transition(id, body, actor);
  }
}
