/* src/helpdesk-files/utils/file-signature.util.spec.ts */
import { declaredTypeMatches, detectMimeType } from './file-signature.util';

// Real headers, padded to at least 12 bytes so the length guard is satisfied.
const pad = (head: Buffer, total = 32): Buffer =>
  Buffer.concat([head, Buffer.alloc(Math.max(0, total - head.length), 0x00)]);

const JPEG = pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]));
const PNG = pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const GIF87 = pad(Buffer.from('GIF87a', 'latin1'));
const GIF89 = pad(Buffer.from('GIF89a', 'latin1'));
const PDF = pad(Buffer.from('%PDF-1.7', 'latin1'));

const webp = (): Buffer =>
  pad(
    Buffer.concat([
      Buffer.from('RIFF', 'latin1'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WEBP', 'latin1'),
    ]),
  );

/** ISO-BMFF: [box size][`ftyp`][major brand]. */
const isoBmff = (brand: string): Buffer =>
  pad(
    Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x20]),
      Buffer.from('ftyp', 'latin1'),
      Buffer.from(brand, 'latin1'),
    ]),
  );

describe('detectMimeType', () => {
  it.each([
    ['JPEG', JPEG, 'image/jpeg'],
    ['PNG', PNG, 'image/png'],
    ['GIF87a', GIF87, 'image/gif'],
    ['GIF89a', GIF89, 'image/gif'],
    ['WEBP', webp(), 'image/webp'],
    ['PDF', PDF, 'application/pdf'],
    ['MP4 (isom)', isoBmff('isom'), 'video/mp4'],
    ['MP4 (mp42)', isoBmff('mp42'), 'video/mp4'],
    ['MP4 (avc1)', isoBmff('avc1'), 'video/mp4'],
  ])('detects %s', (_label, buffer, expected) => {
    expect(detectMimeType(buffer as Buffer)).toBe(expected);
  });

  describe('rejects everything else', () => {
    it('rejects a Windows executable', () => {
      expect(detectMimeType(pad(Buffer.from([0x4d, 0x5a, 0x90, 0x00])))).toBeNull();
    });

    it('rejects an ELF binary', () => {
      expect(detectMimeType(pad(Buffer.from([0x7f, 0x45, 0x4c, 0x46])))).toBeNull();
    });

    it('rejects a ZIP / Office document', () => {
      expect(detectMimeType(pad(Buffer.from([0x50, 0x4b, 0x03, 0x04])))).toBeNull();
    });

    it('rejects HTML (the stored-XSS vector)', () => {
      expect(detectMimeType(pad(Buffer.from('<html><script>', 'latin1')))).toBeNull();
    });

    it('rejects an SVG (scriptable, despite being an "image")', () => {
      expect(detectMimeType(pad(Buffer.from('<svg xmlns="http', 'latin1')))).toBeNull();
    });

    it('rejects RIFF containers that are not WEBP (e.g. WAV)', () => {
      const wav = pad(
        Buffer.concat([
          Buffer.from('RIFF', 'latin1'),
          Buffer.from([0x24, 0x00, 0x00, 0x00]),
          Buffer.from('WAVE', 'latin1'),
        ]),
      );
      expect(detectMimeType(wav)).toBeNull();
    });

    it('rejects ISO-BMFF audio (M4A) even though the container matches', () => {
      expect(detectMimeType(isoBmff('M4A '))).toBeNull();
    });

    it('rejects QuickTime MOV', () => {
      expect(detectMimeType(isoBmff('qt  '))).toBeNull();
    });

    it('rejects an empty buffer', () => {
      expect(detectMimeType(Buffer.alloc(0))).toBeNull();
    });

    it('rejects a buffer shorter than any signature', () => {
      expect(detectMimeType(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
    });

    it('rejects null / undefined', () => {
      expect(detectMimeType(null)).toBeNull();
      expect(detectMimeType(undefined)).toBeNull();
    });
  });
});

describe('declaredTypeMatches', () => {
  it('accepts an exact match', () => {
    expect(declaredTypeMatches('image/png', 'image/png')).toBe(true);
  });

  it('strips charset parameters', () => {
    expect(declaredTypeMatches('application/pdf; charset=binary', 'application/pdf')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(declaredTypeMatches('IMAGE/PNG', 'image/png')).toBe(true);
  });

  it('tolerates the image/jpg and image/pjpeg aliases browsers emit', () => {
    expect(declaredTypeMatches('image/jpg', 'image/jpeg')).toBe(true);
    expect(declaredTypeMatches('image/pjpeg', 'image/jpeg')).toBe(true);
  });

  it('reports a mismatch when the client lies', () => {
    expect(declaredTypeMatches('image/png', 'application/pdf')).toBe(false);
  });

  it('reports a mismatch for a missing content type', () => {
    expect(declaredTypeMatches(undefined, 'video/mp4')).toBe(false);
    expect(declaredTypeMatches('', 'video/mp4')).toBe(false);
  });
});
