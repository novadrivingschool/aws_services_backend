/* src/hr-whatsapp-files/dto/hr-whatsapp-file-key.dto.ts */
import { IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Query params for reading or deleting an existing attachment.
 *
 * `updateId` is required alongside the key so the service can prove the
 * object belongs to that record. Without it, any valid
 * `hr-whatsapp-updates/...` key would be served.
 */
export class HrWhatsappFileKeyDto {
  @IsUUID()
  updateId!: string;

  @IsString()
  @MaxLength(512)
  key!: string;
}
