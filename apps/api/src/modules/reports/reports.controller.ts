import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  idSchema,
  listReportsQuerySchema,
  optionalReasonSchema,
  type OptionalReasonInput,
  requestReportSchema,
  type ListReportsQuery,
  type RequestReportInput,
} from '@ahlan/shared';

import {
  AdminOnly,
  ApiZodBody,
  ApiZodQuery,
  CurrentUser,
  ReviewerRoles,
} from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StadiumScopeGuard } from '../../common/guards/stadium-scope.guard';
import { zodBody, zodParam, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(RolesGuard, StadiumScopeGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'List generated reports' })
  @ApiZodQuery(listReportsQuerySchema)
  list(
    @Query(zodQuery(listReportsQuerySchema)) query: ListReportsQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.reports.list(query, actor);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Report status and download link',
    description: 'The download URL is presigned on read and short-lived.',
  })
  get(@Param('id', zodParam(idSchema)) id: string, @CurrentUser() actor: RequestUser) {
    return this.reports.get(id, actor);
  }

  @Post()
  @ReviewerRoles()
  @ApiOperation({
    summary: 'Request a report (admin, supervisor)',
    description:
      'Returns immediately with a QUEUED report. A BullMQ worker renders the PDF; poll this id or wait for the push notification. ' +
      'A supervisor may only request scope STADIUM for an assigned stadium (FORBIDDEN / STADIUM_OUT_OF_SCOPE otherwise).',
  })
  @ApiZodBody(requestReportSchema)
  request(
    @Body(zodBody(requestReportSchema)) body: RequestReportInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.reports.request(body, actor);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a report and its PDF (admin)',
    description: '409 CONFLICT while the report is RUNNING. Audited.',
  })
  @ApiZodBody(optionalReasonSchema)
  async remove(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(optionalReasonSchema)) body: OptionalReasonInput,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.reports.remove(id, actor, body.reason);
  }

  @Post(':id/retry')
  @ReviewerRoles()
  @ApiOperation({ summary: 'Re-run a failed report (admin; supervisor for own stadium reports)' })
  retry(@Param('id', zodParam(idSchema)) id: string, @CurrentUser() actor: RequestUser) {
    return this.reports.retry(id, actor);
  }

  @Post('preview-period')
  @ReviewerRoles()
  @ApiOperation({
    summary: 'Resolve the period a request would cover (admin, supervisor)',
    description: 'Lets the admin UI show the exact date range before queueing anything.',
  })
  @ApiZodBody(requestReportSchema)
  previewPeriod(@Body(zodBody(requestReportSchema)) body: RequestReportInput) {
    return this.reports.resolvePeriod(body);
  }
}
