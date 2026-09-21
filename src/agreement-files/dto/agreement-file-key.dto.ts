/* src/agreement-files/dto/agreement-file-key.dto.ts */
import { IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Query params for reading or deleting an existing attachment.
 *
 * `agreementId` is required alongside the key so the service can prove the
 * object belongs to that Agreement record. Without it, any valid
 * `agreements/...` key would be served.
 */
export class AgreementFileKeyDto {
  @IsUUID()
  agreementId!: string;

  @IsString()
  @MaxLength(512)
  key!: string;
}
