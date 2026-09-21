/* src/candidate-tracker-files/utils/candidate-tracker-key.util.ts
 *
 * S3 key generation and validation for Candidate Tracker attachments.
 *
 * Same two rules as loa-key.util.ts:
 *   1. The client never chooses a key. It supplies a candidate record id;
 *      the server builds `hr-candidate-tracker/<uuid>/<random>.<ext>`.
 *   2. Any key coming back in (signed URL, delete) must live under
 *      `hr-candidate-tracker/<candidateId>/`. That is what stops one
 *      candidate record from reading or deleting another's documents in the
 *      shared bucket.
 */
import { randomUUID } from 'crypto';
import { AllowedMimeType, CANDIDATE_TRACKER_S3_ROOT, EXTENSION_BY_MIME } from '../candidate-tracker-files.constants';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_KEY_LENGTH = 512;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);

export function buildFolder(candidateId: string): string {
  return `${CANDIDATE_TRACKER_S3_ROOT}/${candidateId}`;
}

/**
 * Builds the object key. The filename is a fresh UUID plus the extension
 * derived from the DETECTED type — the client's `originalname` never reaches
 * S3, which removes path traversal, overwrite-by-collision and header
 * injection in one go.
 */
export function buildObjectKey(candidateId: string, detectedMime: AllowedMimeType): string {
  return `${buildFolder(candidateId)}/${randomUUID()}${EXTENSION_BY_MIME[detectedMime]}`;
}

/**
 * True when `key` is a well-formed Candidate Tracker key for `candidateId`.
 *
 * hr-candidate-tracker / <candidateId> / <filename>
 */
export function isKeyOwnedByCandidate(key: unknown, candidateId: string): key is string {
  if (typeof key !== 'string') return false;
  if (!isUuid(candidateId)) return false;
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) return false;

  if (key.includes('..')) return false;
  if (key.startsWith('/') || key.includes('//')) return false;
  if (key.includes('\\')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(key)) return false;

  const segments = key.split('/');
  if (segments.length !== 3) return false;
  if (segments[0] !== CANDIDATE_TRACKER_S3_ROOT) return false;
  if (segments[1].toLowerCase() !== candidateId.toLowerCase()) return false;

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
