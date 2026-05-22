## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Development Docker

```bash
docker build -t aws-s3-api-dev .

docker run --name aws-s3-api-dev \
  -d \
  -p 5001:5001 \
  --restart always \
  -v $(pwd)/.env:/usr/src/app/.env \
  aws-s3-api-dev

docker logs aws-s3-api-dev -f
```

## Development (Docker Compose) — v1

> Monta el código fuente y corre en modo watch (`start:dev`).

```bash
# Levantar dev (con logs en consola)
docker-compose -f docker-compose.dev.yml up

# Detener
docker-compose -f docker-compose.dev.yml down
```

## Production (Docker Compose)

> Requiere `.env` con todas las variables configuradas antes de correr.

```bash
# Levantar en producción (build + start)
docker-compose -f docker-compose.prod.yml up -d --build

# Ver logs
docker-compose -f docker-compose.prod.yml logs -f

# Detener
docker-compose -f docker-compose.prod.yml down

# Rebuild sin cache
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

### Variables de entorno requeridas (.env)

```env
PORT=5001
NODE_ENV=production

# AWS S3
ACCESS_KEY=
SECRET_ACCESS_KEY=
REGION=
BUCKET=
BUCKET_CRM=
S3_MKT_BUCKET=

# PostgreSQL
POSTGRES_HOST=
POSTGRES_PORT=5432
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=

# Límites S3
NOVA_S3_MAX_FOLDER_FILES=
NOVA_S3_MAX_MULTI_FILES=
```

## Migrations

```bash
# Generar migración
npm run typeorm -- migration:generate ./src/migrations/NombreMigracion

# Correr migraciones
npm run migration:run

# Revertir última migración
npm run migration:revert
```
