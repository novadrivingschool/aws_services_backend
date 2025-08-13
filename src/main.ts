import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
// (Opcional) si realmente necesitas subir límites de JSON/form:
// import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Si necesitas límites grandes para JSON/form (no archivos):
  // app.use(bodyParser.json({ limit: '300mb' }));
  // app.use(bodyParser.urlencoded({ limit: '300mb', extended: true }));

  // CORS: acepta cualquier origen, reflejado, con credenciales.
  app.enableCors({
    origin: true,                // refleja el Origin entrante (permite todos)
    credentials: true,           // permite cookies/autenticación
    methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization','x-api-key','x-requested-with'],
    exposedHeaders: ['ETag','Content-Length'],
    maxAge: 86400,
  });

  // Responder rápido preflight
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Asegurar CORS también en errores (4xx/5xx), reflejando el Origin
  app.use((err, req, res, next) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && !res.headersSent) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    next(err);
  });

  await app.listen(process.env.PORT || 5000);
}
bootstrap();
