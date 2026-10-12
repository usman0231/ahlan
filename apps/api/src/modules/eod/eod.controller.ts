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
  bulkEodWindowSchema,
  correctEodSchema,
  eodWindowDefaultQuerySchema,
  idSchema,
  isoDateSchema,
  listEodQuerySchema,
  restoreRecordSchema,
  saveEodDraftSchema,
  softDeleteRecordSchema,
  submitEodSchema,
  upsertEodWindowDefaultSchema,
  upsertEodWindowSchema,
  type BulkEodWindowInput,
  type CorrectEodInput,
  type EodWindowDefaultQuery,
  type ListEodQuery,
  type RestoreRecordInput,
  type SaveEodDraftInput,
  type SoftDeleteRecordInput,
  type SubmitEodInput,
  type UpsertEodWindowDefaultInput,
  type UpsertEodWindowInput,
} from '@ahlan/shared';

import {
  AdminOnly,
  ApiZodBody,
  ApiZodQuery,
  CurrentUser,
  FieldRoles,
  ReviewerRoles,
  StadiumScope,
} from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StadiumScopeGuard } from '../../common/guards/stadium-scope.guard';
import { zodBody, zodParam, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { EodWindowsService } from './eod-windows.service';
import { EodService } from './eod.service';

@ApiTags('eod')
@ApiBearerAuth()
@Controller('eod')
@UseGuards(RolesGuard, StadiumScopeGuard)
@StadiumScope()
export class EodController {
  constructor(
    private readonly eod: EodService,
    private readonly windows: EodWindowsService,
  ) {}

  /* ------------------------------ windows ------------------------------ */

  @Get('windows')
  @ApiOperation({ summary: 'EOD windows in a date range' })
  listWindows(
    @Query('from', zodQuery(isoDateSchema)) from: string,
    @Query('to', zodQuery(isoDateSchema)) to: string,
    @Query('stadiumId') stadiumId?: string,
  ) {
    return this.windows.list(from, to, stadiumId);
  }

  @Put('windows')
  @AdminOnly()
  @ApiOperation({
    summary: 'Open or update an EOD window (admin)',
    description: 'Omit stadiumId to apply it to every stadium, in each stadium’s own zone.',
  })
  @ApiZodBody(upsertEodWindowSchema)
  upsertWindow(
    @Body(zodBody(upsertEodWindowSchema)) body: UpsertEodWindowInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.windows.upsert(body, actor);
  }

  @Post('windows/bulk')
  @AdminOnly()
  @ApiOperation({ summary: 'Open the same window across a date range (admin)' })
  @ApiZodBody(bulkEodWindowSchema)
  bulkWindows(
    @Body(zodBody(bulkEodWindowSchema)) body: BulkEodWindowInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.windows.bulkUpsert(body, actor);
  }

  @Delete('windows/:id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an EOD window (admin)' })
  async removeWindow(
    @Param('id', zodParam(idSchema)) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.windows.remove(id, actor);
  }

  @Get('window-status')
  @FieldRoles()
  @StadiumScope({ source: 'query', field: 'stadiumId', optional: false })
  @ApiOperation({
    summary: 'Can I submit right now?',
    description: 'Drives the submit button and the countdown in the app.',
  })
  windowStatus(
    @Query('stadiumId', zodQuery(idSchema)) stadiumId: string,
    @Query('date', zodQuery(isoDateSchema)) date: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.windows.status(stadiumId, date, actor);
  }

  @Get('window-default')
  @ApiOperation({
    summary: 'The recurring daily EOD window and whether it is open now',
    description:
      'Without stadiumId: the global default, status in Asia/Riyadh. With stadiumId: that stadium’s ' +
      'default (else the global one), status in the stadium’s zone. Per-date windows still override it.',
  })
  @ApiZodQuery(eodWindowDefaultQuerySchema)
  windowDefault(
    @Query(zodQuery(eodWindowDefaultQuerySchema)) query: EodWindowDefaultQuery,
  ) {
    return this.windows.getDefault(query.stadiumId);
  }

  @Put('window-default')
  @AdminOnly()
  @ApiOperation({
    summary: 'Set the recurring daily EOD window (admin)',
    description: 'Omit stadiumId for the global default every stadium uses. Audited.',
  })
  @ApiZodBody(upsertEodWindowDefaultSchema)
  upsertWindowDefault(
    @Body(zodBody(upsertEodWindowDefaultSchema)) body: UpsertEodWindowDefaultInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.windows.upsertDefault(body, actor);
  }

  /* ------------------------------ reports ------------------------------ */

  @Get()
  @ApiOperation({ summary: 'List EOD reports' })
  @ApiZodQuery(listEodQuerySchema)
  list(
    @Query(zodQuery(listEodQuerySchema)) query: ListEodQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.eod.list(query, actor);
  }

  @Get('mine')
  @FieldRoles()
  @StadiumScope({ source: 'query', field: 'stadiumId', optional: false })
  @ApiOperation({ summary: 'Your own report for a stadium and date, if any' })
  getMine(
    @Query('stadiumId', zodQuery(idSchema)) stadiumId: string,
    @Query('date', zodQuery(isoDateSchema)) date: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.eod.getMine(stadiumId, date, actor);
  }

  @Get('compliance')
  @ReviewerRoles()
  @ApiOperation({
    summary: 'Who submitted and who did not, for a date (admin, supervisor)',
    description: 'Lists inspectors only. A supervisor sees their assigned stadiums only.',
  })
  compliance(
    @Query('date', zodQuery(isoDateSchema)) date: string,
    @CurrentUser() actor: RequestUser,
    @Query('stadiumId') stadiumId?: string,
  ) {
    return this.eod.complianceFor(date, stadiumId, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one EOD report' })
  get(@Param('id', zodParam(idSchema)) id: string, @CurrentUser() actor: RequestUser) {
    return this.eod.get(id, actor);
  }

  @Put('draft')
  @FieldRoles()
  @ApiOperation({
    summary: 'Save an EOD draft',
    description: 'Not window-checked: the window only gates submission.',
  })
  @ApiZodBody(saveEodDraftSchema)
  saveDraft(
    @Body(zodBody(saveEodDraftSchema)) body: SaveEodDraftInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.eod.saveDraft(body, actor);
  }

  @Post('submit')
  @FieldRoles()
  @ApiOperation({
    summary: 'Submit the EOD report',
    description:
      'Rejected outside the open window. One report per inspector, per stadium, per stadium-local day.',
  })
  @ApiZodBody(submitEodSchema)
  submit(
    @Body(zodBody(submitEodSchema)) body: SubmitEodInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.eod.submit(body, actor);
  }

  @Patch(':id/correct')
  @AdminOnly()
  @ApiOperation({ summary: 'Correct a submitted EOD report (admin)' })
  @ApiZodBody(correctEodSchema)
  correct(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(correctEodSchema)) body: CorrectEodInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.eod.correct(id, body, actor);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete a submitted EOD report (admin)',
    description:
      'Never hard-deleted. Hidden from every list, KPI, report and sync pull (sent as deleted); audited with the reason. Frees the day slot.',
  })
  @ApiZodBody(softDeleteRecordSchema)
  async remove(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(softDeleteRecordSchema)) body: SoftDeleteRecordInput,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.eod.softDelete(id, body.reason, actor);
  }

  @Post(':id/restore')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a soft-deleted EOD report (admin)' })
  @ApiZodBody(restoreRecordSchema)
  restore(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(restoreRecordSchema)) body: RestoreRecordInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.eod.restore(id, body.reason, actor);
  }
}
