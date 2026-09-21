/* src/candidate-tracker-files/dto/candidate-file-key.dto.ts */
import { IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Query params for reading or deleting an existing attachment.
 *
 * `candidateId` is required alongside the key so the service can prove the
 * object belongs to that candidate record. Without it, any valid
 * `hr-candidate-tracker/...` key would be served.
 */
export class CandidateFileKeyDto {
  @IsUUID()
  candidateId!: string;

  @IsString()
  @MaxLength(512)
  key!: string;
}
