import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

function isAllowedOrigin(origin: string): boolean {
  // Permite localhost con cualquier puerto
  const localhost = /^http:\/\/localhost:\d+$/i;

  // Permite cualquier subdominio de novadrivingone.net
  // Ej: https://novadrivingone.net
  // Ej: https://dev.novadrivingone.net
  // Ej: https://dev.awsservices.api.novadrivingone.net
  const novaDomains =
    /^https:\/\/([a-z0-9-]+\.)*novadrivingone\.net$/i;

  return localhost.test(origin) || novaDomains.test(origin);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /**
   * ✅ CORS centralizado (sin app.enableCors)
   * - Evita "multiple values"
   * - Funciona para DEV, PROD y LOCAL
   */
  app.use((req: any, res: any, next: any) => {
    const origin = req.headers.origin as string | undefined;

    // Para proxies/CDN
    res.setHeader('Vary', 'Origin');

    if (origin && isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    );

    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type,Authorization,X-Requested-With,Origin,Accept',
    );

    // Preflight
    if (req.method === 'OPTIONS') {
      return res.status(204).send();
    }

    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
