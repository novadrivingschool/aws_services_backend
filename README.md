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

## Develping Docker
docker build -t aws-s3-api-dev .

docker run --name aws-s3-api-dev \
  -d \
  -p 5010:5010 \
  --restart always \
  -v $(pwd)/.env:/usr/src/app/.env \
  aws-s3-api-dev

docker logs aws-s3-api-dev -f

## Production
docker build -t aws-s3-api .

docker run --name aws-s3-api \
  -d \
  -p 5010:5010 \
  --restart always \
  -v $(pwd)/.env:/usr/src/app/.env \
  aws-s3-api

docker logs aws-s3-api -f


<!-- CREATE TABLE -->
npm run typeorm -- migration:generate ./src/migrations/CreateUpdateTables
npm run migration:run