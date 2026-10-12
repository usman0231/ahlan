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
  correctInspectionSchema,
  createInspectionSchema,
  idSchema,
  restoreRecordSchema,
  softDeleteRecordSchema,
  type RestoreRecordInput,
  type SoftDeleteRecordInput,
  listInspectionsQuerySchema,
  saveInspectionDraftSchema,
  submitInspectionSchema,
  type CorrectInspectionInput,
  type CreateInspectionInput,
  type ListInspectionsQuery,
  type SaveInspectionDraftInput,
  type SubmitInspectionInput,
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
import { InspectionsService } from './inspections.service';

@ApiTags('inspections')
@ApiBearerAuth()
@Controller('inspections')
@UseGuards(RolesGuard, StadiumScopeGuard)
@StadiumScope()
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get()
  @ApiOperation({ summary: 'List inspections' })
  @ApiZodQuery(listInspectionsQuerySchema)
  list(
    @Query(zodQuery(listInspectionsQuerySchema)) query: ListInspectionsQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.inspections.list(query, actor);
  }

  @Get('my-drafts')
  @FieldRoles()
  @ApiOperation({ summary: 'Your unfinished inspections' })
  listMyDrafts(@CurrentUser() actor: RequestUser) {
    return this.inspections.listMyDrafts(actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an inspection with every answer and photo' })
  get(@Param('id', zodParam(idSchema)) id: string, @CurrentUser() actor: RequestUser) {
    return this.inspections.get(id, actor);
  }

  @Post()
  @FieldRoles()
  @ApiOperation({
    summary: 'Start an inspection',
    description: 'Send the device-generated UUID v7 so a retry cannot create a duplicate.',
  })
  @ApiZodBody(createInspectionSchema)
  create(
    @Body(zodBody(createInspectionSchema)) body: CreateInspectionInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.inspections.create(body, actor);
  }

  @Put(':id/draft')
  @FieldRoles()
  @ApiOperation({
    summary: 'Save a draft',
    description: 'Replaces the whole answer set, so repeating the call is harmless.',
  })
  @ApiZodBody(saveInspectionDraftSchema)
  saveDraft(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(saveInspectionDraftSchema)) body: SaveInspectionDraftInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.inspections.saveDraft(id, body, actor);
  }

  @Post('submit')
  @FieldRoles()
  @ApiOperation({
    summary: 'Submit an inspection',
    description:
      'Creates and submits in one call so an offline device can sync in one request. Every NO raises a finding; compliance is recomputed server-side.',
  })
  @ApiZodBody(submitInspectionSchema)
  submit(
    @Body(zodBody(submitInspectionSchema)) body: SubmitInspectionInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.inspections.submit(body, actor);
  }

  @Patch(':id/correct')
  @AdminOnly()
  @ApiOperation({
    summary: 'Correct a submitted inspection (admin)',
    description: 'The only way to change a locked record. Requires a reason and is fully audited.',
  })
  @ApiZodBody(correctInspectionSchema)
  correct(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(correctInspectionSchema)) body: CorrectInspectionInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.inspections.correct(id, body, actor);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete a submitted inspection (admin)',
    description:
      'Never hard-deleted. Hidden from every list, detail (non-admin), KPI, report and sync pull (sent as deleted). Audited with the reason. Its findings are deleted and restored with it.',
  })
  @ApiZodBody(softDeleteRecordSchema)
  async remove(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(softDeleteRecordSchema)) body: SoftDeleteRecordInput,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.inspections.softDelete(id, body.reason, actor);
  }

  @Post(':id/restore')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore soft-deleted a submitted inspection (admin)' })
  @ApiZodBody(restoreRecordSchema)
  restore(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(restoreRecordSchema)) body: RestoreRecordInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.inspections.restore(id, body.reason, actor);
  }
}
