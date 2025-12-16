/* src/nova-s3/dto/create-folder.dto.ts */
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFolderDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  root?: string = 'nova-s3';

  // path destino donde crear (relativo a root). "" = raíz
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  path?: string = '';

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeNumber?: string;
}
