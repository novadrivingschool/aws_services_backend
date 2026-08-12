/* src/loa-files/loa-files.controller.ts
 *
 * `/leave-of-absence/files` — the LOA module's own upload path.
 *
 * Separate from `/s3/*` on purpose: those routes are shared by 15+ unrelated
 * features and accept any file into any folder, so their policy can never be
 * tightened without breaking someone. This controller serves LOA only.
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

import { LoaFilesService } from './loa-files.service';
import { loaMulterOptions } from './loa-multer.config';
import { describePolicy } from './loa-files.constants';
import { UploadLoaFileDto } from './dto/upload-loa-file.dto';
import { LoaFileKeyDto } from './dto/loa-file-key.dto';
import { UploadExceptionFilter } from './filters/upload-exception.filter';

@ApiTags('Leave of Absence Files')
@Controller('leave-of-absence/files')
@UseFilters(UploadExceptionFilter)
export class LoaFilesController {
  constructor(private readonly service: LoaFilesService) {}

  /** Lets the UI render the allowed types and sizes from one source of truth. */
  @Get('policy')
  @ApiOperation({ summary: 'Allowed file types and size limits' })
  getPolicy() {
    return { success: true, policy: describePolicy() };
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload one LOA attachment (image or PDF)' })
  @ApiResponse({ status: 201, description: 'Stored; returns the S3 key' })
  @ApiResponse({ status: 400, description: 'Disallowed or malformed file' })
  @ApiResponse({ status: 413, description: 'File exceeds the limit for its type' })
  @UseInterceptors(FileInterceptor('file', loaMulterOptions))
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

    return this.service.upload(file, dto.loaId, dto.uploadedBy || 'unknown');
  }

  @Get('signed-url')
  @ApiOperation({ summary: 'Short-lived URL to view an attachment' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  getSignedUrl(@Query() query: LoaFileKeyDto) {
    return this.service.getSignedUrl(query.key, query.loaId);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete an attachment belonging to a LOA record' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  remove(@Query() query: LoaFileKeyDto) {
    return this.service.remove(query.key, query.loaId);
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async validateUploadBody(body: Record<string, string>): Promise<UploadLoaFileDto> {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    return (await pipe.transform(
      {
        loaId: body?.loaId,
        uploadedBy: body?.uploadedBy,
      },
      { type: 'body', metatype: UploadLoaFileDto },
    )) as UploadLoaFileDto;
  }
}
