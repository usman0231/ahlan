import { Module } from '@nestjs/common';

import { FindingsModule } from '../findings/findings.module';
import { DisciplinesController } from './disciplines.controller';
import { DisciplinesService } from './disciplines.service';
import { ObservationsController } from './observations.controller';
import { ObservationsService } from './observations.service';

@Module({
  imports: [FindingsModule],
  controllers: [ObservationsController, DisciplinesController],
  providers: [ObservationsService, DisciplinesService],
  exports: [ObservationsService, DisciplinesService],
})
export class ObservationsModule {}
