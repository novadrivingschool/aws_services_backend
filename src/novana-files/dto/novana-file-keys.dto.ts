/* src/novana-files/dto/novana-file-keys.dto.ts */
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsString, MaxLength } from 'class-validator';

/**
 * Lote de claves a borrar. El tope (50) es holgado para lo que necesita
 * NOVANA —un comentario admite 5 adjuntos, un registro 10— y evita que una
 * llamada mal formada vacíe media carpeta de golpe.
 */
export class NovanaFileKeysDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(512, { each: true })
  keys!: string[];
}
