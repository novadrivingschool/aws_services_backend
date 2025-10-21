import { PartialType } from '@nestjs/mapped-types';
import { CreateS3mktDto } from './create-s3mkt.dto';

export class UpdateS3mktDto extends PartialType(CreateS3mktDto) {}
