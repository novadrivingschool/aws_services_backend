/* src/helpdesk-files/helpdesk-files.service.ts
 *
 * HelpDesk attachment storage. Owns its own S3 client on purpose: this module
 * must not inherit anything from `S3Service`, whose methods accept a
 * client-supplied folder and filename.
 *
 * It reads the same AWS credentials from the environment (BUCKET / REGION /
 * ACCESS_KEY / SECRET_ACCESS_KEY) that the service already requires to boot —
 * no new configuration is introduced.
 */
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  AllowedMimeType,
  INLINE_SAFE_MIME_TYPES,
  MAX_SIZE_BY_MIME,
  POLICY_SUMMARY,
  SIGNED_URL_TTL_SECONDS,
} from './helpdesk-files.constants';
import { declaredTypeMatches, detectMimeType } from './utils/file-signature.util';
import {
  AttachmentScope,
  buildObjectKey,
  extensionOf,
  isKeyOwnedByTicket,
} from './utils/helpdesk-key.util';

export interface UploadedAttachment {
  success: true;
  key: string;
  mimeType: AllowedMimeType;
  size: number;
}

export interface SignedAttachmentUrl {
  success: true;
  url: string;
  expiresIn: number;
}

/** MIME served for a stored object, derived from its extension — never from S3 metadata. */
const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
};

const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;

@Injectable()
export class HelpdeskFilesService {
  private readonly logger = new Logger(HelpdeskFilesService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const bucket = this.config.get<string>('BUCKET');
    if (!bucket) {
      throw new Error('S3 bucket name (BUCKET) is not defined in environment variables');
    }
    this.bucket = bucket;

    const region = this.config.get<string>('REGION');
    const accessKeyId = this.config.get<string>('ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('SECRET_ACCESS_KEY');

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials (REGION / ACCESS_KEY / SECRET_ACCESS_KEY) are incomplete');
    }

    this.s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  }

  // ─── Upload ──────────────────────────────────────────────────────────────

