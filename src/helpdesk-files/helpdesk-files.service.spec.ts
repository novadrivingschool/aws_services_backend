/* src/helpdesk-files/helpdesk-files.service.spec.ts */
import { BadRequestException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

import { HelpdeskFilesService } from './helpdesk-files.service';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({ send: (...a: unknown[]) => mockSend(...a) })),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/object'),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// ── Fixtures ───────────────────────────────────────────────────────────────

const TICKET = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER = '9c858901-8a57-4791-81fe-4c455b099bc9';
const ACTOR = '1042';
const MB = 1024 * 1024;

const pad = (head: Buffer, total: number): Buffer =>
  Buffer.concat([head, Buffer.alloc(Math.max(0, total - head.length), 0x00)]);

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_HEAD = Buffer.from('%PDF-1.7', 'latin1');
const MP4_HEAD = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x20]),
  Buffer.from('ftyp', 'latin1'),
  Buffer.from('isom', 'latin1'),
]);
const EXE_HEAD = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);

/**
 * Builds a multer file. `size` is set independently of the buffer length so a
 * "50 MB PNG" can be simulated without allocating 50 MB in the test process.
 */
const makeFile = (
  head: Buffer,
  originalname: string,
  size: number,
  mimetype = 'application/octet-stream',
): Express.Multer.File =>
  ({
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size,
    buffer: pad(head, 64),
  }) as Express.Multer.File;

