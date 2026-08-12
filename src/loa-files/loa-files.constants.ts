/* src/loa-files/loa-files.constants.ts
 *
 * Single source of truth for the Leave of Absence (LOA) attachment policy.
 *
 * Mirrors helpdesk-files: its own endpoint, its own bucket prefix, its own
 * policy. Does not touch S3Module / S3mktModule / NovaS3Module / CrmS3Module /
 * HelpdeskFilesModule — tightening this policy can never break another feature.
 */

/** LOA attachments are HR documentation: images or PDFs. No video. */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Per-type size caps, in bytes. */
export const MAX_SIZE_BY_MIME: Record<AllowedMimeType, number> = {
  'image/jpeg': 8 * 1024 * 1024, //  8 MB
  'image/png': 8 * 1024 * 1024, //  8 MB
  'image/webp': 8 * 1024 * 1024, //  8 MB
  'application/pdf': 20 * 1024 * 1024, // 20 MB
};

/** Hard ceiling handed to multer; the exact per-type cap is applied afterwards. */
export const MULTER_MAX_FILE_SIZE = Math.max(...Object.values(MAX_SIZE_BY_MIME));

/** Extension written to S3, derived from the DETECTED type. */
export const EXTENSION_BY_MIME: Record<AllowedMimeType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

/** Extensions accepted in the file picker / cheap pre-filter. */
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'] as const;

/** Every LOA object lives under this prefix. Enforced on read and write. */
export const LOA_S3_ROOT = 'hr-loa';

/** Max attachments the UI allows per LOA record (mirrored on the frontend). */
export const MAX_FILES_PER_LOA = 10;

/** Signed URL lifetime, in seconds. */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

/** Types safe to render inline in the browser; everything else forces a download. */
export const INLINE_SAFE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

/** Returned by `GET /leave-of-absence/files/policy` so the UI reads limits from the server. */
export function describePolicy() {
  return {
    allowedMimeTypes: [...ALLOWED_MIME_TYPES],
    allowedExtensions: [...ALLOWED_EXTENSIONS],
    maxFilesPerRecord: MAX_FILES_PER_LOA,
    maxSizeByMime: MAX_SIZE_BY_MIME,
    limits: [
      { label: 'Images (JPG, PNG, WEBP)', maxMb: mb(MAX_SIZE_BY_MIME['image/jpeg']) },
      { label: 'PDF', maxMb: mb(MAX_SIZE_BY_MIME['application/pdf']) },
    ],
  };
}

/** One-line summary reused in error messages. */
export const POLICY_SUMMARY =
  `Allowed: images (JPG, PNG, WEBP) up to ${mb(MAX_SIZE_BY_MIME['image/jpeg'])} MB, ` +
  `PDF up to ${mb(MAX_SIZE_BY_MIME['application/pdf'])} MB.`;
