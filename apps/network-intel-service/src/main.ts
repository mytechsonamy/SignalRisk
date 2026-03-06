import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  const logger = new Logger('Bootstrap');
  const flags = {
    jti: process.env.ENABLE_JTI_DENYLIST !== 'false',
    vpn: process.env.ENABLE_VPN_DETECTION !== 'false',
    apiKey: process.env.ENABLE_API_KEY_VALIDATION !== 'false',
  };
  logger.log(`Feature flags: jti=${flags.jti} vpn=${flags.vpn} apiKey=${flags.apiKey}`);

  const port = process.env.PORT || 3006;
  await app.listen(port);
  console.log(`Network intel service listening on port ${port}`);
}

bootstrap();
