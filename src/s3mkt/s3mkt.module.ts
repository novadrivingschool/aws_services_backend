import { Module } from '@nestjs/common';
import { S3MktService } from './s3mkt.service';
import { S3MktController } from './s3mkt.controller';

@Module({
  controllers: [S3MktController],
  providers: [S3MktService],
})
export class S3mktModule {}
