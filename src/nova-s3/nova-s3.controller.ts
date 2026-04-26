import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { NovaS3Service, NovaS3TreeResponseDto } from './nova-s3.service';

import { CreateFolderDto } from './dto/create-folder.dto';
import { ListFolderDto } from './dto/list-folder.dto';
import { RenameDto } from './dto/rename.dto';
import { MoveFileDto } from './dto/move-file.dto';
import { MoveFolderDto } from './dto/move-folder.dto';
import { DeleteDto } from './dto/delete.dto';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { PresignBatchDto } from './dto/presign-batch.dto';
import { CompleteMultipartDto, AbortMultipartDto } from './dto/complete-multipart.dto';
import { RegisterUploadDto } from './dto/register-upload.dto';
import { RegisterBatchDto } from './dto/register-batch.dto';

import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Nova S3')
@Controller('nova-s3')
export class NovaS3Controller {
  // ✅ NO te borro nada: solo subo límites y agrego soporte paths[] (folder upload real)
  private readonly MAX_MULTI_FILES = Number(process.env.NOVA_S3_MAX_MULTI_FILES ?? 3000);
  private readonly MAX_FOLDER_FILES = Number(process.env.NOVA_S3_MAX_FOLDER_FILES ?? 10000);

  constructor(private readonly novaS3Service: NovaS3Service) { }

  // ---------------------------------------------------------------------------
  // Helpers (guard rails)
  // ---------------------------------------------------------------------------
  private requireEmployee(employeeNumber?: string) {
    const emp = (employeeNumber ?? '').trim();
    if (!emp) throw new BadRequestException('employeeNumber is required');
    return emp;
  }

  /**
   * LIST (DB): Lista el contenido de un folder desde la tabla `nova_s3`.
   *
   * ✅ Source of truth = BD (no S3)
   * - Esto alimenta el panel derecho (lista de items).
   *
   * Reglas:
   * - root: raíz lógica del explorer (default "nova-s3")
   * - path: carpeta actual (relative). "" = raíz
   * - employeeNumber: 🔴 REQUERIDO (multi-tenant 100%)
   *
   * Devuelve:
   * - folders y files que tengan parentPath == path
   */
  @Get('list')
  @ApiOperation({
    summary: 'List folder contents (DB source of truth)',
    description:
      'Lists the contents of a folder directly from the database table `nova_s3` (source of truth). ' +
      'This endpoint does NOT hit S3. It returns the children items whose `parentPath` matches the provided `path`. ' +
      'Use it to render the right panel after selecting a folder in the tree.',
  })
  @ApiQuery({ name: 'root', required: false, example: 'nova-s3' })
  @ApiQuery({
    name: 'path',
    required: false,
    example: 'Marketing/Creatives',
    description: 'Current folder path (relative). Empty string means root.',
  })
  @ApiQuery({
    name: 'employeeNumber',
    required: true,
    example: 'NOVAJG232701',
    description:
      'Multi-tenant key (REQUIRED). All navigation and operations are scoped by this employeeNumber.',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    example: 'name',
    description: 'name | type | size | createdAt | updatedAt',
  })
  @ApiQuery({ name: 'order', required: false, example: 'asc', description: 'asc | desc' })
  @ApiOkResponse({
    description: 'Folder listing from DB',
    schema: {
      example: {
        success: true,
        root: 'nova-s3',
        path: 'Marketing/Creatives',
        total: 2,
        items: [],
      },
    },
  })
  list(@Query() dto: ListFolderDto) {
    dto.employeeNumber = this.requireEmployee(dto.employeeNumber);
    return this.novaS3Service.list(dto);
  }

