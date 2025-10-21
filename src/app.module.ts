import { Module } from '@nestjs/common';
import { S3Module } from './s3/s3.module';
import { S3Controller } from './s3/s3.controller';
import { ConfigModule } from '@nestjs/config';
import { S3mktModule } from './s3mkt/s3mkt.module';

@Module({

  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    S3Module,
    S3mktModule],
  controllers: [S3Controller],
  providers: [],
})
export class AppModule { }
