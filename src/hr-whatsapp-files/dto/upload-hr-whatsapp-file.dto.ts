/* src/hr-whatsapp-files/dto/upload-hr-whatsapp-file.dto.ts */
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Multipart fields accompanying the file.
 *
 * No `folder` field on purpose: the destination is derived server-side from
 * `updateId`. Letting the client pass a folder is what made the shared
 * `/s3/upload/general` endpoint able to write anywhere in the bucket.
 */
export class UploadHrWhatsappFileDto {
  /** HR WhatsApp Update record the attachment belongs to. */
  @IsUUID()
  updateId!: string;

  /** Employee number of who uploaded it — S3 metadata + log line. Audit only. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  uploadedBy?: string;
}
