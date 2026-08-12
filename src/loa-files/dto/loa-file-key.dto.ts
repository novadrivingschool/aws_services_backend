/* src/loa-files/dto/loa-file-key.dto.ts */
import { IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Query params for reading or deleting an existing attachment.
 *
 * `loaId` is required alongside the key so the service can prove the object
 * belongs to that LOA record. Without it, any valid `hr-loa/...` key would be
 * served.
 */
export class LoaFileKeyDto {
  @IsUUID()
  loaId!: string;

  @IsString()
  @MaxLength(512)
  key!: string;
}
