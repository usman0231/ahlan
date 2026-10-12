import { Module } from '@nestjs/common';

import { EodController } from './eod.controller';
import { EodWindowsService } from './eod-windows.service';
import { EodService } from './eod.service';

@Module({
  controllers: [EodController],
  providers: [EodService, EodWindowsService],
  exports: [EodService, EodWindowsService],
})
export class EodModule {}
