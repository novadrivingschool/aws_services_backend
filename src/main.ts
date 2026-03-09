/* src\main.ts */
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 🟡 CONFIGURACIÓN CORRECTA DE CORS
  app.enableCors({
    origin: true, // Permite cualquier origen (frontend)
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // ❌ ELIMINA el app.use((req, res, next) => {...}) que tenías aquí. 
  // NestJS ya maneja el OPTIONS (preflight) con el enableCors de arriba.

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 5001; // Asegúrate de que el puerto cuadre
  await app.listen(port);
  console.log(`🚀 Backend running on: http://localhost:${port}`);
}

bootstrap();