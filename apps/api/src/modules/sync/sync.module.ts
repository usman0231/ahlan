import { Module } from '@nestjs/common';

import { EodModule } from '../eod/eod.module';
import { InspectionsModule } from '../inspections/inspections.module';
import { ObservationsModule } from '../observations/observations.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

/**
 * Sync owns no business rules of its own: it delegates to the modules that do,
 * which is what keeps an offline submit identical to an online one.
 */
@Module({
  imports: [InspectionsModule, ObservationsModule, EodModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
