/* src/hr-whatsapp-files/filters/upload-exception.filter.ts
 *
 * Turns multer's terse errors into messages that tell the user what is
 * allowed. Same rationale as loa-files/filters/upload-exception.filter.ts.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';

import { POLICY_SUMMARY } from '../hr-whatsapp-files.constants';

const MULTER_MESSAGE_OVERRIDES: Record<string, string> = {
  'File too large': `File is too large. ${POLICY_SUMMARY}`,
  'Too many files': 'Only one file can be uploaded per request.',
  'Unexpected field': 'Unexpected upload field — the file must be sent as "file".',
  'Too many parts': 'Malformed upload request.',
  'Too many fields': 'Malformed upload request.',
};

@Catch(HttpException)
export class UploadExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UploadExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const payload = exception.getResponse();

    const originalMessage =
      typeof payload === 'string'
        ? payload
        : ((payload as { message?: unknown })?.message as string | undefined);

    const override =
      typeof originalMessage === 'string' ? MULTER_MESSAGE_OVERRIDES[originalMessage] : undefined;

    if (!override) {
      response.status(status).json(typeof payload === 'string' ? { message: payload } : payload);
      return;
    }

    if (exception instanceof PayloadTooLargeException) {
      this.logger.warn(`Upload rejected: ${originalMessage}`);
    }

    response.status(status || HttpStatus.BAD_REQUEST).json({
      statusCode: status,
      message: override,
      error: exception.name,
    });
  }
}
