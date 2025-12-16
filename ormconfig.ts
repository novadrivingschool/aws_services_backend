import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

console.log('Database Configuration:');
console.log({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  username: process.env.POSTGRES_USER,
  database: process.env.POSTGRES_DB,
});

console.log('Migrations Path:', path.join(__dirname, '/migrations/*.{ts,js}'));

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: [path.join(__dirname, '/**/*.entity.{ts,js}')],
  migrations: [path.join(__dirname, 'src/migrations/*.{ts,js}')],
  synchronize: false,
  logging: ['query', 'error'],
  ssl: {
    rejectUnauthorized: false,
  },
});
