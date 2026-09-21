/* src/candidate-tracker-files/candidate-tracker-files.constants.ts
 *
 * Single source of truth for the Candidate Tracker attachment policy
 * (resumes, IDs, test results). Mirrors loa-files.constants.ts: its own
 * endpoint, its own bucket prefix, its own policy. Does not touch S3Module /
 * S3mktModule / NovaS3Module / CrmS3Module / HelpdeskFilesModule /
 * LoaFilesModule / HrWhatsappFilesModule — tightening this policy can never
 * break another feature.
 */

/** Resumes/IDs: images, PDF, or a Word doc. No video. */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Per-type size caps, in bytes. */
export const MAX_SIZE_BY_MIME: Record<AllowedMimeType, number> = {
  'image/jpeg': 8 * 1024 * 1024, //  8 MB
  'image/png': 8 * 1024 * 1024, //  8 MB
  'image/webp': 8 * 1024 * 1024, //  8 MB
  'application/pdf': 20 * 1024 * 1024, // 20 MB
  'application/msword': 15 * 1024 * 1024, // 15 MB
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 15 * 1024 * 1024, // 15 MB
};

/** Hard ceiling handed to multer; the exact per-type cap is applied afterwards. */
export const MULTER_MAX_FILE_SIZE = Math.max(...Object.values(MAX_SIZE_BY_MIME));

/** Extension written to S3, derived from the DETECTED type. */
export const EXTENSION_BY_MIME: Record<AllowedMimeType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

/** Extensions accepted in the file picker / cheap pre-filter. */
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.doc', '.docx'] as const;

/** Every Candidate Tracker object lives under this prefix. Enforced on read and write. */
export const CANDIDATE_TRACKER_S3_ROOT = 'hr-candidate-tracker';

/** Max attachments the UI allows per candidate (mirrored on the frontend). */
export const MAX_FILES_PER_CANDIDATE = 10;

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

/** Returned by `GET /candidate-tracker/files/policy` so the UI reads limits from the server. */
export function describePolicy() {
  return {
    allowedMimeTypes: [...ALLOWED_MIME_TYPES],
    allowedExtensions: [...ALLOWED_EXTENSIONS],
    maxFilesPerRecord: MAX_FILES_PER_CANDIDATE,
    maxSizeByMime: MAX_SIZE_BY_MIME,
    limits: [
      { label: 'Images (JPG, PNG, WEBP)', maxMb: mb(MAX_SIZE_BY_MIME['image/jpeg']) },
      { label: 'PDF', maxMb: mb(MAX_SIZE_BY_MIME['application/pdf']) },
      { label: 'Word (DOC, DOCX)', maxMb: mb(MAX_SIZE_BY_MIME['application/msword']) },
    ],
  };
}

/** One-line summary reused in error messages. */
export const POLICY_SUMMARY =
  `Allowed: images (JPG, PNG, WEBP) up to ${mb(MAX_SIZE_BY_MIME['image/jpeg'])} MB, ` +
  `PDF up to ${mb(MAX_SIZE_BY_MIME['application/pdf'])} MB, ` +
  `Word (DOC/DOCX) up to ${mb(MAX_SIZE_BY_MIME['application/msword'])} MB.`;
