import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const port = process.env.PORT || 3012;
  await app.listen(port);
  console.log(`Graph Intel service listening on port ${port}`);
}

bootstrap();
