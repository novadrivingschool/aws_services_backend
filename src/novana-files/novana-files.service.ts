/* src/novana-files/novana-files.service.ts
 *
 * Almacenamiento de adjuntos de NOVANA. Tiene su propio cliente S3 a
 * propósito: este módulo no debe heredar nada de `S3Service`, cuyos métodos
 * aceptan carpeta y nombre de archivo elegidos por el cliente.
 *
 * Lee del entorno las mismas credenciales que el servicio ya necesita para
 * arrancar (BUCKET / REGION / ACCESS_KEY / SECRET_ACCESS_KEY) — no introduce
 * configuración nueva.
 */
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  AllowedMimeType,
  INLINE_SAFE_MIME_TYPES,
  MAX_SIZE_BY_MIME,
  POLICY_SUMMARY,
  SIGNED_URL_TTL_SECONDS,
} from './novana-files.constants';
import { declaredTypeMatches, detectMimeType } from './utils/file-signature.util';
import {
  buildObjectKey,
  extensionOf,
  isLegalNovanaKey,
  keyBelongsToTask,
  NovanaKeyParts,
} from './utils/novana-key.util';

export interface UploadedAttachment {
  success: true;
  key: string;
  mimeType: AllowedMimeType;
  size: number;
  /** Nombre original, solo para pintarlo en la UI. Nunca se usa para decidir nada. */
  name: string;
}

export interface SignedAttachmentUrl {
  success: true;
  url: string;
  expiresIn: number;
}

/** MIME servido para un objeto guardado, derivado de su extensión — nunca de los metadatos de S3. */
const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10;

@Injectable()
export class NovanaFilesService {
  private readonly logger = new Logger(NovanaFilesService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const bucket = this.config.get<string>('BUCKET');
    if (!bucket) {
      throw new Error('S3 bucket name (BUCKET) is not defined in environment variables');
    }
    this.bucket = bucket;

    const region = this.config.get<string>('REGION');
    const accessKeyId = this.config.get<string>('ACCESS_KEY');
    const secretAccessKey = this.config.get<string>('SECRET_ACCESS_KEY');

    if (!region || !accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials (REGION / ACCESS_KEY / SECRET_ACCESS_KEY) are incomplete');
    }

    this.s3 = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  }

  // ─── Subida ──────────────────────────────────────────────────────────────

