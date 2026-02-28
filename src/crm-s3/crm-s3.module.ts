import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CrmS3Controller } from './crm-s3.controller';
import { CrmS3Service } from './crm-s3.service';

@Module({
  // Importamos ConfigModule para que el servicio pueda inyectar ConfigService
  imports: [ConfigModule],
  controllers: [CrmS3Controller],
  providers: [CrmS3Service],
  // Si en el futuro necesitas usar CrmS3Service en otro módulo, descomenta la siguiente línea:
  // exports: [CrmS3Service],
})
export class CrmS3Module {}