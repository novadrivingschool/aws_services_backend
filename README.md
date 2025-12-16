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
docker build -t aws_services_backend_dev .

docker run --name aws_services_backend_dev \
  -d \
  -p 5010:5010 \
  --restart always \
  -v $(pwd)/.env:/usr/src/app/.env \
  aws_services_backend_dev

docker logs aws_services_backend_dev -f

## Production
docker build -t aws_services_backend .

docker run --name aws_services_backend \
  -d \
  -p 5010:5010 \
  --restart always \
  -v $(pwd)/.env:/usr/src/app/.env \
  aws_services_backend

docker logs aws_services_backend -f


<!-- CREATE TABLE -->
npm run typeorm -- migration:generate ./src/migrations/CreateUpdateTables
npm run migration:run