import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { ZodError, type ZodTypeAny, type z } from 'zod';

import { AppException } from '../errors/app.exception';

/**
 * Validates a request body, query or param against a schema from
 * `@ahlan/shared`. Nothing reaches a service unparsed, and the transformed
 * output (trimmed strings, coerced numbers, 2dp decimals) is what the service
 * actually receives.
 */
@Injectable()
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.infer<T> {
    try {
      return this.schema.parse(value) as z.infer<T>;
    } catch (error) {
      if (error instanceof ZodError) {
        throw AppException.validation('Validation failed', flattenIssues(error));
      }
      throw error;
    }
  }
}

export interface FieldError {
  path: string;
  message: string;
  code: string;
}

/** Flat `field -> message` list; the app renders these next to each input. */
export function flattenIssues(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/** Shorthand so controllers read `@Body(zodBody(submitInspectionSchema))`. */
export function zodBody<T extends ZodTypeAny>(schema: T): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}

export const zodQuery = zodBody;
export const zodParam = zodBody;
