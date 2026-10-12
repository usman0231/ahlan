import 'reflect-metadata';

import { Logger, type LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';

import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';

const LOG_LEVELS: Record<string, LogLevel[]> = {
  error: ['error'],
  warn: ['error', 'warn'],
  log: ['error', 'warn', 'log'],
  debug: ['error', 'warn', 'log', 'debug'],
  verbose: ['error', 'warn', 'log', 'debug', 'verbose'],
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<AppConfig, true>);
  const logger = new Logger('Bootstrap');

  app.useLogger(LOG_LEVELS[config.get('logLevel', { infer: true })] ?? LOG_LEVELS.log!);

  // The API serves JSON to a native app, so CSP and friends are not the point;
  // the useful parts here are nosniff, HSTS and frame denial.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());

  app.enableCors({
    origin: config.get('corsOrigins', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  const prefix = config.get('apiPrefix', { infer: true });
  app.setGlobalPrefix(prefix, {
    // Probes stay at the root so a load balancer does not need the version.
    exclude: ['health', 'health/ready'],
  });

  // Behind a reverse proxy, so X-Forwarded-For is what identifies a client for
  // rate limiting and audit entries.
  app.set('trust proxy', 1);

  app.enableShutdownHooks();

  const swagger = new DocumentBuilder()
    .setTitle('Ahlan HSE API')
    .setDescription(
      'HSE management, inspection and assurance for tournament stadiums.\n\n' +
        'Every request body is validated against the Zod schema in `@ahlan/shared`, ' +
        'which the mobile app uses too. Errors always come back as ' +
        '`{ code, message, details }`.',
    )
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addTag('auth', 'Sign in, refresh, registration and password reset')
    .addTag('access-requests', 'Admin approval of self-registered users')
    .addTag('inspections', 'Checklist inspections')
    .addTag('observations', 'Discipline-based HSE observations')
    .addTag('findings', 'Non-compliances raised from inspections and observations')
    .addTag('corrective-actions', 'The finding lifecycle')
    .addTag('eod', 'End-of-Day reports and submission windows')
    .addTag('evidence', 'Presigned photo upload')
    .addTag('kpis', 'Dashboard figures')
    .addTag('reports', 'Weekly, cumulative and end-of-tournament PDFs')
    .addTag('ai', 'AI Intelligence, with mandatory admin review')
    .addTag('sync', 'Offline pull and push')
    .addTag('audit', 'Audit trail')
    .build();

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swagger),
    { swaggerOptions: { persistAuthorization: true } },
  );

  const port = config.get('port', { infer: true });
  await app.listen(port, '0.0.0.0');

  logger.log(`API listening on http://localhost:${port}/${prefix}`);
  logger.log(`Swagger at http://localhost:${port}/docs`);
  if (config.get('redis', { infer: true }).concurrency === 0) {
    logger.warn('QUEUE_CONCURRENCY=0: run `pnpm --filter api start:worker` for background jobs');
  }
}

void bootstrap();
