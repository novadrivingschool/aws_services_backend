/* src/hr-whatsapp-files/hr-whatsapp-files.controller.ts
 *
 * `/hr-whatsapp-updates/files` — the HR WhatsApp Updates module's own
 * upload path.
 *
 * Separate from `/s3/*` on purpose: those routes are shared by 15+ unrelated
 * features and accept any file into any folder, so their policy can never be
 * tightened without breaking someone. This controller serves HR WhatsApp
 * Updates only.
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

import { HrWhatsappFilesService } from './hr-whatsapp-files.service';
import { hrWhatsappMulterOptions } from './hr-whatsapp-multer.config';
import { describePolicy } from './hr-whatsapp-files.constants';
import { UploadHrWhatsappFileDto } from './dto/upload-hr-whatsapp-file.dto';
import { HrWhatsappFileKeyDto } from './dto/hr-whatsapp-file-key.dto';
import { UploadExceptionFilter } from './filters/upload-exception.filter';

@ApiTags('HR WhatsApp Update Files')
@Controller('hr-whatsapp-updates/files')
@UseFilters(UploadExceptionFilter)
export class HrWhatsappFilesController {
  constructor(private readonly service: HrWhatsappFilesService) {}

  /** Lets the UI render the allowed types and sizes from one source of truth. */
  @Get('policy')
  @ApiOperation({ summary: 'Allowed file types and size limits' })
  getPolicy() {
    return { success: true, policy: describePolicy() };
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload one HR WhatsApp Update attachment (image or PDF)' })
  @ApiResponse({ status: 201, description: 'Stored; returns the S3 key' })
  @ApiResponse({ status: 400, description: 'Disallowed or malformed file' })
  @ApiResponse({ status: 413, description: 'File exceeds the limit for its type' })
  @UseInterceptors(FileInterceptor('file', hrWhatsappMulterOptions))
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

    return this.service.upload(file, dto.updateId, dto.uploadedBy || 'unknown');
  }

  @Get('signed-url')
  @ApiOperation({ summary: 'Short-lived URL to view an attachment' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  getSignedUrl(@Query() query: HrWhatsappFileKeyDto) {
    return this.service.getSignedUrl(query.key, query.updateId);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete an attachment belonging to a HR WhatsApp Update record' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  remove(@Query() query: HrWhatsappFileKeyDto) {
    return this.service.remove(query.key, query.updateId);
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private async validateUploadBody(body: Record<string, string>): Promise<UploadHrWhatsappFileDto> {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    return (await pipe.transform(
      {
        updateId: body?.updateId,
        uploadedBy: body?.uploadedBy,
      },
      { type: 'body', metatype: UploadHrWhatsappFileDto },
    )) as UploadHrWhatsappFileDto;
  }
}
