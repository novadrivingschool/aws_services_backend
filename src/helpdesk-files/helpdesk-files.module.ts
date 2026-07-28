/* src/helpdesk-files/helpdesk-files.module.ts
 *
 * Self-contained: no imports from S3Module / S3mktModule / NovaS3Module /
 * CrmS3Module and nothing exported to them. Changing the HelpDesk policy can
 * therefore never affect the other upload flows, and vice versa.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HelpdeskFilesController } from './helpdesk-files.controller';
import { HelpdeskFilesService } from './helpdesk-files.service';

@Module({
  imports: [ConfigModule],
  controllers: [HelpdeskFilesController],
  providers: [HelpdeskFilesService],
})
export class HelpdeskFilesModule {}
