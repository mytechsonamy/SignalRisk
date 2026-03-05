import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  const port = process.env.HEALTH_PORT || 3010;
  await app.listen(port);
  console.log(`Outbox relay health endpoint listening on port ${port}`);
}

bootstrap();
