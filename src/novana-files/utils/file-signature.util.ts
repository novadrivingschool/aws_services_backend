/* src/novana-files/utils/file-signature.util.ts
 *
 * Detección de contenido para los formatos que acepta NOVANA.
 *
 * Escrito a mano y no con el paquete `file-type` por lo mismo que en
 * helpdesk-files: el conjunto permitido es pequeño y cerrado, y `file-type`
 * >= 17 es solo ESM, que no importa limpiamente en este build CommonJS.
 *
 * Ni el `Content-Type` declarado ni el nombre del archivo se creen jamás:
 * los dos los controla el cliente. Solo mandan los bytes.
 */
import { AllowedMimeType } from '../novana-files.constants';

/** Prefijo más largo que necesita cualquier comprobación (la marca MP4 acaba en el byte 12). */
const MIN_BYTES_NEEDED = 12;

const asciiAt = (buf: Buffer, offset: number, length: number): string =>
  buf.length >= offset + length ? buf.subarray(offset, offset + length).toString('latin1') : '';

const startsWith = (buf: Buffer, bytes: number[]): boolean => {
  if (buf.length < bytes.length) return false;
  return bytes.every((b, i) => buf[i] === b);
};

const MP4_VIDEO_BRANDS = new Set([
  'isom', 'iso2', 'iso4', 'iso5', 'iso6', 'iso8',
  'mp41', 'mp42', 'mp71', 'avc1', 'dash', 'mmp4',
  'M4V ', 'M4VH', 'M4VP',
]);

const isJpeg = (buf: Buffer): boolean => startsWith(buf, [0xff, 0xd8, 0xff]);

const isPng = (buf: Buffer): boolean =>
  startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const isGif = (buf: Buffer): boolean => {
  const header = asciiAt(buf, 0, 6);
  return header === 'GIF87a' || header === 'GIF89a';
};

const isWebp = (buf: Buffer): boolean =>
  asciiAt(buf, 0, 4) === 'RIFF' && asciiAt(buf, 8, 4) === 'WEBP';

const isPdf = (buf: Buffer): boolean => startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d]);

const isMp4Video = (buf: Buffer): boolean =>
  asciiAt(buf, 4, 4) === 'ftyp' && MP4_VIDEO_BRANDS.has(asciiAt(buf, 8, 4));

/** Firma ZIP local: "PK\x03\x04". Todo OOXML es un ZIP. */
const isZip = (buf: Buffer): boolean => startsWith(buf, [0x50, 0x4b, 0x03, 0x04]);

/**
 * Cuántos bytes se recorren buscando el marcador de OOXML.
 *
 * Los nombres de entrada viven en las cabeceras locales del ZIP, repartidas
 * por el archivo. En la práctica `word/`, `xl/` o `ppt/` aparecen en los
 * primeros kilobytes, y limitar la ventana evita recorrer un archivo de 20 MB
 * entero por cada subida.
 */
const OOXML_SCAN_WINDOW = 64 * 1024;

/**
 * Distingue docx / xlsx / pptx dentro de un ZIP.
 *
 * Los tres comparten firma (son ZIP), así que hay que mirar los nombres de las
 * entradas. Se buscan las rutas canónicas de cada formato; si no aparece
 * ninguna, se rechaza — un ZIP que no es OOXML no entra, y eso incluye .zip,
 * .jar y .apk, que también empiezan por PK.
 */
const detectOoxml = (buf: Buffer): AllowedMimeType | null => {
  const window = buf.subarray(0, Math.min(buf.length, OOXML_SCAN_WINDOW)).toString('latin1');

  if (window.includes('word/document.xml') || window.includes('word/_rels')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (window.includes('xl/workbook.xml') || window.includes('xl/_rels')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (window.includes('ppt/presentation.xml') || window.includes('ppt/_rels')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  return null;
};

/**
 * Devuelve el MIME real de `buffer`, o `null` cuando el contenido no es
 * ninguno de los formatos permitidos (lo que incluye "vacío" y "demasiado
 * corto").
 */
export function detectMimeType(buffer: Buffer | undefined | null): AllowedMimeType | null {
  if (!buffer || buffer.length < MIN_BYTES_NEEDED) return null;

  if (isJpeg(buffer)) return 'image/jpeg';
  if (isPng(buffer)) return 'image/png';
  if (isGif(buffer)) return 'image/gif';
  if (isWebp(buffer)) return 'image/webp';
  if (isPdf(buffer)) return 'application/pdf';
  if (isMp4Video(buffer)) return 'video/mp4';
  if (isZip(buffer)) return detectOoxml(buffer);

  return null;
}

/**
 * True cuando el tipo que declaró el cliente es coherente con el detectado.
 *
 * Una discrepancia no es necesariamente un ataque — los navegadores mandan
 * `image/jpg` o cadena vacía — así que quien llama decide cuánto quejarse. Lo
 * que importa es que el valor que se persiste sea siempre el DETECTADO.
 */
export function declaredTypeMatches(
  declared: string | undefined,
  detected: AllowedMimeType,
): boolean {
  if (!declared) return false;
  const normalised = declared.toLowerCase().trim().split(';')[0];
  if (normalised === detected) return true;
  if (detected === 'image/jpeg' && (normalised === 'image/jpg' || normalised === 'image/pjpeg')) {
    return true;
  }
  // Windows manda a menudo el genérico de ZIP para los Office.
  if (detected.startsWith('application/vnd.openxmlformats') && normalised === 'application/zip') {
    return true;
  }
  return false;
}
