/* src/loa-files/dto/upload-loa-file.dto.ts */
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Multipart fields accompanying the file.
 *
 * No `folder` field on purpose: the destination is derived server-side from
 * `loaId`. Letting the client pass a folder is what made the shared
 * `/s3/upload/general` endpoint able to write anywhere in the bucket.
 */
export class UploadLoaFileDto {
  /** Leave of Absence record the attachment belongs to. */
  @IsUUID()
  loaId!: string;

  /** Employee number of who uploaded it — S3 metadata + log line. Audit only. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  uploadedBy?: string;
}
