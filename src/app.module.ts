import * as dotenv from 'dotenv';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { S3Module } from './s3/s3.module';
import { S3mktModule } from './s3mkt/s3mkt.module';
import { NovaS3Module } from './nova-s3/nova-s3.module';


dotenv.config();
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Hace que las variables estén disponibles en todo el proyecto
      envFilePath: '.env', // Asegúrate de que apunta al archivo correcto
    }),
    
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      database: process.env.POSTGRES_DB,
      username: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      autoLoadEntities: true,
      synchronize: false,
      ssl: {
        rejectUnauthorized: false, // Úsalo solo si tienes certificados autofirmados
      },
      logging: false, 
    }),
    S3Module,
    S3mktModule,
    NovaS3Module
  ],
})
export class AppModule { }