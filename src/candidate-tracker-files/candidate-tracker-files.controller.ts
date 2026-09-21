/* src/candidate-tracker-files/candidate-tracker-files.controller.ts
 *
 * `/candidate-tracker/files` — the Candidate Tracker module's own upload
 * path.
 *
 * Separate from `/s3/*` on purpose: those routes are shared by 15+ unrelated
 * features and accept any file into any folder, so their policy can never be
 * tightened without breaking someone. This controller serves Candidate
 * Tracker only.
 *
 * No auth guard here, matching the rest of this service (loa-files,
 * hr-whatsapp-files, helpdesk-files). If authentication is added later it
 * belongs across `aws_services_backend` as a whole, not bolted onto this one
 * controller.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CandidateTrackerFilesService } from './candidate-tracker-files.service';
import { candidateTrackerMulterOptions } from './candidate-tracker-multer.config';
import { describePolicy } from './candidate-tracker-files.constants';
import { UploadCandidateFileDto } from './dto/upload-candidate-file.dto';
import { CandidateFileKeyDto } from './dto/candidate-file-key.dto';
import { UploadExceptionFilter } from './filters/upload-exception.filter';

@ApiTags('Candidate Tracker Files')
@Controller('candidate-tracker/files')
@UseFilters(UploadExceptionFilter)
export class CandidateTrackerFilesController {
  constructor(private readonly service: CandidateTrackerFilesService) {}

  /** Lets the UI render the allowed types and sizes from one source of truth. */
  @Get('policy')
  @ApiOperation({ summary: 'Allowed file types and size limits' })
  getPolicy() {
    return { success: true, policy: describePolicy() };
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload one Candidate Tracker attachment (image, PDF or Word doc)' })
  @ApiResponse({ status: 201, description: 'Stored; returns the S3 key' })
  @ApiResponse({ status: 400, description: 'Disallowed or malformed file' })
  @ApiResponse({ status: 413, description: 'File exceeds the limit for its type' })
  @UseInterceptors(FileInterceptor('file', candidateTrackerMulterOptions))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    // Validated manually: multipart fields arrive as strings, and running the
    // global ValidationPipe with `forbidNonWhitelisted` over a multipart body
    // rejects the boundary fields multer adds.
    @Body() body: Record<string, string>,
  ) {
    if (!file) {
      throw new BadRequestException('File is required (send it as the "file" field)');
    }

    const dto = await this.validateUploadBody(body);

    return this.service.upload(file, dto.candidateId, dto.uploadedBy || 'unknown');
  }

  @Get('signed-url')
  @ApiOperation({ summary: 'Short-lived URL to view an attachment' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  getSignedUrl(@Query() query: CandidateFileKeyDto) {
    return this.service.getSignedUrl(query.key, query.candidateId);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete an attachment belonging to a candidate record' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  remove(@Query() query: CandidateFileKeyDto) {
    return this.service.remove(query.key, query.candidateId);
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async validateUploadBody(body: Record<string, string>): Promise<UploadCandidateFileDto> {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    return (await pipe.transform(
      { candidateId: body?.candidateId, uploadedBy: body?.uploadedBy },
      { type: 'body', metatype: UploadCandidateFileDto },
    )) as UploadCandidateFileDto;
  }
}
