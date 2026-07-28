/* src/helpdesk-files/utils/helpdesk-key.util.ts
 *
 * S3 key generation and validation for HelpDesk attachments.
 *
 * Two rules, both enforced server-side:
 *   1. The client never chooses a key. It supplies a ticket UUID; the server
 *      builds `it-tickets/<uuid>[/comments]/<random>.<ext>`.
 *   2. Any key coming back in (signed URL, delete) must live under
 *      `it-tickets/<uuid>/`. That is what stops a ticket from being used to
 *      read or delete unrelated objects in the shared bucket.
 */
import { randomUUID } from 'crypto';
import {
  AllowedMimeType,
  COMMENT_SUBFOLDER,
  EXTENSION_BY_MIME,
  HELPDESK_S3_ROOT,
} from '../helpdesk-files.constants';

/** RFC 4122 UUID, any version. Mirrors Nest's ParseUUIDPipe. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Hard cap so a pathological key can never blow up a log line or an S3 call. */
const MAX_KEY_LENGTH = 512;

export type AttachmentScope = 'ticket' | 'comment';

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);

/** Folder an attachment belongs to, given its ticket and scope. */
export function buildFolder(ticketUuid: string, scope: AttachmentScope): string {
  const base = `${HELPDESK_S3_ROOT}/${ticketUuid}`;
  return scope === 'comment' ? `${base}/${COMMENT_SUBFOLDER}` : base;
}

/**
 * Builds the object key. The filename is a fresh UUID plus the extension
 * derived from the DETECTED type — the client's `originalname` never reaches
 * S3, which removes path traversal, overwrite-by-collision, unicode RTL
 * spoofing and header injection in one go.
 */
export function buildObjectKey(
  ticketUuid: string,
  scope: AttachmentScope,
  detectedMime: AllowedMimeType,
): string {
  return `${buildFolder(ticketUuid, scope)}/${randomUUID()}${EXTENSION_BY_MIME[detectedMime]}`;
}

/**
 * True when `key` is a well-formed HelpDesk key for `ticketUuid`.
 *
 * Accepts both the new server-generated shape and the legacy
 * `<timestamp>_<original name>` files uploaded before this module existed, so
 * old tickets keep rendering. Legacy filenames may contain accents, parens and
 * other characters, hence the deny-list (traversal, control chars, separators)
 * rather than a strict allow-list on that last segment.
 */
export function isKeyOwnedByTicket(key: unknown, ticketUuid: string): key is string {
  if (typeof key !== 'string') return false;
  if (!isUuid(ticketUuid)) return false;
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) return false;

  // No traversal, no absolute keys, no empty segments, no control characters,
  // no backslashes (Windows-style separators S3 would happily store verbatim).
  if (key.includes('..')) return false;
  if (key.startsWith('/') || key.includes('//')) return false;
  if (key.includes('\\')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(key)) return false;

  const segments = key.split('/');
  // it-tickets / <uuid> / [comments] / <filename>
  if (segments.length < 3 || segments.length > 4) return false;
  if (segments[0] !== HELPDESK_S3_ROOT) return false;
  if (segments[1].toLowerCase() !== ticketUuid.toLowerCase()) return false;
  if (segments.length === 4 && segments[2] !== COMMENT_SUBFOLDER) return false;

  const filename = segments[segments.length - 1];
  if (!filename || filename === '.' || filename === '..') return false;

  return true;
}

/**
 * Same check without binding to a specific ticket: the key must sit under
 * `it-tickets/<some valid uuid>/`. Used where the ticket is not in scope but
 * we still refuse to touch anything outside the HelpDesk prefix.
 */
export function isHelpdeskKey(key: unknown): key is string {
  if (typeof key !== 'string') return false;
  const segments = key.split('/');
  if (segments.length < 3) return false;
  if (segments[0] !== HELPDESK_S3_ROOT) return false;
  return isKeyOwnedByTicket(key, segments[1]);
}

/** Extension of a key, lowercased and including the dot (`''` when absent). */
export function extensionOf(key: string): string {
  const filename = key.split('/').pop() ?? '';
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}
