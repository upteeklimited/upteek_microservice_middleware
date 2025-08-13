import * as rateLimit from 'express-rate-limit';

import { AppModule } from './app.module';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WebSocketExceptionFilter } from './gateways/shared/websocket-exception.filter';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: '*',
    // allowedHeaders: ['Content-Type', 'Authorization', 'x-client-type'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // If you need to allow cookies or authorization headers
  });
  app.use(helmet());
  // app.use(
  //   rateLimit.default({
  //     windowMs: 15 * 60 * 1000,
  //     max: 100,
  //   }),
  // );
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  // Add global exception filter for WebSocket connections
  app.useGlobalFilters(new WebSocketExceptionFilter());

  await app.listen(4000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
