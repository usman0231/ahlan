import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { AiInsightKind } from '@prisma/client';
import type { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { JOBS, QUEUES } from '../../queues/queue-names';
import { KpisService, type KpiWindow } from '../kpis/kpis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AI_PROVIDER, type AiProvider } from './ai.provider';
import { AiService } from './ai.service';
import { PROMPT_VERSION, buildSnapshot } from './prompt.builder';

interface GenerateInsightsJob {
  jobId: string;
  tournamentId: string;
  stadiumId: string | null;
  periodStart: string;
  periodEnd: string;
  kinds: AiInsightKind[];
  locale: 'en' | 'ar';
  requestedById: string;
}

/**
 * Generates AI insights out of process.
 *
 * The aggregate snapshot is built here from our own database and stored with
 * every insight, so a reviewing admin can see precisely what the model was
 * given. Nothing is auto-published.
 */
@Processor(QUEUES.ai)
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kpis: KpisService,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {
    super();
  }

  override async process(job: Job<GenerateInsightsJob>): Promise<{ insightIds: string[] }> {
    if (job.name !== JOBS.generateInsights) {
      this.logger.warn(`Ignoring unknown job ${job.name}`);
      return { insightIds: [] };
    }

    const data = job.data;
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: data.tournamentId },
      select: { name: true },
    });
    if (!tournament) {
      this.logger.warn(`Tournament ${data.tournamentId} no longer exists; dropping the job`);
      return { insightIds: [] };
    }

    const stadium = data.stadiumId
      ? await this.prisma.stadium.findUnique({
          where: { id: data.stadiumId },
          select: { name: true },
        })
      : null;

    const window: KpiWindow = {
      from: data.periodStart,
      to: data.periodEnd,
      stadiumIds: data.stadiumId ? [data.stadiumId] : null,
      tournamentId: data.tournamentId,
    };

    const [summary, byStadium, byDiscipline, trend, repeatFailures] = await Promise.all([
      this.kpis.summary(window, true),
      data.stadiumId ? Promise.resolve([]) : this.kpis.byStadium(window),
      this.kpis.byDiscipline(window),
      this.kpis.trend(window),
      this.kpis.topRepeatFindings(window, 5),
    ]);

    const snapshot = buildSnapshot({
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      tournamentName: tournament.name,
      stadiumName: stadium?.name ?? null,
      summary,
      byStadium,
      byDiscipline,
      trend,
      repeatFailures: repeatFailures.map((row) => ({
        itemCode: row.itemCode,
        question: row.question,
        noCount: row.noCount,
      })),
    });

    this.logger.log(
      `Generating ${data.kinds.length} insight(s) with the ${this.provider.name} provider ` +
        `for ${data.periodStart}..${data.periodEnd}`,
    );

    const result = await this.provider.generate({
      snapshot,
      kinds: data.kinds,
      locale: data.locale,
    });

    const insightIds = await this.ai.storeGenerated({
      tournamentId: data.tournamentId,
      stadiumId: data.stadiumId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      model: result.model,
      promptVersion: PROMPT_VERSION,
      snapshot,
      insights: result.insights,
    });

    await this.notifications.notify({
      userId: data.requestedById,
      kind: 'AI_INSIGHT_READY',
      title: 'AI insights ready for review',
      body: `${insightIds.length} insight(s) are waiting for your review before they can be used in a report.`,
      route: '/manage/ai-insights',
      data: { count: String(insightIds.length) },
    });

    return { insightIds };
  }
}
