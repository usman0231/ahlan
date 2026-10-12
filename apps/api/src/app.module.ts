import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';

import { ConfigModule } from './config/config.module';
import type { AppConfig } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { MailModule } from './mail/mail.module';
import { QueueModule } from './queues/queue.module';
import { HealthModule } from './health/health.module';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

import { AccessRequestsModule } from './modules/access-requests/access-requests.module';
import { AiModule } from './modules/ai/ai.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChecklistsModule } from './modules/checklists/checklists.module';
import { CorrectiveActionsModule } from './modules/corrective-actions/corrective-actions.module';
import { EodModule } from './modules/eod/eod.module';
import { EvidenceModule } from './modules/evidence/evidence.module';
import { FindingsModule } from './modules/findings/findings.module';
import { InspectionsModule } from './modules/inspections/inspections.module';
import { KpisModule } from './modules/kpis/kpis.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ObservationsModule } from './modules/observations/observations.module';
import { ReportsModule } from './modules/reports/reports.module';
import { StadiumsModule } from './modules/stadiums/stadiums.module';
import { SyncModule } from './modules/sync/sync.module';
import { TournamentsModule } from './modules/tournaments/tournaments.module';
import { UsersModule } from './modules/users/users.module';

/**
 * Three things are wired globally here, and they are the reason a new
 * controller is secure by default:
 *   - `JwtAuthGuard`: every route needs a token unless it says `@Public()`
 *   - `ThrottlerGuard`: a baseline rate limit on everything
 *   - `AllExceptionsFilter`: one `{ code, message, details }` envelope, no stacks
 *
 * `RolesGuard` and `StadiumScopeGuard` are applied per controller instead, so
 * each one states its own access rules where they can be read.
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    StorageModule,
    MailModule,
    QueueModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const throttle = config.get('throttle', { infer: true });
        return [{ name: 'default', ttl: throttle.ttl, limit: throttle.limit }];
      },
    }),

    AuditModule,
    NotificationsModule,
    EvidenceModule,
    AuthModule,
    UsersModule,
    AccessRequestsModule,
    TournamentsModule,
    StadiumsModule,
    ChecklistsModule,
    FindingsModule,
    CorrectiveActionsModule,
    InspectionsModule,
    ObservationsModule,
    EodModule,
    KpisModule,
    ReportsModule,
    AiModule,
    SyncModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
