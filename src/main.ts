import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 🔹 Convertimos el string en array
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

  const isDev = process.env.NODE_ENV !== 'production';

  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (isDev || allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin || '*');
    }

    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
  });

  app.enableCors({
    origin: (origin, callback) => {
      if (isDev || (origin && allowedOrigins.includes(origin))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  });

  await app.listen(process.env.PORT || 5000);
}
bootstrap();
