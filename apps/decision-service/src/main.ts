import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // allow extra fields on DecisionRequest
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  const port = process.env.PORT || 3009;
  await app.listen(port);
  console.log(`Decision service listening on port ${port}`);
}

bootstrap();
