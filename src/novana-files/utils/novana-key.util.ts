/* src/novana-files/utils/novana-key.util.ts
 *
 * Generación y validación de claves S3 para los adjuntos de NOVANA.
 *
 * Reglas, todas del lado del servidor:
 *   1. El cliente NUNCA elige la clave. Manda el uuid del ámbito (tarea,
 *      subtarea, proyecto o borrador); el servidor construye
 *      `novana/<plural>/<uuid>/<comments|files>/<aleatorio>.<ext>`.
 *   2. Toda clave que vuelva (URL firmada, borrado) tiene que encajar EXACTO
 *      en una de las formas legales (`LEGAL_KEY_RE`, más abajo). Eso
 *      impide leer o borrar objetos ajenos del bucket compartido, y cierra el
 *      path traversal: ni `scopeId` ni `taskUuid` se concatenan crudos en una
 *      ruta sin pasar antes por este regex — un `scopeId` del estilo
 *      `../../etc` simplemente no matchea `UUID_SRC` y la clave entera se
 *      rechaza, nunca se construye una ruta "casi buena".
 *
 * `buildObjectKey` (escritura) y `parseNovanaKey` (lectura) comparten las
 * mismas constantes de `novana-files.constants`, así que generar y validar
 * jamás pueden divergir entre sí.
 */
import { randomUUID } from 'crypto';

import {
  AllowedMimeType,
  ALLOWED_EXTENSIONS,
  COMMENT_SUBFOLDER,
  DRAFTS_SUBFOLDER,
  EXTENSION_BY_MIME,
  FILES_SUBFOLDER,
  NOVANA_S3_ROOT,
  PROJECTS_SUBFOLDER,
  ScopeArea,
  ScopeKind,
  SCOPE_KINDS,
  SCOPE_KIND_AREAS,
  SCOPE_KIND_TO_PLURAL,
  SUBTASKS_SUBFOLDER,
  TASKS_SUBFOLDER,
} from '../novana-files.constants';

/** Tope duro para que una clave patológica no reviente un log ni una llamada a S3. */
const MAX_KEY_LENGTH = 512;

/** UUID RFC 4122 (versiones 1-5), en cualquier caja. Origen único para todo el módulo. */
const UUID_SRC =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const UUID_ONLY_RE = new RegExp(`^${UUID_SRC}$`);

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_ONLY_RE.test(value);

const escapeExtForRegex = (ext: string): string => ext.replace(/\./g, '\\.');
const EXTENSION_ALTERNATION = ALLOWED_EXTENSIONS.map(escapeExtForRegex).join('|');

/** `<uuid>.<extensión permitida>` — así nombra SIEMPRE el archivo `buildObjectKey`, nunca otra cosa. */
const FILENAME_SRC = `${UUID_SRC}(?:${EXTENSION_ALTERNATION})`;

/**
 * Un tramo `<plural>/<uuid>/(?:área1|área2)` (o `<plural>/<uuid>/área-única`
 * si el scopeKind solo admite una) por cada `scopeKind`, construido a partir
 * de `SCOPE_KIND_TO_PLURAL` + `SCOPE_KIND_AREAS` — las MISMAS constantes que
 * `novana-files.constants.ts` usa para `describePolicy()`. Generarlo así, en
 * vez de cablear un branch por scopeKind, es lo que permite que
 * `SCOPE_KIND_AREAS` sea la única fuente de verdad de qué área es legal bajo
 * qué scopeKind: si se añade un scopeKind, o a uno existente se le
 * añade/quita un área, este regex lo sigue automáticamente sin tocar una
 * línea de este archivo. `comments` sigue sin ser alcanzable bajo `project`
 * ni bajo `draft` porque `SCOPE_KIND_AREAS` no lo lista para ellos — no por
 * un caso especial aquí; el porqué (un proyecto no tiene hilo de
 * comentarios, un borrador no tiene registro todavía) está documentado junto
 * a esa constante, en `novana-files.constants.ts`.
 *
 * Ninguno de los valores que entran aquí (subcarpetas, áreas) tiene
 * caracteres de regex — son todo palabras ascii en minúscula fijadas en
 * `novana-files.constants.ts` — así que no hace falta escaparlos.
 */
