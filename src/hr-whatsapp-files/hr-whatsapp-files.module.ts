/* src/hr-whatsapp-files/hr-whatsapp-files.module.ts
 *
 * Self-contained: no imports from S3Module / S3mktModule / NovaS3Module /
 * CrmS3Module / HelpdeskFilesModule / NovanaFilesModule / LoaFilesModule and
 * nothing exported to them. Changing the HR WhatsApp Updates attachment
 * policy can therefore never affect the other upload flows, and vice versa.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HrWhatsappFilesController } from './hr-whatsapp-files.controller';
import { HrWhatsappFilesService } from './hr-whatsapp-files.service';

@Module({
  imports: [ConfigModule],
  controllers: [HrWhatsappFilesController],
  providers: [HrWhatsappFilesService],
})
export class HrWhatsappFilesModule {}
