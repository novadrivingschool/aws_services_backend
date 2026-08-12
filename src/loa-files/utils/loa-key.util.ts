/* src/loa-files/utils/loa-key.util.ts
 *
 * S3 key generation and validation for LOA attachments.
 *
 * Same two rules as helpdesk-key.util.ts:
 *   1. The client never chooses a key. It supplies a LOA record id; the server
 *      builds `hr-loa/<uuid>/<random>.<ext>`.
 *   2. Any key coming back in (signed URL, delete) must live under
 *      `hr-loa/<loaId>/`. That is what stops one LOA record from reading or
 *      deleting another record's documents in the shared bucket.
 */
import { randomUUID } from 'crypto';
import { AllowedMimeType, EXTENSION_BY_MIME, LOA_S3_ROOT } from '../loa-files.constants';

/** RFC 4122 UUID, any version. Mirrors Nest's ParseUUIDPipe. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Hard cap so a pathological key can never blow up a log line or an S3 call. */
const MAX_KEY_LENGTH = 512;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);

/** Folder an attachment belongs to, given its LOA record id. */
export function buildFolder(loaId: string): string {
  return `${LOA_S3_ROOT}/${loaId}`;
}

/**
 * Builds the object key. The filename is a fresh UUID plus the extension
 * derived from the DETECTED type — the client's `originalname` never reaches
 * S3, which removes path traversal, overwrite-by-collision and header
 * injection in one go.
 */
export function buildObjectKey(loaId: string, detectedMime: AllowedMimeType): string {
  return `${buildFolder(loaId)}/${randomUUID()}${EXTENSION_BY_MIME[detectedMime]}`;
}

/**
 * True when `key` is a well-formed LOA key for `loaId`.
 *
 * hr-loa / <loaId> / <filename>
 */
export function isKeyOwnedByLoa(key: unknown, loaId: string): key is string {
  if (typeof key !== 'string') return false;
  if (!isUuid(loaId)) return false;
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) return false;

  if (key.includes('..')) return false;
  if (key.startsWith('/') || key.includes('//')) return false;
  if (key.includes('\\')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(key)) return false;

  const segments = key.split('/');
  if (segments.length !== 3) return false;
  if (segments[0] !== LOA_S3_ROOT) return false;
  if (segments[1].toLowerCase() !== loaId.toLowerCase()) return false;

  const filename = segments[2];
  if (!filename || filename === '.' || filename === '..') return false;

  return true;
}

/** Extension of a key, lowercased and including the dot (`''` when absent). */
export function extensionOf(key: string): string {
  const filename = key.split('/').pop() ?? '';
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}
