// src/s3/s3.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Response } from 'express';
import { Stream } from 'stream';


@Injectable()
export class S3Service {
  private s3: S3Client;
  private bucketName: string;

  constructor(private readonly configService: ConfigService) {
    const bucket = this.configService.get<string>('BUCKET');
    if (!bucket) {
      throw new Error('S3 bucket name is not defined in environment variables');
    }
    this.bucketName = bucket;

    const region = this.configService.get<string>('REGION');
    const accessKeyId = this.configService.get<string>('ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('SECRET_ACCESS_KEY');

    console.log('S3 Configuration:', {
      region,
      accessKeyId,
      secretAccessKey,
    });

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error('S3 configuration is incomplete in environment variables');
    }

    this.s3 = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimetype: string,
    employeeNumber: string,
    folder: string
  ) {
    const key = `${folder}/${employeeNumber}/${filename}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: mimetype,
        })
      );

      return {
        success: true,
        message: `File uploaded to ${key}`
      };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  async getPublicUrl(folder: string, employeeNumber: string, filename: string) {
    const key = `${folder}/${employeeNumber}/${filename}`;

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const url = await getSignedUrl(this.s3, command, { expiresIn: 60 * 5 }); // 5 minutos
      return { success: true, url };
    } catch (error) {
      console.error('❌ Error generating signed URL:', error);
      return { success: false, error: error.message };
    }
  }

  async getPublicUrl_noEmployeeNumber(folder: string, filename: string) {
    const key = `${folder}/${filename}`;

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const url = await getSignedUrl(this.s3, command, { expiresIn: 60 * 5 }); // 5 minutos
      return { success: true, url };
    } catch (error) {
      console.error('❌ Error generating signed URL:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteFile(filename: string, employeeNumber: string) {
    const key = `Employees/${employeeNumber}/${filename}`;

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      await this.s3.send(command);
      return { success: true };
    } catch (error) {
      console.error('S3 Delete Error:', error);
      throw new InternalServerErrorException('Error deleting from S3');
    }
  }

  async downloadFile(
    folder: string,
    filename: string,
    res: Response,
  ) {
    console.log("folder: ", folder);
    folder = decodeURIComponent(folder);
    const key = `${folder}/${filename}`;
    console.log("key: ", key);

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const s3Response = await this.s3.send(command);

      res.setHeader('Content-Type', s3Response.ContentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const stream = s3Response.Body as Stream;

      stream.pipe(res);
    } catch (error) {
      console.error('❌ Error downloading file:', error);
      throw new InternalServerErrorException('Failed to download file');
    }
  }
}
