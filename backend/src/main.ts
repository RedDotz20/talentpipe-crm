import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DRIZZLE_PROVIDER } from './database/drizzle.provider';
import { initDatabase } from './database/database-init';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = process.env.CORS_ORIGIN?.split(',') ?? [];
  app.enableCors({
    origin(
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        /^https?:\/\/localhost:\d+$/.test(origin)
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api');

  // Create schema (and optionally demo data) before serving any request.
  await initDatabase(app.get(DRIZZLE_PROVIDER), new Logger('DatabaseInit'));

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
void bootstrap();
