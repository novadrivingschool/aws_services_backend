import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class MultipartPartDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  partNumber: number;

  @ApiProperty({ example: '"d8e8fca2dc0f896fd7cb4cb0031ba249"' })
  @IsNotEmpty()
  @IsString()
  etag: string;
}

export class CompleteMultipartDto {
  @ApiProperty({ example: 'nova-s3' })
  @IsNotEmpty()
  @IsString()
  root: string;

  @ApiProperty({ example: 'AQIDBAUGBwgJCg...' })
  @IsNotEmpty()
  @IsString()
  uploadId: string;

  @ApiProperty({ example: 'nova-s3/NOVAJG232701/Marketing/video.mp4' })
  @IsNotEmpty()
  @IsString()
  s3Key: string;

  @ApiProperty({ example: 'Marketing/video.mp4', description: 'Relative path in DB (without root/employeeNumber)' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(1024)
  path: string;

  @ApiProperty({ example: 'video.mp4' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  filename: string;

  @ApiProperty({ example: 1073741824 })
  @IsNumber()
  @Min(0)
  size: number;

  @ApiProperty({ example: 'video/mp4' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  mimeType: string;

  @ApiProperty({ example: 'NOVAJG232701' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  employeeNumber: string;

  @ApiProperty({ type: [MultipartPartDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MultipartPartDto)
  parts: MultipartPartDto[];
}

export class AbortMultipartDto {
  @ApiProperty({ example: 'nova-s3/NOVAJG232701/Marketing/video.mp4' })
  @IsNotEmpty()
  @IsString()
  s3Key: string;

  @ApiProperty({ example: 'AQIDBAUGBwgJCg...' })
  @IsNotEmpty()
  @IsString()
  uploadId: string;
}
