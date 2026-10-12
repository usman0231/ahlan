import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { listAuditLogsQuerySchema, type ListAuditLogsQuery } from '@ahlan/shared';

import { AdminOnly, ApiZodQuery } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { zodQuery } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from './audit.service';

/** Read-only. Nothing in the product can write an audit row through HTTP. */
@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit-logs')
@UseGuards(RolesGuard)
@AdminOnly()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries (admin)' })
  @ApiZodQuery(listAuditLogsQuerySchema)
  list(@Query(zodQuery(listAuditLogsQuerySchema)) query: ListAuditLogsQuery) {
    return this.audit.list(query);
  }

  @Get(':entity/:entityId')
  @ApiOperation({ summary: 'Full history of one record (admin)' })
  history(@Param('entity') entity: string, @Param('entityId') entityId: string) {
    return this.audit.historyFor(entity, entityId);
  }
}
