/* src/novana-files/novana-files.constants.ts
 *
 * Única fuente de verdad de la política de adjuntos de NOVANA.
 *
 * Módulo propio, igual que helpdesk-files: no toca S3Module / S3mktModule /
 * NovaS3Module / CrmS3Module. Cada servicio tiene su ruta de subida, así
 * endurecer la de NOVANA nunca puede romper la de otro.
 *
 * Sobre Office: se aceptan SOLO los formatos OOXML (2007+). Los antiguos
 * .doc/.xls/.ppt son contenedores OLE y comparten firma binaria entre sí, de
 * modo que no se pueden distinguir sin parsear el directorio OLE — y aceptar
 * "un OLE cualquiera" sería exactamente el agujero que este módulo evita.
 */

/** Tipos MIME canónicos que acepta NOVANA. Nada más se almacena. */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/**
 * Topes por tipo, en bytes.
 *
 * Un tope global sería erróneo en las dos direcciones: 8 MB haría imposible
 * grabar 60 s de pantalla, y 100 MB permitiría aparcar un "PNG" de 100 MB en
 * el bucket (y, con memoryStorage, en el heap del proceso).
 */
export const MAX_SIZE_BY_MIME: Record<AllowedMimeType, number> = {
  'image/jpeg': 8 * 1024 * 1024,
  'image/png': 8 * 1024 * 1024,
  'image/gif': 8 * 1024 * 1024,
  'image/webp': 8 * 1024 * 1024,
  'application/pdf': 20 * 1024 * 1024,
  'video/mp4': 100 * 1024 * 1024,
  [DOCX]: 20 * 1024 * 1024,
  [XLSX]: 20 * 1024 * 1024,
  [PPTX]: 20 * 1024 * 1024,
};

/**
 * Techo duro que recibe multer. Multer no puede saber el tipo real hasta que
 * los bytes están en memoria, así que aplica el mayor de los permitidos y el
 * tope exacto por tipo se comprueba después, contra el tipo DETECTADO.
 */
export const MULTER_MAX_FILE_SIZE = Math.max(...Object.values(MAX_SIZE_BY_MIME));

/** Extensión escrita en S3, derivada del tipo detectado (nunca del cliente). */
export const EXTENSION_BY_MIME: Record<AllowedMimeType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  [DOCX]: '.docx',
  [XLSX]: '.xlsx',
  [PPTX]: '.pptx',
};

/** Extensiones aceptadas en el selector de archivos / prefiltro barato. */
export const ALLOWED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.pdf',
  '.mp4',
  '.docx',
  '.xlsx',
  '.pptx',
] as const;

/** Todo objeto de NOVANA vive bajo este prefijo. Se exige al leer y al escribir. */
export const NOVANA_S3_ROOT = 'novana';

/**
 * Subcarpetas de cada ámbito ("scope") de adjunto.
 *
 * `comments` es EXCLUSIVO de `tasks`: solo las tareas tienen comentarios hoy.
 * `files` es el ámbito nuevo — adjuntos del PROPIO registro (tarea, proyecto
 * o borrador), no de sus comentarios — y existe para los tres plurales.
 *
 * `as const` en las dos últimas: sus tipos literales ('comments' / 'files')
 * son los que arman `NovanaKeyArea` en `utils/novana-key.util.ts`, para que
 * ese tipo no pueda desincronizarse del valor real escrito en S3.
 */
export const TASKS_SUBFOLDER = 'tasks';
export const PROJECTS_SUBFOLDER = 'projects';
export const DRAFTS_SUBFOLDER = 'drafts';
export const COMMENT_SUBFOLDER = 'comments' as const;
export const FILES_SUBFOLDER = 'files' as const;

/**
 * Los tres ámbitos ("scopeKind") que puede declarar el cliente al subir un
 * adjunto del PROPIO registro. Lista cerrada: cualquier otro valor se
 * rechaza antes de tocar ninguna ruta.
 *
 * `draft` existe porque en NOVANA se pueden adjuntar archivos en el diálogo
 * de creación de tarea/proyecto, ANTES de que el registro exista — no hay
 * `taskUuid`/`projectUuid` todavía, solo un uuid generado en el cliente para
 * la sesión de creación.
 */
