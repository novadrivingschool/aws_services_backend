/* src/hr-whatsapp-files/hr-whatsapp-files.service.ts
 *
 * HR WhatsApp Update attachment storage (images/PDF). Owns its own S3 client
 * on purpose — mirrors loa-files.service.ts / helpdesk-files.service.ts.
 * This module must not inherit anything from S3Service, whose methods accept
 * a client-supplied folder and filename.
 *
 * Reads the same AWS credentials from the environment (BUCKET / REGION /
 * ACCESS_KEY / SECRET_ACCESS_KEY) the service already requires to boot — no
 * new configuration is introduced.
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
} from './hr-whatsapp-files.constants';
import { declaredTypeMatches, detectMimeType } from './utils/file-signature.util';
import { buildObjectKey, extensionOf, isKeyOwnedByUpdate } from './utils/hr-whatsapp-key.util';

export interface UploadedHrWhatsappAttachment {
  success: true;
  key: string;
  mimeType: AllowedMimeType;
  size: number;
}

export interface SignedHrWhatsappAttachmentUrl {
  success: true;
  url: string;
  expiresIn: number;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;

@Injectable()
export class HrWhatsappFilesService {
  private readonly logger = new Logger(HrWhatsappFilesService.name);
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

  async upload(
    file: Express.Multer.File,
    updateId: string,
    actor = 'unknown',
  ): Promise<UploadedHrWhatsappAttachment> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('File is required');
    }

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

    if (!declaredTypeMatches(file.mimetype, detected)) {
      this.logger.warn(
        `Type mismatch from ${actor}: declared="${file.mimetype}" detected="${detected}" ` +
          `name="${file.originalname}" — storing as "${detected}"`,
      );
    }

    const limit = MAX_SIZE_BY_MIME[detected];
    if (file.size > limit) {
      throw new PayloadTooLargeException(
        `"${file.originalname}" is ${mb(file.size)} MB. The limit for ${detected} files ` +
          `is ${mb(limit)} MB.`,
      );
    }

    const key = buildObjectKey(updateId, detected);

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: detected,
          ContentDisposition: `inline; filename="${key.split('/').pop()}"`,
          ServerSideEncryption: 'AES256',
          Metadata: {
            'update-id': updateId,
            'uploaded-by': actor,
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
      `Stored ${key} (${detected}, ${mb(file.size)} MB) for HR WhatsApp Update ${updateId} by ${actor}`,
    );

    return { success: true, key, mimeType: detected, size: file.size };
  }

  // ─── Read ────────────────────────────────────────────────────────────────

  async getSignedUrl(key: string, updateId: string): Promise<SignedHrWhatsappAttachmentUrl> {
    this.assertOwnership(key, updateId);

    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404 || status === 403) {
        this.logger.warn(`Attachment referenced by HR WhatsApp Update ${updateId} is not in the bucket: ${key}`);
        throw new NotFoundException(
          'This attachment is no longer stored. The record still references it, but the file ' +
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

  async remove(key: string, updateId: string, actor = 'unknown'): Promise<{ success: true }> {
    this.assertOwnership(key, updateId);

    try {
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

  /** The single choke point that keeps one record from reaching another's objects. */
  private assertOwnership(key: string, updateId: string): void {
    if (!isKeyOwnedByUpdate(key, updateId)) {
      this.logger.warn(`Blocked out-of-scope key "${key}" for HR WhatsApp Update ${updateId}`);
      throw new BadRequestException('The requested file does not belong to this record');
    }
  }

  private safeFilename(key: string): string {
    const raw = key.split('/').pop() ?? 'attachment';
    const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, '_');
    return cleaned.slice(0, 120) || 'attachment';
  }
}
