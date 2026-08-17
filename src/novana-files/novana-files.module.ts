/* src/novana-files/novana-files.module.ts
 *
 * Autocontenido: sin imports de S3Module / S3mktModule / NovaS3Module /
 * CrmS3Module y sin exportar nada hacia ellos. Cambiar la política de NOVANA
 * no puede afectar a los otros flujos de subida, ni al revés.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { NovanaFilesController } from './novana-files.controller';
import { NovanaFilesService } from './novana-files.service';

@Module({
  imports: [ConfigModule],
  controllers: [NovanaFilesController],
  providers: [NovanaFilesService],
})
export class NovanaFilesModule {}
