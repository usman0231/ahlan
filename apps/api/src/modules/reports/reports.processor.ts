import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { fromDateColumn } from '../../common/util/local-date';
import { JOBS, QUEUES } from '../../queues/queue-names';
import { NotificationsService } from '../notifications/notifications.service';
import { PdfService } from './pdf.service';
import { ReportDataService } from './report-data.service';
import { ReportsService } from './reports.service';
import { renderReportHtml } from './templates/report.template';

interface GenerateReportJob {
  reportId: string;
}

/**
 * Generates a report PDF out of process.
 *
 * Failures are recorded on the report row as well as re-thrown: BullMQ retries
 * with backoff, and the admin sees why it failed rather than a row stuck on
 * RUNNING forever.
 */
@Processor(QUEUES.reports)
export class ReportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly reportData: ReportDataService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  override async process(job: Job<GenerateReportJob>): Promise<{ objectKey: string }> {
    if (job.name !== JOBS.generateReport) {
      this.logger.warn(`Ignoring unknown job ${job.name}`);
      return { objectKey: '' };
    }

    const { reportId } = job.data;
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: { stadium: { select: { code: true } } },
    });
    if (!report) {
      this.logger.warn(`Report ${reportId} no longer exists; dropping the job`);
      return { objectKey: '' };
    }

    const startedAt = Date.now();
    await this.reports.markRunning(reportId);

    try {
      const data = await this.reportData.build(report);
      const html = renderReportHtml(data);
      const { buffer, sizeBytes } = await this.pdf.render(html);

      const objectKey = this.storage.buildReportKey({
        tournamentId: report.tournamentId,
        type: report.type,
        stadiumCode: report.stadium?.code ?? null,
        periodEnd: fromDateColumn(report.periodEnd),
        reportId,
      });

      await this.storage.putObject({
        bucket: this.storage.reportsBucket,
        objectKey,
        body: buffer,
        contentType: 'application/pdf',
      });

      const fileName = buildFileName(report.type, report.stadium?.code ?? null, data.meta.periodEnd);

      await this.reports.markCompleted(reportId, {
        objectKey,
        fileName,
        sizeBytes,
        pageCount: null,
      });

      this.logger.log(
        `Generated ${report.type} report ${reportId} (${Math.round(sizeBytes / 1024)} KB) in ${
          Date.now() - startedAt
        }ms`,
      );

      await this.notifications.notify({
        userId: report.requestedById,
        kind: 'REPORT_READY',
        title: 'Your report is ready',
        body: `${data.meta.title} for ${data.meta.periodStart} to ${data.meta.periodEnd}.`,
        route: '/reports',
        data: { reportId },
      });

      return { objectKey };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Report ${reportId} failed: ${message}`, (error as Error).stack);
      await this.reports.markFailed(reportId, message);
      // Re-thrown so BullMQ can retry; the row already says what went wrong.
      throw error;
    }
  }
}

function buildFileName(type: string, stadiumCode: string | null, periodEnd: string): string {
  const scope = stadiumCode ?? 'ALL';
  return `ahlan-hse-${type.toLowerCase().replace(/_/g, '-')}-${scope}-${periodEnd}.pdf`;
}
