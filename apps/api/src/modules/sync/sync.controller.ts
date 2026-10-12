import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  pullQuerySchema,
  pushBodySchema,
  type PullQuery,
  type PushBody,
} from '@ahlan/shared';

import { ApiZodBody, ApiZodQuery, CurrentUser } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('pull')
  @ApiOperation({
    summary: 'Pull everything that changed since the last sync',
    description:
      'Scoped to the caller: an inspector receives only their assigned stadiums. Pass lastPulledAt=0 for a full sync.',
  })
  @ApiZodQuery(pullQuerySchema)
  pull(@Query(zodQuery(pullQuerySchema)) query: PullQuery, @CurrentUser() actor: RequestUser) {
    return this.sync.pull(query, actor);
  }

  @Post('push')
  @ApiOperation({
    summary: 'Push locally created records',
    description:
      'Each record is re-validated and run through the same service as an online submit, so every rule still applies. Per-record failures come back in `rejected`.',
  })
  @ApiZodBody(pushBodySchema)
  push(@Body(zodBody(pushBodySchema)) body: PushBody, @CurrentUser() actor: RequestUser) {
    return this.sync.push(body, actor);
  }
}
