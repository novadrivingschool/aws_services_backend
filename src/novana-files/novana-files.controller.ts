/* src/novana-files/novana-files.controller.ts
 *
 * `/novana/files` — la ruta de subida propia de NOVANA.
 *
 * Separada de `/s3/*` a propósito: esas rutas las comparten 15+ funciones sin
 * relación y aceptan cualquier archivo en cualquier carpeta, así que su
 * política no se puede endurecer sin romperle algo a alguien. Este controller
 * sirve solo a NOVANA.
 *
 * Sin guard de autenticación, igual que el resto de este servicio. Si se añade
 * autenticación, corresponde a `aws_services_backend` entero y no atornillada
 * a este controller.
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

import { NovanaFilesService } from './novana-files.service';
import { novanaMulterOptions } from './novana-multer.config';
import { describePolicy } from './novana-files.constants';
import { UploadNovanaFileDto } from './dto/upload-novana-file.dto';
import { NovanaFileKeyDto } from './dto/novana-file-key.dto';
import { NovanaUploadExceptionFilter } from './filters/upload-exception.filter';
import { resolveUploadTarget } from './utils/novana-key.util';

@ApiTags('NOVANA Files')
@Controller('novana/files')
@UseFilters(NovanaUploadExceptionFilter)
export class NovanaFilesController {
  constructor(private readonly service: NovanaFilesService) {}

  /**
   * Permite a la UI pintar tipos, tamaños, ámbitos y formas de clave desde una
   * sola fuente de verdad en vez de duplicarlos a mano en el frontend.
   */
  @Get('policy')
  @ApiOperation({ summary: 'Allowed file types, size limits, scope kinds and key shapes' })
  getPolicy() {
    return { success: true, policy: describePolicy() };
  }

  @Post('upload')
  @ApiOperation({
    summary:
      'Upload one attachment: either for a task comment (taskUuid) or for the record itself ' +
      '(scopeKind + scopeId: task, project or draft)',
  })
  @ApiResponse({ status: 201, description: 'Stored; returns the S3 key' })
  @ApiResponse({ status: 400, description: 'Disallowed/malformed file, or malformed scope fields' })
  @ApiResponse({ status: 413, description: 'File exceeds the limit for its type' })
  @UseInterceptors(FileInterceptor('file', novanaMulterOptions))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    // Validado a mano: los campos multipart llegan como cadenas, y pasar el
    // ValidationPipe global con `forbidNonWhitelisted` sobre un cuerpo
    // multipart rechaza los campos de frontera que añade multer.
    @Body() body: Record<string, string>,
  ) {
    if (!file) {
      throw new BadRequestException('File is required (send it as the "file" field)');
    }

    const dto = await this.validateUploadBody(body);

    // Única fuente de la regla "qué campos van juntos": vive en
    // resolveUploadTarget para no repetirla aquí ni en el servicio.
    const resolved = resolveUploadTarget({
      taskUuid: dto.taskUuid,
      scopeKind: dto.scopeKind,
      scopeId: dto.scopeId,
    });
    if (!resolved.ok) {
      throw new BadRequestException(resolved.message);
    }

    return this.service.upload(file, resolved.parts, dto.uploadedBy || 'unknown');
  }

  @Get('signed-url')
  @ApiOperation({ summary: 'Short-lived URL to view an attachment' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  getSignedUrl(@Query() query: NovanaFileKeyDto) {
    return this.service.getSignedUrl(query.key, query.taskUuid);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete an attachment (task comment, task, project or draft)' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  remove(@Query() query: NovanaFileKeyDto) {
    return this.service.remove(query.key, query.taskUuid);
  }

  // ─── Internos ────────────────────────────────────────────────────────────

  private async validateUploadBody(body: Record<string, string>): Promise<UploadNovanaFileDto> {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    return (await pipe.transform(
      {
        taskUuid: body?.taskUuid,
        uploadedBy: body?.uploadedBy,
        scopeKind: body?.scopeKind,
        scopeId: body?.scopeId,
      },
      { type: 'body', metatype: UploadNovanaFileDto },
    )) as UploadNovanaFileDto;
  }
}
