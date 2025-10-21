import {
  Controller, Get, Post, Patch, Body, Query,
  BadRequestException, UploadedFile, UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3MktService } from './s3mkt.service';

@Controller('s3mkt') // 👈 rutas nuevas, separadas de /s3/*
export class S3MktController {
  constructor(private readonly s3mkt: S3MktService) {}

  // POST /s3mkt/upload  (multipart: file, body: folder)
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

  // GET /s3mkt/file-url?folder=Marketing/templates/crm&filename=img.png
  @Get('file-url')
  async publicUrl(
    @Query('folder') folder: string,
    @Query('filename') filename: string,
  ) {
    if (!folder) throw new BadRequestException('folder is required');
    if (!filename) throw new BadRequestException('filename is required');
    return this.s3mkt.getPublicUrlNoEmployee(folder, filename);
  }

  // GET /s3mkt/list-html?folder=Marketing/templates/crm
  @Get('list-html')
  async listHtml(@Query('folder') folder: string) {
    if (!folder) throw new BadRequestException('folder is required');
    return this.s3mkt.listHtml(folder);
  }

  // GET /s3mkt/file?key=Marketing/templates/crm/template.html
  @Get('file')
  async getFile(@Query('key') key: string) {
    if (!key) throw new BadRequestException('key is required');
    const content = await this.s3mkt.getFileContent(key);
    return { success: true, key, contentType: 'text/html; charset=utf-8', content };
  }

  // PATCH /s3mkt/replace   (multipart: file, body: folder, filename)
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
}
