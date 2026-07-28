/* src/helpdesk-files/helpdesk-files.constants.ts
 *
 * Single source of truth for the HelpDesk attachment policy.
 *
 * This module owns its own endpoint and does not touch `S3Module` /
 * `S3mktModule` / `NovaS3Module` / `CrmS3Module`. The HelpDesk no longer shares
 * `/s3/upload/general` with CallsQa, LeadInstructorVault, Reimbursement,
 * VehicleLogs, ClassesRatings and the rest — each service gets its own upload
 * path, so tightening one can never break another.
 */

/** Canonical MIME types the HelpDesk accepts. Nothing else gets stored. */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/**
 * Per-type size caps, in bytes.
 *
 * A single global cap would be wrong in both directions: 8 MB makes a 60 s
 * screen recording impossible, and 100 MB lets someone park a 100 MB "PNG"
 * in the bucket (and, with memory storage, in the process heap).
 */
export const MAX_SIZE_BY_MIME: Record<AllowedMimeType, number> = {
  'image/jpeg': 8 * 1024 * 1024, //   8 MB
  'image/png': 8 * 1024 * 1024, //   8 MB
  'image/gif': 8 * 1024 * 1024, //   8 MB
  'image/webp': 8 * 1024 * 1024, //   8 MB
  'application/pdf': 20 * 1024 * 1024, //  20 MB
  'video/mp4': 100 * 1024 * 1024, // 100 MB
};

/**
 * Hard ceiling handed to multer. Multer cannot know the real type until the
 * bytes are buffered, so it enforces the largest allowed value and the exact
 * per-type cap is applied afterwards, against the DETECTED type.
 */
export const MULTER_MAX_FILE_SIZE = Math.max(...Object.values(MAX_SIZE_BY_MIME));

/** Extension written to S3, derived from the detected type (never from the client). */
export const EXTENSION_BY_MIME: Record<AllowedMimeType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
};

/** Extensions accepted in the file picker / cheap pre-filter. */
export const ALLOWED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.pdf',
  '.mp4',
] as const;

/** Every HelpDesk object lives under this prefix. Enforced on read and write. */
export const HELPDESK_S3_ROOT = 'it-tickets';

/** Sub-folder used for files attached to a comment rather than to the ticket. */
export const COMMENT_SUBFOLDER = 'comments';

/** Max attachments the UI allows per ticket (mirrored on the frontend). */
export const MAX_FILES_PER_TICKET = 5;

/** Signed URL lifetime, in seconds. */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

/**
 * Types safe to render inline in the browser. Anything else is served with
 * `Content-Disposition: attachment` so it can never execute in our origin.
 */
export const INLINE_SAFE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
];

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

/**
 * Human-readable policy. Returned by `GET /helpdesk/files/policy` so the UI
 * can render the limits from the server instead of hardcoding them twice.
 */
export function describePolicy() {
  return {
    allowedMimeTypes: [...ALLOWED_MIME_TYPES],
    allowedExtensions: [...ALLOWED_EXTENSIONS],
    maxFilesPerTicket: MAX_FILES_PER_TICKET,
    maxSizeByMime: MAX_SIZE_BY_MIME,
    limits: [
      { label: 'Images (JPG, PNG, GIF, WEBP)', maxMb: mb(MAX_SIZE_BY_MIME['image/jpeg']) },
      { label: 'PDF', maxMb: mb(MAX_SIZE_BY_MIME['application/pdf']) },
      { label: 'Video (MP4)', maxMb: mb(MAX_SIZE_BY_MIME['video/mp4']) },
    ],
  };
}

/** One-line summary reused in error messages so the user always sees the rules. */
export const POLICY_SUMMARY =
  `Allowed: images (JPG, PNG, GIF, WEBP) up to ${mb(MAX_SIZE_BY_MIME['image/jpeg'])} MB, ` +
  `PDF up to ${mb(MAX_SIZE_BY_MIME['application/pdf'])} MB, ` +
  `MP4 video up to ${mb(MAX_SIZE_BY_MIME['video/mp4'])} MB.`;
