import { IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterUploadDto {
  @ApiPropertyOptional({ example: 'nova-s3' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  root?: string;

  @ApiProperty({
    example: 'Marketing/logo.png',
    description: 'Relative path in DB (without root/employeeNumber)',
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(1024)
  path: string;

  @ApiProperty({ example: 'nova-s3/NOVAJG232701/Marketing/logo.png' })
  @IsNotEmpty()
  @IsString()
  s3Key: string;

  @ApiProperty({ example: 4096000 })
  @IsNumber()
  @Min(0)
  size: number;

  @ApiProperty({ example: 'image/png' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(128)
  mimeType: string;

  @ApiProperty({ example: 'NOVAJG232701' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  employeeNumber: string;
}
