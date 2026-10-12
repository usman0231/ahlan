import { Global, Module } from '@nestjs/common';

import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';

/** Global: inspections, observations, findings and EOD all attach evidence. */
@Global()
@Module({
  controllers: [EvidenceController],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
