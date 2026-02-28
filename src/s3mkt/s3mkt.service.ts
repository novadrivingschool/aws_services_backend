import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ObjectIdentifier,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

export interface FileInfo {
  key: string;
  filename: string;
  size?: number;
  lastModified?: Date;
  isFolder?: boolean;
  url?: string;
}

export interface TemplateInfo {
  key: string;
  folder: string;
  templateName: string;
  filename: string;
  size?: number;
  lastModified?: Date;
  displayName: string;
  isLegacy?: boolean;
}

@Injectable()
export class S3MktService {
  private readonly BUCKET: string;
  private s3: S3Client;
  private region: string;

  constructor(private readonly config: ConfigService) {
    this.region = this.config.get<string>('REGION') || 'us-east-2';
    this.BUCKET = this.config.get<string>('S3_MKT_BUCKET') || 'nova-marketing-dev';

    const accessKeyId = this.config.get<string>('ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('SECRET_ACCESS_KEY');

    if (!this.region) {
      throw new Error('REGION is required in environment variables');
    }
    if (!this.BUCKET) {
      throw new Error('S3_MKT_BUCKET is required in environment variables');
    }

    this.s3 = new S3Client({
      region: this.region,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  private publicUrlFromKey(key: string): string {
    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');
    const base =
      this.region === 'us-east-1'
        ? `https://${this.BUCKET}.s3.amazonaws.com`
        : `https://${this.BUCKET}.s3.${this.region}.amazonaws.com`;
    return `${base}/${encodedKey}`;
  }

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
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      return { success: true, key, publicUrl: this.publicUrlFromKey(key) };
    } catch (e: any) {
      console.error('❌ S3Mkt upload error:', e);
      throw new InternalServerErrorException('Failed to upload to marketing bucket');
    }
  }

  async getPublicUrlNoEmployee(folder: string, filename: string) {
    const key = `${folder}/${filename}`;
    return { success: true, key, publicUrl: this.publicUrlFromKey(key) };
  }

  async listHtml(folder: string): Promise<{
    success: boolean;
    bucket: string;
    folder: string;
    count: number;
    templates: TemplateInfo[];
  }> {
    const prefix = folder.endsWith('/') ? folder : `${folder}/`;
    console.log('Using prefix:', prefix);

    try {
      // 1. List subfolders (prefixes)
      console.log('Fetching subfolders for folder:', folder);
      const res = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.BUCKET,
          Prefix: prefix,
          Delimiter: '/',
        }),
      );
      console.log('Subfolders fetched:', res.CommonPrefixes);

      const subfolders = res.CommonPrefixes?.map(p => p.Prefix!).filter(Boolean) || [];
      console.log('Subfolders to process:', subfolders);

      const templates: TemplateInfo[] = [];

      // 2. For each subfolder, check if it contains index.html
      for (const subfolder of subfolders) {
        console.log('Checking subfolder:', subfolder);
        const list = await this.s3.send(
          new ListObjectsV2Command({
            Bucket: this.BUCKET,
            Prefix: subfolder,
          }),
        );
        console.log('Files in subfolder:', list.Contents);

        const indexHtml = list.Contents?.find(obj =>
          obj.Key?.toLowerCase().endsWith('index.html')
        );

        if (indexHtml && indexHtml.Key) {
          console.log('Found index.html in subfolder:', subfolder);

          const folderName = subfolder.replace(prefix, '').replace(/\/$/, '');
          templates.push({
            key: indexHtml.Key,
            folder: subfolder,
            templateName: folderName,
            filename: 'index.html',
            size: indexHtml.Size,
            lastModified: indexHtml.LastModified,
            displayName: folderName.replace(/[_-]/g, ' ')
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' '),
          });
        }
      }

