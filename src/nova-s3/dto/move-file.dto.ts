/* src/nova-s3/dto/move-file.dto.ts */
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MoveFileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  root?: string = 'nova-s3';

  // ruta relativa del archivo: "A/B/file.pdf"
  @IsString()
  @MaxLength(1024)
  sourcePath: string;

  // carpeta destino relativa: "" (raíz) o "X/Y"
  @IsString()
  @MaxLength(1024)
  targetPath: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeNumber?: string;
}