  /**
   * TREE (DB): Devuelve árbol completo desde la tabla `nova_s3`.
   *
   * ✅ Source of truth = BD (no S3)
   * - Root node + folders anidados
   * - files[] (top level) opcional para UI inicial
   *
   * 🔴 Reglas tenant:
   * - employeeNumber: REQUERIDO (no existe tree global)
   */
  @Get('tree')
  @ApiOperation({
    summary: 'Get explorer tree (DB source of truth)',
    description:
      'Builds an explorer tree structure directly from the database table `nova_s3` (source of truth). ' +
      'This endpoint does NOT hit S3. It is intended for the left tree panel of the explorer. ' +
      'If your dataset grows, you can later switch to lazy loading (list by parentPath). ' +
      'All results are scoped by employeeNumber (tenant).',
  })
  @ApiQuery({ name: 'root', required: false, example: 'nova-s3' })
  @ApiQuery({
    name: 'employeeNumber',
    required: true,
    example: 'NOVAJG232701',
    description: 'Multi-tenant key (REQUIRED). There is no global tree.',
  })
  @ApiOkResponse({
    description: 'Tree structure from DB',
    schema: {
      example: {
        success: true,
        root: {
          name: 'nova-s3',
          path: '',
          type: 'folder',
          children: [
            {
              name: 'Marketing',
              path: 'Marketing',
              type: 'folder',
              children: [
                {
                  name: 'Creatives',
                  path: 'Marketing/Creatives',
                  type: 'folder',
                  children: [],
                },
              ],
            },
          ],
        },
        files: [
          {
            name: 'readme.txt',
            path: 'readme.txt',
            type: 'file',
            size: 120,
            lastModified: '2025-12-13T18:00:00.000Z',
          },
        ],
      },
    },
  })
  tree(
    @Query('root') root = 'nova-s3',
    @Query('employeeNumber') employeeNumber?: string,
    @Query('foldersOnly') foldersOnly?: string,
  ): Promise<NovaS3TreeResponseDto> {
    return this.novaS3Service.tree(root, this.requireEmployee(employeeNumber), foldersOnly === 'true');
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search files/folders by name (DB LIKE — server-side)',
    description: 'Searches nova_s3 by name LIKE %query%. Much faster than client-side recursion on large datasets.',
  })
  @ApiQuery({ name: 'root', required: false, example: 'nova-s3' })
  @ApiQuery({ name: 'q', required: true, example: 'invoice' })
  @ApiQuery({ name: 'employeeNumber', required: true, example: 'NOVAJG232701' })
  @ApiQuery({ name: 'limit', required: false, example: 200 })
  search(
    @Query('root') root = 'nova-s3',
    @Query('q') query = '',
    @Query('employeeNumber') employeeNumber?: string,
    @Query('limit') limit?: string,
  ) {
    const emp = this.requireEmployee(employeeNumber);
    return this.novaS3Service.search({ root, query, employeeNumber: emp, limit: limit ? Number(limit) : undefined });
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get storage stats (SQL COUNT/SUM — server-side)',
    description: 'Returns folder count, file count, and total size calculated with a SQL query. Use this instead of client-side tree traversal.',
  })
  @ApiQuery({ name: 'root', required: false, example: 'nova-s3' })
  @ApiQuery({ name: 'employeeNumber', required: true, example: 'NOVAJG232701' })
  stats(
    @Query('root') root = 'nova-s3',
    @Query('employeeNumber') employeeNumber?: string,
  ) {
    const emp = this.requireEmployee(employeeNumber);
    return this.novaS3Service.stats(root, emp);
  }

  @Get('file-url')
  @ApiOperation({ summary: 'Get presigned GET url (tenant-aware)' })
  @ApiQuery({ name: 'root', required: false, example: 'nova-s3' })
  @ApiQuery({ name: 'path', required: true, example: 'ChatGPT Image.png' })
  @ApiQuery({ name: 'employeeNumber', required: true, example: 'NOVAJG232701' })
  @ApiQuery({ name: 'expiresSeconds', required: false, example: 300 })
  getFileUrl(
    @Query('root') root = 'nova-s3',
    @Query('path') path?: string,
    @Query('employeeNumber') employeeNumber?: string,
    @Query('expiresSeconds') expiresSeconds?: string,
  ) {
    if (!path) throw new BadRequestException('path is required');
    const emp = this.requireEmployee(employeeNumber);
    const exp = expiresSeconds ? Number(expiresSeconds) : undefined;
    return this.novaS3Service.getFileUrl({ root, path, employeeNumber: emp, expiresSeconds: exp });
  }


  /**
   * CREATE FOLDER (DB + S3)
   *
   * - Crea la carpeta “lógica” en BD (y asegura la cadena de padres).
   * - En S3: opcionalmente crea el folder-object/prefix (según tu S3Service).
   *
   * ✅ Tenant rule:
   * - employeeNumber: 🔴 REQUERIDO
   * - la carpeta física se crea bajo {root}/{employeeNumber}/...
   */
  @Post('folder')
  @ApiOperation({
    summary: 'Create folder (DB source of truth + S3 storage)',
    description:
      'Creates a folder in the explorer. The backend normalizes `root/path/name`, ' +
      'auto-creates missing parent folders in DB, and (optionally) creates the folder prefix/object in S3. ' +
      'After this, the folder will appear in DB-driven tree/list endpoints. ' +
      'Tenant rule: employeeNumber is REQUIRED and the physical folder is created under `{root}/{employeeNumber}/...`.',
  })
  @ApiBody({
    type: CreateFolderDto,
    examples: {
      basic: {
        summary: 'Create folder inside a path',
        value: {
          root: 'nova-s3',
          path: 'Marketing/Creatives',
          name: 'Banners',
          employeeNumber: 'NOVAJG232701',
        },
      },
      rootLevel: {
        summary: 'Create folder at root',
        value: {
          root: 'nova-s3',
          path: '',
          name: 'Invoices',
          employeeNumber: 'NOVAJG232701',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Folder created',
    schema: {
      example: {
        success: true,
        message: 'Folder created',
        finalPath: 'Marketing/Creatives/Banners',
        s3Key: 'nova-s3/NOVAJG232701/Marketing/Creatives/Banners/',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Validation error',
    schema: { example: { statusCode: 400, message: 'name is required', error: 'Bad Request' } },
  })
  createFolder(@Body() dto: CreateFolderDto) {
    dto.employeeNumber = this.requireEmployee(dto.employeeNumber);
    return this.novaS3Service.createFolder(dto);
  }

  /**
   * UPLOAD ONE (S3 + DB)
   *
   * - Subida real a S3
   * - Inserta/actualiza registro en BD (type=file)
   * - Asegura folders padre en BD
   *
   * ✅ Tenant rule:
   * - employeeNumber: 🔴 REQUERIDO
   * - el archivo físico se sube bajo {root}/{employeeNumber}/...
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload single file (S3 storage + DB source of truth)',
    description:
      'Uploads a single file to S3 under `root/path` and persists the file record in `nova_s3`. ' +
      'The backend also ensures that missing parent folders exist in DB so that the DB-driven tree/list stays consistent. ' +
      'Tenant rule: employeeNumber is REQUIRED and the physical file is stored under `{root}/{employeeNumber}/...`.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'root', required: false, example: 'nova-s3' })
  @ApiQuery({ name: 'path', required: false, example: 'Marketing/Creatives' })
  @ApiQuery({
    name: 'employeeNumber',
    required: true,
    example: 'NOVAJG232701',
    description:
      'REQUIRED. The physical upload will be under `{root}/{employeeNumber}/...` and DB records will be tagged with this value.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
    examples: {
      uploadOne: {
        summary: 'Upload file into Marketing/Creatives',
        value: { file: '(binary)' },
      },
    },
  })
  @ApiOkResponse({
    description: 'File uploaded',
    schema: {
      example: {
        success: true,
        message: 'Uploaded',
        path: 'Marketing/Creatives/logo.png',
        s3Key: 'nova-s3/NOVAJG232701/Marketing/Creatives/logo.png',
      },
    },
  })
  uploadOne(
    @UploadedFile() file: Express.Multer.File,
    @Query('root') root = 'nova-s3',
    @Query('path') path = '',
    @Query('employeeNumber') employeeNumber?: string,
  ) {
    if (!file) throw new BadRequestException('file is required');
    const emp = this.requireEmployee(employeeNumber);
    return this.novaS3Service.uploadOne({ root, path, employeeNumber: emp }, file);
  }

  /**
   * UPLOAD MULTIPLE (S3 + DB)
   *
   * - Sube múltiples archivos al mismo folder root/path
   * - Inserta/actualiza cada archivo en BD
   *
   * ✅ Tenant rule:
   * - employeeNumber: 🔴 REQUERIDO
   * - los archivos se guardan bajo {root}/{employeeNumber}/...
   */
  @Post('upload/multiple')
  @UseInterceptors(FilesInterceptor('files', 3000))
  @ApiOperation({
    summary: 'Upload multiple files to same folder (S3 storage + DB source of truth)',
    description:
      'Uploads multiple files to S3 under the same `root/path` and persists one DB record per file. ' +
      'The backend ensures parent folders exist in DB to keep tree/list consistent. ' +
      'Tenant rule: employeeNumber is REQUIRED and files are stored under `{root}/{employeeNumber}/...`.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'root', required: false, example: 'nova-s3' })
  @ApiQuery({ name: 'path', required: false, example: 'Marketing/Creatives' })
  @ApiQuery({ name: 'employeeNumber', required: true, example: 'NOVAJG232701' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
      required: ['files'],
    },
    examples: {
      uploadMultiple: {
        summary: 'Upload 3 files into Marketing/Creatives',
        value: { files: ['(binary)', '(binary)', '(binary)'] },
      },
    },
  })
  @ApiOkResponse({
    description: 'Files uploaded',
    schema: { example: { success: true, message: 'Uploaded 3 files', count: 3 } },
  })
  uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('root') root = 'nova-s3',
    @Query('path') path = '',
    @Query('employeeNumber') employeeNumber?: string,
  ) {
    if (!files?.length) throw new BadRequestException('files[] is required');

    if (files.length > this.MAX_MULTI_FILES) {
      throw new BadRequestException(`Too many files. Max allowed: ${this.MAX_MULTI_FILES}`);
    }

    const emp = this.requireEmployee(employeeNumber);
    return this.novaS3Service.uploadMultiple({ root, path, employeeNumber: emp }, files);
  }

  /**
   * UPLOAD FOLDER (S3 + DB)
   *
   * - Mantiene subcarpetas SOLO si el cliente manda rutas relativas reales.
   * - Nuevo soporte: enviar `paths[]` en el body para preservar estructura.
   *   (Ej: paths[0]="A/B/file.png")
   *
   * ⚠ Postman no manda bien webkitRelativePath; sirve para smoke test, no para estructura real.
   *
   * ✅ Tenant rule:
   * - employeeNumber: 🔴 REQUERIDO
   * - TODO se guarda bajo {root}/{employeeNumber}/...
   */
  @Post('upload/folder')
  @UseInterceptors(FilesInterceptor('files', 10000))
  @ApiOperation({
    summary: 'Upload folder (keeps structure with paths[]) (S3 + DB)',
    description:
      'Uploads a folder (possibly nested) in one request. ' +
      '✅ Recommended: send `paths[]` (same order as files[]) to preserve structure exactly. ' +
      'Fallback: if no paths[] is sent, server will try to infer from `file.originalname` (may lose subfolders). ' +
      'Tenant rule: employeeNumber is REQUIRED and everything is stored under `{root}/{employeeNumber}/...`.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'root', required: false, example: 'nova-s3' })
  @ApiQuery({
    name: 'path',
    required: false,
    example: 'Marketing',
    description: 'Optional basePath: everything will be uploaded inside this folder.',
  })
  @ApiQuery({ name: 'employeeNumber', required: true, example: 'NOVAJG232701' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        paths: {
          description:
            'Optional. Array of relative paths matching files[] order. Can be sent as JSON string or repeated fields.',
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
        },
      },
      required: ['files'],
    },
  })
  @ApiOkResponse({
    description: 'Folder uploaded',
    schema: { example: { success: true, message: 'Uploaded folder', count: 25 } },
  })
  uploadFolder(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('paths') paths: any,
    @Query('root') root = 'nova-s3',
    @Query('path') basePath = '',
    @Query('employeeNumber') employeeNumber?: string,
  ) {
    if (!files?.length) throw new BadRequestException('files[] is required');

    if (files.length > this.MAX_FOLDER_FILES) {
      throw new BadRequestException(`Too many files. Max allowed: ${this.MAX_FOLDER_FILES}`);
    }

    const emp = this.requireEmployee(employeeNumber);
    return this.novaS3Service.uploadFolder({ root, basePath, employeeNumber: emp, paths }, files);
  }

  /**
   * RENAME (DB source of truth + S3 sync)
   *
   * - Renombra file o folder en S3
   * - Actualiza paths en BD
   *
   * Nota:
   * - Si es folder, hace cascade: actualiza carpeta + todos sus descendientes
   *
   * ✅ Tenant rule:
   * - employeeNumber: 🔴 REQUERIDO
   * - opera dentro de {root}/{employeeNumber}/...
   */
  @Patch('rename')
  @ApiOperation({
    summary: 'Rename file or folder (DB source of truth + S3 sync)',
    description:
      'Renames a file or folder. The DB is the source of truth, so the backend validates the item exists in DB first. ' +
      'Then it performs the physical rename operation in S3 and updates the DB (source of truth) so tree/list reflect the change. ' +
      'If it is a folder, the backend cascades the rename across all descendants. ' +
      'Tenant rule: employeeNumber is REQUIRED and the operation is applied under `{root}/{employeeNumber}/...`.',
  })
  @ApiBody({ type: RenameDto })
  @ApiOkResponse({ description: 'Renamed' })
  rename(@Body() dto: RenameDto) {
    dto.employeeNumber = this.requireEmployee(dto.employeeNumber);
    return this.novaS3Service.rename(dto);
  }

  /**
   * MOVE FILE (DB source of truth + S3 sync)
   *
   * - Mueve un file a otro folder
   * - Actualiza el registro en BD
   *
   * ✅ Tenant rule:
   * - employeeNumber: 🔴 REQUERIDO
   * - opera dentro de {root}/{employeeNumber}/...
   */
  @Patch('move-file')
  @ApiOperation({
    summary: 'Move file (DB source of truth + S3 sync)',
    description:
      'Moves a file from `sourcePath` to `targetPath` (destination folder). The DB is the source of truth; the backend validates the file exists in DB first. ' +
      'Then it performs the S3 move and updates the DB record. After this, DB-driven tree/list will show the file in the new location. ' +
      'Tenant rule: employeeNumber is REQUIRED and the operation is applied under `{root}/{employeeNumber}/...`.',
  })
  @ApiBody({ type: MoveFileDto })
  @ApiOkResponse({ description: 'Moved' })
  moveFile(@Body() dto: MoveFileDto) {
    dto.employeeNumber = this.requireEmployee(dto.employeeNumber);
    return this.novaS3Service.moveFile(dto);
  }

  /**
   * MOVE FOLDER (DB source of truth + S3 sync cascade)
   *
   * - Mueve carpeta completa a destino
   * - Actualiza DB en cascade (carpeta + descendientes)
   *
   * ✅ Tenant rule:
   * - employeeNumber: 🔴 REQUERIDO
   * - opera dentro de {root}/{employeeNumber}/...
   */
  @Patch('move-folder')
  @ApiOperation({
    summary: 'Move folder (DB source of truth + S3 sync cascade)',
    description:
      'Moves a folder (prefix) from `sourcePath` to `targetPath` (destination folder). The DB is the source of truth; the backend validates the folder exists in DB first. ' +
      'Then it performs the S3 move and updates the DB in cascade: the folder itself and all descendants paths/parentPath/s3Key are updated. ' +
      'Tenant rule: employeeNumber is REQUIRED and the operation is applied under `{root}/{employeeNumber}/...`.',
  })
  @ApiBody({ type: MoveFolderDto })
  @ApiOkResponse({ description: 'Folder moved' })
  moveFolder(@Body() dto: MoveFolderDto) {
    dto.employeeNumber = this.requireEmployee(dto.employeeNumber);
    return this.novaS3Service.moveFolder(dto);
  }

  // ---------------------------------------------------------------------------
  // PRESIGNED PUT — upload directo desde browser sin pasar por el backend
  // ---------------------------------------------------------------------------

  /**
   * PRESIGN UPLOAD (single file)
   * Genera una presigned PUT URL para que el browser suba directo a S3.
   * Flujo: Frontend pide URL → sube directo a S3 → llama /register
   */
  @Post('upload/presign')
  @ApiOperation({
    summary: 'Get presigned PUT URL for direct browser upload (single file)',
    description:
      'Returns a presigned PUT URL so the browser can upload the file directly to S3 without routing through the backend. ' +
      'After the direct upload succeeds, call POST /nova-s3/register to persist the file in DB. ' +
      'This avoids double-transfer and is dramatically faster for large files.',
  })
  @ApiBody({ type: PresignUploadDto })
  presignUpload(@Body() dto: PresignUploadDto) {
    dto.employeeNumber = this.requireEmployee(dto.employeeNumber);
    return this.novaS3Service.presignUpload(dto);
  }

  /**
   * PRESIGN BATCH
   * Genera presigned URLs para múltiples archivos en una sola llamada.
   * - Archivos < 100MB → presigned PUT (type: 'put')
   * - Archivos >= 100MB → Multipart Upload (type: 'multipart', incluye URLs por parte)
   */
  @Post('upload/presign/batch')
  @ApiOperation({
    summary: 'Get presigned URLs for batch direct upload (single PUT or multipart per file)',
    description:
      'Generates presigned URLs for all files in one round trip. ' +
      'Small files get a single presigned PUT URL. Large files (>= threshold) get a multipart upload with per-part presigned URLs. ' +
      'Upload all files directly to S3 in parallel, then call POST /nova-s3/register/batch to persist them in DB.',
  })
  @ApiBody({ type: PresignBatchDto })
  presignBatch(@Body() dto: PresignBatchDto) {
    dto.employeeNumber = this.requireEmployee(dto.employeeNumber);
    return this.novaS3Service.presignBatch(dto);
  }

  /**
   * COMPLETE MULTIPART
   * Ensambla las partes del multipart upload y registra en DB.
   * Llamar con los ETags devueltos por S3 en cada PUT de parte.
   */
  @Post('upload/multipart/complete')
  @ApiOperation({
    summary: 'Complete multipart upload and register file in DB',
    description:
      'Assembles all uploaded parts into the final S3 object and persists the file record in DB. ' +
      'Send the parts array with { partNumber, etag } from each part upload response header.',
  })
  @ApiBody({ type: CompleteMultipartDto })
  completeMultipart(@Body() dto: CompleteMultipartDto) {
    dto.employeeNumber = this.requireEmployee(dto.employeeNumber);
    return this.novaS3Service.completeMultipart(dto);
  }

  /**
   * ABORT MULTIPART
   * Cancela un multipart upload en curso (cleanup de partes en S3).
   */
  @Post('upload/multipart/abort')
  @ApiOperation({
    summary: 'Abort multipart upload (cleanup)',
    description: 'Aborts an in-progress multipart upload and removes all uploaded parts from S3.',
  })
  @ApiBody({ type: AbortMultipartDto })
  abortMultipart(@Body() dto: AbortMultipartDto) {
    return this.novaS3Service.abortMultipart(dto);
  }

  // ---------------------------------------------------------------------------
  // REGISTER — persiste en DB después de upload directo a S3
  // ---------------------------------------------------------------------------

  /**
   * REGISTER SINGLE FILE
   * Registra un archivo en DB después de que el frontend lo subió directo a S3.
   */
  @Post('register')
  @ApiOperation({
    summary: 'Register file in DB after direct S3 upload',
    description:
      'Persists a file record in the nova_s3 DB table after the frontend uploaded it directly to S3 via presigned URL. ' +
      'Also ensures all parent folders exist in DB.',
  })
  @ApiBody({ type: RegisterUploadDto })
  registerUpload(@Body() dto: RegisterUploadDto) {
    dto.employeeNumber = this.requireEmployee(dto.employeeNumber);
    return this.novaS3Service.registerUpload(dto);
  }

  /**
   * REGISTER BATCH
   * Registra múltiples archivos en DB de una sola vez (al final de un batch upload directo).
   */
  @Post('register/batch')
  @ApiOperation({
    summary: 'Register multiple files in DB after direct S3 batch upload',
    description:
      'Bulk-registers file records in DB after a batch of direct S3 uploads via presigned URLs. ' +
      'Ensures all parent folder chains exist in DB before inserting.',
  })
  @ApiBody({ type: RegisterBatchDto })
  registerBatch(@Body() dto: RegisterBatchDto) {
    dto.employeeNumber = this.requireEmployee(dto.employeeNumber);
    return this.novaS3Service.registerBatch(dto);
  }

  /**
   * DELETE (DB source of truth + S3 sync)
   *
   * - kind=file: borra 1 objeto en S3 y elimina row en DB
   * - kind=folder: borra prefijo en S3 y elimina rows en DB (cascade)
   *
   * ✅ Tenant rule:
   * - employeeNumber: 🔴 REQUERIDO
   * - opera dentro de {root}/{employeeNumber}/...
   */
  @Delete()
  @ApiOperation({
    summary: 'Delete file or folder (DB source of truth + S3 sync)',
    description:
      'Deletes a file or folder. The DB is the source of truth; the backend validates the item exists in DB first. ' +
      'Then it performs the S3 delete and deletes matching records from DB. For folders, it cascades deletion across all descendants (path LIKE folder/%). ' +
      'Tenant rule: employeeNumber is REQUIRED and the delete is applied under `{root}/{employeeNumber}/...`.',
  })
  @ApiBody({ type: DeleteDto })
  @ApiOkResponse({
    description: 'Deleted',
    schema: { example: { success: true, message: 'Deleted', deletedCount: 27 } },
  })
  remove(@Body() dto: DeleteDto) {
    dto.employeeNumber = this.requireEmployee(dto.employeeNumber);
    return this.novaS3Service.remove(dto);
  }
}
