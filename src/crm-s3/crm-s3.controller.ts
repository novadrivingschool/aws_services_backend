import {
  Controller,
  Get,
  Post,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CrmS3Service } from './crm-s3.service';

@Controller('crm-files')
export class CrmS3Controller {
  constructor(private readonly crmS3Service: CrmS3Service) { }

  /**
   * POST /crm-files/upload/:uuid
   *
   * Sube un archivo al bucket del CRM en la ruta: crm/{uuid}/archivo.extension
   */
  @Post('upload/:uuid')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('uuid') uuid: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    console.log(`Uploading file for CRM UUID: ${uuid}...`);

    if (!file) throw new BadRequestException('File is required');
    if (!uuid) throw new BadRequestException('uuid is required');

    return this.crmS3Service.uploadFile(uuid, file);
  }

  /**
   * GET /crm-files/url/:uuid/:filename
   *
   * Obtiene la URL pública (firmada) para descargar o visualizar el archivo.
   */
  @Get('url/:uuid/:filename')
  async getFileUrl(
    @Param('uuid') uuid: string,
    @Param('filename') filename: string,
  ) {
    if (!uuid) throw new BadRequestException('uuid is required');
    if (!filename) throw new BadRequestException('filename is required');

    return this.crmS3Service.getPublicUrl(uuid, filename);
  }

  /**
   * DELETE /crm-files/:uuid/:filename
   *
   * Elimina un archivo específico del bucket del CRM.
   */
  @Delete(':uuid/:filename')
  async deleteFile(
    @Param('uuid') uuid: string,
    @Param('filename') filename: string,
  ) {
    if (!uuid) throw new BadRequestException('uuid is required');
    if (!filename) throw new BadRequestException('filename is required');

    return this.crmS3Service.deleteFile(uuid, filename);
  }
}