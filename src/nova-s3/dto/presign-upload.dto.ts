import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PresignUploadDto {
  @ApiPropertyOptional({ example: 'nova-s3' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  root?: string;

  @ApiPropertyOptional({ example: 'Marketing/Creatives', description: 'Folder path (relative). Empty = root.' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  path?: string;

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

  @ApiProperty({ example: 'NOVAJG232701' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  employeeNumber: string;

  @ApiPropertyOptional({ example: 3600, description: 'URL expiry in seconds (default 3600)' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  expiresSeconds?: number;
}
