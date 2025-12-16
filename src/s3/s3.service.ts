/* src\s3\s3.service.ts */
import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
  _Object,
  CommonPrefix,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Response } from 'express';
import { Stream } from 'stream';

interface FolderInfo {
  success: boolean;
  folder: string;
  fileCount: number;
  totalSize: number;
  lastModified: Date | null;
}

interface S3OperationResult {
  success: boolean;
  message: string;
  [key: string]: any;
}

interface TreeItem {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: TreeItem[];
  size?: number;
  lastModified?: Date;
}

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

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Construye un prefijo base consistente:
   * folder[/employeeNumber][/path]/
   */
  private buildBasePrefix(folder: string, employeeNumber?: string, path?: string): string {
    let prefix = folder.replace(/^\/|\/$/g, '');

    if (employeeNumber) {
      prefix += `/${employeeNumber}`;
    }

    if (path) {
      const cleanPath = path.replace(/^\/|\/$/g, '');
      if (cleanPath) {
        prefix += `/${cleanPath}`;
      }
    }

    return prefix.endsWith('/') ? prefix : `${prefix}/`;
  }

  // ---------------------------------------------------------------------------
  // Uploads
  // ---------------------------------------------------------------------------

  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimetype: string,
    employeeNumber: string,
    folder: string,
  ): Promise<S3OperationResult> {
    const key = `${folder}/${employeeNumber}/${filename}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: mimetype,
        }),
      );

      return {
        success: true,
        message: `File uploaded to ${key}`,
      };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  async uploadFileGeneral(
    buffer: Buffer,
    filename: string,
    mimetype: string,
    folder: string,
  ): Promise<S3OperationResult> {
    const key = `${folder}/${filename}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: mimetype,
        }),
      );

      return {
        success: true,
        message: `File uploaded to ${key}`,
      };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  // ---------------------------------------------------------------------------
  // URLs
  // ---------------------------------------------------------------------------

  async getPublicUrl(folder: string, employeeNumber: string, filename: string) {
    const key = `${folder}/${employeeNumber}/${filename}`;

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const url = await getSignedUrl(this.s3, command, { expiresIn: 60 * 5 });
      return { success: true, url };
    } catch (error) {
      console.error('❌ Error generating signed URL:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  async getPublicUrl_noEmployeeNumber(folder: string, filename: string) {
    console.log('getPublicUrl_noEmployeeNumber');
    console.log('folder: ', folder);
    console.log('filename: ', filename);
    const key = `${folder}/${filename}`;
    console.log('key: ', key);
    console.log('this.bucketName: ', this.bucketName);

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const url = await getSignedUrl(this.s3, command, { expiresIn: 60 * 5 });
      return { success: true, url };
    } catch (error) {
      console.error('❌ Error generating signed URL:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  // ---------------------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------------------

  async downloadFile(folder: string, filename: string, res: Response) {
    console.log('folder: ', folder);
    folder = decodeURIComponent(folder);
    const key = `${folder}/${filename}`;
    console.log('key: ', key);

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

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async deleteFile(folder: string, filename: string, employeeNumber?: string): Promise<S3OperationResult> {
    const key = employeeNumber
      ? `${folder}/${employeeNumber}/${filename}`
      : `${folder}/${filename}`;

    console.log('🗑️ Deleting file from S3:', key);

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      await this.s3.send(command);
      return {
        success: true,
        message: `File deleted: ${key}`,
      };
    } catch (error) {
      console.error('❌ S3 Delete Error:', error);
      throw new InternalServerErrorException('Error deleting from S3');
    }
  }

  async deleteFileNoEmployee(folder: string, filename: string): Promise<S3OperationResult> {
    const key = `${folder}/${filename}`;
    console.log('🗑️ Deleting file (no employee):', key);

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      await this.s3.send(command);
      return {
        success: true,
        message: `File deleted successfully: ${key}`,
      };
    } catch (error) {
      console.error('❌ Error deleting file (no employee):', error);
      throw new InternalServerErrorException('Failed to delete file from S3');
    }
  }

  // ---------------------------------------------------------------------------
  // Explorer / Box-like
  // ---------------------------------------------------------------------------

  /**
   * Lista carpetas y archivos dentro de una ruta.
   */
  // En s3.service.ts, modifica el método listFolder:

async listFolder(
  folder: string,
  employeeNumber?: string,
  path?: string,
  page: number = 1,
  limit: number = 50,
  sortBy: string = 'name',
  order: 'asc' | 'desc' = 'asc'
) {
  const prefix = this.buildBasePrefix(folder, employeeNumber, path);

  const command = new ListObjectsV2Command({
    Bucket: this.bucketName,
    Prefix: prefix,
    Delimiter: '/',
  });

  try {
    const result = await this.s3.send(command);

    // Procesar carpetas
    const folders =
      result.CommonPrefixes?.map((cp: CommonPrefix) => {
        const fullPrefix = cp.Prefix || '';
        const relative = fullPrefix.substring(prefix.length).replace(/\/$/, '');
        return {
          name: relative,
          path: (path ? `${path.replace(/^\/|\/$/g, '')}/` : '') + relative,
          type: 'folder' as const,
        };
      }) || [];

    // Procesar archivos
    let files =
      result.Contents?.filter((obj: _Object) => obj.Key && obj.Key !== prefix)
        .map((obj: _Object) => {
          const key = obj.Key!;
          const relative = key.substring(prefix.length);
          
          return {
            name: relative.split('/').pop() || relative,
            path: (path ? `${path.replace(/^\/|\/$/g, '')}/` : '') + relative,
            size: obj.Size || 0,
            lastModified: obj.LastModified,
            type: 'file' as const,
          };
        }) || [];

    // Ordenar archivos
    files = files.sort((a, b) => {
      if (sortBy === 'name') {
        return order === 'asc' 
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      } else if (sortBy === 'size') {
        return order === 'asc' 
          ? (a.size || 0) - (b.size || 0)
          : (b.size || 0) - (a.size || 0);
      } else if (sortBy === 'date') {
        return order === 'asc'
          ? (a.lastModified?.getTime() || 0) - (b.lastModified?.getTime() || 0)
          : (b.lastModified?.getTime() || 0) - (a.lastModified?.getTime() || 0);
      }
      return 0;
    });

    // Aplicar paginación solo a archivos (las carpetas siempre se muestran todas)
    const startIndex = (page - 1) * limit;
    const paginatedFiles = files.slice(startIndex, startIndex + limit);

    return {
      success: true,
      folder,
      path: path || '',
      folders, // Siempre todas las carpetas
      files: paginatedFiles,
      pagination: {
        page,
        limit,
        totalFiles: files.length,
        totalPages: Math.ceil(files.length / limit),
        hasNextPage: startIndex + limit < files.length,
        hasPrevPage: page > 1,
      },
    };
  } catch (error) {
    console.error('❌ Error listing folder:', error);
    throw new InternalServerErrorException('Failed to list folder');
  }
}
  /* async listFolder(folder: string, employeeNumber?: string, path?: string) {
    const prefix = this.buildBasePrefix(folder, employeeNumber, path);

    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
      Delimiter: '/',
    });

    try {
      const result = await this.s3.send(command);

      const folders =
        result.CommonPrefixes?.map((cp: CommonPrefix) => {
          const fullPrefix = cp.Prefix || '';
          const relative = fullPrefix.substring(prefix.length).replace(/\/$/, '');
          return {
            name: relative,
            path: (path ? `${path.replace(/^\/|\/$/g, '')}/` : '') + relative,
          };
        }) || [];

      const files =
        result.Contents?.filter((obj: _Object) => obj.Key && obj.Key !== prefix).map((obj: _Object) => {
          const key = obj.Key!;
          const relative = key.substring(prefix.length);

          return {
            name: relative.split('/').pop() || relative,
            path: (path ? `${path.replace(/^\/|\/$/g, '')}/` : '') + relative,
            size: obj.Size,
            lastModified: obj.LastModified,
          };
        }) || [];

      return {
        success: true,
        folder,
        path: path || '',
        folders,
        files,
      };
    } catch (error) {
      console.error('❌ Error listing folder:', error);
      throw new InternalServerErrorException('Failed to list folder');
    }
  } */

  /**
   * Crea una "carpeta" como objeto 0 bytes con sufijo "/".
   */
  async createFolder(
    folder: string,
    name: string,
    employeeNumber?: string,
    path?: string,
  ): Promise<S3OperationResult> {
    const parentPrefix = this.buildBasePrefix(folder, employeeNumber, path);
    const cleanName = name.replace(/^\/|\/$/g, '');
    const key = `${parentPrefix}${cleanName}/`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: '',
        }),
      );

      return {
        success: true,
        message: 'Folder created',
        key,
      };
    } catch (error) {
      console.error('❌ Error creating folder:', error);
      throw new InternalServerErrorException('Failed to create folder');
    }
  }

  /**
   * Renombra un archivo o carpeta simple (no recursivo).
   */
  async renameItem(
    folder: string,
    oldPath: string,
    newName: string,
    employeeNumber?: string,
  ): Promise<S3OperationResult> {
    const cleanOldPath = oldPath.replace(/^\/|\/$/g, '');
    const parts = cleanOldPath.split('/');
    const oldFileName = parts.pop() as string;
    const dirPath = parts.join('/');

    const basePrefix = this.buildBasePrefix(folder, employeeNumber, dirPath || undefined);
    const oldKey = `${basePrefix}${oldFileName}`;
    const newKey = `${basePrefix}${newName}`;

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

      return {
        success: true,
        message: 'Item renamed',
        oldKey,
        newKey,
      };
    } catch (error) {
      console.error('❌ Error renaming item:', error);
      throw new InternalServerErrorException('Failed to rename item');
    }
  }

  /**
   * Mueve un archivo a otra carpeta destino.
   */
  async moveItem(
    folder: string,
    sourcePath: string,
    targetPath: string,
    employeeNumber?: string,
  ): Promise<S3OperationResult> {
    const cleanSource = sourcePath.replace(/^\/|\/$/g, '');
    const filename = cleanSource.split('/').pop() as string;
    const sourceDir = cleanSource.split('/').slice(0, -1).join('/');

    const sourceBase = this.buildBasePrefix(folder, employeeNumber, sourceDir || undefined);
    const sourceKey = `${sourceBase}${filename}`;

    const cleanTarget = targetPath.replace(/^\/|\/$/g, '');
    const targetBase = this.buildBasePrefix(folder, employeeNumber, cleanTarget || undefined);
    const targetKey = `${targetBase}${filename}`;

    try {
      await this.s3.send(
        new CopyObjectCommand({
          Bucket: this.bucketName,
          CopySource: `${this.bucketName}/${sourceKey}`,
          Key: targetKey,
        }),
      );

      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: sourceKey,
        }),
      );

      return {
        success: true,
        message: 'Item moved',
        sourceKey,
        targetKey,
      };
    } catch (error) {
      console.error('❌ Error moving item:', error);
      throw new InternalServerErrorException('Failed to move item');
    }
  }

  /**
   * Devuelve metadata básica de un archivo.
   */
  async getMetadata(folder: string, path: string, employeeNumber?: string) {
    const cleanPath = path.replace(/^\/|\/$/g, '');
    const basePrefix = this.buildBasePrefix(folder, employeeNumber);
    const key = `${basePrefix}${cleanPath}`.replace('//', '/');

    try {
      const head = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      return {
        success: true,
        key,
        size: head.ContentLength,
        mimeType: head.ContentType,
        lastModified: head.LastModified,
      };
    } catch (error) {
      console.error('❌ Error getting metadata:', error);
      throw new InternalServerErrorException('Failed to get metadata');
    }
  }

  /**
   * Elimina una carpeta y todo su contenido de forma recursiva.
   */
  async deleteFolder(
    folder: string,
    path?: string,
    employeeNumber?: string,
  ): Promise<S3OperationResult> {
    const prefix = this.buildBasePrefix(folder, employeeNumber, path);

    try {
      let allObjects: _Object[] = [];
      let continuationToken: string | undefined;

      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });

        const listResult = await this.s3.send(listCommand);

        if (listResult.Contents) {
          allObjects = [...allObjects, ...listResult.Contents];
        }

        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken);

      if (allObjects.length === 0) {
        try {
          const deleteCommand = new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: prefix.endsWith('/') ? prefix : `${prefix}/`,
          });
          await this.s3.send(deleteCommand);
        } catch (error) {
          console.log('Folder object does not exist or already deleted');
        }

        return {
          success: true,
          message: `Empty folder deleted: ${prefix}`,
          deletedCount: 0,
        };
      }

      let deletedCount = 0;
      for (const object of allObjects) {
        if (object.Key) {
          try {
            const deleteCommand = new DeleteObjectCommand({
              Bucket: this.bucketName,
              Key: object.Key,
            });
            await this.s3.send(deleteCommand);
            deletedCount++;
          } catch (error) {
            console.error(`Error deleting object ${object.Key}:`, error);
          }
        }
      }

      try {
        const deleteFolderCommand = new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: prefix.endsWith('/') ? prefix : `${prefix}/`,
        });
        await this.s3.send(deleteFolderCommand);
      } catch (error) {
        console.log('Folder object does not exist or already deleted');
      }

      return {
        success: true,
        message: `Folder deleted successfully: ${prefix}`,
        deletedCount,
        totalObjects: allObjects.length,
      };
    } catch (error) {
      console.error('❌ Error deleting folder:', error);
      throw new InternalServerErrorException('Failed to delete folder');
    }
  }

  /**
   * Elimina una carpeta general (sin employee_number).
   */
  async deleteFolderNoEmployee(folder: string, path?: string): Promise<S3OperationResult> {
    return this.deleteFolder(folder, path, undefined);
  }

  /**
   * Mueve/renombra una carpeta de forma recursiva.
   */
  /**
 * Mueve/renombra una carpeta de forma recursiva.
 */
  /**
 * Mueve/renombra una carpeta de forma recursiva.
 */
  async moveFolder(
    folder: string,
    sourcePath: string,
    targetPath: string,
    employeeNumber?: string,
  ): Promise<S3OperationResult> {
    console.log('🚀 moveFolder called:', { folder, sourcePath, targetPath, employeeNumber });

    // Si targetPath está vacío, significa mover a la raíz
    if (targetPath === '' || targetPath === null || targetPath === undefined) {
      console.log('📍 Moving to ROOT folder');

      // Extraer solo el nombre de la carpeta fuente
      const sourceFolderName = sourcePath.split('/').pop() || sourcePath;
      const finalTargetPath = sourceFolderName; // En la raíz, solo el nombre

      // Verificar si ya existe en la raíz
      const existsInRoot = await this.folderExists(folder, finalTargetPath, employeeNumber);
      if (existsInRoot) {
        throw new BadRequestException(`Cannot move folder. A folder with the name "${sourceFolderName}" already exists in the root.`);
      }

      return await this.moveFolderToPath(folder, sourcePath, finalTargetPath, employeeNumber);
    }

    // Si targetPath NO está vacío
    const targetExistsAsFolder = await this.folderExists(folder, targetPath, employeeNumber);
    const sourceFolderName = sourcePath.split('/').pop() || sourcePath;

    let finalTargetPath: string;

    if (targetExistsAsFolder) {
      // Si el destino es una carpeta existente, mover DENTRO de esa carpeta
      finalTargetPath = targetPath + '/' + sourceFolderName;
      console.log(`📁 Target folder exists. Moving "${sourceFolderName}" INTO "${targetPath}"`);
    } else {
      // Si el destino NO existe, interpretarlo como un nuevo nombre/ubicación
      finalTargetPath = targetPath;
      console.log(`📁 Target path does not exist. Moving/renaming to "${targetPath}"`);
    }

    // Verificar si el destino final ya existe
    const targetExists = await this.folderExists(folder, finalTargetPath, employeeNumber);
    if (targetExists) {
      throw new BadRequestException(`Cannot move folder. A folder with the name "${sourceFolderName}" already exists in the destination.`);
    }

    return await this.moveFolderToPath(folder, sourcePath, finalTargetPath, employeeNumber);
  }

  /**
   * Función helper para mover carpetas a una ruta específica.
   */
  private async moveFolderToPath(
    folder: string,
    sourcePath: string,
    finalTargetPath: string,
    employeeNumber?: string,
  ): Promise<S3OperationResult> {

    // Construir prefijos S3
    const sourcePrefix = this.buildBasePrefix(folder, employeeNumber, sourcePath);
    const targetPrefix = this.buildBasePrefix(folder, employeeNumber, finalTargetPath);

    console.log('📝 Final prefixes:', {
      sourcePrefix,
      targetPrefix,
      sourcePath,
      finalTargetPath
    });

    try {
      // Listar todo el contenido de la carpeta origen
      let allObjects: _Object[] = [];
      let continuationToken: string | undefined;

      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: sourcePrefix,
          ContinuationToken: continuationToken,
        });

        const listResult = await this.s3.send(listCommand);
        console.log(`📋 List result: ${listResult.Contents?.length || 0} objects`);

        if (listResult.Contents) {
          allObjects = [...allObjects, ...listResult.Contents];
        }

        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken);

      if (allObjects.length === 0) {
        // Carpeta vacía
        console.log('📁 Empty folder, creating in target...');

        // Crear carpeta vacía en destino
        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: targetPrefix.endsWith('/') ? targetPrefix : `${targetPrefix}/`,
            Body: '',
          }),
        );

        return {
          success: true,
          message: 'Empty folder moved',
          copiedCount: 0,
        };
      }

      // Copiar todos los objetos
      let copiedCount = 0;
      for (const object of allObjects) {
        if (object.Key) {
          const relativePath = object.Key.substring(sourcePrefix.length);
          const newKey = `${targetPrefix}${relativePath}`;

          console.log(`📄 Copying: ${object.Key} -> ${newKey}`);

          try {
            const copyCommand = new CopyObjectCommand({
              Bucket: this.bucketName,
              CopySource: `${this.bucketName}/${object.Key}`,
              Key: newKey,
            });
            await this.s3.send(copyCommand);
            copiedCount++;
          } catch (error) {
            console.error(`❌ Error copying object ${object.Key}:`, error);
            throw new InternalServerErrorException(`Failed to copy object: ${object.Key}`);
          }
        }
      }

      // Eliminar objetos originales
      let deletedCount = 0;
      for (const object of allObjects) {
        if (object.Key) {
          try {
            const deleteCommand = new DeleteObjectCommand({
              Bucket: this.bucketName,
              Key: object.Key,
            });
            await this.s3.send(deleteCommand);
            deletedCount++;
          } catch (error) {
            console.error(`⚠️ Error deleting original object ${object.Key}:`, error);
          }
        }
      }

      return {
        success: true,
        message: `Folder moved from ${sourcePath} to ${finalTargetPath}`,
        copiedCount,
        deletedCount,
        totalObjects: allObjects.length,
      };
    } catch (error) {
      console.error('❌ Error moving folder:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to move folder');
    }
  }

  /**
   * Helper para obtener la ruta padre de una ruta
   */
  private getParentPath(path: string): string | undefined {
    const parts = path.split('/');
    if (parts.length <= 1) return undefined;
    parts.pop();
    return parts.join('/');
  }

  /**
   * Método para renombrar carpetas - usa moveFolder internamente
   */
  async renameFolder(
    folder: string,
    oldPath: string,
    newName: string,
    employeeNumber?: string,
  ): Promise<S3OperationResult> {
    const pathParts = oldPath.split('/');
    pathParts.pop();
    const parentPath = pathParts.join('/');
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    return this.moveFolder(folder, oldPath, newPath, employeeNumber);
  }

  /**
   * Lista recursivamente todo el contenido para construir el árbol completo
   */
  async listAllFolders(folder: string, employeeNumber?: string) {
    const prefix = this.buildBasePrefix(folder, employeeNumber, '');

    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
      Delimiter: '/',
    });

    try {
      const result = await this.s3.send(command);

      const folders: TreeItem[] = [];

      if (result.CommonPrefixes) {
        for (const commonPrefix of result.CommonPrefixes) {
          if (commonPrefix.Prefix) {
            const relativePath = commonPrefix.Prefix.substring(prefix.length).replace(/\/$/, '');

            folders.push({
              name: relativePath.split('/').pop() || relativePath,
              path: relativePath,
              type: 'folder',
            });
          }
        }
      }

      const files: TreeItem[] = [];
      if (result.Contents) {
        for (const content of result.Contents) {
          if (content.Key && content.Key !== prefix) {
            const relativePath = content.Key.substring(prefix.length);
            if (!relativePath.includes('/')) {
              files.push({
                name: relativePath,
                path: relativePath,
                size: content.Size,
                lastModified: content.LastModified,
                type: 'file',
              });
            }
          }
        }
      }

      const listSubfolders = async (currentPath: string): Promise<TreeItem[]> => {
        const currentPrefix = this.buildBasePrefix(folder, employeeNumber, currentPath);

        const subCommand = new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: currentPrefix,
          Delimiter: '/',
        });

        const subResult = await this.s3.send(subCommand);
        const subFolders: TreeItem[] = [];

        if (subResult.CommonPrefixes) {
          for (const commonPrefix of subResult.CommonPrefixes) {
            if (commonPrefix.Prefix) {
              const fullPath = commonPrefix.Prefix.substring(prefix.length).replace(/\/$/, '');
              const folderName = fullPath.split('/').pop() || fullPath;

              subFolders.push({
                name: folderName,
                path: fullPath,
                type: 'folder',
                children: await listSubfolders(fullPath),
              });
            }
          }
        }

        return subFolders;
      };

      const tree = await Promise.all(folders.map(async (folderItem) => ({
        ...folderItem,
        children: await listSubfolders(folderItem.path),
      })));

      return {
        success: true,
        root: {
          name: folder,
          path: '',
          type: 'folder',
          children: tree,
        },
        files,
      };
    } catch (error) {
      console.error('❌ Error listing all folders:', error);
      throw new InternalServerErrorException('Failed to list folder structure');
    }
  }

  /**
 * Verifica si una carpeta existe
 */
  /**
   * Verifica si una carpeta existe
   */
  async folderExists(folder: string, path: string, employeeNumber?: string): Promise<boolean> {
    const prefix = this.buildBasePrefix(folder, employeeNumber, path);

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: 1,
      });

      const result = await this.s3.send(command);

      // CORRECCIÓN: Usa operadores ternarios explícitos
      const hasContents = result.Contents ? result.Contents.length > 0 : false;
      const hasPrefixes = result.CommonPrefixes ? result.CommonPrefixes.length > 0 : false;

      return hasContents || hasPrefixes;
    } catch (error) {
      console.error('❌ Error checking folder existence:', error);
      return false;
    }
  }

  /**
   * Obtiene información detallada de una carpeta
   */
  async getFolderInfo(folder: string, path: string, employeeNumber?: string): Promise<FolderInfo> {
    const prefix = this.buildBasePrefix(folder, employeeNumber, path);

    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      });

      const result = await this.s3.send(listCommand);

      const files = result.Contents?.filter(obj =>
        obj.Key && obj.Key !== prefix && !obj.Key.endsWith('/')
      ) || [];

      const totalSize = files.reduce((sum, file) => sum + (file.Size || 0), 0);

      let lastModified: Date | null = null;
      files.forEach(file => {
        if (file.LastModified) {
          if (!lastModified || file.LastModified > lastModified) {
            lastModified = file.LastModified;
          }
        }
      });

      return {
        success: true,
        folder: path,
        fileCount: files.length,
        totalSize,
        lastModified,
      };
    } catch (error) {
      console.error('❌ Error getting folder info:', error);
      throw new InternalServerErrorException('Failed to get folder information');
    }
  }

  /**
   * Copia una carpeta completa a otra ubicación
   */
  async copyFolder(
    folder: string,
    sourcePath: string,
    targetPath: string,
    employeeNumber?: string,
  ): Promise<S3OperationResult> {
    const sourcePrefix = this.buildBasePrefix(folder, employeeNumber, sourcePath);
    const targetPrefix = this.buildBasePrefix(folder, employeeNumber, targetPath);

    try {
      let allObjects: _Object[] = [];
      let continuationToken: string | undefined;

      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: sourcePrefix,
          ContinuationToken: continuationToken,
        });

        const listResult = await this.s3.send(listCommand);

        if (listResult.Contents) {
          allObjects = [...allObjects, ...listResult.Contents];
        }

        continuationToken = listResult.NextContinuationToken;
      } while (continuationToken);

      if (allObjects.length === 0) {
        return {
          success: true,
          message: 'Empty folder copied',
          copiedCount: 0,
        };
      }

      let copiedCount = 0;
      for (const object of allObjects) {
        if (object.Key) {
          const relativePath = object.Key.substring(sourcePrefix.length);
          const newKey = `${targetPrefix}${relativePath}`;

          try {
            const copyCommand = new CopyObjectCommand({
              Bucket: this.bucketName,
              CopySource: `${this.bucketName}/${object.Key}`,
              Key: newKey,
            });
            await this.s3.send(copyCommand);
            copiedCount++;
          } catch (error) {
            console.error(`Error copying object ${object.Key}:`, error);
            throw new InternalServerErrorException(`Failed to copy object: ${object.Key}`);
          }
        }
      }

      return {
        success: true,
        message: `Folder copied from ${sourcePath} to ${targetPath}`,
        copiedCount,
        totalObjects: allObjects.length,
      };
    } catch (error) {
      console.error('❌ Error copying folder:', error);
      throw new InternalServerErrorException('Failed to copy folder');
    }
  }

  async uploadMultipleFiles(
    files: Express.Multer.File[],
    folder: string,
    paths?: string[],
  ): Promise<S3OperationResult> {
    try {
      console.log(`🚀 Subiendo ${files.length} archivos EN PARALELO TOTAL`);

      // 1. Preparar TODAS las promesas de upload
      const uploadPromises = files.map((file, index) => {
        const relativePath = paths && paths[index] ? paths[index] : file.originalname;
        const key = `${folder}/${relativePath}`;

        console.log(`📤 Preparando: ${file.originalname}`);

        return this.s3.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
          })
        ).then(() => {
          console.log(`✅ Subido: ${file.originalname}`);
          return { success: true, filename: file.originalname };
        }).catch(error => {
          console.error(`❌ Error: ${file.originalname}`, error.message);
          return {
            success: false,
            filename: file.originalname,
            error: error.message
          };
        });
      });

      console.log(`🎯 Ejecutando ${uploadPromises.length} uploads paralelos...`);

      // 2. EJECUTAR TODOS LOS UPLOADS EN PARALELO
      const results = await Promise.allSettled(uploadPromises);

      // 3. Procesar resultados
      const successful = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(r => r.success);

      const failed = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(r => !r.success);

      console.log(`📊 Resultado: ${successful.length} exitosos, ${failed.length} fallidos`);

      return {
        success: failed.length === 0,
        message: `Subidos ${successful.length} archivos`,
        results: successful,
        errors: failed,
      };

    } catch (error) {
      console.error('Error general en uploadMultipleFiles:', error);
      throw new InternalServerErrorException('Error en subida masiva');
    }
  }
}