import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Permitir todos los orígenes (CORS abierto)
  app.enableCors({
    origin: '*', // o (origin: true para reflejar el origen y permitir credenciales)
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: '*',
    exposedHeaders: 'Content-Disposition',
  });

  await app.listen(process.env.PORT || 5000);
}
bootstrap();
