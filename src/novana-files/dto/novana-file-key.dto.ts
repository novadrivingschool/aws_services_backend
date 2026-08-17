/* src/novana-files/dto/novana-file-key.dto.ts */
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Parámetros para leer o borrar un adjunto existente.
 *
 * `key` es obligatoria y se valida contra las cuatro formas legales de clave
 * (`isLegalNovanaKey`, en `utils/novana-key.util.ts`) — eso es lo único que
 * garantiza que la clave es de NOVANA y no un intento de path traversal o de
 * leer/borrar algo fuera de este módulo.
 *
 * `taskUuid` es OPCIONAL. Si llega, además se exige que la clave sea de esa
 * tarea (comportamiento de hoy, para no romper al cliente de comentarios que
 * ya está en producción).
 *
 * Sin `taskUuid`, cualquier clave de NOVANA bien formada pasa esta capa:
 * comprobar que el adjunto es de verdad del registro concreto que lo pide
 * (que esa clave está en la lista de adjuntos guardados de ESE registro) es
 * responsabilidad de `it_backend`, que es quien conoce esa lista — aquí solo
 * se valida la FORMA de la clave.
 */
export class NovanaFileKeyDto {
  @IsOptional()
  @IsUUID()
  taskUuid?: string;

  @IsString()
  @MaxLength(512)
  key!: string;
}
