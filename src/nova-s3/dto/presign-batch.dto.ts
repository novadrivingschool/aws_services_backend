import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PresignBatchItemDto {
  @ApiProperty({ example: 'logo.png' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  filename: string;

  @ApiProperty({ example: 'image/png' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  contentType: string;

  @ApiProperty({ example: 4096000 })
  @IsNumber()
  @Min(1)
  size: number;

  @ApiProperty({
    example: 'Logos/logo.png',
    description: 'Relative path of the file (may include subfolders). Relative to basePath.',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(1024)
  relativePath: string;
}

export class PresignBatchDto {
  @ApiPropertyOptional({ example: 'nova-s3' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  root?: string;

  @ApiPropertyOptional({ example: 'Uploads/2026', description: 'Base folder path. Files are placed inside this.' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  basePath?: string;

  @ApiProperty({ example: 'NOVAJG232701' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  employeeNumber: string;

  @ApiProperty({ type: [PresignBatchItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PresignBatchItemDto)
  files: PresignBatchItemDto[];

  @ApiPropertyOptional({
    example: 104857600,
    description: 'File size threshold (bytes) for multipart upload. Default: 100MB.',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  multipartThreshold?: number;

  @ApiPropertyOptional({
    example: 10485760,
    description: 'Part size (bytes) for multipart uploads. Default: 10MB. Min: 5MB.',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  partSize?: number;

  @ApiPropertyOptional({ example: 3600 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  urlExpiresSeconds?: number;
}
