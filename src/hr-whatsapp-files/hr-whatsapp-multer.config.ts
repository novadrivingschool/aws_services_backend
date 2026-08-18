/* src/hr-whatsapp-files/hr-whatsapp-multer.config.ts
 *
 * Multer options for the HR WhatsApp Updates upload endpoint. Two-layer
 * approach, same as loa-multer.config.ts:
 *   1. HERE    — extension allow-list + hard ceiling + exactly one file.
 *   2. SERVICE — magic-byte detection decides the real type, and the
 *                per-type cap is applied against that.
 */
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { extname } from 'path';

import { ALLOWED_EXTENSIONS, MULTER_MAX_FILE_SIZE, POLICY_SUMMARY } from './hr-whatsapp-files.constants';

const allowed = new Set<string>(ALLOWED_EXTENSIONS);

export function hrWhatsappFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
): void {
  const ext = extname(file.originalname || '').toLowerCase();

  if (!ext) {
    cb(
      new BadRequestException(
        `"${file.originalname || 'file'}" has no extension and was rejected. ${POLICY_SUMMARY}`,
      ),
      false,
    );
    return;
  }

  if (!allowed.has(ext)) {
    cb(new BadRequestException(`File type "${ext}" is not allowed. ${POLICY_SUMMARY}`), false);
    return;
  }

  cb(null, true);
}

export const hrWhatsappMulterOptions = {
  storage: memoryStorage(),
  fileFilter: hrWhatsappFileFilter,
  limits: {
    fileSize: MULTER_MAX_FILE_SIZE,
    files: 1,
    fields: 8, // updateId, uploadedBy — nothing else is expected
    parts: 12,
  },
};