export const SCOPE_KINDS = ['task', 'project', 'draft'] as const;
export type ScopeKind = (typeof SCOPE_KINDS)[number];

/** `scopeKind` (como lo manda el cliente, singular) -> segmento plural de la clave S3. */
export const SCOPE_KIND_TO_PLURAL: Record<ScopeKind, string> = {
  task: TASKS_SUBFOLDER,
  project: PROJECTS_SUBFOLDER,
  draft: DRAFTS_SUBFOLDER,
};

/** Máximo de adjuntos por comentario (replicado en el frontend). */
export const MAX_FILES_PER_COMMENT = 5;

/** Vida de la URL firmada, en segundos. */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

/**
 * Tipos que es seguro renderizar en línea. Cualquier otro se sirve con
 * `Content-Disposition: attachment` para que nunca pueda ejecutarse en
 * nuestro origen. Los Office van SIEMPRE como descarga: aunque el navegador
 * no los ejecute, no hay razón para abrirlos dentro del dominio.
 */
export const INLINE_SAFE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'video/mp4',
];

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

/**
 * Las cuatro formas de clave legales, en formato legible para humanos y UI.
 * `utils/novana-key.util.ts` valida las claves reales con un regex construido
 * a partir de las MISMAS constantes que arman estas plantillas — esto es solo
 * la versión para mostrar, nunca se usa para validar nada.
 */
export const NOVANA_KEY_SHAPES = [
  `${NOVANA_S3_ROOT}/${TASKS_SUBFOLDER}/<uuid>/${COMMENT_SUBFOLDER}/<uuid>.<ext>`,
  `${NOVANA_S3_ROOT}/${TASKS_SUBFOLDER}/<uuid>/${FILES_SUBFOLDER}/<uuid>.<ext>`,
  `${NOVANA_S3_ROOT}/${PROJECTS_SUBFOLDER}/<uuid>/${FILES_SUBFOLDER}/<uuid>.<ext>`,
  `${NOVANA_S3_ROOT}/${DRAFTS_SUBFOLDER}/<uuid>/${FILES_SUBFOLDER}/<uuid>.<ext>`,
] as const;

/**
 * Política legible. La devuelve `GET /novana/files/policy` para que la UI
 * pinte los límites desde el servidor en vez de duplicar los números.
 */
export function describePolicy() {
  return {
    allowedMimeTypes: [...ALLOWED_MIME_TYPES],
    allowedExtensions: [...ALLOWED_EXTENSIONS],
    maxFilesPerComment: MAX_FILES_PER_COMMENT,
    maxSizeByMime: MAX_SIZE_BY_MIME,
    limits: [
      { label: 'Images (JPG, PNG, GIF, WEBP)', maxMb: mb(MAX_SIZE_BY_MIME['image/jpeg']) },
      { label: 'PDF', maxMb: mb(MAX_SIZE_BY_MIME['application/pdf']) },
      { label: 'Office (DOCX, XLSX, PPTX)', maxMb: mb(MAX_SIZE_BY_MIME[DOCX]) },
      { label: 'Video (MP4)', maxMb: mb(MAX_SIZE_BY_MIME['video/mp4']) },
    ],
    // Para que el frontend deje de duplicar a mano los ámbitos y la forma de
    // las claves: los lee de aquí, la misma fuente que usa el validador.
    scopeKinds: [...SCOPE_KINDS],
    keyShapes: [...NOVANA_KEY_SHAPES],
  };
}

/** Resumen de una línea, reusado en los mensajes de error. */
export const POLICY_SUMMARY =
  `Allowed: images (JPG, PNG, GIF, WEBP) up to ${mb(MAX_SIZE_BY_MIME['image/jpeg'])} MB, ` +
  `PDF and Office files (DOCX, XLSX, PPTX) up to ${mb(MAX_SIZE_BY_MIME['application/pdf'])} MB, ` +
  `MP4 video up to ${mb(MAX_SIZE_BY_MIME['video/mp4'])} MB.`;
