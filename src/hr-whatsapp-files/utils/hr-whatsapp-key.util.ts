/* src/hr-whatsapp-files/utils/hr-whatsapp-key.util.ts
 *
 * Key generation/validation for HR WhatsApp Update attachments. Mirrors
 * loa-files/utils/loa-key.util.ts.
 */
import { randomUUID } from 'crypto';
import { AllowedMimeType, EXTENSION_BY_MIME, HR_WHATSAPP_S3_ROOT } from '../hr-whatsapp-files.constants';

/** RFC 4122 UUID, any version. Mirrors Nest's ParseUUIDPipe. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Hard cap so a pathological key can never blow up a log line or an S3 call. */
const MAX_KEY_LENGTH = 512;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);

/** Folder an attachment belongs to, given its HR WhatsApp Update record id. */
export function buildFolder(updateId: string): string {
  return `${HR_WHATSAPP_S3_ROOT}/${updateId}`;
}

/**
 * Builds the object key. The filename is a fresh UUID plus the extension
 * derived from the DETECTED type — the client's `originalname` never reaches
 * S3, which removes path traversal, overwrite-by-collision and header
 * injection in one go.
 */
export function buildObjectKey(updateId: string, detectedMime: AllowedMimeType): string {
  return `${buildFolder(updateId)}/${randomUUID()}${EXTENSION_BY_MIME[detectedMime]}`;
}

/**
 * True when `key` is a well-formed HR WhatsApp Update key for `updateId`.
 *
 * hr-whatsapp-updates / <updateId> / <filename>
 */
export function isKeyOwnedByUpdate(key: unknown, updateId: string): key is string {
  if (typeof key !== 'string') return false;
  if (!isUuid(updateId)) return false;
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) return false;

  if (key.includes('..')) return false;
  if (key.startsWith('/') || key.includes('//')) return false;
  if (key.includes('\\')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(key)) return false;

  const segments = key.split('/');
  if (segments.length !== 3) return false;
  if (segments[0] !== HR_WHATSAPP_S3_ROOT) return false;
  if (segments[1].toLowerCase() !== updateId.toLowerCase()) return false;

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
