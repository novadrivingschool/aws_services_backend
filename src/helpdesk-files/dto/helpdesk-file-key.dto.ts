/* src/helpdesk-files/dto/helpdesk-file-key.dto.ts */
import { IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Query params for reading or deleting an existing attachment.
 *
 * `ticketUuid` is required alongside the key so the service can prove the
 * object belongs to that ticket. Without it, any valid `it-tickets/...` key
 * would be served.
 */
export class HelpdeskFileKeyDto {
  @IsUUID()
  ticketUuid!: string;

  @IsString()
  @MaxLength(512)
  key!: string;
}
