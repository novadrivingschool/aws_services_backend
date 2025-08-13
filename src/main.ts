import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import * as bodyParser from 'body-parser'; // si aún usas body-parser para JSON/form
dotenv.config();

function parseAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowed = parseAllowedOrigins();
  const isDev = process.env.NODE_ENV !== 'production';

  // (Opcional) si envías JSON grande (NO archivos), sube límites:
  app.use(bodyParser.json({ limit: '300mb' }));
  app.use(bodyParser.urlencoded({ limit: '300mb', extended: true }));

  // Usa SOLO enableCors. No mezcles con middleware manual para evitar headers duplicados
  app.enableCors({
    origin: (origin, cb) => {
      // permite herramientas sin Origin (curl/Postman)
      if (!origin) return cb(null, true);
      if (isDev) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true, // si usas cookies/autenticación
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      // agrega aquí otros headers que envíes desde el browser
    ],
    exposedHeaders: ['ETag', 'Content-Length'],
    maxAge: 86400,
  });

  // Responder rápido los preflight (algunos proxies no lo hacen)
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Asegura CORS incluso en errores (413, 4xx/5xx), para que el navegador muestre el error real
  app.use((err, req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    const can = isDev || (origin && allowed.includes(origin));
    if (can && !res.headersSent) {
      res.setHeader('Access-Control-Allow-Origin', origin!);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    next(err);
  });

  await app.listen(process.env.PORT || 5000);
}
bootstrap();
