/* src/agreement-files/agreement-files.module.ts
 *
 * Self-contained: no imports from S3Module / S3mktModule / NovaS3Module /
 * CrmS3Module / HelpdeskFilesModule / LoaFilesModule and nothing exported to
 * them. Changing the Agreement policy can therefore never affect the other
 * upload flows, and vice versa.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AgreementFilesController } from './agreement-files.controller';
import { AgreementFilesService } from './agreement-files.service';

@Module({
  imports: [ConfigModule],
  controllers: [AgreementFilesController],
  providers: [AgreementFilesService],
})
export class AgreementFilesModule {}
