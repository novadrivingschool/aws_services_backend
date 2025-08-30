import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilita CORS SOLO fuera de producción
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({
      origin: [
        'http://localhost:8080',
        'http://127.0.0.1:8080',
      ],
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders: 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
      credentials: true,
      exposedHeaders: 'Content-Disposition', // útil si devuelves descargas
      maxAge: 86400,
    });
  }

  await app.listen(process.env.PORT || 5000);
}
bootstrap();
