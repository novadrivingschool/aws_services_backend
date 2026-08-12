/* src/loa-files/loa-files.module.ts
 *
 * Self-contained: no imports from S3Module / S3mktModule / NovaS3Module /
 * CrmS3Module / HelpdeskFilesModule and nothing exported to them. Changing the
 * LOA policy can therefore never affect the other upload flows, and vice versa.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { LoaFilesController } from './loa-files.controller';
import { LoaFilesService } from './loa-files.service';

@Module({
  imports: [ConfigModule],
  controllers: [LoaFilesController],
  providers: [LoaFilesService],
})
export class LoaFilesModule {}
