/* src/helpdesk-files/utils/file-signature.util.ts
 *
 * Content sniffing for the six formats the HelpDesk accepts.
 *
 * Why hand-rolled instead of the `file-type` package: the allowed set is tiny
 * and frozen, and `file-type` >= 17 is ESM-only, which does not import cleanly
 * from this CommonJS NestJS build. 80 lines with unit tests beats a dependency
 * that needs a bundler workaround.
 *
 * The declared `Content-Type` and the filename are attacker-controlled and are
 * never trusted; only the bytes are.
 */
import { AllowedMimeType } from '../helpdesk-files.constants';

/** Longest prefix any check below needs (MP4 brand ends at byte 12). */
const MIN_BYTES_NEEDED = 12;

const asciiAt = (buf: Buffer, offset: number, length: number): string =>
  buf.length >= offset + length
    ? buf.subarray(offset, offset + length).toString('latin1')
    : '';

const startsWith = (buf: Buffer, bytes: number[]): boolean => {
  if (buf.length < bytes.length) return false;
  return bytes.every((b, i) => buf[i] === b);
};

/**
 * ISO-BMFF brands we treat as MP4 *video*.
 *
 * `M4A ` (audio) and `qt  ` (QuickTime MOV) are deliberately absent: both are
 * ISO-BMFF too, and accepting them would let audio/MOV in through a filter
 * that claims to allow "MP4 video" only.
 */
const MP4_VIDEO_BRANDS = new Set([
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'iso8',
  'mp41',
  'mp42',
  'mp71',
  'avc1',
  'dash',
  'mmp4',
  'M4V ',
  'M4VH',
  'M4VP',
]);

const isJpeg = (buf: Buffer): boolean => startsWith(buf, [0xff, 0xd8, 0xff]);

const isPng = (buf: Buffer): boolean =>
  startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const isGif = (buf: Buffer): boolean => {
  const header = asciiAt(buf, 0, 6);
  return header === 'GIF87a' || header === 'GIF89a';
};

/** RIFF container whose form type is WEBP: "RIFF" ....size.... "WEBP". */
const isWebp = (buf: Buffer): boolean =>
  asciiAt(buf, 0, 4) === 'RIFF' && asciiAt(buf, 8, 4) === 'WEBP';

const isPdf = (buf: Buffer): boolean =>
  startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

/**
 * ISO-BMFF: the `ftyp` box must be first, so bytes 4..8 are the box type and
 * bytes 8..12 the major brand.
 */
const isMp4Video = (buf: Buffer): boolean =>
  asciiAt(buf, 4, 4) === 'ftyp' && MP4_VIDEO_BRANDS.has(asciiAt(buf, 8, 4));

/**
 * Returns the real MIME type of `buffer`, or `null` when the content is not one
 * of the six allowed formats (which includes "empty" and "too short").
 */
export function detectMimeType(buffer: Buffer | undefined | null): AllowedMimeType | null {
  if (!buffer || buffer.length < MIN_BYTES_NEEDED) return null;

  if (isJpeg(buffer)) return 'image/jpeg';
  if (isPng(buffer)) return 'image/png';
  if (isGif(buffer)) return 'image/gif';
  if (isWebp(buffer)) return 'image/webp';
  if (isPdf(buffer)) return 'application/pdf';
  if (isMp4Video(buffer)) return 'video/mp4';

  return null;
}

/**
 * True when the type the client claimed is consistent with the detected one.
 *
 * A mismatch is not necessarily an attack — browsers do send `image/jpg` or an
 * empty type — so the caller decides how loudly to complain. What matters is
 * that the value we persist is always the DETECTED one.
 */
export function declaredTypeMatches(
  declared: string | undefined,
  detected: AllowedMimeType,
): boolean {
  if (!declared) return false;
  const normalised = declared.toLowerCase().trim().split(';')[0];
  if (normalised === detected) return true;
  // Tolerated aliases browsers actually emit.
  if (detected === 'image/jpeg' && (normalised === 'image/jpg' || normalised === 'image/pjpeg')) {
    return true;
  }
  return false;
}
