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
  createFindingSchema,
  idSchema,
  restoreRecordSchema,
  softDeleteRecordSchema,
  type RestoreRecordInput,
  type SoftDeleteRecordInput,
  listFindingsQuerySchema,
  updateFindingSchema,
  type CreateFindingInput,
  type ListFindingsQuery,
  type UpdateFindingInput,
} from '@ahlan/shared';

import {
  AdminOnly,
  ApiZodBody,
  ApiZodQuery,
  CurrentUser,
  StadiumScope,
} from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StadiumScopeGuard } from '../../common/guards/stadium-scope.guard';
import { zodBody, zodParam, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { FindingsService } from './findings.service';

@ApiTags('findings')
@ApiBearerAuth()
@Controller('findings')
@UseGuards(RolesGuard, StadiumScopeGuard)
@StadiumScope()
export class FindingsController {
  constructor(private readonly findings: FindingsService) {}

  @Get()
  @ApiOperation({
    summary: 'List findings',
    description: 'OVERDUE is derived from the action due date; use overdueOnly to filter on it.',
  })
  @ApiZodQuery(listFindingsQuerySchema)
  list(
    @Query(zodQuery(listFindingsQuerySchema)) query: ListFindingsQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.findings.list(query, actor);
  }

  @Get('assigned-to-me')
  @ApiOperation({ summary: 'Findings with an open corrective action assigned to the caller' })
  listMine(@CurrentUser() actor: RequestUser) {
    return this.findings.listMyActions(actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a finding with its evidence and corrective actions' })
  get(@Param('id', zodParam(idSchema)) id: string, @CurrentUser() actor: RequestUser) {
    return this.findings.get(id, actor);
  }

  @Post()
  @AdminOnly()
  @ApiOperation({
    summary: 'Raise a finding by hand (admin)',
    description: 'Most findings are raised automatically by a NO answer or an unsafe observation.',
  })
  @ApiZodBody(createFindingSchema)
  create(
    @Body(zodBody(createFindingSchema)) body: CreateFindingInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.findings.createManual(body, actor);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({
    summary: 'Correct a finding (admin)',
    description: 'Requires a reason, which is written to the audit log.',
  })
  @ApiZodBody(updateFindingSchema)
  update(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(updateFindingSchema)) body: UpdateFindingInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.findings.update(id, body, actor);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete a finding (admin)',
    description:
      'Never hard-deleted. Hidden from every list, detail (non-admin), KPI, report and sync pull (sent as deleted). Audited with the reason. Its corrective actions are hidden with it.',
  })
  @ApiZodBody(softDeleteRecordSchema)
  async remove(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(softDeleteRecordSchema)) body: SoftDeleteRecordInput,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.findings.softDelete(id, body.reason, actor);
  }

  @Post(':id/restore')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore soft-deleted a finding (admin)' })
  @ApiZodBody(restoreRecordSchema)
  restore(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(restoreRecordSchema)) body: RestoreRecordInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.findings.restore(id, body.reason, actor);
  }
}
