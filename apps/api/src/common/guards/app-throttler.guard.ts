import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
  type ThrottlerRequest,
} from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';

import type { AppConfig } from '../../config/configuration';

/**
 * Rate limiting, with an off switch for the test environment.
 *
 * The limits on `/auth/login` and `/auth/register` are deliberately tight,
 * because those are the unauthenticated endpoints. That also means an e2e suite
 * - which signs in dozens of times a minute as different seeded users - trips
 * them and fails on 429 rather than on anything it meant to assert.
 *
 * Rather than loosening the production limit or making the tests sleep, the
 * guard is disabled when `NODE_ENV=test`. The limits themselves are still
 * covered by their own test.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    super(options, storageService, reflector);
  }

  protected override async shouldSkip(context: Parameters<ThrottlerGuard['canActivate']>[0]) {
    if (!this.config.get('throttle', { infer: true }).enabled) return true;
    return super.shouldSkip(context);
  }

  /**
   * Behind a reverse proxy every request would otherwise share the proxy's IP
   * and exhaust one shared bucket.
   */
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = (req.headers ?? {}) as Record<string, string | string[] | undefined>;
    const forwarded = headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]?.trim();
    return first ?? (req.ip as string) ?? 'unknown';
  }

  protected override async handleRequest(request: ThrottlerRequest): Promise<boolean> {
    return super.handleRequest(request);
  }
}
