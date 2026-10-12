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
  listAiInsightsQuerySchema,
  optionalReasonSchema,
  type OptionalReasonInput,
  requestAiInsightsSchema,
  reviewAiInsightSchema,
  type ListAiInsightsQuery,
  type RequestAiInsightsInput,
  type ReviewAiInsightInput,
} from '@ahlan/shared';

import { AdminOnly, ApiZodBody, ApiZodQuery, CurrentUser } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StadiumScopeGuard } from '../../common/guards/stadium-scope.guard';
import { zodBody, zodParam, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { AiService } from './ai.service';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/insights')
@UseGuards(RolesGuard, StadiumScopeGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get()
  @ApiOperation({
    summary: 'List AI insights',
    description:
      'Every entry is labelled AI-generated. Inspectors only ever see approved insights for their stadiums.',
  })
  @ApiZodQuery(listAiInsightsQuerySchema)
  list(
    @Query(zodQuery(listAiInsightsQuerySchema)) query: ListAiInsightsQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.ai.list(query, actor);
  }

  @Get('pending-count')
  @AdminOnly()
  @ApiOperation({ summary: 'How many insights are waiting for review (admin)' })
  async pendingCount() {
    return { pending: await this.ai.pendingReviewCount() };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one insight, including the figures it was built from' })
  get(@Param('id', zodParam(idSchema)) id: string, @CurrentUser() actor: RequestUser) {
    return this.ai.get(id, actor);
  }

  @Post('generate')
  @AdminOnly()
  @ApiOperation({
    summary: 'Queue a generation run (admin)',
    description:
      'Runs in a worker against aggregated figures only. Results arrive as PENDING_REVIEW.',
  })
  @ApiZodBody(requestAiInsightsSchema)
  request(
    @Body(zodBody(requestAiInsightsSchema)) body: RequestAiInsightsInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.ai.request(body, actor);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an AI insight (admin)',
    description: 'Already-generated report PDFs are not changed. Audited.',
  })
  @ApiZodBody(optionalReasonSchema)
  async remove(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(optionalReasonSchema)) body: OptionalReasonInput,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.ai.remove(id, actor, body.reason);
  }

  @Post(':id/review')
  @AdminOnly()
  @ApiOperation({
    summary: 'Approve or reject an insight (admin)',
    description:
      'Approval is what makes an insight usable in an official report. The wording may be corrected first.',
  })
  @ApiZodBody(reviewAiInsightSchema)
  review(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(reviewAiInsightSchema)) body: ReviewAiInsightInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.ai.review(id, body, actor);
  }
}
