// src/s3mkt/s3mkt.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

@Injectable()
export class S3MktService {
  // ⚠️ solo bucket hardcodeado (como pediste)
  private readonly BUCKET = 'nova-marketing';

  private s3: S3Client;
  private region: string;

  constructor(private readonly config: ConfigService) {
    // usa la MISMA región y credenciales de tu proyecto
    this.region = this.config.get<string>('REGION') || 'us-east-2';
    const accessKeyId = this.config.get<string>('ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('SECRET_ACCESS_KEY');

    if (!this.region) {
      throw new Error('REGION is required in environment variables');
    }

    // credenciales explícitas si están definidas (evita el CredentialsProviderError)
    this.s3 = new S3Client({
      region: this.region,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined, // si corres con role/perfil, el provider chain las toma
    });
  }

  // URL pública estable (no firmada)
  private publicUrlFromKey(key: string) {
    return `https://${this.BUCKET}.s3.${this.region}.amazonaws.com/${key}`;
  }

  // ====== subir archivo al bucket de marketing
  async uploadFileGeneral(
    buffer: Buffer,
    filename: string,
    mimetype: string,
    folder: string,
  ) {
    const key = `${folder}/${filename}`;
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.BUCKET,
          Key: key,
          Body: buffer,
          ContentType: mimetype,
          // Opcional: cache largo para assets de email
          CacheControl: 'public, max-age=31536000, immutable',
          // Opcional si tu bucket policy no es pública:
          // ACL: 'public-read',
        }),
      );
      return { success: true, key, publicUrl: this.publicUrlFromKey(key) };
    } catch (e) {
      console.error('❌ S3Mkt upload error:', e);
      throw new InternalServerErrorException(
        'Failed to upload to marketing bucket',
      );
    }
  }

  // ====== URL pública estable por folder+filename
  async getPublicUrlNoEmployee(folder: string, filename: string) {
    const key = `${folder}/${filename}`;
    return { success: true, key, publicUrl: this.publicUrlFromKey(key) };
  }

  // ====== listar SOLO .html en un prefijo
  async listHtml(folder: string) {
    const prefix = folder.endsWith('/') ? folder : `${folder}/`;
    try {
      const res = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.BUCKET,
          Prefix: prefix,
        }),
      );
      const files =
        (res.Contents || [])
          .map((o) => ({
            key: o.Key!,
            filename: o.Key!.replace(prefix, ''),
            size: o.Size,
            lastModified: o.LastModified,
          }))
          .filter((f) => f.filename)
          .filter((f) => /\.html?$/i.test(f.filename)) || [];
      return {
        success: true,
        bucket: this.BUCKET,
        folder,
        count: files.length,
        files,
      };
    } catch (e) {
      console.error('❌ S3Mkt list-html error:', e);
      throw new InternalServerErrorException(
        'Failed to list html in marketing bucket',
      );
    }
  }

  // ====== leer contenido de un HTML por key
  async getFileContent(key: string): Promise<string> {
    try {
      const res = await this.s3.send(
        new GetObjectCommand({ Bucket: this.BUCKET, Key: key }),
      );
      if (!res.Body) return '';
      const stream = res.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString('utf-8');
    } catch (e) {
      console.error('❌ S3Mkt get-file error:', e);
      throw new InternalServerErrorException(
        'Failed to get file from marketing bucket',
      );
    }
  }

  // ====== reemplazar archivo (misma key)
  async replaceFileGeneral(
    buffer: Buffer,
    mimetype: string,
    folder: string,
    filename: string,
  ) {
    const key = `${folder}/${filename}`;
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.BUCKET,
          Key: key,
          Body: buffer,
          ContentType: mimetype,
          CacheControl: 'public, max-age=31536000, immutable',
          // ACL: 'public-read',
        }),
      );
      return { success: true, key, publicUrl: this.publicUrlFromKey(key) };
    } catch (e) {
      console.error('❌ S3Mkt replace error:', e);
      throw new InternalServerErrorException(
        'Failed to replace file in marketing bucket',
      );
    }
  }
}
