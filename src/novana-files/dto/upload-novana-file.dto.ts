/* src/novana-files/dto/upload-novana-file.dto.ts */
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { SCOPE_KINDS, ScopeKind } from '../novana-files.constants';

/**
 * Campos multipart que acompañan al archivo.
 *
 * No hay campo `folder` libre: el destino se deriva SIEMPRE de `taskUuid`
 * (comentario de una tarea, comportamiento legado) o del par
 * `scopeKind`+`scopeId` (adjunto del propio registro). Dejar que el cliente
 * pase una carpeta a mano es justo lo que permitía al endpoint compartido
 * `/s3/upload/general` escribir en cualquier sitio del bucket.
 *
 * Este DTO solo valida la FORMA de cada campo por separado (uuid, valor de
 * la lista cerrada...). La regla de negocio — "scopeKind y scopeId van
 * juntos, o no va ninguno; sin ellos hace falta taskUuid" — vive en
 * `resolveUploadTarget` (`utils/novana-key.util.ts`) para no repetirla aquí
 * y en el controller.
 */
export class UploadNovanaFileDto {
  /**
   * Legado: tarea a cuyo COMENTARIO pertenece el adjunto. Sigue siendo el
   * único campo obligatorio cuando no se manda `scopeKind`/`scopeId`, para no
   * romper al frontend de comentarios ya en producción. Si llegan
   * `scopeKind`+`scopeId`, este campo se ignora aunque venga.
   */
  @IsOptional()
  @IsUUID()
  taskUuid?: string;

  /**
   * Ámbito del PROPIO registro al que se adjunta el archivo (no un
   * comentario). Lista cerrada — un valor fuera de ella nunca llega a
   * construir una ruta, se rechaza en la validación del DTO.
   */
  @IsOptional()
  @IsIn(SCOPE_KINDS)
  scopeKind?: ScopeKind;

  /**
   * uuid del registro (tarea/proyecto) o de la sesión de creación (borrador).
   * v4 porque así los genera siempre el cliente que abre el diálogo de alta.
   */
  @IsOptional()
  @IsUUID('4')
  scopeId?: string;

  /** Número de empleado, para los metadatos de S3 y el log. Solo auditoría. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  uploadedBy?: string;
}
