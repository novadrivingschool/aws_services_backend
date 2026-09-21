/* src/agreement-files/agreement-multer.config.ts
 *
 * Multer options for the Agreement upload endpoint. Same two-layer approach
 * as loa-multer.config.ts:
 *   1. HERE    — extension allow-list + hard ceiling + exactly one file.
 *   2. SERVICE — magic-byte detection decides the real type, and the
 *                per-type cap is applied against that.
 */
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { extname } from 'path';

import { ALLOWED_EXTENSIONS, MULTER_MAX_FILE_SIZE, POLICY_SUMMARY } from './agreement-files.constants';

const allowed = new Set<string>(ALLOWED_EXTENSIONS);

export function agreementFileFilter(
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

export const agreementMulterOptions = {
  storage: memoryStorage(),
  fileFilter: agreementFileFilter,
  limits: {
    fileSize: MULTER_MAX_FILE_SIZE,
    files: 1,
    fields: 8, // agreementId, uploadedBy — nothing else is expected
    parts: 12,
  },
};