  /**
   * Valida y guarda un adjunto.
   *
   * `parts` ya viene resuelto por `resolveUploadTarget` (controller): o es un
   * comentario de tarea (legado, `area: 'comments'`) o es un adjunto del
   * propio registro — tarea, proyecto o borrador (`area: 'files'`). Este
   * método no conoce esa distinción de negocio, solo construye la clave a
   * partir de `parts`.
   *
   * El orden importa: el tipo se decide desde los BYTES antes de comprobar el
   * tamaño, porque el tope depende del tipo real. Un archivo de 50 MB que dice
   * ser PNG hay que rechazarlo como PNG demasiado grande, no aceptarlo como
   * vídeo.
   */
  async upload(
    file: Express.Multer.File,
    parts: NovanaKeyParts,
    actor = 'unknown',
  ): Promise<UploadedAttachment> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('File is required');
    }

    // 1. ¿Qué es, en realidad?
    const detected = detectMimeType(file.buffer);
    if (!detected) {
      this.logger.warn(
        `Rejected upload from ${actor}: content did not match any allowed format ` +
          `(declared="${file.mimetype}", name="${file.originalname}")`,
      );
      throw new BadRequestException(
        `"${file.originalname}" is not a supported file. Its contents do not match a ` +
          `permitted format — renaming a file does not change its type. ${POLICY_SUMMARY}`,
      );
    }

    // Una discrepancia merece una línea de log (es la firma de un archivo
    // renombrado) pero no un rechazo: el tipo detectado es sobre el que se actúa.
    if (!declaredTypeMatches(file.mimetype, detected)) {
      this.logger.warn(
        `Type mismatch from ${actor}: declared="${file.mimetype}" detected="${detected}" ` +
          `name="${file.originalname}" — storing as "${detected}"`,
      );
    }

    // 2. Tope por tipo, contra el tipo detectado.
    const limit = MAX_SIZE_BY_MIME[detected];
    if (file.size > limit) {
      throw new PayloadTooLargeException(
        `"${file.originalname}" is ${mb(file.size)} MB. The limit for this kind of file ` +
          `is ${mb(limit)} MB.`,
      );
    }

    // 3. La clave se construye aquí — el nombre del cliente nunca llega a S3.
    const key = buildObjectKey(parts, detected);

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          // El tipo DETECTADO, no el declarado. Eso es lo que hace seguro
          // servir estos objetos en línea después.
          ContentType: detected,
          ContentDisposition: `inline; filename="${key.split('/').pop()}"`,
          ServerSideEncryption: 'AES256',
          Metadata: {
            'scope-kind': parts.scopeKind,
            'scope-id': parts.scopeId,
            'uploaded-by': actor,
            // Solo para forense; nunca se usa para decidir nada.
            'original-name': encodeURIComponent(file.originalname).slice(0, 512),
          },
        }),
      );
    } catch (err) {
      this.logger.error(
        `S3 put failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new InternalServerErrorException('Failed to store the attachment');
    }

    this.logger.log(
      `Stored ${key} (${detected}, ${mb(file.size)} MB) for ${parts.scopeKind} ${parts.scopeId} ` +
        `by ${actor}`,
    );

    return {
      success: true,
      key,
      mimeType: detected,
      size: file.size,
      name: file.originalname,
    };
  }

  // ─── Lectura ─────────────────────────────────────────────────────────────

  /**
   * URL firmada de vida corta.
   *
   * `ResponseContentType` / `ResponseContentDisposition` se fijan en la URL
   * para que S3 sirva lo que decidimos NOSOTROS y no los metadatos guardados
   * en el objeto.
   */
  async getSignedUrl(key: string, taskUuid?: string): Promise<SignedAttachmentUrl> {
    this.assertAccessible(key, taskUuid);

    // Firmar es criptografía local: funciona incluso para un objeto que no
    // existe, y entonces el navegador enseña una imagen en blanco sin
    // explicación. Un HEAD convierte ese fallo silencioso en un 404 accionable.
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404 || status === 403) {
        this.logger.warn(`Attachment is not in the bucket: ${key}`);
        throw new NotFoundException(
          'This attachment is no longer stored. The record still references it, but the file ' +
            'is not in the bucket.',
        );
      }
      this.logger.error(`HEAD failed for ${key}: ${err instanceof Error ? err.message : err}`);
      throw new InternalServerErrorException('Failed to read the attachment');
    }

    const contentType = MIME_BY_EXTENSION[extensionOf(key)] ?? 'application/octet-stream';
    const disposition = INLINE_SAFE_MIME_TYPES.includes(contentType) ? 'inline' : 'attachment';
    const filename = this.safeFilename(key);

    try {
      const url = await getSignedUrl(
        this.s3,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentType: contentType,
          ResponseContentDisposition: `${disposition}; filename="${filename}"`,
        }),
        { expiresIn: SIGNED_URL_TTL_SECONDS },
      );

      return { success: true, url, expiresIn: SIGNED_URL_TTL_SECONDS };
    } catch (err) {
      this.logger.error(`Failed to sign ${key}: ${err instanceof Error ? err.message : String(err)}`);
      throw new InternalServerErrorException('Failed to generate the attachment URL');
    }
  }

  // ─── Borrado ─────────────────────────────────────────────────────────────

  async remove(key: string, taskUuid?: string, actor = 'unknown'): Promise<{ success: true }> {
    this.assertAccessible(key, taskUuid);

    try {
      // HEAD primero para que borrar algo que no está sea un 404 y no un éxito
      // silencioso — el camino de rollback de la UI depende de saberlo.
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404 || status === 403) {
        throw new NotFoundException('Attachment not found');
      }
      this.logger.error(`HEAD failed for ${key}: ${err instanceof Error ? err.message : err}`);
      throw new InternalServerErrorException('Failed to delete the attachment');
    }

    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      this.logger.error(`DELETE failed for ${key}: ${err instanceof Error ? err.message : err}`);
      throw new InternalServerErrorException('Failed to delete the attachment');
    }

    this.logger.log(`Deleted ${key} by ${actor}`);
    return { success: true };
  }

  // ─── Internos ────────────────────────────────────────────────────────────

  /**
   * Único punto de estrangulamiento de lectura/borrado.
   *
   * Sin `taskUuid`: solo exige que `key` encaje en una de las formas
   * legales de NOVANA (impide traversal y lecturas fuera de este módulo).
   * Comprobar que el adjunto es de verdad del registro que lo pide —es decir,
   * que esa clave está en la lista de adjuntos guardados de ESE registro— es
   * responsabilidad de quien conoce esa lista: `it_backend`, no este backend.
   *
   * Con `taskUuid`: además exige que la clave sea de esa tarea, igual que
   * antes de que existieran los ámbitos de proyecto/borrador — así el cliente
   * de comentarios que ya existe no cambia de comportamiento.
   */
  private assertAccessible(key: string, taskUuid?: string): void {
    if (!isLegalNovanaKey(key)) {
      this.logger.warn(`Blocked malformed key "${key}"`);
      throw new BadRequestException('The requested key is not a valid NOVANA attachment key');
    }
    if (taskUuid !== undefined && !keyBelongsToTask(key, taskUuid)) {
      this.logger.warn(`Blocked out-of-scope key "${key}" for task ${taskUuid}`);
      throw new BadRequestException('The requested file does not belong to this task');
    }
  }

  /** Nombre ASCII y sin comillas, para que no se pueda romper la cabecera. */
  private safeFilename(key: string): string {
    const raw = key.split('/').pop() ?? 'attachment';
    const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, '_');
    return cleaned.slice(0, 120) || 'attachment';
  }
}
