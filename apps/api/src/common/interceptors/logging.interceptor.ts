import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { tap } from 'rxjs';

import type { RequestUser } from '../types/request-user';

/** One line per request: method, path, caller and duration. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const startedAt = Date.now();
    const actor = request.user ? `${request.user.role}:${request.user.id}` : 'anonymous';

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - startedAt;
        this.logger.log(`${request.method} ${request.originalUrl} ${actor} ${ms}ms`);
      }),
    );
  }
}
