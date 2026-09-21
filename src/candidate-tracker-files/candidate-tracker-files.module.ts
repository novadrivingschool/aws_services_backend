/* src/candidate-tracker-files/candidate-tracker-files.module.ts
 *
 * Self-contained: no imports from S3Module / S3mktModule / NovaS3Module /
 * CrmS3Module / HelpdeskFilesModule / LoaFilesModule / HrWhatsappFilesModule
 * and nothing exported to them. Changing the Candidate Tracker policy can
 * therefore never affect the other upload flows, and vice versa.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CandidateTrackerFilesController } from './candidate-tracker-files.controller';
import { CandidateTrackerFilesService } from './candidate-tracker-files.service';

@Module({
  imports: [ConfigModule],
  controllers: [CandidateTrackerFilesController],
  providers: [CandidateTrackerFilesService],
})
export class CandidateTrackerFilesModule {}
