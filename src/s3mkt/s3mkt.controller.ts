import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3MktService } from './s3mkt.service';

@Controller('s3mkt')
export class S3MktController {
  constructor(private readonly s3mkt: S3MktService) { }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (!folder) throw new BadRequestException('folder is required');
    const { buffer, originalname, mimetype } = file;
    return this.s3mkt.uploadFileGeneral(buffer, originalname, mimetype, folder);
  }

  @Get('file-url')
  async publicUrl(
    @Query('folder') folder: string,
    @Query('filename') filename: string,
  ) {
    if (!folder) throw new BadRequestException('folder is required');
    if (!filename) throw new BadRequestException('filename is required');
    return this.s3mkt.getPublicUrlNoEmployee(folder, filename);
  }

  @Get('list-html')
  async listHtml(@Query('folder') folder: string) {
    if (!folder) throw new BadRequestException('folder is required');
    console.log('Listing HTML templates in folder:', folder);

    try {
      const result = await this.s3mkt.listHtml(folder);
      console.log('Successfully listed HTML templates:', result.count, 'templates found');
      return result;
    } catch (e) {
      console.error('Error while listing HTML templates:', e);
      throw e;
    }
  }

  @Get('file')
  async getFile(@Query('key') key: string) {
    if (!key) throw new BadRequestException('key is required');
    const content = await this.s3mkt.getFileContent(key);
    return {
      success: true,
      key,
      contentType: 'text/html; charset=utf-8',
      content
    };
  }

  @Patch('replace')
  @UseInterceptors(FileInterceptor('file'))
  async replace(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder: string,
    @Body('filename') filename: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (!folder) throw new BadRequestException('folder is required');
    if (!filename) throw new BadRequestException('filename is required');
    const { buffer, mimetype } = file;
    return this.s3mkt.replaceFileGeneral(buffer, mimetype, folder, filename);
  }

  @Patch('rename')
  async renameFile(
    @Body('oldKey') oldKey: string,
    @Body('newKey') newKey: string,
  ) {
    if (!oldKey) throw new BadRequestException('oldKey is required');
    if (!newKey) throw new BadRequestException('newKey is required');
    return this.s3mkt.renameFile(oldKey, newKey);
  }

  @Delete('delete')
  async deleteFile(@Query('key') key: string) {
    if (!key) throw new BadRequestException('key is required');
    return this.s3mkt.deleteFile(key);
  }

  @Patch('rename-folder')
  async renameFolder(
    @Body('oldFolderPath') oldFolderPath: string,
    @Body('newFolderPath') newFolderPath: string,
  ) {
    if (!oldFolderPath) throw new BadRequestException('oldFolderPath is required');
    if (!newFolderPath) throw new BadRequestException('newFolderPath is required');

    const basePath = 'Marketing/templates/crm';
    if (!oldFolderPath.startsWith(basePath) || !newFolderPath.startsWith(basePath)) {
      throw new BadRequestException('Solo se pueden renombrar carpetas dentro del directorio de templates');
    }

    return this.s3mkt.renameFolder(oldFolderPath, newFolderPath);
  }

  @Delete('delete-folder')
  async deleteFolder(@Query('folderPath') folderPath: string) {
    if (!folderPath) throw new BadRequestException('folderPath is required');

    const basePath = 'Marketing/templates/crm';
    if (!folderPath.startsWith(basePath)) {
      throw new BadRequestException('Solo se pueden eliminar carpetas dentro del directorio de templates');
    }

    return this.s3mkt.deleteFolder(folderPath);
  }

  @Get('list-folder')
  async listFolder(@Query('folderPath') folderPath: string) {
    if (!folderPath) throw new BadRequestException('folderPath is required');
    return this.s3mkt.listFolderContents(folderPath);
  }

  @Post('migrate-legacy')
  async migrateLegacyTemplate(
    @Body('templateName') templateName: string,
    @Body('htmlContent') htmlContent: string,
    @Body('folder') folder: string,
  ) {
    if (!templateName) throw new BadRequestException('templateName is required');
    if (!htmlContent) throw new BadRequestException('htmlContent is required');
    if (!folder) throw new BadRequestException('folder is required');

    return this.s3mkt.migrateLegacyTemplate(templateName, htmlContent, folder);
  }

}