import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '@ahlan/shared';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { flattenIssues } from '../pipes/zod-validation.pipe';

/**
 * Single exit point for errors. Guarantees the `{ code, message, details }`
 * envelope and makes sure a stack trace can never reach a client - the stack is
 * logged server-side with the request id instead.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.translate(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status} ${body.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.debug(`${request.method} ${request.originalUrl} -> ${status} ${body.code}`);
    }

    response.status(status).json(body);
  }

  private translate(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const status = exception.getStatus();

      // Already in our envelope (thrown by AppException).
      if (isErrorBody(payload)) {
        return { status, body: payload };
      }

      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);

      return {
        status,
        body: {
          code: statusToCode(status),
          message: Array.isArray(message) ? message.join(', ') : message,
        },
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Validation failed',
          details: flattenIssues(exception),
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.translatePrisma(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Something went wrong' },
    };
  }

  private translatePrisma(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    body: ApiErrorBody;
  } {
    const target = (error.meta as { target?: string[] | string } | undefined)?.target;
    const fields = Array.isArray(target) ? target.join(', ') : target;

    switch (error.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: ERROR_CODES.ALREADY_EXISTS,
            message: fields ? `A record with this ${fields} already exists` : 'Already exists',
          },
        };
      case 'P2003':
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          body: { code: ERROR_CODES.NOT_FOUND, message: 'A referenced record was not found' },
        };
      case 'P2014':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: ERROR_CODES.CONFLICT,
            message: 'This change would break a required relation',
          },
        };
      default:
        this.logger.error(`Unmapped Prisma error ${error.code}: ${error.message}`);
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Database error' },
        };
    }
  }
}

function isErrorBody(payload: unknown): payload is ApiErrorBody {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { code?: unknown }).code === 'string' &&
    typeof (payload as { message?: unknown }).message === 'string'
  );
}

function statusToCode(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ERROR_CODES.VALIDATION_FAILED;
    case HttpStatus.UNAUTHORIZED:
      return ERROR_CODES.UNAUTHENTICATED;
    case HttpStatus.FORBIDDEN:
      return ERROR_CODES.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ERROR_CODES.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ERROR_CODES.CONFLICT;
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return ERROR_CODES.VALIDATION_FAILED;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ERROR_CODES.RATE_LIMITED;
    default:
      return ERROR_CODES.INTERNAL_ERROR;
  }
}
