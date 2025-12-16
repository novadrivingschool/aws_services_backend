/* src/nova-s3/dto/move-folder.dto.ts */
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MoveFolderDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  root?: string = 'nova-s3';

  // ruta relativa de la carpeta: "A/B/Folder"
  @IsString()
  @MaxLength(1024)
  sourcePath: string;

  // ruta destino relativa: "" (raíz) o "X/Y" (mover dentro o renombrar según tu S3Service)
  @IsString()
  @MaxLength(1024)
  targetPath: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeNumber?: string;
}
