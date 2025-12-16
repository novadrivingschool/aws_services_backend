import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListFolderDto {
  @ApiPropertyOptional({ example: 'nova-s3' })
  root?: string;

  @ApiPropertyOptional({
    example: 'Marketing/Creatives',
    description: 'Current folder path (relative). Empty string means root.',
  })
  path?: string;

  @ApiPropertyOptional({
    example: 'NOVAJG232701',
    description: 'Multi-tenant key.',
  })
  employeeNumber?: string;

  @ApiPropertyOptional({
    example: 'name',
    description: 'name | type | size | createdAt | updatedAt',
  })
  sortBy?: 'name' | 'type' | 'size' | 'createdAt' | 'updatedAt';

  @ApiPropertyOptional({
    example: 'asc',
    description: 'asc | desc',
  })
  order?: 'asc' | 'desc';
}
