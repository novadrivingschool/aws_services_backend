import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  UseInterceptors,
  UploadedFile,
  Query,
  Res,
  BadRequestException,
  UploadedFiles,
} from '@nestjs/common';
import { S3Service } from './s3.service';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';


@Controller('s3')
export class S3Controller {
  constructor(private readonly s3Service: S3Service) { }

  // ---------------------------------------------------------------------------
  // UPLOADS
  // ---------------------------------------------------------------------------

  /**
   * POST /s3/upload/general
   *
   * Sube un archivo "general" a S3.
   * - No está ligado a un employee_number.
   * - Recibe la carpeta destino en el body (folder).
   */
  @Post('upload/general')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFileGeneral(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder: string,
  ): Promise<any> {
    console.log('uploading file general...');
    console.log('folder: ', folder);
    console.log('file: ', file);

    if (!file) throw new BadRequestException('File is required');
    if (!folder) throw new BadRequestException('folder is required');

    const buffer = file.buffer;
    const filename = file.originalname;
    const mimetype = file.mimetype;

    return this.s3Service.uploadFileGeneral(buffer, filename, mimetype, folder);
  }

  @Post('upload/multiple')
  @UseInterceptors(FilesInterceptor('files')) // Cambiar a FilesInterceptor
  async uploadMultipleFiles(
    @UploadedFiles() files: Express.Multer.File[], // Cambiar a UploadedFiles (plural)
    @Body('folder') folder: string,
    @Body('paths') paths?: string,
  ): Promise<any> {
    console.log('Uploading multiple files...', files.length);
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }
    if (!folder) {
      throw new BadRequestException('folder is required');
    }

    // Parsear paths si viene como string JSON
    let pathArray: string[] = [];
    if (paths) {
      try {
        pathArray = JSON.parse(paths);
      } catch (e) {
        throw new BadRequestException('Invalid paths format');
      }
    }

