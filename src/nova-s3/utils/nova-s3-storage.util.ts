/* src/utils/nova-s3-storage.util.ts
 *
 * NOVA S3 (Storage-only helpers)
 * ✅ S3 = almacenamiento físico
 * ✅ BD = source of truth (tree/list/navegación NO va aquí)
 *
 * Este archivo existe para que NovaS3Service use operaciones S3 sin depender
 * del src/s3/s3.service.ts (que lo usan otros módulos).
 */

import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  _Object,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface NovaS3OpResult {
  success: boolean;
  message: string;
  [key: string]: any;
}

@Injectable()
export class NovaS3StorageUtil {
  private readonly s3: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    const bucket = this.configService.get<string>('BUCKET');
    const region = this.configService.get<string>('REGION');
    const accessKeyId = this.configService.get<string>('ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('SECRET_ACCESS_KEY');

    if (!bucket) throw new Error('S3 bucket name (BUCKET) is not defined');
    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error('S3 configuration is incomplete (REGION/ACCESS_KEY/SECRET_ACCESS_KEY)');
    }

    this.bucketName = bucket;
    this.s3 = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Normaliza un "folder/prefix" para que no tenga dobles slashes.
   */
  private norm(p: string) {
    return (p || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
  }

  /**
   * Construye Key final:
   * - folder: ya debe venir completo (ej: "nova-s3/EMP123/Marketing")
   * - relativePath: "Creatives/logo.png"
   */
  private buildKey(folder: string, relativePath: string) {
    const f = this.norm(folder);
    const r = this.norm(relativePath);
    return r ? `${f}/${r}` : f;
  }

  // ---------------------------------------------------------------------------
  // Uploads (storage only)
  // ---------------------------------------------------------------------------

  /**
   * UPLOAD ONE (storage only)
   * - PutObject a: `${folder}/${filename}`
   */
  async uploadFileGeneral(
    buffer: Buffer,
    filename: string,
    mimetype: string,
    folder: string,
  ): Promise<NovaS3OpResult> {
    const key = this.buildKey(folder, filename);

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: mimetype,
        }),
      );

      return { success: true, message: `File uploaded to ${key}`, key };
    } catch (error) {
      console.error('S3 uploadFileGeneral error:', error);
      throw new InternalServerErrorException('Failed to upload file to S3');
    }
  }

  /**
   * UPLOAD MANY (storage only)
   * - folder: prefix base completo (ej: "nova-s3/EMP123")
   * - paths[i]: ruta relativa (ej: "Marketing/Creatives/a.png")
   */
  async uploadMultipleFiles(
    files: Express.Multer.File[],
    folder: string,
    paths?: string[],
  ): Promise<NovaS3OpResult> {
    try {
      const uploadPromises = files.map((file, i) => {
        const rel = paths?.[i] ? paths[i] : file.originalname;
        const key = this.buildKey(folder, rel);

        return this.s3
          .send(
            new PutObjectCommand({
              Bucket: this.bucketName,
              Key: key,
              Body: file.buffer,
              ContentType: file.mimetype,
            }),
          )
          .then(() => ({ success: true, filename: file.originalname, key }))
          .catch((err) => ({ success: false, filename: file.originalname, error: err?.message || String(err) }));
      });

      const settled = await Promise.allSettled(uploadPromises);

      const fulfilled = settled
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map((r) => r.value);

      const ok = fulfilled.filter((x) => x.success);
      const fail = fulfilled.filter((x) => !x.success);

      return {
        success: fail.length === 0,
        message: `Uploaded ${ok.length} files`,
        results: ok,
        errors: fail,
      };
    } catch (error) {
      console.error('S3 uploadMultipleFiles error:', error);
      throw new InternalServerErrorException('Failed to upload multiple files to S3');
    }
  }

  // ---------------------------------------------------------------------------
  // Folder "marker" (optional)
  // ---------------------------------------------------------------------------

  /**
   * CREATE FOLDER MARKER (opcional)
   * - Crea objeto 0 bytes con sufijo "/" para representar carpeta vacía.
   * - Si no lo quieres, puedes no llamarlo desde NovaS3Service.
   */
  async createFolderMarker(folder: string, relativePath: string): Promise<NovaS3OpResult> {
    const key = this.buildKey(folder, relativePath);
    const markerKey = key.endsWith('/') ? key : `${key}/`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: markerKey,
          Body: '',
        }),
      );
      return { success: true, message: 'Folder marker created', key: markerKey };
    } catch (error) {
      console.error('S3 createFolderMarker error:', error);
      throw new InternalServerErrorException('Failed to create folder marker in S3');
    }
  }

  // ---------------------------------------------------------------------------
  // Rename / Move FILE (storage only)
  // ---------------------------------------------------------------------------

  /**
   * RENAME FILE (storage only)
   * - oldKey: `${baseFolder}/${oldRelative}`
   * - newKey: `${baseFolder}/${newRelative}`
   */
  async renameFile(baseFolder: string, oldRelative: string, newRelative: string): Promise<NovaS3OpResult> {
    const oldKey = this.buildKey(baseFolder, oldRelative);
    const newKey = this.buildKey(baseFolder, newRelative);

    if (!oldRelative || !newRelative) throw new BadRequestException('oldRelative/newRelative are required');

    try {
      await this.s3.send(
        new CopyObjectCommand({
          Bucket: this.bucketName,
          CopySource: `${this.bucketName}/${oldKey}`,
          Key: newKey,
        }),
      );

      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: oldKey,
        }),
      );

      return { success: true, message: 'File renamed', oldKey, newKey };
    } catch (error) {
      console.error('S3 renameFile error:', error);
      throw new InternalServerErrorException('Failed to rename file in S3');
    }
  }

  /**
   * MOVE FILE (storage only)
   * - Copia a newRelative y borra oldRelative
   */
  async moveFile(baseFolder: string, oldRelative: string, newRelative: string): Promise<NovaS3OpResult> {
    const oldKey = this.buildKey(baseFolder, oldRelative);
    const newKey = this.buildKey(baseFolder, newRelative);

    try {
      await this.s3.send(
        new CopyObjectCommand({
          Bucket: this.bucketName,
          CopySource: `${this.bucketName}/${oldKey}`,
          Key: newKey,
        }),
      );

      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: oldKey,
        }),
      );

      return { success: true, message: 'File moved', oldKey, newKey };
    } catch (error) {
      console.error('S3 moveFile error:', error);
      throw new InternalServerErrorException('Failed to move file in S3');
    }
  }

  // ---------------------------------------------------------------------------
  // Move / Rename FOLDER (prefix copy + delete) (storage only)
  // ---------------------------------------------------------------------------

  /**
   * MOVE PREFIX (folder) (storage only)
   * - Copia TODOS los objetos bajo oldPrefix -> newPrefix, manteniendo ruta relativa.
   * - Luego borra los originales.
   *
   * baseFolder: ej "nova-s3/EMP123"
   * oldPrefixRel: ej "Marketing/Creatives"
   * newPrefixRel: ej "Marketing/Archive/Creatives"
   */
  async movePrefix(baseFolder: string, oldPrefixRel: string, newPrefixRel: string): Promise<NovaS3OpResult> {
    const oldPrefix = this.buildKey(baseFolder, oldPrefixRel);
    const newPrefix = this.buildKey(baseFolder, newPrefixRel);

    const sourcePrefix = oldPrefix.endsWith('/') ? oldPrefix : `${oldPrefix}/`;
    const targetPrefix = newPrefix.endsWith('/') ? newPrefix : `${newPrefix}/`;

    try {
      let allObjects: _Object[] = [];
      let token: string | undefined;

      do {
        const list = await this.s3.send(
          new ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: sourcePrefix,
            ContinuationToken: token,
          }),
        );

        if (list.Contents?.length) allObjects = allObjects.concat(list.Contents);
        token = list.NextContinuationToken;
      } while (token);

      // Si carpeta vacía: crea marker en destino
      if (allObjects.length === 0) {
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: targetPrefix,
            Body: '',
          }),
        );
        return { success: true, message: 'Empty folder moved (marker created)', copiedCount: 0, deletedCount: 0 };
      }

      // Copiar
      let copied = 0;
      for (const obj of allObjects) {
        if (!obj.Key) continue;

        const relative = obj.Key.substring(sourcePrefix.length);
        const destKey = `${targetPrefix}${relative}`;

        await this.s3.send(
          new CopyObjectCommand({
            Bucket: this.bucketName,
            CopySource: `${this.bucketName}/${obj.Key}`,
            Key: destKey,
          }),
        );
        copied++;
      }

      // Borrar originales
      let deleted = 0;
      for (const obj of allObjects) {
        if (!obj.Key) continue;
        try {
          await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: obj.Key }));
          deleted++;
        } catch (e) {
          console.warn('Warning deleting original key:', obj.Key, e);
        }
      }

      return {
        success: true,
        message: 'Folder moved (prefix)',
        copiedCount: copied,
        deletedCount: deleted,
        totalObjects: allObjects.length,
        sourcePrefix,
        targetPrefix,
      };
    } catch (error) {
      console.error('S3 movePrefix error:', error);
      throw new InternalServerErrorException('Failed to move folder/prefix in S3');
    }
  }

  // ---------------------------------------------------------------------------
  // Delete (storage only)
  // ---------------------------------------------------------------------------

  /**
   * DELETE ONE OBJECT (storage only)
   */
  async deleteObject(baseFolder: string, relative: string): Promise<NovaS3OpResult> {
    const key = this.buildKey(baseFolder, relative);

    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }));
      return { success: true, message: `Deleted ${key}`, key };
    } catch (error) {
      console.error('S3 deleteObject error:', error);
      throw new InternalServerErrorException('Failed to delete object in S3');
    }
  }

  /**
   * DELETE PREFIX (folder) (storage only)
   */
  async deletePrefix(baseFolder: string, prefixRel: string): Promise<NovaS3OpResult> {
    const prefix = this.buildKey(baseFolder, prefixRel);
    const p = prefix.endsWith('/') ? prefix : `${prefix}/`;

    try {
      let allObjects: _Object[] = [];
      let token: string | undefined;

      do {
        const list = await this.s3.send(
          new ListObjectsV2Command({
            Bucket: this.bucketName,
            Prefix: p,
            ContinuationToken: token,
          }),
        );

        if (list.Contents?.length) allObjects = allObjects.concat(list.Contents);
        token = list.NextContinuationToken;
      } while (token);

      let deleted = 0;
      for (const obj of allObjects) {
        if (!obj.Key) continue;
        await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: obj.Key }));
        deleted++;
      }

      // Intentar borrar marker (si existe)
      try {
        await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: p }));
      } catch (_) {}

      return { success: true, message: 'Prefix deleted', deletedCount: deleted, prefix: p };
    } catch (error) {
      console.error('S3 deletePrefix error:', error);
      throw new InternalServerErrorException('Failed to delete folder/prefix in S3');
    }
  }

  // ---------------------------------------------------------------------------
  // Presigned URL (storage only)
  // ---------------------------------------------------------------------------

  /**
   * Presigned GET URL (5 min)
   * baseFolder: ej "nova-s3/EMP123"
   * relative: ej "Marketing/Creatives/logo.png"
   */
  async presignedGetUrl(baseFolder: string, relative: string, expiresSeconds = 60 * 5) {
    const key = this.buildKey(baseFolder, relative);

    try {
      const command = new GetObjectCommand({ Bucket: this.bucketName, Key: key });
      const url = await getSignedUrl(this.s3, command, { expiresIn: expiresSeconds });
      return { success: true, url, key };
    } catch (error) {
      console.error('S3 presignedGetUrl error:', error);
      return { success: false, error: (error as Error).message };
    }
  }
}
