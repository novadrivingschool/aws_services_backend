# HelpDesk files (`/helpdesk/files`)

The HelpDesk's own attachment resource. It no longer shares
`POST /s3/upload/general` with CallsQa, LeadInstructorVault, Reimbursement,
VehicleLogs, ClassesRatings, OfficeSupplies, FacilitiesMaintenance, StartTime,
Overusage, CarMaintenance, ExtraHours, LastMinuteCancellation, GoNova
car-inspection and the rest — each service owns its upload path, so tightening
one can never break another.

Self-contained: no imports from `S3Module` / `S3mktModule` / `NovaS3Module` /
`CrmS3Module`, and nothing exported to them. It builds its own `S3Client`
rather than reusing `S3Service`, whose methods accept a client-supplied folder
and filename.

## Policy

| Type | Extensions | Max size |
|---|---|---|
| Image | `.jpg` `.jpeg` `.png` `.gif` `.webp` | 8 MB |
| Document | `.pdf` | 20 MB |
| Video | `.mp4` | 100 MB |

Max 5 attachments per ticket and per comment. Single source of truth:
[`helpdesk-files.constants.ts`](./helpdesk-files.constants.ts), also served at
`GET /helpdesk/files/policy` so the UI does not have to hardcode the numbers.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/helpdesk/files/policy` | Allowed types and limits |
| `POST` | `/helpdesk/files/upload` | multipart: `file`, `ticketUuid`, `scope` (`ticket`\|`comment`), optional `uploadedBy` |
| `GET` | `/helpdesk/files/signed-url?ticketUuid=&key=` | 5-minute URL |
| `DELETE` | `/helpdesk/files?ticketUuid=&key=` | Remove one attachment |

There is **no `folder` parameter**. The key is built server-side as
`it-tickets/<ticketUuid>[/comments]/<uuid>.<ext>`; the client's filename never
reaches S3. That removes path traversal, overwrite-by-collision, unicode RTL
spoofing and header injection in one go.

## How a file is validated

1. **`fileFilter`** — extension allow-list. Cheap: rejects a 2 GB `.iso` before
   it is buffered into the heap. Runs before the body exists, so it only sees
   the filename.
2. **Multer `limits`** — 100 MB ceiling, `files: 1`.
3. **Magic bytes** — [`file-signature.util.ts`](./utils/file-signature.util.ts)
   reads the header and decides the real type. The declared `Content-Type` is
   logged on mismatch but never trusted: it is client-controlled, so enforcing
   it buys nothing and rejects honest users (Windows sends
   `application/octet-stream` for `.mp4`).
4. **Per-type cap** — applied against the *detected* type, so renaming a 50 MB
   PNG to `.mp4` does not slip past the 8 MB image limit.

Stored objects get the detected `ContentType`, `ServerSideEncryption: AES256`
and a UUID filename. Signed URLs pin `ResponseContentType` /
`ResponseContentDisposition`, which also neutralises legacy objects uploaded
through the old shared endpoint with a client-chosen content type.

Legacy keys (`it-tickets/<uuid>/<timestamp>_<original name>`) are still accepted
on read and delete, so tickets created before this module keep rendering.

## Deployment

**No new environment variables.** The module reads the same `BUCKET`, `REGION`,
`ACCESS_KEY` and `SECRET_ACCESS_KEY` this service already needs to boot.

```bash
cd aws_services_backend
npm install                      # adds multer as a direct dependency
npm run build && npm test
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

The one infrastructure change: the nginx vhost in front of this service must
accept a 100 MB body, otherwise MP4 uploads fail at the proxy with a 413 before
they reach Nest.

```nginx
client_max_body_size 110M;
proxy_read_timeout   300s;
proxy_send_timeout   300s;
```

## Not in scope

There is no auth guard here — `aws_services_backend` has none anywhere, and
adding one to this controller alone would be inconsistent and would couple the
service to another service's session secret. If authentication is added it
belongs across the whole service, as its own piece of work.
