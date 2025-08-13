import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
// Opcional: solo si necesitas subir límites para JSON/form (no afecta archivos):
// import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // (Opcional) límites para JSON/form:
  // app.use(bodyParser.json({ limit: '300mb' }));
  // app.use(bodyParser.urlencoded({ limit: '300mb', extended: true }));

  // ❌ NO habilites CORS aquí (lo maneja Nginx)
  // ❌ NO middleware para OPTIONS
  // ❌ NO agregues headers CORS en errores

  await app.listen(process.env.PORT || 5000);
}
bootstrap();