    return this.s3Service.uploadMultipleFiles(files, folder, pathArray);
  }

  /**
   * POST /s3/upload
   *
   * Sube un archivo asociado a un empleado.
   * - Query: employee_number, folder
   * - Sirve para un "espacio personal" tipo "My Files" del usuario.
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('employee_number') employeeNumber: string,
    @Query('folder') folder: string, // Carpeta destino en S3
  ): Promise<any> {
    if (!file) throw new BadRequestException('File is required');
    if (!employeeNumber) throw new BadRequestException('employee_number is required');
    if (!folder) throw new BadRequestException('folder is required');

    const buffer = file.buffer;
    const filename = file.originalname;
    const mimetype = file.mimetype;

    return this.s3Service.uploadFile(buffer, filename, mimetype, employeeNumber, folder);
  }

  // ---------------------------------------------------------------------------
  // SIGNED URLS
  // ---------------------------------------------------------------------------

  /**
   * GET /s3/file-url
   *
   * Devuelve una URL firmada para un archivo asociado a un empleado.
   */
  @Get('file-url')
  getPublicUrl(
    @Query('folder') folder: string,
    @Query('employee_number') employeeNumber: string,
    @Query('filename') filename: string,
  ): any {
    return this.s3Service.getPublicUrl(folder, employeeNumber, filename);
  }

  /**
   * GET /s3/file-url/no-employee
   *
   * Igual que /file-url, pero para archivos "generales" sin employee_number.
   */
  @Get('file-url/no-employee')
  getPublicUrl_noEmployeeNumber(
    @Query('folder') folder: string,
    @Query('filename') filename: string,
  ): any {
    console.log('file-url/no-employee/getting public url...');
    console.log('folder: ', folder);
    console.log('filename: ', filename);
    return this.s3Service.getPublicUrl_noEmployeeNumber(folder, filename);
  }

  // ---------------------------------------------------------------------------
  // DOWNLOAD
  // ---------------------------------------------------------------------------

  /**
   * GET /s3/download
   *
   * Descarga un archivo y lo devuelve como stream en la respuesta HTTP.
   */
  @Get('download')
  async downloadFile(
    @Res() res: Response,
    @Query('folder') folder: string,
    @Query('filename') filename: string,
  ): Promise<void> {
    if (!folder) throw new BadRequestException('folder is required');
    if (!filename) throw new BadRequestException('filename is required');

    await this.s3Service.downloadFile(folder, filename, res);
  }

  // ---------------------------------------------------------------------------
  // DELETE FILES
  // ---------------------------------------------------------------------------

  /**
   * DELETE /s3/delete
   *
   * Elimina un archivo asociado (o no) a un employee_number.
   */
  @Delete('delete')
  async deleteFile(
    @Query('folder') folder: string,
    @Query('filename') filename: string,
    @Query('employee_number') employeeNumber?: string,
  ): Promise<any> {
    if (!folder || !filename) {
      throw new BadRequestException('folder and filename are required');
    }

    return this.s3Service.deleteFile(folder, filename, employeeNumber);
  }

  /**
   * DELETE /s3/delete/no-employee
   *
   * Elimina un archivo "general" sin employee_number.
   */
  @Delete('delete/no-employee')
  async deleteFileNoEmployee(
    @Query('folder') folder: string,
    @Query('filename') filename: string,
  ): Promise<any> {
    if (!folder || !filename) {
      throw new BadRequestException('folder and filename are required');
    }

    return this.s3Service.deleteFileNoEmployee(folder, filename);
  }

  // ---------------------------------------------------------------------------
  // EXPLORER / LIST
  // ---------------------------------------------------------------------------

  /**
   * GET /s3/list
   *
   * Lista carpetas y archivos dentro de una ruta.
   */
  @Get('list')
  async listFolder(
    @Query('folder') folder: string,
    @Query('path') path?: string,
    @Query('employee_number') employeeNumber?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: 'asc' | 'desc',
  ): Promise<any> {
    if (!folder) {
      throw new BadRequestException('folder is required');
    }

    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 50;

    return this.s3Service.listFolder(
      folder,
      employeeNumber,
      path,
      pageNum,
      limitNum,
      sortBy || 'name',
      order || 'asc'
    );
  }
  /* @Get('list')
  async listFolder(
    @Query('folder') folder: string,
    @Query('path') path?: string,
    @Query('employee_number') employeeNumber?: string,
  ): Promise<any> {
    if (!folder) {
      throw new BadRequestException('folder is required');
    }
    return this.s3Service.listFolder(folder, employeeNumber, path);
  } */

  /**
   * GET /s3/metadata
   *
   * Devuelve metadata básica de un archivo.
   */
  @Get('metadata')
  async getMetadata(
    @Query('folder') folder: string,
    @Query('path') path: string,
    @Query('employee_number') employeeNumber?: string,
  ): Promise<any> {
    if (!folder) throw new BadRequestException('folder is required');
    if (!path) throw new BadRequestException('path is required');

    return this.s3Service.getMetadata(folder, path, employeeNumber);
  }

  // ---------------------------------------------------------------------------
  // FOLDERS: CREATE / DELETE
  // ---------------------------------------------------------------------------

  /**
   * POST /s3/folder
   *
   * Crea una carpeta lógica dentro de una ruta.
   */
  @Post('folder')
  async createFolder(
    @Body('folder') folder: string,
    @Body('name') name: string,
    @Body('path') path?: string,
    @Body('employee_number') employeeNumber?: string,
  ): Promise<any> {
    if (!folder) throw new BadRequestException('folder is required');
    if (!name) throw new BadRequestException('name is required');

    return this.s3Service.createFolder(folder, name, employeeNumber, path);
  }

  /**
   * DELETE /s3/folder
   *
   * Elimina una carpeta y todo su contenido.
   */
  @Delete('folder')
  async deleteFolder(
    @Query('folder') rootFolder: string,
    @Query('path') path?: string,
    @Query('employee_number') employeeNumber?: string,
  ): Promise<any> {
    if (!rootFolder) {
      throw new BadRequestException('folder is required');
    }

    return this.s3Service.deleteFolder(rootFolder, path, employeeNumber);
  }

  /**
   * DELETE /s3/folder/no-employee
   *
   * Elimina una carpeta general (sin employee_number).
   */
  @Delete('folder/no-employee')
  async deleteFolderNoEmployee(
    @Query('folder') rootFolder: string,
    @Query('path') path?: string,
  ): Promise<any> {
    if (!rootFolder) {
      throw new BadRequestException('folder is required');
    }

    return this.s3Service.deleteFolderNoEmployee(rootFolder, path);
  }

  // ---------------------------------------------------------------------------
  // FOLDERS: MOVE / RENAME / COPY
  // ---------------------------------------------------------------------------

  /**
   * PATCH /s3/rename
   *
   * Renombra un archivo o carpeta (simple).
   */
  @Patch('rename')
  async renameItem(
    @Body('folder') folder: string,
    @Body('old_path') oldPath: string,
    @Body('new_name') newName: string,
    @Body('employee_number') employeeNumber?: string,
  ): Promise<any> {
    if (!folder) throw new BadRequestException('folder is required');
    if (!oldPath || !newName) {
      throw new BadRequestException('old_path and new_name are required');
    }

    return this.s3Service.renameItem(folder, oldPath, newName, employeeNumber);
  }

  /**
   * PATCH /s3/move
   *
   * Mueve un archivo de una carpeta a otra.
   */
  @Patch('move')
  async moveItem(
    @Body('folder') folder: string,
    @Body('source_path') sourcePath: string,
    @Body('target_path') targetPath: string,
    @Body('employee_number') employeeNumber?: string,
  ): Promise<any> {
    if (!folder) throw new BadRequestException('folder is required');
    if (!sourcePath || !targetPath) {
      throw new BadRequestException('source_path and target_path are required');
    }

    return this.s3Service.moveItem(folder, sourcePath, targetPath, employeeNumber);
  }

  /**
   * PATCH /s3/folder/move
   *
   * Mueve una carpeta completa a otra ubicación.
   */
  // En S3Controller
  @Patch('folder/move')
  async moveFolder(
    @Body('folder') folder: string,
    @Body('source_path') sourcePath: string,
    @Body('target_path') targetPath: string,
    @Body('employee_number') employeeNumber?: string,
  ): Promise<any> {
    console.log('📂 MOVE FOLDER REQUEST:', {
      folder,
      sourcePath,
      targetPath,
      employeeNumber,
    });

    if (!folder) throw new BadRequestException('folder is required');
    if (!sourcePath) throw new BadRequestException('source_path is required');
    if (!targetPath) throw new BadRequestException('target_path is required');

    return this.s3Service.moveFolder(folder, sourcePath, targetPath, employeeNumber);
  }

  /**
   * PATCH /s3/folder/rename
   *
   * Renombra una carpeta (usa moveFolder internamente).
   */
  @Patch('folder/rename')
  async renameFolder(
    @Body('folder') folder: string,
    @Body('old_path') oldPath: string,
    @Body('new_name') newName: string,
    @Body('employee_number') employeeNumber?: string,
  ): Promise<any> {
    if (!folder) throw new BadRequestException('folder is required');
    if (!oldPath || !newName) {
      throw new BadRequestException('old_path and new_name are required');
    }

    return this.s3Service.renameFolder(folder, oldPath, newName, employeeNumber);
  }

  /**
   * POST /s3/folder/copy
   *
   * Copia una carpeta completa a otra ubicación.
   */
  @Post('folder/copy')
  async copyFolder(
    @Body('folder') folder: string,
    @Body('source_path') sourcePath: string,
    @Body('target_path') targetPath: string,
    @Body('employee_number') employeeNumber?: string,
  ): Promise<any> {
    if (!folder) throw new BadRequestException('folder is required');
    if (!sourcePath) throw new BadRequestException('source_path is required');
    if (!targetPath) throw new BadRequestException('target_path is required');

    return this.s3Service.copyFolder(folder, sourcePath, targetPath, employeeNumber);
  }

  // ---------------------------------------------------------------------------
  // TREE & FOLDER INFO (AQUÍ ESTABA TU ERROR TS4053)
  // ---------------------------------------------------------------------------

  /**
   * GET /s3/folder/tree
   *
   * Obtiene la estructura completa de carpetas como árbol.
   *
   * ⚠ Para evitar el error TS4053 NO usamos FolderInfo/TreeItem en la firma.
   */
  @Get('folder/tree')
  async getFolderTree(
    @Query('folder') folder: string,
    @Query('employee_number') employeeNumber?: string,
  ): Promise<any> {
    if (!folder) throw new BadRequestException('folder is required');
    return this.s3Service.listAllFolders(folder, employeeNumber);
  }

  /**
   * GET /s3/folder/info
   *
   * Obtiene información detallada de una carpeta.
   *
   * ⚠ Igual: devolvemos Promise<any> para que TypeScript no intente usar FolderInfo.
   */
  @Get('folder/info')
  async getFolderInfo(
    @Query('folder') folder: string,
    @Query('path') path: string,
    @Query('employee_number') employeeNumber?: string,
  ): Promise<any> {
    if (!folder) throw new BadRequestException('folder is required');
    if (!path) throw new BadRequestException('path is required');

    return this.s3Service.getFolderInfo(folder, path, employeeNumber);
  }
}