const SCOPE_KIND_KEY_ALTERNATION = SCOPE_KINDS.map((scopeKind) => {
  const plural = SCOPE_KIND_TO_PLURAL[scopeKind];
  const areas = SCOPE_KIND_AREAS[scopeKind];
  const areaSrc = areas.length === 1 ? areas[0] : `(?:${areas.join('|')})`;
  return `${plural}/${UUID_SRC}/${areaSrc}`;
}).join('|');

/**
 * Las formas legales de clave, y ninguna otra, como un único regex anclado
 * (`^...$`, sin flag `m`: `$` exige el final real de la cadena, no admite un
 * `\n` colgando al final). Sin comodines `.*` en ningún tramo — es una lista
 * blanca cerrada de principio a fin, armada arriba a partir de
 * `SCOPE_KIND_KEY_ALTERNATION` — así que `..`, `\`, bytes de control o un
 * sufijo `/../../otro.png` no tienen forma de colarse: o la cadena encaja
 * letra a letra en este patrón, o se rechaza entera.
 */
const LEGAL_KEY_RE = new RegExp(
  '^' + `${NOVANA_S3_ROOT}/(?:${SCOPE_KIND_KEY_ALTERNATION})/${FILENAME_SRC}$`,
);

/**
 * Inverso de `SCOPE_KIND_TO_PLURAL`, para reconstruir el `scopeKind` a partir
 * de una clave. Tabla escrita a mano (son 4 entradas) en vez de derivada por
 * `Object.entries` para no depender de que TypeScript infiera bien los tipos
 * literales al invertir un `Record` — más simple, y sigue ligada a las mismas
 * constantes de subcarpeta que `SCOPE_KIND_TO_PLURAL`.
 */
const PLURAL_TO_SCOPE_KIND: Record<string, ScopeKind> = {
  [TASKS_SUBFOLDER]: 'task',
  [SUBTASKS_SUBFOLDER]: 'subtask',
  [PROJECTS_SUBFOLDER]: 'project',
  [DRAFTS_SUBFOLDER]: 'draft',
};

/**
 * 'comments' (adjunto del hilo, solo bajo `task`/`subtask`) o 'files'
 * (adjunto del propio registro). Alias de `ScopeArea`
 * (`novana-files.constants.ts`) — mismo valor, nombre propio de este módulo
 * porque aquí describe el papel dentro de una clave ya partida, no el campo
 * suelto que manda el cliente.
 */
export type NovanaKeyArea = ScopeArea;

/** Las partes con las que se construye — o en las que se descompone — una clave de NOVANA. */
export interface NovanaKeyParts {
  scopeKind: ScopeKind;
  /** uuid de la tarea, el proyecto o el borrador (sesión de creación). */
  scopeId: string;
  area: NovanaKeyArea;
}

/**
 * Descompone una clave si (y solo si) encaja en una de las formas legales
 * (`LEGAL_KEY_RE`). `null` en cualquier otro caso: traversal, extensión no permitida,
 * ámbito desconocido, uuid mal formado, barra invertida de Windows, clave
 * vacía o demasiado larga, etc.
 */
export function parseNovanaKey(key: unknown): NovanaKeyParts | null {
  if (typeof key !== 'string') return null;
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) return null;
  if (!LEGAL_KEY_RE.test(key)) return null;

  // Trocear por '/' aquí es seguro: el regex de arriba ya confirmó que la
  // cadena ENTERA tiene este formato exacto de 5 segmentos. No es cortar por
  // índices a ciegas — es leer una forma que ya se validó por completo.
  const segments = key.split('/');
  const [, plural, scopeId, area] = segments;
  const scopeKind = PLURAL_TO_SCOPE_KIND[plural];
  if (!scopeKind) return null; // defensivo; LEGAL_KEY_RE ya lo garantiza

  return { scopeKind, scopeId: scopeId.toLowerCase(), area: area as NovanaKeyArea };
}

/** True cuando `key` es una clave de NOVANA bien formada, en cualquiera de los ámbitos admitidos. */
export function isLegalNovanaKey(key: unknown): key is string {
  return parseNovanaKey(key) !== null;
}

/**
 * True cuando `key` es legal Y vive bajo la tarea `taskUuid` — en `comments/`
 * (legado) o en `files/` (adjuntos de la propia tarea): ambas cuentan como
 * "de esa tarea". Solo se usa cuando el cliente manda `taskUuid` en la query,
 * para no romper el comportamiento de hoy.
 */
export function keyBelongsToTask(key: unknown, taskUuid: string): boolean {
  if (!isUuid(taskUuid)) return false;
  const parts = parseNovanaKey(key);
  return parts !== null && parts.scopeKind === 'task' && parts.scopeId === taskUuid.toLowerCase();
}