describe('HelpdeskFilesService', () => {
  let service: HelpdeskFilesService;

  beforeEach(async () => {
    mockSend.mockReset().mockResolvedValue({});
    (getSignedUrl as jest.Mock).mockClear();

    const config: Partial<ConfigService> = {
      get: jest.fn((key: string) =>
        ({
          BUCKET: 'nova-bucket',
          REGION: 'us-east-1',
          ACCESS_KEY: 'AKIA_TEST',
          SECRET_ACCESS_KEY: 'secret_test',
        })[key],
      ) as ConfigService['get'],
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [HelpdeskFilesService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = module.get(HelpdeskFilesService);
  });

  // ── configuration ────────────────────────────────────────────────────────

  describe('configuration', () => {
    it('only needs the AWS credentials this service already requires to boot', () => {
      // No extra environment variable is introduced by this module: if BUCKET,
      // REGION, ACCESS_KEY and SECRET_ACCESS_KEY are set, it works.
      expect(() =>
        new HelpdeskFilesService({
          get: (k: string) =>
            ({
              BUCKET: 'b',
              REGION: 'r',
              ACCESS_KEY: 'a',
              SECRET_ACCESS_KEY: 's',
            })[k],
        } as unknown as ConfigService),
      ).not.toThrow();
    });

    it('fails loudly when BUCKET is missing', () => {
      expect(
        () => new HelpdeskFilesService({ get: () => undefined } as unknown as ConfigService),
      ).toThrow(/BUCKET/);
    });
  });

  // ── upload ───────────────────────────────────────────────────────────────

  describe('upload — allowed types', () => {
    it('stores a PNG and returns a server-generated key', async () => {
      const res = await service.upload(makeFile(PNG_HEAD, 'shot.png', 2 * MB), TICKET, 'ticket', ACTOR);

      expect(res.success).toBe(true);
      expect(res.mimeType).toBe('image/png');
      expect(res.key).toMatch(new RegExp(`^it-tickets/${TICKET}/[0-9a-f-]{36}\\.png$`));
    });

    it('stores a PDF under the comment folder when scope=comment', async () => {
      const res = await service.upload(makeFile(PDF_HEAD, 'invoice.pdf', 5 * MB), TICKET, 'comment', ACTOR);
      expect(res.key).toMatch(new RegExp(`^it-tickets/${TICKET}/comments/[0-9a-f-]{36}\\.pdf$`));
    });

    it('stores an MP4', async () => {
      const res = await service.upload(makeFile(MP4_HEAD, 'clip.mp4', 60 * MB), TICKET, 'ticket', ACTOR);
      expect(res.mimeType).toBe('video/mp4');
    });

    it('writes the DETECTED content type to S3, never the declared one', async () => {
      // Client claims text/html — the classic stored-XSS setup.
      await service.upload(makeFile(PNG_HEAD, 'x.png', 1 * MB, 'text/html'), TICKET, 'ticket', ACTOR);

      const command = mockSend.mock.calls[0][0] as PutObjectCommand;
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input.ContentType).toBe('image/png');
      expect(command.input.ServerSideEncryption).toBe('AES256');
    });

    it("never uses the client's filename as the S3 key", async () => {
      const res = await service.upload(
        makeFile(PNG_HEAD, '../../../hr/payroll/nomina.png', 1 * MB),
        TICKET,
        'ticket',
        ACTOR,
      );
      expect(res.key).not.toContain('..');
      expect(res.key).not.toContain('nomina');
      expect(res.key.startsWith(`it-tickets/${TICKET}/`)).toBe(true);
    });
  });

  describe('upload — disallowed content', () => {
    it('rejects an executable renamed to .png', async () => {
      await expect(
        service.upload(makeFile(EXE_HEAD, 'payload.png', 1 * MB, 'image/png'), TICKET, 'ticket', ACTOR),
      ).rejects.toThrow(BadRequestException);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('rejects HTML renamed to .pdf', async () => {
      const html = Buffer.from('<html><script>alert(1)</script>', 'latin1');
      await expect(
        service.upload(makeFile(html, 'doc.pdf', 1024, 'application/pdf'), TICKET, 'ticket', ACTOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an empty file', async () => {
      const empty = { ...makeFile(PNG_HEAD, 'a.png', 0), buffer: Buffer.alloc(0) };
      await expect(
        service.upload(empty as Express.Multer.File, TICKET, 'ticket', ACTOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a missing file', async () => {
      await expect(
        service.upload(undefined as unknown as Express.Multer.File, TICKET, 'ticket', ACTOR),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('upload — per-type size caps', () => {
    it('rejects a 9 MB image (limit 8 MB)', async () => {
      await expect(
        service.upload(makeFile(PNG_HEAD, 'big.png', 9 * MB), TICKET, 'ticket', ACTOR),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('accepts an 8 MB image (boundary)', async () => {
      await expect(
        service.upload(makeFile(PNG_HEAD, 'ok.png', 8 * MB), TICKET, 'ticket', ACTOR),
      ).resolves.toMatchObject({ success: true });
    });

    it('rejects a 21 MB PDF (limit 20 MB)', async () => {
      await expect(
        service.upload(makeFile(PDF_HEAD, 'big.pdf', 21 * MB), TICKET, 'ticket', ACTOR),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('accepts a 20 MB PDF (boundary)', async () => {
      await expect(
        service.upload(makeFile(PDF_HEAD, 'ok.pdf', 20 * MB), TICKET, 'ticket', ACTOR),
      ).resolves.toMatchObject({ success: true });
    });

    it('rejects a 101 MB MP4 (limit 100 MB)', async () => {
      await expect(
        service.upload(makeFile(MP4_HEAD, 'big.mp4', 101 * MB), TICKET, 'ticket', ACTOR),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it('applies the IMAGE cap to a large PNG renamed .mp4', async () => {
      // The cap must follow the detected type, not the extension — otherwise
      // "rename your 50 MB png to .mp4" is a way around the 8 MB limit.
      await expect(
        service.upload(makeFile(PNG_HEAD, 'sneaky.mp4', 50 * MB), TICKET, 'ticket', ACTOR),
      ).rejects.toThrow(PayloadTooLargeException);
    });
  });

  // ── getSignedUrl ─────────────────────────────────────────────────────────

  describe('getSignedUrl', () => {
    it('signs a key that belongs to the ticket', async () => {
      const res = await service.getSignedUrl(`it-tickets/${TICKET}/a.png`, TICKET);
      expect(res.url).toBe('https://signed.example/object');
    });

    it('pins the content type and inline disposition into the URL', async () => {
      await service.getSignedUrl(`it-tickets/${TICKET}/a.png`, TICKET);

      const command = (getSignedUrl as jest.Mock).mock.calls[0][1] as GetObjectCommand;
      expect(command.input.ResponseContentType).toBe('image/png');
      expect(command.input.ResponseContentDisposition).toContain('inline');
    });

    it('forces attachment for an unknown extension, whatever S3 has stored', async () => {
      // Legacy object uploaded through the old shared endpoint.
      await service.getSignedUrl(`it-tickets/${TICKET}/legacy.html`, TICKET);

      const command = (getSignedUrl as jest.Mock).mock.calls[0][1] as GetObjectCommand;
      expect(command.input.ResponseContentType).toBe('application/octet-stream');
      expect(command.input.ResponseContentDisposition).toContain('attachment');
    });

    it('resolves legacy timestamped keys so old tickets keep rendering', async () => {
      await expect(
        service.getSignedUrl(`it-tickets/${TICKET}/1767225600000_captura (1).png`, TICKET),
      ).resolves.toMatchObject({ success: true });
    });

    it('returns 404 when the ticket references a file that is not in the bucket', async () => {
      // Signing is local crypto and would happily succeed here, leaving the UI
      // with a blank image and no explanation. The HEAD makes it actionable.
      mockSend.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });

      await expect(service.getSignedUrl(`it-tickets/${TICKET}/gone.png`, TICKET)).rejects.toThrow(
        NotFoundException,
      );
      expect(getSignedUrl as jest.Mock).not.toHaveBeenCalled();
    });

    it("refuses a key from another ticket", async () => {
      await expect(service.getSignedUrl(`it-tickets/${OTHER}/a.png`, TICKET)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses a key outside the helpdesk prefix', async () => {
      await expect(service.getSignedUrl('hr/payroll/nomina.pdf', TICKET)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses path traversal', async () => {
      await expect(
        service.getSignedUrl(`it-tickets/${TICKET}/../../hr/nomina.pdf`, TICKET),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes a key owned by the ticket', async () => {
      const res = await service.remove(`it-tickets/${TICKET}/a.png`, TICKET, ACTOR);

      expect(res.success).toBe(true);
      expect(mockSend.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
      expect(mockSend.mock.calls[1][0]).toBeInstanceOf(DeleteObjectCommand);
    });

    it('returns 404 when the object does not exist', async () => {
      mockSend.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });

      await expect(service.remove(`it-tickets/${TICKET}/a.png`, TICKET, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to delete outside the ticket, without touching S3', async () => {
      await expect(service.remove('hr/payroll/nomina.pdf', TICKET, ACTOR)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
