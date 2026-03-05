import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  const port = process.env.PORT || 3011;
  await app.listen(port);
  console.log(`Webhook service listening on port ${port}`);
}

bootstrap();
