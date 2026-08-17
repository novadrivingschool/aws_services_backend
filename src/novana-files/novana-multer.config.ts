/* src/novana-files/novana-multer.config.ts
 *
 * Opciones de multer para la subida de NOVANA.
 *
 * Por capas a propósito — multer corre antes de que existan los bytes, así que
 * solo puede hacer el filtro barato; la decisión real llega después:
 *
 *   1. AQUÍ    — lista blanca de extensiones + techo de 100 MB + un solo
 *                archivo. Barato: para un `.iso` de 2 GB antes de meterlo en
 *                el heap.
 *   2. SERVICE — la detección por magic bytes decide el tipo real, y el tope
 *                por tipo (8/20/100 MB) se aplica contra ese.
 *
 * El `Content-Type` declarado NO se exige en esta capa: lo controla del todo
 * el atacante, así que rechazar por él no aporta seguridad y sí genera falsos
 * negativos con usuarios honestos (Windows manda `application/octet-stream`
 * para .mp4 y `application/zip` para .docx con bastante frecuencia).
 */
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { extname } from 'path';

import {
  ALLOWED_EXTENSIONS,
  MULTER_MAX_FILE_SIZE,
  POLICY_SUMMARY,
} from './novana-files.constants';

const allowed = new Set<string>(ALLOWED_EXTENSIONS);

export function novanaFileFilter(
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
 * `memoryStorage` mantiene el buffer en RAM, que es lo que permite oler los
 * magic bytes antes de escribir nada. El coste es presión de heap, acotada
 * aquí por `fileSize` y `files: 1`.
 */
export const novanaMulterOptions = {
  storage: memoryStorage(),
  fileFilter: novanaFileFilter,
  limits: {
    fileSize: MULTER_MAX_FILE_SIZE, // techo duro; el tope por tipo llega después
    files: 1,
    fields: 8,
    parts: 12,
  },
};
