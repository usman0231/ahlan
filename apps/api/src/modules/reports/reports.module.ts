import { Module } from '@nestjs/common';

import { KpisModule } from '../kpis/kpis.module';
import { PdfService } from './pdf.service';
import { ReportDataService } from './report-data.service';
import { ReportsController } from './reports.controller';
import { ReportsProcessor } from './reports.processor';
import { ReportsService } from './reports.service';

@Module({
  imports: [KpisModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportDataService, PdfService, ReportsProcessor],
  exports: [ReportsService, ReportDataService],
})
export class ReportsModule {}
