import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterBatchItemDto {
  @ApiProperty({ example: 'Marketing/logo.png' })
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
}

export class RegisterBatchDto {
  @ApiPropertyOptional({ example: 'nova-s3' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  root?: string;

  @ApiProperty({ example: 'NOVAJG232701' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  employeeNumber: string;

  @ApiProperty({ type: [RegisterBatchItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegisterBatchItemDto)
  items: RegisterBatchItemDto[];
}
