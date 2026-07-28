/* src/helpdesk-files/dto/upload-helpdesk-file.dto.ts */
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Multipart fields accompanying the file.
 *
 * Note there is no `folder` field: the destination is derived server-side from
 * `ticketUuid` + `scope`. Letting the client pass a folder is what made the
 * shared `/s3/upload/general` endpoint able to write anywhere in the bucket.
 */
export class UploadHelpdeskFileDto {
  /** Ticket the attachment belongs to. */
  @IsUUID()
  ticketUuid!: string;

  /** `ticket` (default) puts the file next to the ticket, `comment` under /comments. */
  @IsOptional()
  @IsIn(['ticket', 'comment'])
  scope?: 'ticket' | 'comment';

  /** Employee number, for the S3 metadata and the log line. Audit only. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  uploadedBy?: string;
}
