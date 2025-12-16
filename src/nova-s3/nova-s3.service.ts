import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

import { NovaS3 } from './entities/nova-s3.entity';

import { CreateFolderDto } from './dto/create-folder.dto';
import { ListFolderDto } from './dto/list-folder.dto';
import { RenameDto } from './dto/rename.dto';
import { MoveFileDto } from './dto/move-file.dto';
import { MoveFolderDto } from './dto/move-folder.dto';
import { DeleteDto } from './dto/delete.dto';
import { NovaS3StorageUtil } from './utils/nova-s3-storage.util';

/**
 * Operation response (local DTO)
 * - Normaliza respuestas del storage layer en un shape consistente.
 * - Evita exponer tipos internos (TS4053).
 */
export type NovaS3OperationResponseDto = {
  success: boolean;
  message?: string;
  [key: string]: any;
};

/**
 * Tree item DTO used by the explorer tree.
 */
export type NovaS3TreeItemDto = {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: NovaS3TreeItemDto[];
  size?: number;
  lastModified?: Date;
};

/**
 * Full tree response:
 * - root node with nested folders
 * - flat list of root-level files (optional)
 */
export type NovaS3TreeResponseDto = {
  success: boolean;
  root: {
    name: string;
    path: string;
    type: 'folder';
    children: NovaS3TreeItemDto[];
  };
  files: NovaS3TreeItemDto[];
};

/**
 * Upload context used by upload endpoints.
 */
type UploadCtx = { root: string; path?: string; employeeNumber?: string };

// ✅ NEW (solo agrega, no borra): shape para folder upload con paths opcionales
type UploadFolderCtx = {
  root: string;
  basePath?: string;
  employeeNumber?: string;
  paths?: any; // puede venir string JSON, array string, undefined
};

@Injectable()
export class NovaS3Service {
  private readonly logger = new Logger(NovaS3Service.name);

  constructor(
    /**
     * ✅ Storage-only util
     * - PutObject, copy+delete, delete prefix, presigned URL, etc.
     * - NO navegación aquí.
     */
    private readonly storage: NovaS3StorageUtil,

    /**
     * ✅ DB repository (table nova_s3) = source of truth for navigation.
     * Tree/list endpoints read from this table only.
     */
    @InjectRepository(NovaS3)
    private readonly repo: Repository<NovaS3>,
  ) { }

  // ---------------------------------------------------------------------------
  // Helpers (normalization & path building)
  // ---------------------------------------------------------------------------

  /** internal: safe stringify (no revienta por circular) */
  private safeJson(v: any) {
    try { return JSON.stringify(v); } catch { return String(v); }
  }

  /** internal: log context standard */
  private logCtx(fn: string, ctx: Record<string, any>) {
    this.logger.log(`[${fn}] ctx=${this.safeJson(ctx)}`);
  }

  /** internal: log step */
  private logStep(fn: string, msg: string, extra?: any) {
    if (extra !== undefined) this.logger.log(`[${fn}] ${msg} | ${this.safeJson(extra)}`);
    else this.logger.log(`[${fn}] ${msg}`);
  }

  /** internal: log error with stack */
  private logErr(fn: string, err: any, extra?: any) {
    const msg = err?.message ?? String(err);
    const stack = err?.stack ? `\n${err.stack}` : '';
    if (extra !== undefined) this.logger.error(`[${fn}] ERROR: ${msg} | ${this.safeJson(extra)}${stack}`);
    else this.logger.error(`[${fn}] ERROR: ${msg}${stack}`);
  }

  /** Normalize root: trim slashes, default to "nova-s3". */
  private normRoot(root?: string) {
    const out = (root || 'nova-s3').replace(/^\/|\/$/g, '');
    // log chiquito (no spamear demasiado)
    return out;
  }

  /** Normalize path: trim, remove leading/trailing slashes. */
  private normPath(path?: string) {
    const out = (path || '').trim().replace(/\\/g, '/').replace(/^\/|\/$/g, '');
    return out;
  }

  /** Join base path + name safely (no duplicate slashes). */
  private joinPath(path: string, name: string) {
    const p = this.normPath(path);
    const n = this.normPath(name);
    return p ? `${p}/${n}` : n;
  }

  /** Parent path of a relative path. Example: "A/B/C" => "A/B" */
  private parentOf(relativePath: string) {
    const clean = this.normPath(relativePath);
    if (!clean) return '';
    const parts = clean.split('/');
    parts.pop();
    return parts.join('/');
  }

  /** Last segment name of a relative path. Example: "A/B/C" => "C" */
  private nameOf(relativePath: string) {
    const clean = this.normPath(relativePath);
    if (!clean) return '';
    return clean.split('/').pop() || '';
  }

  /**
   * Convert any incoming name to safe relative path:
   * - supports Windows "\" separators
   * - trims leading/trailing slashes
   *
   * Critical for folder uploads (webkitRelativePath).
   */
  private relFromOriginalName(name: string) {
    return this.normPath(name || '');
  }

