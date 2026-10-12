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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  correctObservationSchema,
  createObservationSchema,
  idSchema,
  restoreRecordSchema,
  softDeleteRecordSchema,
  type RestoreRecordInput,
  type SoftDeleteRecordInput,
  listObservationsQuerySchema,
  saveObservationDraftSchema,
  submitObservationSchema,
  type CorrectObservationInput,
  type CreateObservationInput,
  type ListObservationsQuery,
  type SaveObservationDraftInput,
  type SubmitObservationInput,
} from '@ahlan/shared';

import {
  AdminOnly,
  FieldRoles,
  ApiZodBody,
  ApiZodQuery,
  CurrentUser,
  StadiumScope,
} from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StadiumScopeGuard } from '../../common/guards/stadium-scope.guard';
import { zodBody, zodParam, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { ObservationsService } from './observations.service';

@ApiTags('observations')
@ApiBearerAuth()
@Controller('observations')
@UseGuards(RolesGuard, StadiumScopeGuard)
@StadiumScope()
export class ObservationsController {
  constructor(private readonly observations: ObservationsService) {}

  @Get()
  @ApiOperation({ summary: 'List observations' })
  @ApiZodQuery(listObservationsQuerySchema)
  list(
    @Query(zodQuery(listObservationsQuerySchema)) query: ListObservationsQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.observations.list(query, actor);
  }

  @Get('my-drafts')
  @FieldRoles()
  @ApiOperation({ summary: 'Your unfinished observations' })
  listMyDrafts(@CurrentUser() actor: RequestUser) {
    return this.observations.listMyDrafts(actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an observation with its photos' })
  get(@Param('id', zodParam(idSchema)) id: string, @CurrentUser() actor: RequestUser) {
    return this.observations.get(id, actor);
  }

  @Post()
  @FieldRoles()
  @ApiOperation({
    summary: 'Save a new observation as a draft',
    description: 'The photo rule is only enforced on submit, so a draft may be incomplete.',
  })
  @ApiZodBody(createObservationSchema)
  create(
    @Body(zodBody(createObservationSchema)) body: CreateObservationInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.observations.createDraft(body, actor);
  }

  @Put(':id/draft')
  @FieldRoles()
  @ApiOperation({ summary: 'Update a draft observation' })
  @ApiZodBody(saveObservationDraftSchema)
  saveDraft(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(saveObservationDraftSchema)) body: SaveObservationDraftInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.observations.saveDraft(id, body, actor);
  }

  @Post('submit')
  @FieldRoles()
  @ApiOperation({
    summary: 'Submit an observation',
    description:
      'Unsafe acts, unsafe conditions and near misses raise a finding and need a photo. Positive observations do neither.',
  })
  @ApiZodBody(submitObservationSchema)
  submit(
    @Body(zodBody(submitObservationSchema)) body: SubmitObservationInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.observations.submit(body, actor);
  }

  @Patch(':id/correct')
  @AdminOnly()
  @ApiOperation({
    summary: 'Correct a submitted observation (admin)',
    description: 'Requires a reason; the linked finding is updated to match.',
  })
  @ApiZodBody(correctObservationSchema)
  correct(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(correctObservationSchema)) body: CorrectObservationInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.observations.correct(id, body, actor);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete a submitted observation (admin)',
    description:
      'Never hard-deleted. Hidden from every list, detail (non-admin), KPI, report and sync pull (sent as deleted). Audited with the reason. Its finding is deleted and restored with it.',
  })
  @ApiZodBody(softDeleteRecordSchema)
  async remove(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(softDeleteRecordSchema)) body: SoftDeleteRecordInput,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.observations.softDelete(id, body.reason, actor);
  }

  @Post(':id/restore')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore soft-deleted a submitted observation (admin)' })
  @ApiZodBody(restoreRecordSchema)
  restore(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(restoreRecordSchema)) body: RestoreRecordInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.observations.restore(id, body.reason, actor);
  }
}
