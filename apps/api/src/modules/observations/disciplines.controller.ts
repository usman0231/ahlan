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
  createDisciplineSchema,
  idSchema,
  optionalReasonSchema,
  updateDisciplineSchema,
  type OptionalReasonInput,
  type CreateDisciplineInput,
  type UpdateDisciplineInput,
} from '@ahlan/shared';

import { AdminOnly, ApiZodBody, CurrentUser } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { zodBody, zodParam } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { DisciplinesService } from './disciplines.service';

/**
 * Disciplines belong with observations: they are what an observation is filed
 * under, and the app downloads them for offline use.
 */
@ApiTags('disciplines')
@ApiBearerAuth()
@Controller('disciplines')
@UseGuards(RolesGuard)
export class DisciplinesController {
  constructor(private readonly disciplines: DisciplinesService) {}

  @Get()
  @ApiOperation({ summary: 'List disciplines in display order' })
  list(@Query('includeInactive') includeInactive?: string) {
    return this.disciplines.list(includeInactive === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one discipline' })
  get(@Param('id', zodParam(idSchema)) id: string) {
    return this.disciplines.get(id);
  }

  @Post()
  @AdminOnly()
  @ApiOperation({ summary: 'Add a discipline (admin)' })
  @ApiZodBody(createDisciplineSchema)
  create(
    @Body(zodBody(createDisciplineSchema)) body: CreateDisciplineInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.disciplines.create(body, actor);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update a discipline (admin)' })
  @ApiZodBody(updateDisciplineSchema)
  update(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(updateDisciplineSchema)) body: UpdateDisciplineInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.disciplines.update(id, body, actor);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete a discipline (admin)',
    description:
      'Sets deletedAt and deactivates it. Historical observations keep resolving it. To only hide it, PATCH isActive=false.',
  })
  @ApiZodBody(optionalReasonSchema)
  async remove(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(optionalReasonSchema)) body: OptionalReasonInput,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.disciplines.softDelete(id, actor, body.reason);
  }
}