  /**
   * TENANT PREFIX (employeeNumber)
   * - If employeeNumber exists => "EMP123"
   * - Else => ""
   */
  private tenantPrefix(employeeNumber?: string | null) {
    const e = (employeeNumber ?? '').trim();
    return e ? this.normPath(e) : '';
  }

  /**
   * Base S3 folder (prefix base):
   * - without employee: root
   * - with employee: root/employeeNumber
   *
   * ✅ Aquí NO va navegación; solo el lugar físico en S3.
   */
  private s3BaseFolder(root: string, employeeNumber?: string | null) {
    const tenant = this.tenantPrefix(employeeNumber);
    return tenant ? `${this.normRoot(root)}/${tenant}` : this.normRoot(root);
  }

  /**
   * Build FINAL S3 key (string guardado en BD)
   * - base: root[/employeeNumber]
   * - then relativePath
   * - if folder => trailing slash
   */
  private buildTenantS3Key(
    root: string,
    employeeNumber: string | null,
    relativePath: string,
    isFolder = false,
  ) {
    const base = this.s3BaseFolder(root, employeeNumber);
    const rel = this.normPath(relativePath);
    const full = rel ? `${base}/${rel}` : base;
    return isFolder ? (full.endsWith('/') ? full : `${full}/`) : full;
  }

  /** Normalize any storage response into local operation DTO. */
  private toOpResponse(raw: any): NovaS3OperationResponseDto {
    if (raw && typeof raw === 'object') return { success: !!raw.success, ...raw };
    return { success: false, message: 'Unknown storage response', raw };
  }

  // ---------------------------------------------------------------------------
  // ✅ NEW helpers (bulk + folder paths parsing) - NO BORRO NADA
  // ---------------------------------------------------------------------------

  /**
   * Parse `paths` coming from multipart body.
   * Supported:
   * - undefined => returns null
   * - array of strings => returns that array
   * - JSON string => parses to array
   * - single string (non-JSON) => returns [string] (NOT recommended)
   */
  private parsePathsInput(paths: any): string[] | null {
    this.logStep('parsePathsInput', 'incoming paths', paths);

    if (paths == null) return null;

    // already array
    if (Array.isArray(paths)) {
      const arr = paths.map((x) => String(x ?? '')).filter(Boolean);
      this.logStep('parsePathsInput', 'parsed array', { len: arr.length, sample: arr.slice(0, 3) });
      return arr.length ? arr : null;
    }

    // string
    if (typeof paths === 'string') {
      const s = paths.trim();
      if (!s) return null;

      // try json
      if (s.startsWith('[') || s.startsWith('{')) {
        try {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed)) {
            const arr = parsed.map((x) => String(x ?? '')).filter(Boolean);
            this.logStep('parsePathsInput', 'parsed JSON array', { len: arr.length, sample: arr.slice(0, 3) });
            return arr.length ? arr : null;
          }
        } catch (e: any) {
          this.logErr('parsePathsInput', e, { note: 'JSON parse failed, fallback to single string' });
          // fallthrough
        }
      }

