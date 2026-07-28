/* src/helpdesk-files/helpdesk-multer.config.ts
 *
 * Multer options for the HelpDesk upload endpoint.
 *
 * Layered on purpose — multer runs before the bytes exist, so it can only do
 * the cheap gate; the real decision happens afterwards in the service:
 *
 *   1. HERE    — extension allow-list + 100 MB ceiling + exactly one file.
 *                Cheap: stops a 2 GB `.iso` before it is buffered into the heap.
 *   2. SERVICE — magic-byte detection decides the real type, and the per-type
 *                cap (8/20/100 MB) is applied against that.
 *
 * The declared `Content-Type` is deliberately NOT enforced at this layer. It is
 * fully attacker-controlled, so rejecting on it buys no security while
 * generating false negatives for honest users (Windows sends
 * `application/octet-stream` for .mp4 often enough to matter). Step 2 is the
 * gate that actually decides.
 */
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { extname } from 'path';

import {
  ALLOWED_EXTENSIONS,
  MULTER_MAX_FILE_SIZE,
  POLICY_SUMMARY,
} from './helpdesk-files.constants';

const allowed = new Set<string>(ALLOWED_EXTENSIONS);

/**
 * Cheap pre-filter. Returning `cb(error)` makes Nest surface a 400 without the
 * request body ever being buffered.
 */
export function helpdeskFileFilter(
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

/**
 * Options handed to `FileInterceptor`.
 *
 * `memoryStorage` keeps the buffer in RAM, which is what lets us sniff the
 * magic bytes before anything is written anywhere. The trade-off is heap
 * pressure, bounded here by `fileSize` (100 MB) and `files: 1`.
 */
export const helpdeskMulterOptions = {
  storage: memoryStorage(),
  fileFilter: helpdeskFileFilter,
  limits: {
    fileSize: MULTER_MAX_FILE_SIZE, // 100 MB — hard ceiling; per-type cap comes later
    files: 1, // one attachment per request
    fields: 8, // ticketUuid, scope, uploadedBy — nothing else is expected
    parts: 12,
  },
};
