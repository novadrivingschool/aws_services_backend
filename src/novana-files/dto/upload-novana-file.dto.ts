/* src/novana-files/dto/upload-novana-file.dto.ts */
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { SCOPE_AREAS, SCOPE_KINDS, ScopeArea, ScopeKind } from '../novana-files.constants';

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
   * Ámbito al que se adjunta el archivo: el PROPIO registro (tarea, subtarea,
   * proyecto o borrador) o, combinado con `scopeArea: 'comments'`, el hilo de
   * comentarios de ese registro (solo task/subtask — ver `scopeArea`, abajo).
   * Lista cerrada — un valor fuera de ella nunca llega a construir una ruta,
   * se rechaza en la validación del DTO.
   */
  @IsOptional()
  @IsIn(SCOPE_KINDS)
  scopeKind?: ScopeKind;

  /**
   * uuid del registro (tarea/subtarea/proyecto) o de la sesión de creación
   * (borrador). v4 porque así los genera siempre el cliente que abre el
   * diálogo de alta.
   */
  @IsOptional()
  @IsUUID('4')
  scopeId?: string;

  /**
   * Área dentro de `scopeKind`: `'files'` (adjunto del propio registro) o
   * `'comments'` (adjunto de su hilo). OPCIONAL — por defecto `'files'`, así
   * que un cliente que nunca manda este campo (todo el mundo hoy, incluido el
   * frontend de comentarios de tarea en producción, que usa el modo legado de
   * `taskUuid` y ni siquiera pasa por esta rama) se comporta exactamente
   * igual que antes de que existiera.
   *
   * Solo tiene efecto junto a `scopeKind`+`scopeId`. La combinación concreta
   * — `'comments'` únicamente vale con `scopeKind` `task` o `subtask` — la
   * valida `resolveUploadTarget` (`utils/novana-key.util.ts`) contra
   * `SCOPE_KIND_AREAS`, no este DTO: aquí solo se comprueba que el VALOR es
   * uno de los dos legales.
   */
  @IsOptional()
  @IsIn(SCOPE_AREAS)
  scopeArea?: ScopeArea;

  /** Número de empleado, para los metadatos de S3 y el log. Solo auditoría. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  uploadedBy?: string;
}