      // fallback single path
      this.logStep('parsePathsInput', 'fallback single string', s);
      return [s];
    }

    this.logStep('parsePathsInput', 'unsupported type, returning null', typeof paths);
    return null;
  }

  /**
   * Ensure folder chain exists in DB (original).
   * NOTE: sigue aquí, no lo borro.
   */
  private async ensureFolderChain(root: string, folderPath: string, employeeNumber?: string | null) {
    const fn = 'ensureFolderChain';
    this.logCtx(fn, { root, folderPath, employeeNumber });

    const clean = this.normPath(folderPath);
    if (!clean) {
      this.logStep(fn, 'clean path empty -> skip');
      return;
    }

    const parts = clean.split('/').filter(Boolean);
    let acc = '';

    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;

      this.logStep(fn, 'checking folder exists', { acc });

      const exists = await this.repo.findOne({
        where: {
          root,
          path: acc,
          type: 'folder',
          employeeNumber: employeeNumber ?? null,
        } as any,
      });

      if (!exists) {
        this.logStep(fn, 'folder NOT exists -> create in DB', { acc });

        // Crear en DB
        await this.repo.save({
          root,
          path: acc,
          parentPath: this.parentOf(acc),
          name: part,
          type: 'folder',
          s3Key: this.buildTenantS3Key(root, employeeNumber ?? null, acc, true),
          employeeNumber: employeeNumber ?? null,
          size: null,
          mimeType: null,
          meta: { op: 'autoFolder' },
        } as any);

        this.logStep(fn, 'folder saved in DB', {
          path: acc,
          parentPath: this.parentOf(acc),
          s3Key: this.buildTenantS3Key(root, employeeNumber ?? null, acc, true),
        });

        // ✅ NUEVO: Crear marcador en S3
        const baseFolder = this.s3BaseFolder(root, employeeNumber ?? null);
        this.logStep(fn, 'creating S3 folder marker', { baseFolder, acc });

        try {
          await this.storage.createFolderMarker(baseFolder, acc);
          this.logStep(fn, 'S3 folder marker OK', { baseFolder, acc });
        } catch (e: any) {
          // no lo mates, pero queda log
          this.logErr(fn, e, { baseFolder, acc, note: 'createFolderMarker failed' });
        }
      } else {
        this.logStep(fn, 'folder exists (DB)', { acc });
      }
    }
  }

  /**
   * ✅ NEW: cached version to avoid hitting DB for same folders 1000x in one request.
   */
  private async ensureFolderChainCached(
    root: string,
    folderPath: string,
    employeeNumber: string | null,
    cache: Set<string>,
  ) {
    const fn = 'ensureFolderChainCached';
    this.logCtx(fn, { root, folderPath, employeeNumber, cacheSize: cache?.size });

    const clean = this.normPath(folderPath);
    if (!clean) {
      this.logStep(fn, 'clean path empty -> skip');
      return;
    }

    const parts = clean.split('/').filter(Boolean);
    let acc = '';

    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      const cacheKey = `${root}|${employeeNumber ?? 'null'}|${acc}`;

      if (cache.has(cacheKey)) {
        this.logStep(fn, 'cache hit -> skip', { acc });
        continue;
      }
      cache.add(cacheKey);

      this.logStep(fn, 'checking folder exists', { acc });

      const exists = await this.repo.findOne({
        where: { root, path: acc, type: 'folder', employeeNumber } as any,
        select: { id: true } as any,
      });

      if (!exists) {
        this.logStep(fn, 'folder NOT exists -> create in DB', { acc });

        await this.repo.save({
          root,
          path: acc,
          parentPath: this.parentOf(acc),
          name: part,
          type: 'folder',
          s3Key: this.buildTenantS3Key(root, employeeNumber, acc, true),
          employeeNumber,
          size: null,
          mimeType: null,
          meta: { op: 'autoFolder' },
        } as any);

        this.logStep(fn, 'folder saved in DB', {
          path: acc,
          parentPath: this.parentOf(acc),
          s3Key: this.buildTenantS3Key(root, employeeNumber, acc, true),
        });

        // (tu cached no creaba marker; NO CAMBIO TU LÓGICA) -> solo log que NO se crea marker aquí
        this.logStep(fn, 'NOTE: cached version does NOT create S3 marker (by design)');
      } else {
        this.logStep(fn, 'folder exists (DB)', { acc });
      }
    }
  }

  /**
   * ✅ NEW: bulk upsert for files
   * Requires UNIQUE constraint on (root, employeeNumber, path) or similar.
   */
  private async upsertFiles(rows: Partial<NovaS3>[]) {
    const fn = 'upsertFiles';
    this.logCtx(fn, { rows: rows?.length, sample: rows?.[0]?.path });

    if (!rows.length) {
      this.logStep(fn, 'no rows -> skip');
      return;
    }

    await this.repo.upsert(rows as any, ['root', 'employeeNumber', 'path'] as any);
    this.logStep(fn, 'upsert OK', { rows: rows.length });
  }

  /**
   * Update a single item path in DB (file or folder).
   */
  private async updateOnePath(root: string, employeeNumber: string | null, oldPath: string, newPath: string) {
    const fn = 'updateOnePath';
    this.logCtx(fn, { root, employeeNumber, oldPath, newPath });

    const item = await this.repo.findOne({
      where: { root, employeeNumber, path: oldPath } as any,
    });

    if (!item) {
      this.logStep(fn, 'item NOT found -> return null');
      return null;
    }

    item.path = this.normPath(newPath);
    item.parentPath = this.parentOf(item.path);
    item.name = this.nameOf(item.path);
    item.s3Key =
      item.type === 'folder'
        ? this.buildTenantS3Key(root, employeeNumber, item.path, true)
        : this.buildTenantS3Key(root, employeeNumber, item.path, false);

    const saved = await this.repo.save(item);

    this.logStep(fn, 'saved', {
      id: saved.id,
      path: saved.path,
      parentPath: saved.parentPath,
      name: saved.name,
      s3Key: saved.s3Key,
      type: saved.type,
    });

    return saved;
  }

  /**
   * Cascade update for folders:
   * - updates folder itself (oldPrefix -> newPrefix)
   * - updates every descendant where path LIKE oldPrefix/% (BD is source of truth)
   */
  private async cascadeUpdatePrefix(
    root: string,
    employeeNumber: string | null,
    oldPrefix: string,
    newPrefix: string,
  ) {
    const fn = 'cascadeUpdatePrefix';
    this.logCtx(fn, { root, employeeNumber, oldPrefix, newPrefix });

    const oldP = this.normPath(oldPrefix);
    const newP = this.normPath(newPrefix);

    const affected = await this.repo.find({
      where: [
        { root, employeeNumber, path: oldP } as any,
        { root, employeeNumber, path: Like(`${oldP}/%`) } as any,
      ],
    });

    this.logStep(fn, 'affected found', { count: affected.length, oldP, newP });

    for (const row of affected) {
      const current = this.normPath(row.path);

      if (current === oldP) {
        row.path = newP;
      } else if (current.startsWith(`${oldP}/`)) {
        row.path = `${newP}/${current.slice(oldP.length + 1)}`;
      }

      row.parentPath = this.parentOf(row.path);
      row.name = this.nameOf(row.path);
      row.s3Key =
        row.type === 'folder'
          ? this.buildTenantS3Key(root, employeeNumber, row.path, true)
          : this.buildTenantS3Key(root, employeeNumber, row.path, false);
    }

    if (affected.length) {
      await this.repo.save(affected);
      this.logStep(fn, 'saved affected rows', { count: affected.length });
    } else {
      this.logStep(fn, 'no affected rows to save');
    }

    return affected.length;
  }

  // ---------------------------------------------------------------------------
  // Explorer READ (DB = source of truth)
  // ---------------------------------------------------------------------------

  async list(dto: ListFolderDto): Promise<any> {
    const fn = 'list';
    this.logCtx(fn, dto as any);

    try {
      const root = this.normRoot(dto.root);
      const path = this.normPath(dto.path);
      const employeeNumber = dto.employeeNumber ?? null;

      this.logStep(fn, 'normalized', { root, path, employeeNumber });

      const sortBy = (dto.sortBy ?? 'name') as
        | 'name'
        | 'type'
        | 'size'
        | 'createdAt'
        | 'updatedAt';

      const order =
        (dto.order ?? 'asc').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

      this.logStep(fn, 'query', { sortBy, order });

      const items = await this.repo.find({
        where: { root, parentPath: path, employeeNumber } as any,
        order: { [sortBy]: order } as any,
      });

      this.logStep(fn, 'result', { total: items.length, sample: items.slice(0, 2).map(i => ({ id: i.id, path: i.path, type: i.type, parentPath: i.parentPath })) });

      return {
        success: true,
        root,
        path,
        total: items.length,
        items,
      };
    } catch (e: any) {
      this.logErr(fn, e);
      throw e;
    }
  }

  async tree(root = 'nova-s3', employeeNumber?: string): Promise<NovaS3TreeResponseDto> {
    const fn = 'tree';
    this.logCtx(fn, { root, employeeNumber });

    try {
      const r = this.normRoot(root);
      const emp = employeeNumber ?? null;

      this.logStep(fn, 'normalized', { root: r, employeeNumber: emp });

      const all = await this.repo.find({
        where: { root: r, employeeNumber: emp } as any,
        order: { type: 'ASC', name: 'ASC' } as any,
      });

      this.logStep(fn, 'db rows', { count: all.length, sample: all.slice(0, 3).map(x => ({ path: x.path, parentPath: x.parentPath, type: x.type })) });

      const folderMap = new Map<string, NovaS3TreeItemDto>();
      const childrenMap = new Map<string, NovaS3TreeItemDto[]>();
      childrenMap.set('', []);

      for (const row of all) {
        const node: NovaS3TreeItemDto = {
          name: row.name,
          path: row.path,
          type: row.type === 'folder' ? 'folder' : 'file',
          size: row.size ?? undefined,
          lastModified: row.updatedAt ?? undefined,
          children: row.type === 'folder' ? [] : undefined,
        };

        const parent = row.parentPath ?? '';
        if (!childrenMap.has(parent)) childrenMap.set(parent, []);
        childrenMap.get(parent)!.push(node);

        if (row.type === 'folder') folderMap.set(row.path, node);
      }

      for (const [p, folderNode] of folderMap.entries()) {
        folderNode.children = childrenMap.get(p) ?? [];
      }

      const rootChildren = childrenMap.get('') ?? [];

      this.logStep(fn, 'tree built', {
        rootFolders: rootChildren.filter((x) => x.type === 'folder').length,
        rootFiles: rootChildren.filter((x) => x.type === 'file').length,
      });

      return {
        success: true,
        root: {
          name: r,
          path: '',
          type: 'folder',
          children: rootChildren.filter((x) => x.type === 'folder'),
        },
        files: rootChildren.filter((x) => x.type === 'file'),
      };
    } catch (e: any) {
      this.logErr(fn, e);
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // CREATE FOLDER (DB source of truth + S3 storage marker optional)
  // ---------------------------------------------------------------------------

  async createFolder(dto: CreateFolderDto): Promise<NovaS3OperationResponseDto> {
    const fn = 'createFolder';
    this.logCtx(fn, dto as any);

    try {
      const root = this.normRoot(dto.root);
      const path = this.normPath(dto.path);
      const name = this.relFromOriginalName(dto.name || '');
      const emp = dto.employeeNumber ?? null;

      this.logStep(fn, 'normalized', { root, path, name, emp });

      if (!name) throw new BadRequestException('name is required');

      await this.ensureFolderChain(root, path, emp);

      const finalPath = this.joinPath(path, name);
      this.logStep(fn, 'finalPath', { finalPath });

      await this.ensureFolderChain(root, finalPath, emp);

      const baseFolder = this.s3BaseFolder(root, emp);
      this.logStep(fn, 's3 baseFolder', { baseFolder });

      const raw = await this.storage.createFolderMarker(baseFolder, finalPath);
      this.logStep(fn, 'storage raw', raw);

      const s3Key = this.buildTenantS3Key(root, emp, finalPath, true);
      this.logStep(fn, 'computed s3Key', { s3Key });

      return this.toOpResponse({
        ...raw,
        finalPath,
        s3Key,
        message: raw?.message ?? 'Folder created',
      });
    } catch (e: any) {
      this.logErr(fn, e);
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // UPLOADS (S3 storage + DB source of truth)
  // ---------------------------------------------------------------------------

  async uploadOne(ctx: UploadCtx, file: Express.Multer.File): Promise<NovaS3OperationResponseDto> {
    const fn = 'uploadOne';
    this.logCtx(fn, {
      ctx,
      file: { originalname: file?.originalname, mimetype: file?.mimetype, size: file?.size },
    });

    try {
      const root = this.normRoot(ctx.root);
      const path = this.normPath(ctx.path);
      const emp = ctx.employeeNumber ?? null;

      this.logStep(fn, 'normalized', { root, path, emp });

      await this.ensureFolderChain(root, path, emp);

      const relative = path ? `${path}/${file.originalname}` : file.originalname;
      const relClean = this.relFromOriginalName(relative);

      this.logStep(fn, 'computed rel', { relative, relClean, parentPath: this.parentOf(relClean) });

      await this.ensureFolderChain(root, this.parentOf(relClean), emp);

      const baseFolder = this.s3BaseFolder(root, emp);
      this.logStep(fn, 's3 baseFolder', { baseFolder });

      const raw = await this.storage.uploadFileGeneral(file.buffer, relClean, file.mimetype, baseFolder);
      this.logStep(fn, 'storage raw', raw);

      const s3Key = this.buildTenantS3Key(root, emp, relClean, false);
      this.logStep(fn, 'computed s3Key', { s3Key });

      await this.repo.upsert(
        [
          {
            root,
            path: relClean,
            parentPath: this.parentOf(relClean),
            name: this.nameOf(relClean),
            type: 'file',
            s3Key,
            employeeNumber: emp,
            size: file.size ?? null,
            mimeType: file.mimetype ?? null,
            meta: { op: 'uploadOne', ctxPath: path },
          } as any,
        ],
        ['root', 'employeeNumber', 'path'] as any,
      );

      this.logStep(fn, 'DB upsert OK', {
        path: relClean,
        parentPath: this.parentOf(relClean),
        name: this.nameOf(relClean),
        employeeNumber: emp,
      });

      return this.toOpResponse({
        ...raw,
        path: relClean,
        s3Key,
        message: raw?.message ?? 'Uploaded',
      });
    } catch (e: any) {
      this.logErr(fn, e);
      throw e;
    }
  }

  async uploadMultiple(ctx: UploadCtx, files: Express.Multer.File[]): Promise<NovaS3OperationResponseDto> {
    const fn = 'uploadMultiple';
    this.logCtx(fn, {
      ctx,
      files: (files ?? []).slice(0, 3).map(f => ({ originalname: f.originalname, mimetype: f.mimetype, size: f.size })),
      filesCount: files?.length ?? 0,
    });

    try {
      const root = this.normRoot(ctx.root);
      const path = this.normPath(ctx.path);
      const emp = ctx.employeeNumber ?? null;

      this.logStep(fn, 'normalized', { root, path, emp });

      await this.ensureFolderChain(root, path, emp);

      const baseFolder = this.s3BaseFolder(root, emp);
      this.logStep(fn, 's3 baseFolder', { baseFolder });

      const desiredRel = files.map((f) =>
        this.relFromOriginalName(path ? `${path}/${f.originalname}` : f.originalname),
      );

      this.logStep(fn, 'desiredRel', { count: desiredRel.length, sample: desiredRel.slice(0, 5) });

      const folderCache = new Set<string>();
      await this.ensureFolderChainCached(root, path, emp, folderCache);

      const raw = await this.storage.uploadMultipleFiles(files, baseFolder, desiredRel);
      this.logStep(fn, 'storage raw', raw);

      const okSet = new Set<string>(
        ((raw as any)?.results || [])
          .map((r: any) => this.relativeFromS3Key(baseFolder, r?.key))
          .filter(Boolean),
      );

      this.logStep(fn, 'okSet', { size: okSet.size, sample: Array.from(okSet).slice(0, 5) });

      const rows: Partial<NovaS3>[] = [];
      for (let i = 0; i < files.length; i++) {
        const rel = desiredRel[i];

        if (okSet.size && !okSet.has(rel)) {
          this.logStep(fn, 'SKIP not in okSet', { rel });
          continue;
        }

        await this.ensureFolderChainCached(root, this.parentOf(rel), emp, folderCache);

        rows.push({
          root,
          path: rel,
          parentPath: this.parentOf(rel),
          name: this.nameOf(rel),
          type: 'file' as any,
          s3Key: this.buildTenantS3Key(root, emp, rel, false),
          employeeNumber: emp as any,
          size: files[i].size ?? null,
          mimeType: files[i].mimetype ?? null,
          meta: { op: 'uploadMultiple', ctxPath: path },
        } as any);
      }

      this.logStep(fn, 'rows to upsert', { count: rows.length, sample: rows.slice(0, 3).map(r => ({ path: r.path, parentPath: r.parentPath })) });

      if (rows.length) await this.upsertFiles(rows);

      return this.toOpResponse({
        ...raw,
        count: rows.length,
        message: raw?.message ?? `Uploaded ${rows.length} files`,
      });
    } catch (e: any) {
      this.logErr(fn, e);
      throw e;
    }
  }

  async uploadFolder(ctx: UploadFolderCtx, files: Express.Multer.File[]): Promise<NovaS3OperationResponseDto> {
    const fn = 'uploadFolder';
    this.logCtx(fn, {
      ctx,
      filesCount: files?.length ?? 0,
      filesSample: (files ?? []).slice(0, 3).map(f => ({ originalname: f.originalname, size: f.size })),
    });

    try {
      const root = this.normRoot(ctx.root);
      const basePath = this.normPath(ctx.basePath);
      const emp = ctx.employeeNumber ?? null;

      this.logStep(fn, 'normalized', { root, basePath, emp });

      const parsedPaths = this.parsePathsInput(ctx.paths);

      const incomingRel = parsedPaths?.length
        ? parsedPaths.map((p) => this.relFromOriginalName(p))
        : files.map((f) => this.relFromOriginalName(f.originalname));

      this.logStep(fn, 'incomingRel', { count: incomingRel.length, sample: incomingRel.slice(0, 5) });

      if (incomingRel.length !== files.length) {
        this.logStep(fn, 'paths length mismatch', { incoming: incomingRel.length, files: files.length });
        throw new BadRequestException('paths[] length must match files[] length');
      }
      if (incomingRel.some((p) => !p)) throw new BadRequestException('Invalid file path(s)');

      const desiredRel = incomingRel.map((p) => (basePath ? this.joinPath(basePath, p) : p));
      this.logStep(fn, 'desiredRel', { count: desiredRel.length, sample: desiredRel.slice(0, 5) });

      const folderCache = new Set<string>();
      for (const rel of desiredRel) {
        await this.ensureFolderChainCached(root, this.parentOf(rel), emp, folderCache);
      }
      this.logStep(fn, 'folderCache size', { size: folderCache.size });

      const baseFolder = this.s3BaseFolder(root, emp);
      this.logStep(fn, 's3 baseFolder', { baseFolder });

      const raw = await this.storage.uploadMultipleFiles(files, baseFolder, desiredRel);
      this.logStep(fn, 'storage raw', raw);

      const okSet = new Set<string>(
        ((raw as any)?.results || [])
          .map((r: any) => this.relativeFromS3Key(baseFolder, r?.key))
          .filter(Boolean),
      );

      this.logStep(fn, 'okSet', { size: okSet.size, sample: Array.from(okSet).slice(0, 5) });

      const rows: Partial<NovaS3>[] = [];
      for (let i = 0; i < files.length; i++) {
        const rel = desiredRel[i];
        if (okSet.size && !okSet.has(rel)) {
          this.logStep(fn, 'SKIP not in okSet', { rel });
          continue;
        }

        rows.push({
          root,
          path: rel,
          parentPath: this.parentOf(rel),
          name: this.nameOf(rel),
          type: 'file' as any,
          s3Key: this.buildTenantS3Key(root, emp, rel, false),
          employeeNumber: emp as any,
          size: files[i].size ?? null,
          mimeType: files[i].mimetype ?? null,
          meta: { op: 'uploadFolder', basePath },
        } as any);
      }

      this.logStep(fn, 'rows to upsert', { count: rows.length, sample: rows.slice(0, 3).map(r => ({ path: r.path, parentPath: r.parentPath })) });

      if (rows.length) await this.upsertFiles(rows);

      return this.toOpResponse({
        ...raw,
        count: rows.length,
        message: raw?.message ?? `Uploaded folder (${rows.length} files)`,
      });
    } catch (e: any) {
      this.logErr(fn, e);
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // RENAME / MOVE / DELETE (BD source of truth + S3 sync)
  // ---------------------------------------------------------------------------

  async rename(dto: RenameDto): Promise<NovaS3OperationResponseDto> {
    const fn = 'rename';
    this.logCtx(fn, dto as any);

    try {
      const root = this.normRoot(dto.root);
      const oldPath = this.normPath(dto.oldPath);
      const newName = this.relFromOriginalName(dto.newName || '');
      const emp = dto.employeeNumber ?? null;

      this.logStep(fn, 'normalized', { root, oldPath, newName, emp });

      if (!oldPath) throw new BadRequestException('oldPath is required');
      if (!newName) throw new BadRequestException('newName is required');

      const existing = await this.repo.findOne({
        where: { root, employeeNumber: emp, path: oldPath } as any,
      });
      if (!existing) throw new BadRequestException('Item not found in DB');

      this.logStep(fn, 'existing', { id: existing.id, type: existing.type, path: existing.path });

      const parent = this.parentOf(oldPath);
      const newPath = parent ? this.joinPath(parent, newName) : newName;

      this.logStep(fn, 'computed newPath', { parent, newPath });

      const baseFolder = this.s3BaseFolder(root, emp);
      this.logStep(fn, 's3 baseFolder', { baseFolder });

      if (existing.type === 'folder') {
        const raw = await this.storage.movePrefix(baseFolder, oldPath, newPath);
        this.logStep(fn, 'storage raw (folder)', raw);

        const changed = await this.cascadeUpdatePrefix(root, emp, oldPath, newPath);
        this.logStep(fn, 'cascade updated', { changed });

        return this.toOpResponse({
          ...raw,
          oldPath,
          newPath,
          updated: changed,
          message: raw?.message ?? 'Renamed folder',
        });
      }

      const raw = await this.storage.renameFile(baseFolder, oldPath, newPath);
      this.logStep(fn, 'storage raw (file)', raw);

      await this.updateOnePath(root, emp, oldPath, newPath);

      return this.toOpResponse({
        ...raw,
        oldPath,
        newPath,
        message: raw?.message ?? 'Renamed file',
      });
    } catch (e: any) {
      this.logErr(fn, e);
      throw e;
    }
  }

  async moveFile(dto: MoveFileDto): Promise<NovaS3OperationResponseDto> {
    const fn = 'moveFile';
    this.logCtx(fn, dto as any);

    try {
      const root = this.normRoot(dto.root);
      const sourcePath = this.normPath(dto.sourcePath);
      const targetPath = this.normPath(dto.targetPath);
      const emp = dto.employeeNumber ?? null;

      this.logStep(fn, 'normalized', { root, sourcePath, targetPath, emp });

      if (!sourcePath) throw new BadRequestException('sourcePath is required');

      const existing = await this.repo.findOne({
        where: { root, employeeNumber: emp, path: sourcePath } as any,
      });
      if (!existing) throw new BadRequestException('File not found in DB');
      if (existing.type !== 'file') throw new BadRequestException('sourcePath is not a file');

      this.logStep(fn, 'existing', { id: existing.id, path: existing.path });

      await this.ensureFolderChain(root, targetPath, emp);

      const fileName = this.nameOf(sourcePath);
      const newPath = targetPath ? this.joinPath(targetPath, fileName) : fileName;

      this.logStep(fn, 'computed newPath', { fileName, newPath });

      const baseFolder = this.s3BaseFolder(root, emp);
      this.logStep(fn, 's3 baseFolder', { baseFolder });

      const raw = await this.storage.moveFile(baseFolder, sourcePath, newPath);
      this.logStep(fn, 'storage raw', raw);

      await this.updateOnePath(root, emp, sourcePath, newPath);

      return this.toOpResponse({
        ...raw,
        oldPath: sourcePath,
        newPath,
        message: raw?.message ?? 'Moved file',
      });
    } catch (e: any) {
      this.logErr(fn, e);
      throw e;
    }
  }

  async moveFolder(dto: MoveFolderDto): Promise<NovaS3OperationResponseDto> {
    const fn = 'moveFolder';
    this.logCtx(fn, dto as any);

    try {
      const root = this.normRoot(dto.root);
      const sourcePath = this.normPath(dto.sourcePath);
      const targetPath = this.normPath(dto.targetPath);
      const emp = dto.employeeNumber ?? null;

      this.logStep(fn, 'normalized', { root, sourcePath, targetPath, emp });

      if (!sourcePath) throw new BadRequestException('sourcePath is required');

      const existing = await this.repo.findOne({
        where: { root, employeeNumber: emp, path: sourcePath } as any,
      });
      if (!existing) throw new BadRequestException('Folder not found in DB');
      if (existing.type !== 'folder') throw new BadRequestException('sourcePath is not a folder');

      this.logStep(fn, 'existing', { id: existing.id, path: existing.path });

      const folderName = this.nameOf(sourcePath);
      const newPrefix = targetPath ? this.joinPath(targetPath, folderName) : folderName;

      this.logStep(fn, 'computed newPrefix', { folderName, newPrefix });

      await this.ensureFolderChain(root, this.parentOf(newPrefix), emp);

      const baseFolder = this.s3BaseFolder(root, emp);
      this.logStep(fn, 's3 baseFolder', { baseFolder });

      const raw = await this.storage.movePrefix(baseFolder, sourcePath, newPrefix);
      this.logStep(fn, 'storage raw', raw);

      const changed = await this.cascadeUpdatePrefix(root, emp, sourcePath, newPrefix);
      this.logStep(fn, 'cascade updated', { changed });

      return this.toOpResponse({
        ...raw,
        oldPath: sourcePath,
        newPath: newPrefix,
        updated: changed,
        message: raw?.message ?? 'Moved folder',
      });
    } catch (e: any) {
      this.logErr(fn, e);
      throw e;
    }
  }

  async remove(dto: DeleteDto): Promise<NovaS3OperationResponseDto> {
    const fn = 'remove';
    this.logCtx(fn, dto as any);

    try {
      const root = this.normRoot(dto.root);
      const rel = this.normPath(dto.path);
      const emp = dto.employeeNumber ?? null;

      this.logStep(fn, 'normalized', { root, rel, emp, kind: dto.kind });

      if (!rel) throw new BadRequestException('path is required');

      const existing = await this.repo.findOne({
        where: { root, employeeNumber: emp, path: rel } as any,
      });
      if (!existing) throw new BadRequestException('Item not found in DB');

      this.logStep(fn, 'existing', { id: existing.id, type: existing.type, path: existing.path });

      const baseFolder = this.s3BaseFolder(root, emp);
      this.logStep(fn, 's3 baseFolder', { baseFolder });

      if (dto.kind === 'folder') {
        const raw = await this.storage.deletePrefix(baseFolder, rel);
        this.logStep(fn, 'storage raw (folder)', raw);

        const del = await this.repo.delete([
          { root, employeeNumber: emp, path: rel } as any,
          { root, employeeNumber: emp, path: Like(`${rel}/%`) } as any,
        ]);

        this.logStep(fn, 'db delete (folder)', { affected: del.affected ?? 0 });

        return this.toOpResponse({
          ...raw,
          deletedCount: del.affected ?? 0,
          message: raw?.message ?? 'Deleted folder',
        });
      }

      const raw = await this.storage.deleteObject(baseFolder, rel);
      this.logStep(fn, 'storage raw (file)', raw);

      const del = await this.repo.delete({ root, employeeNumber: emp, path: rel } as any);
      this.logStep(fn, 'db delete (file)', { affected: del.affected ?? 0 });

      return this.toOpResponse({
        ...raw,
        deletedCount: del.affected ?? 0,
        message: raw?.message ?? 'Deleted file',
      });
    } catch (e: any) {
      this.logErr(fn, e);
      throw e;
    }
  }

  private relativeFromS3Key(baseFolder: string, key?: string | null) {
    const fn = 'relativeFromS3Key';
    this.logStep(fn, 'input', { baseFolder, key });

    const k = String(key ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!k) return '';

    const base = String(baseFolder ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
    const prefix = base ? `${base}/` : '';

    if (prefix && k.startsWith(prefix)) {
      const out = this.normPath(k.slice(prefix.length));
      this.logStep(fn, 'computed (strip base)', { out });
      return out;
    }

    const out = this.normPath(k);
    this.logStep(fn, 'computed (already relative)', { out });
    return out;
  }

  async getFileUrl(dto: { root: string; path: string; employeeNumber: string; expiresSeconds?: number }) {
    const fn = 'getFileUrl';
    this.logCtx(fn, dto as any);

    const root = this.normRoot(dto.root);
    const rel = this.normPath(dto.path);
    const emp = (dto.employeeNumber ?? '').trim();

    if (!emp) throw new BadRequestException('employeeNumber is required');
    if (!rel) throw new BadRequestException('path is required');

    // (Opcional, pero recomendado) Validar que exista en DB y que sea file
    const row = await this.repo.findOne({
      where: { root, employeeNumber: emp, path: rel, type: 'file' } as any,
    });
    if (!row) throw new BadRequestException('File not found in DB');

    const baseFolder = this.s3BaseFolder(root, emp);
    const exp = dto.expiresSeconds ?? 60 * 5;

    const signed = await this.storage.presignedGetUrl(baseFolder, rel, exp);
    if (!signed?.success || !signed?.url) {
      throw new BadRequestException(signed?.error ?? 'Failed to generate presigned url');
    }

    return { success: true, url: signed.url, key: signed.key, expiresSeconds: exp };
  }

}