  /**
   * Validates and stores one attachment.
   *
   * Order matters: the type is decided from the bytes BEFORE the size is
   * checked, because the cap depends on the real type. A 50 MB file claiming
   * to be a PNG has to be rejected as an oversized PNG, not accepted as a video.
   */
  async upload(
    file: Express.Multer.File,
    ticketUuid: string,
    scope: AttachmentScope,
    actor = 'unknown',
  ): Promise<UploadedAttachment> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('File is required');
    }

    // 1. What is it, really?
    const detected = detectMimeType(file.buffer);
    if (!detected) {
      this.logger.warn(
        `Rejected upload from ${actor}: content did not match any allowed format ` +
          `(declared="${file.mimetype}", name="${file.originalname}")`,
      );
      throw new BadRequestException(
        `"${file.originalname}" is not a supported file. Its contents do not match a ` +
          `permitted format — renaming a file does not change its type. ${POLICY_SUMMARY}`,
      );
    }

    // A mismatch is worth a log line (it is the signature of a renamed file)
    // but not a rejection: the detected type is the one we act on.
    if (!declaredTypeMatches(file.mimetype, detected)) {
      this.logger.warn(
        `Type mismatch from ${actor}: declared="${file.mimetype}" detected="${detected}" ` +
          `name="${file.originalname}" — storing as "${detected}"`,
      );
    }

    // 2. Per-type size cap, against the detected type.
    const limit = MAX_SIZE_BY_MIME[detected];
    if (file.size > limit) {
      throw new PayloadTooLargeException(
        `"${file.originalname}" is ${mb(file.size)} MB. The limit for ${detected} files ` +
          `is ${mb(limit)} MB.`,
      );
    }

    // 3. Key is built here — the client's filename never reaches S3.
    const key = buildObjectKey(ticketUuid, scope, detected);

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          // The DETECTED type, not the declared one. This is what makes it safe
          // to serve these objects inline later.
          ContentType: detected,
          ContentDisposition: `inline; filename="${key.split('/').pop()}"`,
          ServerSideEncryption: 'AES256',
          Metadata: {
            'ticket-uuid': ticketUuid,
            'uploaded-by': actor,
            // Kept for forensics only; never used to decide anything.
            'original-name': encodeURIComponent(file.originalname).slice(0, 512),
          },
        }),
      );
    } catch (err) {
      this.logger.error(
        `S3 put failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new InternalServerErrorException('Failed to store the attachment');
    }

    this.logger.log(
      `Stored ${key} (${detected}, ${mb(file.size)} MB) for ticket ${ticketUuid} by ${actor}`,
    );

    return { success: true, key, mimeType: detected, size: file.size };
  }

  // ─── Read ────────────────────────────────────────────────────────────────

  /**
   * Short-lived signed URL for an attachment.
   *
   * `ResponseContentType` / `ResponseContentDisposition` are pinned into the
   * URL so S3 serves what WE decide rather than the metadata stored on the
   * object. That also neutralises legacy objects uploaded through the old
   * shared endpoint with a client-chosen content type.
   */
  async getSignedUrl(key: string, ticketUuid: string): Promise<SignedAttachmentUrl> {
    this.assertOwnership(key, ticketUuid);

    // Signing is pure local crypto: it succeeds even for an object that does
    // not exist, and the browser then shows a blank image with no explanation.
    // One HEAD turns that silent failure into an actionable 404.
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404 || status === 403) {
        this.logger.warn(`Attachment referenced by ticket ${ticketUuid} is not in the bucket: ${key}`);
        throw new NotFoundException(
          'This attachment is no longer stored. The ticket still references it, but the file ' +
            'is not in the bucket.',
        );
      }
      this.logger.error(`HEAD failed for ${key}: ${err instanceof Error ? err.message : err}`);
      throw new InternalServerErrorException('Failed to read the attachment');
    }

    const contentType = MIME_BY_EXTENSION[extensionOf(key)] ?? 'application/octet-stream';
    const disposition = INLINE_SAFE_MIME_TYPES.includes(contentType) ? 'inline' : 'attachment';
    const filename = this.safeFilename(key);

    try {
      const url = await getSignedUrl(
        this.s3,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentType: contentType,
          ResponseContentDisposition: `${disposition}; filename="${filename}"`,
        }),
        { expiresIn: SIGNED_URL_TTL_SECONDS },
      );

      return { success: true, url, expiresIn: SIGNED_URL_TTL_SECONDS };
    } catch (err) {
      this.logger.error(
        `Failed to sign ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new InternalServerErrorException('Failed to generate the attachment URL');
    }
  }

  // ─── Delete ──────────────────────────────────────────────────────────────

  async remove(key: string, ticketUuid: string, actor = 'unknown'): Promise<{ success: true }> {
    this.assertOwnership(key, ticketUuid);

    try {
      // HEAD first so deleting something that is not there is a 404 rather than
      // a silent success — the rollback path in the UI relies on knowing.
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404 || status === 403) {
        throw new NotFoundException('Attachment not found');
      }
      this.logger.error(`HEAD failed for ${key}: ${err instanceof Error ? err.message : err}`);
      throw new InternalServerErrorException('Failed to delete the attachment');
    }

    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      this.logger.error(`DELETE failed for ${key}: ${err instanceof Error ? err.message : err}`);
      throw new InternalServerErrorException('Failed to delete the attachment');
    }

    this.logger.log(`Deleted ${key} by ${actor}`);
    return { success: true };
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  /**
   * The single choke point that keeps a ticket from reaching objects that are
   * not its own. Every read/delete path goes through here.
   */
  private assertOwnership(key: string, ticketUuid: string): void {
    if (!isKeyOwnedByTicket(key, ticketUuid)) {
      this.logger.warn(`Blocked out-of-scope key "${key}" for ticket ${ticketUuid}`);
      throw new BadRequestException('The requested file does not belong to this ticket');
    }
  }

  /** Quote-free, ASCII-only filename so the header can never be broken out of. */
  private safeFilename(key: string): string {
    const raw = key.split('/').pop() ?? 'attachment';
    const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, '_');
    return cleaned.slice(0, 120) || 'attachment';
  }
}
