/* src/nova-s3/nova-s3.module.ts */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NovaS3Service } from './nova-s3.service';
import { NovaS3Controller } from './nova-s3.controller';
import { NovaS3 } from './entities/nova-s3.entity';
import { S3Module } from 'src/s3/s3.module';
import { NovaS3StorageUtil } from './utils/nova-s3-storage.util';

// 👇 importa el util (ajusta la ruta real)


@Module({
  imports: [S3Module, TypeOrmModule.forFeature([NovaS3])],
  controllers: [NovaS3Controller],
  providers: [
    NovaS3Service,
    NovaS3StorageUtil, // ✅ ESTE ES EL FIX del error
  ],
  exports: [NovaS3Service],
})
export class NovaS3Module {}
