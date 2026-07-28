/* src/helpdesk-files/helpdesk-files.controller.ts
 *
 * `/helpdesk/files` — the HelpDesk's own upload path.
 *
 * Separate from `/s3/*` on purpose: those routes are shared by 15+ unrelated
 * features and accept any file into any folder, so their policy can never be
 * tightened without breaking someone. This controller serves the HelpDesk only.
 *
 * No auth guard here, matching the rest of this service. If authentication is
 * added later it belongs across `aws_services_backend` as a whole, not bolted
 * onto this one controller.
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

import { HelpdeskFilesService } from './helpdesk-files.service';
import { helpdeskMulterOptions } from './helpdesk-multer.config';
import { describePolicy } from './helpdesk-files.constants';
import { UploadHelpdeskFileDto } from './dto/upload-helpdesk-file.dto';
import { HelpdeskFileKeyDto } from './dto/helpdesk-file-key.dto';
import { UploadExceptionFilter } from './filters/upload-exception.filter';
import { AttachmentScope } from './utils/helpdesk-key.util';

@ApiTags('HelpDesk Files')
@Controller('helpdesk/files')
@UseFilters(UploadExceptionFilter)
export class HelpdeskFilesController {
  constructor(private readonly service: HelpdeskFilesService) {}

  /**
   * Lets the UI render the allowed types and sizes from one source of truth
   * instead of duplicating the numbers in the frontend.
   */
  @Get('policy')
  @ApiOperation({ summary: 'Allowed file types and size limits' })
  getPolicy() {
    return { success: true, policy: describePolicy() };
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload one ticket attachment (image, PDF or MP4)' })
  @ApiResponse({ status: 201, description: 'Stored; returns the S3 key' })
  @ApiResponse({ status: 400, description: 'Disallowed or malformed file' })
  @ApiResponse({ status: 413, description: 'File exceeds the limit for its type' })
  @UseInterceptors(FileInterceptor('file', helpdeskMulterOptions))
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

    return this.service.upload(
      file,
      dto.ticketUuid,
      (dto.scope ?? 'ticket') as AttachmentScope,
      dto.uploadedBy || 'unknown',
    );
  }

  @Get('signed-url')
  @ApiOperation({ summary: 'Short-lived URL to view an attachment' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  getSignedUrl(@Query() query: HelpdeskFileKeyDto) {
    return this.service.getSignedUrl(query.key, query.ticketUuid);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete an attachment belonging to a ticket' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  remove(@Query() query: HelpdeskFileKeyDto) {
    return this.service.remove(query.key, query.ticketUuid);
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async validateUploadBody(body: Record<string, string>): Promise<UploadHelpdeskFileDto> {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    return (await pipe.transform(
      {
        ticketUuid: body?.ticketUuid,
        scope: body?.scope,
        uploadedBy: body?.uploadedBy,
      },
      { type: 'body', metatype: UploadHelpdeskFileDto },
    )) as UploadHelpdeskFileDto;
  }
}
