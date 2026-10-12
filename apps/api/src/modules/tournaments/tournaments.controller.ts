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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createTournamentSchema,
  idSchema,
  optionalReasonSchema,
  updateTournamentSchema,
  type OptionalReasonInput,
  type CreateTournamentInput,
  type UpdateTournamentInput,
} from '@ahlan/shared';

import { AdminOnly, ApiZodBody, CurrentUser } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { zodBody, zodParam } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { TournamentsService } from './tournaments.service';

@ApiTags('tournaments')
@ApiBearerAuth()
@Controller('tournaments')
@UseGuards(RolesGuard)
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}

  @Get()
  @ApiOperation({ summary: 'List tournaments, active first' })
  list() {
    return this.tournaments.list();
  }

  @Get('active')
  @ApiOperation({ summary: 'The currently active tournament' })
  getActive() {
    return this.tournaments.getActive();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one tournament' })
  get(@Param('id', zodParam(idSchema)) id: string) {
    return this.tournaments.get(id);
  }

  @Post()
  @AdminOnly()
  @ApiOperation({ summary: 'Create a tournament (admin)' })
  @ApiZodBody(createTournamentSchema)
  create(
    @Body(zodBody(createTournamentSchema)) body: CreateTournamentInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.tournaments.create(body, actor);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update a tournament (admin)' })
  @ApiZodBody(updateTournamentSchema)
  update(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(updateTournamentSchema)) body: UpdateTournamentInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.tournaments.update(id, body, actor);
  }

  @Post(':id/activate')
  @AdminOnly()
  @ApiOperation({
    summary: 'Make this the active tournament (admin)',
    description: 'Deactivates whichever tournament was active before.',
  })
  activate(@Param('id', zodParam(idSchema)) id: string, @CurrentUser() actor: RequestUser) {
    return this.tournaments.activate(id, actor);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete a tournament (admin)',
    description: '409 CONFLICT for the active tournament. Stamped records keep their reference.',
  })
  @ApiZodBody(optionalReasonSchema)
  async remove(
    @Param('id', zodParam(idSchema)) id: string,
    @Body(zodBody(optionalReasonSchema)) body: OptionalReasonInput,
    @CurrentUser() actor: RequestUser,
  ) {
    await this.tournaments.softDelete(id, actor, body.reason);
  }
}
