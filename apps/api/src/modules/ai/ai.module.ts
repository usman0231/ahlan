import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/configuration';
import { KpisModule } from '../kpis/kpis.module';
import { AiController } from './ai.controller';
import { AiProcessor } from './ai.processor';
import { AI_PROVIDER, AnthropicAiProvider, LocalAiProvider } from './ai.provider';
import { AiService } from './ai.service';

/**
 * The provider is chosen once, at boot, from `AI_PROVIDER` in the environment.
 * `local` is the development default and makes no network calls at all, so the
 * whole pipeline works without a key.
 */
@Module({
  imports: [KpisModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiProcessor,
    LocalAiProvider,
    {
      provide: AI_PROVIDER,
      inject: [ConfigService, LocalAiProvider],
      useFactory: (config: ConfigService<AppConfig, true>, local: LocalAiProvider) =>
        config.get('ai', { infer: true }).provider === 'anthropic'
          ? new AnthropicAiProvider(config)
          : local,
    },
  ],
  exports: [AiService],
})
export class AiModule {}
