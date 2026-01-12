import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for all origins in development, and configure it for production
  if (process.env.NODE_ENV === 'DEV') {
    app.enableCors({
      origin: 'http://localhost:8080',  // Allow frontend to make requests in development
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: true,  // If you need to send cookies or other credentials
    });
  } else {
    app.enableCors({
      origin: 'https://novadrivingone.net',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      credentials: true,
    });
  }

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