/**
 * Construye la clave. El nombre es un UUID nuevo más la extensión derivada
 * del tipo DETECTADO — el `originalname` del cliente nunca llega a S3, lo que
 * elimina de golpe el path traversal, la sobrescritura por colisión, el
 * spoofing RTL de unicode y la inyección de cabeceras.
 */
export function buildObjectKey(parts: NovanaKeyParts, detectedMime: AllowedMimeType): string {
  const plural = SCOPE_KIND_TO_PLURAL[parts.scopeKind];
  const folder = `${NOVANA_S3_ROOT}/${plural}/${parts.scopeId}/${parts.area}`;
  return `${folder}/${randomUUID()}${EXTENSION_BY_MIME[detectedMime]}`;
}

/**
 * Traduce los campos ya validados por el DTO de subida (formas correctas por
 * separado — uuid, valor de la lista cerrada — pero no la combinación entre
 * ellos) al `NovanaKeyParts` con el que construir la clave, o al mensaje de
 * error si la combinación no vale.
 *
 * Es el ÚNICO sitio que conoce las reglas de negocio de combinación de
 * campos, para que el controller no las repita ni pueda desincronizarse de
 * `parseNovanaKey`:
 *   - "scopeKind y scopeId van juntos, o no va ninguno de los dos; sin ellos
 *     hace falta taskUuid" (regla de siempre, sin cambios).
 *   - "scopeArea es opcional; si no llega, el área es 'files' cuando hay
 *     scopeKind+scopeId (o 'comments' fija en el modo legado de taskUuid,
 *     como siempre)". Así, un cliente que nunca ha oído hablar de
 *     `scopeArea` — el frontend de comentarios de tarea ya en producción,
 *     que solo manda `taskUuid` — se comporta BYTE A BYTE igual que antes de
 *     que este campo existiera.
 *   - "scopeArea solo puede pedir un área que `SCOPE_KIND_AREAS` permita para
 *     ESE scopeKind" — hoy, 'comments' vale para 'task'/'subtask' pero no
 *     para 'project'/'draft'. Se compara contra `SCOPE_KIND_AREAS` (no una
 *     lista aparte) para que esta función nunca pueda aceptar una
 *     combinación que el regex de `parseNovanaKey` luego rechace, o viceversa.
 */
export function resolveUploadTarget(input: {
  taskUuid?: string;
  scopeKind?: ScopeKind;
  scopeId?: string;
  scopeArea?: ScopeArea;
}): { ok: true; parts: NovanaKeyParts } | { ok: false; message: string } {
  const hasScopeKind = input.scopeKind !== undefined;
  const hasScopeId = input.scopeId !== undefined;

  if (hasScopeKind !== hasScopeId) {
    return { ok: false, message: 'scopeKind and scopeId must be sent together' };
  }

  if (hasScopeKind && hasScopeId) {
    const scopeKind = input.scopeKind as ScopeKind;
    // Sin `scopeArea`, el área es la de siempre: `files/` (adjunto del propio
    // registro). `scopeArea` solo lo manda un cliente que explícitamente pide
    // el hilo de comentarios de una tarea/subtarea — el flujo legado de
    // taskUuid, más abajo, ni siquiera pasa por esta rama.
    const area = input.scopeArea ?? FILES_SUBFOLDER;

    if (!SCOPE_KIND_AREAS[scopeKind].includes(area)) {
      return {
        ok: false,
        message:
          `scopeArea "${area}" is not allowed for scopeKind "${scopeKind}". ` +
          `Allowed areas for "${scopeKind}": ${SCOPE_KIND_AREAS[scopeKind].join(', ')}.`,
      };
    }

    // taskUuid, si también llegó, se ignora a propósito: scopeKind/scopeId ganan.
    return { ok: true, parts: { scopeKind, scopeId: input.scopeId as string, area } };
  }

  if (!input.taskUuid) {
    return {
      ok: false,
      message: 'taskUuid is required when scopeKind and scopeId are not sent',
    };
  }
  return { ok: true, parts: { scopeKind: 'task', scopeId: input.taskUuid, area: COMMENT_SUBFOLDER } };
}

/** Extensión de una clave, en minúsculas y con el punto (`''` si no tiene). */
export function extensionOf(key: string): string {
  const filename = key.split('/').pop() ?? '';
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}
