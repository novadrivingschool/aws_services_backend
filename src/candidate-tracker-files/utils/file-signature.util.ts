/* src/candidate-tracker-files/utils/file-signature.util.ts
 *
 * Content sniffing for the formats Candidate Tracker accepts. Same rationale
 * as loa-files/utils/file-signature.util.ts (hand-rolled, no `file-type`
 * dependency): the declared Content-Type and filename are attacker-controlled
 * and are never trusted — only the bytes are.
 *
 * DOCX detection is a heuristic (ZIP signature + a "word/" entry name inside
 * the first bytes of the central-ish directory) rather than a full ZIP parse
 * — good enough to reject "renamed .exe as .docx" without pulling in a ZIP
 * library for one field. DOC uses the real OLE compound-file magic number.
 */
import { AllowedMimeType } from '../candidate-tracker-files.constants';

const MIN_BYTES_NEEDED = 12;

const asciiAt = (buf: Buffer, offset: number, length: number): string =>
  buf.length >= offset + length ? buf.subarray(offset, offset + length).toString('latin1') : '';

const startsWith = (buf: Buffer, bytes: number[]): boolean => {
  if (buf.length < bytes.length) return false;
  return bytes.every((b, i) => buf[i] === b);
};

const isJpeg = (buf: Buffer): boolean => startsWith(buf, [0xff, 0xd8, 0xff]);

const isPng = (buf: Buffer): boolean =>
  startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** RIFF container whose form type is WEBP: "RIFF" ....size.... "WEBP". */
const isWebp = (buf: Buffer): boolean =>
  asciiAt(buf, 0, 4) === 'RIFF' && asciiAt(buf, 8, 4) === 'WEBP';

const isPdf = (buf: Buffer): boolean => startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

/** Legacy .doc — OLE Compound File Binary Format magic number. */
const isDoc = (buf: Buffer): boolean =>
  startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** ZIP local-file-header signature ("PK\x03\x04" or the empty-archive variant). */
const isZip = (buf: Buffer): boolean =>
  startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06]);

/**
 * .docx is a ZIP whose entries include "word/document.xml". Scanning the raw
 * bytes for that literal (instead of parsing the ZIP directory) is a cheap,
 * dependency-free way to tell it apart from a plain .zip or another
 * Office-open format (.xlsx, .pptx) that also starts with PK\x03\x04.
 */
const looksLikeDocx = (buf: Buffer): boolean => buf.includes(Buffer.from('word/'));

/** Real MIME type of `buffer`, or `null` when it is not one of the allowed formats. */
export function detectMimeType(buffer: Buffer | undefined | null): AllowedMimeType | null {
  if (!buffer || buffer.length < MIN_BYTES_NEEDED) return null;

  if (isJpeg(buffer)) return 'image/jpeg';
  if (isPng(buffer)) return 'image/png';
  if (isWebp(buffer)) return 'image/webp';
  if (isPdf(buffer)) return 'application/pdf';
  if (isDoc(buffer)) return 'application/msword';
  if (isZip(buffer) && looksLikeDocx(buffer)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }

  return null;
}

/** True when the type the client claimed is consistent with the detected one. */
export function declaredTypeMatches(declared: string | undefined, detected: AllowedMimeType): boolean {
  if (!declared) return false;
  const normalised = declared.toLowerCase().trim().split(';')[0];
  if (normalised === detected) return true;
  if (detected === 'image/jpeg' && (normalised === 'image/jpg' || normalised === 'image/pjpeg')) {
    return true;
  }
  return false;
}
