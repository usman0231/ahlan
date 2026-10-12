import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheck, HealthCheckService, type HealthIndicatorResult } from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';

import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators';
import type { AppConfig } from '../config/configuration';

/**
 * Liveness and readiness.
 *
 * `/health` answers as long as the process is up, so an orchestrator does not
 * restart a healthy API because Redis blipped. `/health/ready` checks the
 * dependencies a request actually needs.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe: database and queue' })
  ready() {
    return this.health.check([() => this.checkDatabase(), () => this.checkRedis()]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: { status: 'up', responseTimeMs: Date.now() - startedAt } };
    } catch (error) {
      return { database: { status: 'down', message: (error as Error).message } };
    }
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    const redis = this.config.get('redis', { infer: true });
    const client = new Redis({
      host: redis.host,
      port: redis.port,
      password: redis.password,
      lazyConnect: true,
      // A readiness probe must fail fast rather than hang on a dead host.
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
    });

    try {
      await client.connect();
      const pong = await client.ping();
      return { redis: { status: pong === 'PONG' ? 'up' : 'down' } };
    } catch (error) {
      return { redis: { status: 'down', message: (error as Error).message } };
    } finally {
      client.disconnect();
    }
  }
}
