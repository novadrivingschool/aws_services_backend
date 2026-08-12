/* src/loa-files/utils/file-signature.util.ts
 *
 * Content sniffing for the four formats LOA accepts. Same rationale as
 * helpdesk-files/utils/file-signature.util.ts (hand-rolled, no `file-type`
 * dependency): the declared Content-Type and filename are attacker-controlled
 * and are never trusted — only the bytes are.
 */
import { AllowedMimeType } from '../loa-files.constants';

const MIN_BYTES_NEEDED = 12;

const asciiAt = (buf: Buffer, offset: number, length: number): string =>
  buf.length >= offset + length
    ? buf.subarray(offset, offset + length).toString('latin1')
    : '';

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

const isPdf = (buf: Buffer): boolean =>
  startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

/** Real MIME type of `buffer`, or `null` when it is not one of the four allowed formats. */
export function detectMimeType(buffer: Buffer | undefined | null): AllowedMimeType | null {
  if (!buffer || buffer.length < MIN_BYTES_NEEDED) return null;

  if (isJpeg(buffer)) return 'image/jpeg';
  if (isPng(buffer)) return 'image/png';
  if (isWebp(buffer)) return 'image/webp';
  if (isPdf(buffer)) return 'application/pdf';

  return null;
}

/** True when the type the client claimed is consistent with the detected one. */
export function declaredTypeMatches(
  declared: string | undefined,
  detected: AllowedMimeType,
): boolean {
  if (!declared) return false;
  const normalised = declared.toLowerCase().trim().split(';')[0];
  if (normalised === detected) return true;
  if (detected === 'image/jpeg' && (normalised === 'image/jpg' || normalised === 'image/pjpeg')) {
    return true;
  }
  return false;
}
