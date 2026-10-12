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
  checklistCompletionQuerySchema,
  createChecklistSchema,
  createChecklistVersionSchema,
  idSchema,
  listChecklistsQuerySchema,
  optionalReasonSchema,
  type OptionalReasonInput,
  updateChecklistMetaSchema,
  type ChecklistCompletionQuery,
  type CreateChecklistInput,
  type CreateChecklistVersionInput,
  type ListChecklistsQuery,
  type UpdateChecklistMetaInput,
} from '@ahlan/shared';

import {
  AdminOnly,
  ApiZodBody,
  ApiZodQuery,
  CurrentUser,
  ReviewerRoles,
  StadiumScope,
} from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StadiumScopeGuard } from '../../common/guards/stadium-scope.guard';
import { zodBody, zodParam, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { ChecklistsService } from './checklists.service';

@ApiTags('checklists')
@ApiBearerAuth()
@Controller('checklists')
@UseGuards(RolesGuard, StadiumScopeGuard)
export class ChecklistsController {
  constructor(private readonly checklists: ChecklistsService) {}

  @Get()
  @ApiOperation({ summary: 'List checklists' })
  @ApiZodQuery(listChecklistsQuerySchema)
  list(@Query(zodQuery(listChecklistsQuerySchema)) query: ListChecklistsQuery) {
    return this.checklists.list(query);
  }

  @Get('completion')
  @ReviewerRoles()
  @StadiumScope({ source: 'query', field: 'stadiumId' })
  @ApiOperation({
    summary: 'Checklist completion for a date (admin, supervisor)',
    description:
      'Per checklist: expected = active inspectors x assigned stadiums it applies to, with each ' +
      'inspector’s COMPLETED/PENDING status. Category defaults to READINESS; date to today. ' +
      'A supervisor sees their assigned stadiums only.',
  })
  @ApiZodQuery(checklistCompletionQuerySchema)
  completion(
    @Query(zodQuery(checklistCompletionQuerySchema)) query: ChecklistCompletionQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.checklists.completion(query, actor);
  }

  @Get('for-stadium/:stadiumId')
  @StadiumScope({ source: 'param', field: 'stadiumId', optional: false })
  @ApiOperation({
    summary: 'Checklists an inspector can start at this stadium',
    description: 'Each one includes its published version, so the app can work offline.',
  })
  listForStadium(@Param('stadiumId', zodParam(idSchema)) stadiumId: string) {
    return this.checklists.listForStadium(stadiumId);
  }

  @Get('versions/:versionId')
  @ApiOperation({
    summary: 'One checklist version by id',
    description: 'How a submitted inspection renders the wording it was answered against.',
  })
  getVersion(@Param('versionId', zodParam(idSchema)) versionId: string) {
    return this.checklists.getVersion(versionId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a checklist with its published version' })
  get(@Param('id', zodParam(idSchema)) id: string) {
    return this.checklists.get(id);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Version history of a checklist' })
  listVersions(@Param('id', zodParam(idSchema)) id: string) {
    return this.checklists.listVersions(id);
  }

  @Post()
  @AdminOnly()
  @ApiOperation({ summary: 'Create a checklist with version 1 (admin)' })
  @ApiZodBody(createChecklistSchema)
  create(
    @Body(zodBody(createChecklistSchema)) body: CreateChecklistInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.checklists.create(body, actor);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({
    summary: 'Update checklist metadata (admin)',
    description: 'Title, description, discipline and stadium targeting. Does not create a version.',
  })
  @ApiZodBody(updateChecklistMetaSchema)
  updateMeta(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(updateChecklistMetaSchema)) body: UpdateChecklistMetaInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.checklists.updateMeta(id, body, actor);
  }

  @Post(':id/versions')
  @AdminOnly()
  @ApiOperation({
    summary: 'Create the next checklist version (admin)',
    description:
      'The only way to change questions. Submitted inspections stay on the version they used.',
  })
  @ApiZodBody(createChecklistVersionSchema)
  createVersion(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(createChecklistVersionSchema)) body: CreateChecklistVersionInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.checklists.createVersion(id, body, actor);
  }

  @Post('versions/:versionId/publish')
  @AdminOnly()
  @ApiOperation({ summary: 'Publish a draft version (admin)' })
  publishVersion(
    @Param('versionId', zodParam(idSchema)) versionId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.checklists.publishVersion(versionId, actor);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete a checklist (admin)',
    description: 'Submitted inspections keep their version; the checklist is no longer served.',
  })
  @ApiZodBody(optionalReasonSchema)
  async remove(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(optionalReasonSchema)) body: OptionalReasonInput,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.checklists.softDelete(id, actor, body.reason);
  }
}
