import { Module } from '@nestjs/common';
import { S3Module } from './s3/s3.module';
import { S3Controller } from './s3/s3.controller';
import { ConfigModule } from '@nestjs/config';

@Module({

  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    S3Module],
  controllers: [S3Controller],
  providers: [],
})
export class AppModule { }
