import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, UploadedFile, Query, Res } from '@nestjs/common';
import { S3Service } from './s3.service';
import { CreateS3Dto } from './dto/create-s3.dto';
import { UpdateS3Dto } from './dto/update-s3.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';


@Controller('s3')
export class S3Controller {
  constructor(private readonly s3Service: S3Service) { }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('employee_number') employeeNumber: string,
    @Query('folder') folder: string // ← Carpeta destino en S3
  ) {
    const buffer = file.buffer;
    const filename = file.originalname;
    const mimetype = file.mimetype;

    return this.s3Service.uploadFile(buffer, filename, mimetype, employeeNumber, folder);
  }

  @Get('file-url')
  getPublicUrl(
    @Query('folder') folder: string,
    @Query('employee_number') employeeNumber: string,
    @Query('filename') filename: string
  ) {
    return this.s3Service.getPublicUrl(folder, employeeNumber, filename);
  }

  @Get('file-url/no-employee')
  getPublicUrl_noEmployeeNumber(
    @Query('folder') folder: string,
    @Query('filename') filename: string
  ) {
    return this.s3Service.getPublicUrl_noEmployeeNumber(folder, filename);
  }

  @Get('download')
  async downloadFile(
    @Res() res: Response,
    @Query('folder') folder: string,
    @Query('filename') filename: string,
  ) {
    return this.s3Service.downloadFile(folder, filename, res);
  }

}
