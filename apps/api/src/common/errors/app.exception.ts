import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '@ahlan/shared';

/**
 * Every error the API returns on purpose is one of these. The body shape is
 * always `{ code, message, details }` so the app can switch on `code` and show
 * localised copy instead of parsing English prose.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super({ code, message, details } satisfies ApiErrorBody, status);
  }

  static validation(message = 'Validation failed', details?: unknown): AppException {
    return new AppException(
      ERROR_CODES.VALIDATION_FAILED,
      message,
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    );
  }

  static unauthenticated(code: ErrorCode = ERROR_CODES.UNAUTHENTICATED, message = 'Not signed in') {
    return new AppException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(message = 'Not allowed', code: ErrorCode = ERROR_CODES.FORBIDDEN) {
    return new AppException(code, message, HttpStatus.FORBIDDEN);
  }

  static outOfScope(message = 'This stadium is not assigned to you') {
    return new AppException(ERROR_CODES.STADIUM_OUT_OF_SCOPE, message, HttpStatus.FORBIDDEN);
  }

  static notFound(what = 'Record', id?: string): AppException {
    return new AppException(
      ERROR_CODES.NOT_FOUND,
      id ? `${what} ${id} was not found` : `${what} was not found`,
      HttpStatus.NOT_FOUND,
    );
  }

  static conflict(message: string, code: ErrorCode = ERROR_CODES.CONFLICT, details?: unknown) {
    return new AppException(code, message, HttpStatus.CONFLICT, details);
  }

  /** The HSE record was soft-deleted by an admin; it must be restored before any change. */
  static deleted(what = 'Record') {
    return new AppException(
      ERROR_CODES.RECORD_DELETED,
      `${what} has been deleted by an administrator`,
      HttpStatus.CONFLICT,
    );
  }

  static locked(message = 'This record is submitted and can no longer be edited') {
    return new AppException(ERROR_CODES.RECORD_LOCKED, message, HttpStatus.CONFLICT);
  }

  static badRequest(code: ErrorCode, message: string, details?: unknown) {
    return new AppException(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static internal(message = 'Something went wrong') {
    return new AppException(ERROR_CODES.INTERNAL_ERROR, message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
