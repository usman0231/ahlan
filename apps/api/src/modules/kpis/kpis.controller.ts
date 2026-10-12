import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  disciplineDashboardQuerySchema,
  idSchema,
  kpiQuerySchema,
  stadiumCardsQuerySchema,
  type DisciplineDashboardQuery,
  type KpiQuery,
  type StadiumCardsQuery,
} from '@ahlan/shared';

import { ApiZodQuery, CurrentUser, FieldRoles, StadiumScope } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StadiumScopeGuard } from '../../common/guards/stadium-scope.guard';
import { zodParam, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { KpisService } from './kpis.service';

@ApiTags('kpis')
@ApiBearerAuth()
@Controller('kpis')
@UseGuards(RolesGuard, StadiumScopeGuard)
@StadiumScope({ source: 'query' })
export class KpisController {
  constructor(private readonly kpis: KpisService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Admin dashboard figures',
    description:
      'Defaults to the last 30 days inside the active tournament. An inspector only ever gets their own stadiums.',
  })
  @ApiZodQuery(kpiQuerySchema)
  dashboard(@Query(zodQuery(kpiQuerySchema)) query: KpiQuery, @CurrentUser() actor: RequestUser) {
    return this.kpis.dashboard(query, actor);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Headline KPI summary for a window' })
  @ApiZodQuery(kpiQuerySchema)
  async summary(
    @Query(zodQuery(kpiQuerySchema)) query: KpiQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.kpis.summary(await this.kpis.resolveWindow(query, actor), query.compare);
  }

  @Get('by-stadium')
  @ApiOperation({ summary: 'Per-stadium figures, worst compliance first' })
  @ApiZodQuery(kpiQuerySchema)
  async byStadium(
    @Query(zodQuery(kpiQuerySchema)) query: KpiQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.kpis.byStadium(await this.kpis.resolveWindow(query, actor));
  }

  @Get('by-discipline')
  @ApiOperation({ summary: 'Per-discipline figures' })
  @ApiZodQuery(kpiQuerySchema)
  async byDiscipline(
    @Query(zodQuery(kpiQuerySchema)) query: KpiQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.kpis.byDiscipline(await this.kpis.resolveWindow(query, actor));
  }

  @Get('by-inspector')
  @ApiOperation({ summary: 'Per-inspector activity and EOD discipline' })
  @ApiZodQuery(kpiQuerySchema)
  async byInspector(
    @Query(zodQuery(kpiQuerySchema)) query: KpiQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.kpis.byInspector(await this.kpis.resolveWindow(query, actor));
  }

  @Get('trend')
  @ApiOperation({ summary: 'Daily compliance series for the chart' })
  @ApiZodQuery(kpiQuerySchema)
  async trend(@Query(zodQuery(kpiQuerySchema)) query: KpiQuery, @CurrentUser() actor: RequestUser) {
    return this.kpis.trend(await this.kpis.resolveWindow(query, actor));
  }

  @Get('stadium-cards')
  @ApiOperation({
    summary: 'Stadium cards: readiness checklists done/expected, open findings, compliance',
    description:
      'Date defaults to today in each stadium’s zone. Inspectors and supervisors get only their ' +
      'assigned stadiums.',
  })
  @ApiZodQuery(stadiumCardsQuerySchema)
  stadiumCards(
    @Query(zodQuery(stadiumCardsQuerySchema)) query: StadiumCardsQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.kpis.stadiumCards(query, actor);
  }

  @Get('disciplines/:disciplineId')
  @ApiOperation({
    summary: 'One HSE Observation discipline dashboard',
    description:
      'Observation mix by type and severity, findings, compliance on the discipline’s checklists, ' +
      'per-stadium split, daily series and top failing items. Window defaults like the other KPIs.',
  })
  @ApiZodQuery(disciplineDashboardQuerySchema)
  disciplineDashboard(
    @Param('disciplineId', zodParam(idSchema)) disciplineId: string,
    @Query(zodQuery(disciplineDashboardQuerySchema)) query: DisciplineDashboardQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.kpis.disciplineDashboard(disciplineId, query, actor);
  }

  @Get('inspector-home')
  @FieldRoles()
  @ApiOperation({
    summary: "The inspector's home screen",
    description: 'Today per assigned stadium, in each stadium’s own time zone.',
  })
  inspectorHome(@CurrentUser() actor: RequestUser) {
    return this.kpis.inspectorHome(actor);
  }
}