      // 3. Also look for loose HTML files (for legacy templates)
      console.log('Fetching loose HTML files...');
      const allFilesRes = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.BUCKET,
          Prefix: prefix,
        }),
      );

      console.log('Loose HTML files fetched:', allFilesRes.Contents);

      const looseHtmlFiles: TemplateInfo[] = (allFilesRes.Contents || [])
        .filter(obj =>
          obj.Key &&
          obj.Key.toLowerCase().endsWith('.html') &&
          !obj.Key.toLowerCase().endsWith('index.html') &&
          !obj.Key.substring(prefix.length).includes('/')
        )
        .map(obj => {
          const key = obj.Key!;
          return {
            key: key,
            folder: prefix,
            templateName: key.replace(prefix, '').replace(/\.html$/i, ''),
            filename: key.replace(prefix, ''),
            size: obj.Size,
            lastModified: obj.LastModified,
            displayName: key
              .replace(prefix, '')
              .replace(/\.html$/i, '')
              .replace(/[_-]/g, ' ')
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' '),
            isLegacy: true,
          };
        });

      const allTemplates = [...templates, ...looseHtmlFiles];
      console.log('All templates found:', allTemplates.length);

      return {
        success: true,
        bucket: this.BUCKET,
        folder,
        count: allTemplates.length,
        templates: allTemplates,
      };
    } catch (e: any) {
      console.error('❌ S3Mkt list-html error:', e);
      throw new InternalServerErrorException('Failed to list html in marketing bucket');
    }
  }

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
    } catch (e: any) {
      console.error('❌ S3Mkt get-file error:', e);
      throw new InternalServerErrorException('Failed to get file from marketing bucket');
    }
  }

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
        }),
      );
      return { success: true, key, publicUrl: this.publicUrlFromKey(key) };
    } catch (e: any) {
      console.error('❌ S3Mkt replace error:', e);
      throw new InternalServerErrorException('Failed to replace file in marketing bucket');
    }
  }

  async renameFile(oldKey: string, newKey: string) {
    try {
      await this.s3.send(
        new CopyObjectCommand({
          Bucket: this.BUCKET,
          CopySource: `${this.BUCKET}/${encodeURIComponent(oldKey)}`,
          Key: newKey,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );

      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.BUCKET,
          Key: oldKey,
        }),
      );

      return {
        success: true,
        oldKey,
        newKey,
        publicUrl: this.publicUrlFromKey(newKey)
      };
    } catch (e: any) {
      console.error('❌ S3Mkt rename error:', e);
      throw new InternalServerErrorException('Failed to rename file in marketing bucket');
    }
  }

  async deleteFile(key: string) {
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.BUCKET,
          Key: key,
        }),
      );
      return { success: true, key };
    } catch (e: any) {
      console.error('❌ S3Mkt delete error:', e);
      throw new InternalServerErrorException('Failed to delete file from marketing bucket');
    }
  }

  async renameFolder(oldFolderPath: string, newFolderPath: string) {
    try {
      const oldPrefix = oldFolderPath.endsWith('/') ? oldFolderPath : oldFolderPath + '/';
      const newPrefix = newFolderPath.endsWith('/') ? newFolderPath : newFolderPath + '/';

      // 1. Verificar que la carpeta de origen existe
      const sourceList = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.BUCKET,
          Prefix: oldPrefix,
          MaxKeys: 1
        })
      );

      if (!sourceList.Contents || sourceList.Contents.length === 0) {
        throw new Error('La carpeta de origen no existe o está vacía');
      }

      // 2. Verificar que la carpeta de destino NO existe
      const destList = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.BUCKET,
          Prefix: newPrefix,
          MaxKeys: 1
        })
      );

      if (destList.Contents && destList.Contents.length > 0) {
        throw new Error('Ya existe una carpeta con ese nombre');
      }

      // 3. Listar todos los archivos en la carpeta de origen
      const list = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.BUCKET,
          Prefix: oldPrefix,
        })
      );

      if (!list.Contents || list.Contents.length === 0) {
        throw new Error('Carpeta de origen vacía');
      }

      console.log(`Moviendo ${list.Contents.length} archivos de ${oldPrefix} a ${newPrefix}`);

      const movedFiles: Array<{ oldKey: string, newKey: string }> = [];

      // 4. Mover cada archivo
      for (const obj of list.Contents) {
        const oldKey = obj.Key;
        if (!oldKey) continue;

        const newKey = oldKey.replace(oldPrefix, newPrefix);

        console.log(`Moviendo: ${oldKey} -> ${newKey}`);

        // Copiar al nuevo destino
        await this.s3.send(
          new CopyObjectCommand({
            Bucket: this.BUCKET,
            CopySource: `${this.BUCKET}/${encodeURIComponent(oldKey)}`,
            Key: newKey,
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        );

        // Eliminar del origen
        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: this.BUCKET,
            Key: oldKey,
          }),
        );

        movedFiles.push({ oldKey, newKey });
      }

      return {
        success: true,
        message: 'Carpeta renombrada exitosamente',
        oldFolderPath,
        newFolderPath,
        movedFiles: movedFiles.length,
        details: movedFiles
      };
    } catch (e: any) {
      console.error('❌ S3Mkt renameFolder error:', e);
      throw new InternalServerErrorException(`Failed to rename folder: ${e.message}`);
    }
  }

  async deleteFolder(folderPath: string) {
    try {
      const prefix = folderPath.endsWith('/') ? folderPath : folderPath + '/';

      console.log(`Eliminando carpeta: ${prefix}`);

      const list = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.BUCKET,
          Prefix: prefix,
        }),
      );

      if (!list.Contents || list.Contents.length === 0) {
        return {
          success: true,
          message: 'Carpeta eliminada o no existía',
          folderPath,
          deletedCount: 0
        };
      }

      console.log(`Encontrados ${list.Contents.length} archivos para eliminar`);

      const objectsToDelete: ObjectIdentifier[] = list.Contents
        .map(obj => ({ Key: obj.Key! }))
        .filter(obj => obj.Key);

      const batchSize = 1000;
      let totalDeleted = 0;

      for (let i = 0; i < objectsToDelete.length; i += batchSize) {
        const batch = objectsToDelete.slice(i, i + batchSize);

        console.log(`Eliminando lote ${Math.floor(i / batchSize) + 1} de ${Math.ceil(objectsToDelete.length / batchSize)}`);

        const deleteResult = await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: this.BUCKET,
            Delete: {
              Objects: batch,
              Quiet: false,
            },
          }),
        );

        totalDeleted += (deleteResult.Deleted?.length || 0);
      }

      return {
        success: true,
        message: 'Carpeta eliminada exitosamente',
        folderPath,
        deletedCount: totalDeleted
      };
    } catch (e: any) {
      console.error('❌ S3Mkt deleteFolder error:', e);
      throw new InternalServerErrorException('Failed to delete folder from marketing bucket');
    }
  }

  async listFolderContents(folderPath: string): Promise<{
    success: boolean;
    bucket: string;
    folderPath: string;
    count: number;
    files: FileInfo[];
  }> {
    const prefix = folderPath.endsWith('/') ? folderPath : folderPath + '/';
    try {
      const res = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.BUCKET,
          Prefix: prefix,
        }),
      );

      const files: FileInfo[] = (res.Contents || [])
        .filter(obj => obj.Key && obj.Key !== prefix)
        .map((obj) => ({
          key: obj.Key!,
          filename: obj.Key!.replace(prefix, ''),
          size: obj.Size,
          lastModified: obj.LastModified,
          isFolder: obj.Key!.endsWith('/'),
          url: this.publicUrlFromKey(obj.Key!),
        }))
        .sort((a, b) => {
          if (a.isFolder && !b.isFolder) return -1;
          if (!a.isFolder && b.isFolder) return 1;
          return a.filename.localeCompare(b.filename);
        });

      return {
        success: true,
        bucket: this.BUCKET,
        folderPath,
        count: files.length,
        files,
      };
    } catch (e: any) {
      console.error('❌ S3Mkt listFolderContents error:', e);
      throw new InternalServerErrorException('Failed to list folder contents in marketing bucket');
    }
  }

  async migrateLegacyTemplate(templateName: string, htmlContent: string, folder: string) {
    try {
      const newFolder = `${folder}/${templateName}`;
      const buffer = Buffer.from(htmlContent, 'utf-8');

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.BUCKET,
          Key: `${newFolder}/index.html`,
          Body: buffer,
          ContentType: 'text/html; charset=utf-8',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );

      const imageMatches = htmlContent.match(/src="([^"]+)"/g) || [];
      const imageUrls = imageMatches.map(match =>
        match.replace('src="', '').replace('"', '')
      );

      console.log(`Imágenes encontradas en HTML: ${imageUrls.length}`);

      return {
        success: true,
        message: 'Template migrado exitosamente',
        newFolder,
        imagesFound: imageUrls.length,
        publicUrl: this.publicUrlFromKey(`${newFolder}/index.html`)
      };
    } catch (e: any) {
      console.error('❌ S3Mkt migrateLegacyTemplate error:', e);
      throw new InternalServerErrorException('Failed to migrate legacy template');
    }
  }

}