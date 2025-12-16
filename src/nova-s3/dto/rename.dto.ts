/* src/nova-s3/dto/rename.dto.ts */
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RenameDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  root?: string = 'nova-s3';

  // ruta relativa del item, ej: "Marketing/file.pdf" o "Marketing/FolderA"
  @IsString()
  @MaxLength(1024)
  oldPath: string;

  // solo el nuevo nombre (no path)
  @IsString()
  @MaxLength(255)
  newName: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeNumber?: string;
}
