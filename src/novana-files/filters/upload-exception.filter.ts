/* src/novana-files/filters/upload-exception.filter.ts
 *
 * Convierte los errores escuetos de multer en mensajes que dicen qué se
 * permite.
 *
 * `@nestjs/platform-express` ya mapea `LIMIT_FILE_SIZE` a 413 y el resto de
 * límites a 400, pero el cuerpo que produce es solo `{"message":"File too
 * large"}` — que no dice cuánto es demasiado. Este filtro reescribe esas
 * respuestas concretas y deja el resto intacto.
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

import { POLICY_SUMMARY } from '../novana-files.constants';

/** Mensajes literales de multer, mapeados a algo accionable. */
const MULTER_MESSAGE_OVERRIDES: Record<string, string> = {
  'File too large': `File is too large. ${POLICY_SUMMARY}`,
  'Too many files': 'Only one file can be uploaded per request.',
  'Unexpected field': 'Unexpected upload field — the file must be sent as "file".',
  'Too many parts': 'Malformed upload request.',
  'Too many fields': 'Malformed upload request.',
};

@Catch(HttpException)
export class NovanaUploadExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(NovanaUploadExceptionFilter.name);

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
      // No es un error de límite de multer — se preserva la respuesta original.
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
