import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import {
  uuidv7,
  type AiInsight as AiInsightDto,
  type ListAiInsightsQuery,
  type Paginated,
  type RequestAiInsightsInput,
  type ReviewAiInsightInput,
} from '@ahlan/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { cursorArgs, paginateById } from '../../common/util/cursor';
import { fromDateColumn, toDateColumn } from '../../common/util/local-date';
import {
  canAccessStadium,
  isStadiumScoped,
  type RequestUser,
} from '../../common/types/request-user';
import { AuditService } from '../audit/audit.service';
import { JOBS, QUEUES } from '../../queues/queue-names';
import { enqueue } from '../../queues/enqueue';

/**
 * AI Intelligence.
 *
 * Generation is queued, never done in a request. Everything produced lands in
 * `ai_insights` as PENDING_REVIEW and is labelled AI-generated; only an admin's
 * approval makes it eligible for an official report.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUES.ai) private readonly queue: Queue,
  ) {}

  async list(query: ListAiInsightsQuery, actor: RequestUser): Promise<Paginated<AiInsightDto>> {
    const rows = await this.prisma.aiInsight.findMany({
      where: {
        kind: query.kind,
        reviewStatus: query.reviewStatus,
        stadiumId: query.stadiumId,
        tournamentId: query.tournamentId,
        ...(isStadiumScoped(actor)
          ? {
              // Supervisors and inspectors only see approved insights for their stadiums.
              reviewStatus: 'APPROVED',
              OR: [{ stadiumId: { in: actor.stadiumIds } }, { stadiumId: null }],
            }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
    });

    const page = paginateById(rows, query.limit);
    return { ...page, items: page.items.map(toDto) };
  }

  async get(id: string, actor: RequestUser): Promise<AiInsightDto> {
    const row = await this.prisma.aiInsight.findUnique({ where: { id } });
    if (!row) throw AppException.notFound('AI insight', id);
    if (isStadiumScoped(actor)) {
      if (row.reviewStatus !== 'APPROVED') {
        throw AppException.forbidden('This insight has not been reviewed yet');
      }
      if (row.stadiumId && !canAccessStadium(actor, row.stadiumId)) {
        throw AppException.outOfScope();
      }
    }
    return toDto(row);
  }

  /** Admin delete of a generated insight (not an HSE record, so a hard delete). */
  async remove(id: string, actor: RequestUser, reason?: string): Promise<void> {
    const row = await this.prisma.aiInsight.findUnique({ where: { id } });
    if (!row) throw AppException.notFound('AI insight', id);
    await this.prisma.$transaction(async (tx) => {
      await tx.aiInsight.delete({ where: { id } });
      await this.audit.record(
        {
          actor,
          action: 'DELETE',
          entity: 'ai_insights',
          entityId: id,
          stadiumId: row.stadiumId,
          reason: reason ?? null,
          diff: { title: { from: row.title, to: null }, reviewStatus: { from: row.reviewStatus, to: null } },
        },
        tx,
      );
    });
  }

  async pendingReviewCount(): Promise<number> {
    return this.prisma.aiInsight.count({ where: { reviewStatus: 'PENDING_REVIEW' } });
  }

  /** Queues a generation run and returns the job id to poll. */
  async request(input: RequestAiInsightsInput, actor: RequestUser): Promise<{ jobId: string }> {
    const tournament = input.tournamentId
      ? await this.prisma.tournament.findFirst({ where: { id: input.tournamentId, deletedAt: null } })
      : await this.prisma.tournament.findFirst({ where: { isActive: true } });
    if (!tournament) {
      throw AppException.validation('No active tournament to analyse');
    }
    if (input.periodStart > input.periodEnd) {
      throw AppException.validation('periodStart must not be after periodEnd');
    }

    const jobId = uuidv7();
    try {
      await enqueue(
        this.queue,
        JOBS.generateInsights,
        {
          jobId,
          tournamentId: tournament.id,
          stadiumId: input.stadiumId ?? null,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          kinds: input.kinds,
          locale: input.locale,
          requestedById: actor.id,
        },
        { jobId: `ai:${jobId}` },
      );
    } catch (error) {
      this.logger.error(`Could not enqueue AI job: ${(error as Error).message}`);
      throw AppException.internal('The AI queue is unavailable. Please try again.');
    }

    await this.audit.record({
      actor,
      action: 'CREATE',
      entity: 'ai_insights',
      entityId: jobId,
      stadiumId: input.stadiumId ?? null,
      reason: `AI insights requested (${input.kinds.join(', ')})`,
    });

    return { jobId };
  }

  /**
   * The review gate. Approving is what makes an insight publishable; an admin
   * may correct the wording first, and the edit is recorded.
   */
  async review(
    id: string,
    input: ReviewAiInsightInput,
    actor: RequestUser,
  ): Promise<AiInsightDto> {
    const existing = await this.prisma.aiInsight.findUnique({ where: { id } });
    if (!existing) throw AppException.notFound('AI insight', id);
    if (existing.reviewStatus !== 'PENDING_REVIEW') {
      throw AppException.conflict(
        `This insight has already been ${existing.reviewStatus.toLowerCase()}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.aiInsight.update({
        where: { id },
        data: {
          reviewStatus: input.decision,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          reviewNote: input.note ?? null,
          title: input.editedTitle ?? existing.title,
          body: input.editedBody ?? existing.body,
        },
      });

      await this.audit.record(
        {
          actor,
          action: input.decision === 'APPROVED' ? 'APPROVE' : 'REJECT',
          entity: 'ai_insights',
          entityId: id,
          stadiumId: existing.stadiumId,
          reason: input.note ?? null,
          diff: {
            reviewStatus: { from: 'PENDING_REVIEW', to: input.decision },
            ...(input.editedTitle ? { title: { from: existing.title, to: input.editedTitle } } : {}),
            ...(input.editedBody ? { body: { from: '(edited)', to: '(edited)' } } : {}),
          },
        },
        tx,
      );

      return row;
    });

    return toDto(updated);
  }

  /** Called by the worker once a generation run produces insights. */
  async storeGenerated(input: {
    tournamentId: string;
    stadiumId: string | null;
    periodStart: string;
    periodEnd: string;
    model: string;
    promptVersion: string;
    snapshot: unknown;
    insights: {
      kind: AiInsightDto['kind'];
      title: string;
      body: string;
      bullets: string[];
      severity: AiInsightDto['severity'];
      confidence: number;
    }[];
  }): Promise<string[]> {
    const ids: string[] = [];

    for (const insight of input.insights) {
      const id = uuidv7();
      ids.push(id);
      await this.prisma.aiInsight.create({
        data: {
          id,
          kind: insight.kind,
          tournamentId: input.tournamentId,
          stadiumId: input.stadiumId,
          periodStart: toDateColumn(input.periodStart),
          periodEnd: toDateColumn(input.periodEnd),
          title: insight.title,
          body: insight.body,
          bullets: insight.bullets,
          severity: insight.severity ?? null,
          confidence: new Prisma.Decimal(insight.confidence.toFixed(3)),
          inputSnapshot: input.snapshot as Prisma.InputJsonValue,
          model: input.model,
          promptVersion: input.promptVersion,
          // Never anything else on creation: review is not optional.
          reviewStatus: 'PENDING_REVIEW',
        },
      });
    }

    return ids;
  }
}

type AiInsightRow = Prisma.AiInsightGetPayload<Record<string, never>>;

function toDto(row: AiInsightRow): AiInsightDto {
  return {
    id: row.id,
    kind: row.kind,
    tournamentId: row.tournamentId,
    stadiumId: row.stadiumId,
    periodStart: fromDateColumn(row.periodStart),
    periodEnd: fromDateColumn(row.periodEnd),
    title: row.title,
    body: row.body,
    bullets: row.bullets,
    severity: row.severity,
    confidence: row.confidence === null ? null : Number(row.confidence),
    inputSnapshot: row.inputSnapshot,
    model: row.model,
    promptVersion: row.promptVersion,
    reviewStatus: row.reviewStatus,
    reviewedById: row.reviewedById,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    // Not a stored column: the label is always true, so the UI cannot drop it.
    isAiGenerated: true,
    createdAt: row.createdAt,
  };
}
