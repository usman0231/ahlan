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
  attachStadiumImageSchema,
  createStadiumSchema,
  idSchema,
  optionalReasonSchema,
  presignStadiumImageSchema,
  type AttachStadiumImageInput,
  type OptionalReasonInput,
  type PresignStadiumImageInput,
  listStadiumsQuerySchema,
  updateStadiumSchema,
  type CreateStadiumInput,
  type ListStadiumsQuery,
  type UpdateStadiumInput,
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
import { StadiumsService } from './stadiums.service';

@ApiTags('stadiums')
@ApiBearerAuth()
@Controller('stadiums')
@UseGuards(RolesGuard, StadiumScopeGuard)
export class StadiumsController {
  constructor(private readonly stadiums: StadiumsService) {}

  @Get()
  @ApiOperation({
    summary: 'List stadiums',
    description: 'An inspector only ever sees the stadiums assigned to them.',
  })
  @ApiZodQuery(listStadiumsQuerySchema)
  list(
    @Query(zodQuery(listStadiumsQuerySchema)) query: ListStadiumsQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.stadiums.list(query, actor);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Every stadium the caller may work on, for pickers' })
  listMine(@CurrentUser() actor: RequestUser) {
    return this.stadiums.listMine(actor);
  }

  @Get(':id')
  @StadiumScope({ source: 'param', field: 'id', optional: false })
  @ApiOperation({ summary: 'Get one stadium' })
  get(@Param('id', zodParam(idSchema)) id: string) {
    return this.stadiums.get(id);
  }

  @Get(':id/assignees')
  @StadiumScope({ source: 'param', field: 'id', optional: false })
  @ApiOperation({ summary: 'Users assigned to this stadium' })
  listAssignees(@Param('id', zodParam(idSchema)) id: string) {
    return this.stadiums.listAssignees(id);
  }

  @Post()
  @AdminOnly()
  @ApiOperation({ summary: 'Create a stadium (admin)' })
  @ApiZodBody(createStadiumSchema)
  create(
    @Body(zodBody(createStadiumSchema)) body: CreateStadiumInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.stadiums.create(body, actor);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update a stadium (admin)' })
  @ApiZodBody(updateStadiumSchema)
  update(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(updateStadiumSchema)) body: UpdateStadiumInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.stadiums.update(id, body, actor);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete a stadium (admin)',
    description: 'Historical records keep resolving; assignments are cleared.',
  })
  @ApiZodBody(optionalReasonSchema)
  async remove(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(optionalReasonSchema)) body: OptionalReasonInput,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.stadiums.softDelete(id, actor, body.reason);
  }

  @Post(':id/image/presign')
  @AdminOnly()
  @ApiOperation({
    summary: 'Presigned PUT for a stadium photo (admin)',
    description:
      'jpeg/png/webp, at most 8 MB. PUT the bytes to uploadUrl with the returned headers, then call PUT /stadiums/:id/image.',
  })
  @ApiZodBody(presignStadiumImageSchema)
  presignImage(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(presignStadiumImageSchema)) body: PresignStadiumImageInput,
  ) {
    return this.stadiums.presignImage(id, body);
  }

  @Put(':id/image')
  @AdminOnly()
  @ApiOperation({
    summary: 'Attach the uploaded photo to the stadium (admin)',
    description:
      'Verifies the object exists in storage (409 OBJECT_NOT_UPLOADED otherwise) and replaces any previous photo.',
  })
  @ApiZodBody(attachStadiumImageSchema)
  attachImage(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(attachStadiumImageSchema)) body: AttachStadiumImageInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.stadiums.attachImage(id, body, actor);
  }

  @Delete(':id/image')
  @AdminOnly()
  @ApiOperation({ summary: 'Remove the uploaded stadium photo (admin)' })
  removeImage(@Param('id', zodParam(idSchema)) id: string, @CurrentUser() actor: RequestUser) {
    return this.stadiums.removeImage(id, actor);
  }
}
