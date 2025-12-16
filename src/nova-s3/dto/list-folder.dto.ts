// src/nova-s3/dto/list-folder.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListFolderDto {
  @ApiPropertyOptional({ example: 'nova-s3' })
  @IsOptional()
  @IsString()
  root?: string;

  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({ example: 'NOVAJG232701' })
  @IsString()
  employeeNumber!: string;

  @ApiPropertyOptional({ example: 'name' })
  @IsOptional()
  @IsIn(['name', 'type', 'size', 'createdAt', 'updatedAt'])
  sortBy?: 'name' | 'type' | 'size' | 'createdAt' | 'updatedAt';

  @ApiPropertyOptional({ example: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
