import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class CrmS3Service {
  private s3: S3Client;
  private bucketName: string;

  constructor(private readonly configService: ConfigService) {
    // Usamos explícitamente la variable del bucket del CRM
    const bucket = this.configService.get<string>('BUCKET_CRM');
    if (!bucket) {
      throw new Error('S3 BUCKET_CRM is not defined in environment variables');
    }
    this.bucketName = bucket;

    const region = this.configService.get<string>('REGION');
    const accessKeyId = this.configService.get<string>('ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('SECRET_ACCESS_KEY');

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

  // ---------------------------------------------------------------------------
  // UPLOAD
  // ---------------------------------------------------------------------------

  async uploadFile(uuid: string, file: Express.Multer.File) {
    // Forzamos la ruta exacta solicitada: crm/{uuid}/{nombre_archivo}
    const key = `crm/${uuid}/${file.originalname}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      return {
        success: true,
        message: `File successfully uploaded to ${key}`,
        path: key,
      };
    } catch (error) {
      console.error('❌ CRM S3 upload error:', error);
      throw new InternalServerErrorException('Failed to upload file to CRM bucket');
    }
  }

  // ---------------------------------------------------------------------------
  // PUBLIC URL
  // ---------------------------------------------------------------------------

  async getPublicUrl(uuid: string, filename: string) {
    const key = `crm/${uuid}/${filename}`;

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      // Generamos una URL firmada válida por 5 minutos (300 segundos)
      const url = await getSignedUrl(this.s3, command, { expiresIn: 60 * 5 });
      return { success: true, url, path: key };
    } catch (error) {
      console.error('❌ Error generating signed URL for CRM:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  // ---------------------------------------------------------------------------
  // DELETE FILE
  // ---------------------------------------------------------------------------

  async deleteFile(uuid: string, filename: string) {
    const key = `crm/${uuid}/${filename}`;
    console.log(`🗑️ Deleting file from CRM S3: ${key}`);

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      await this.s3.send(command);
      return {
        success: true,
        message: `File deleted successfully: ${filename}`
      };
    } catch (error) {
      console.error('❌ Error deleting file from CRM S3:', error);
      throw new InternalServerErrorException('Failed to delete file from S3');
    }
  }
}