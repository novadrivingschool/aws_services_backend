import { PartialType } from '@nestjs/mapped-types';
import { CreateNovaS3Dto } from './create-nova-s3.dto';

export class UpdateNovaS3Dto extends PartialType(CreateNovaS3Dto) {}
