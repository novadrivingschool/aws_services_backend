/* src/nova-s3/dto/delete.dto.ts */
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DeleteDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  root?: string = 'nova-s3';

  // "file" o "folder"
  @IsIn(['file', 'folder'])
  kind: 'file' | 'folder';

  // ruta relativa del item
  @IsString()
  @MaxLength(1024)
  path: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeNumber?: string;
}
