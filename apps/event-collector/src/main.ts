import { initTracing } from './tracing';
initTracing();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('SignalRisk Event Collector')
    .setDescription('Real-time event ingestion endpoint for fraud signal collection')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  app.enableShutdownHooks();

  const logger = new Logger('Bootstrap');
  const flags = {
    jti: process.env.ENABLE_JTI_DENYLIST !== 'false',
    vpn: process.env.ENABLE_VPN_DETECTION !== 'false',
    apiKey: process.env.ENABLE_API_KEY_VALIDATION !== 'false',
  };
  logger.log(`Feature flags: jti=${flags.jti} vpn=${flags.vpn} apiKey=${flags.apiKey}`);

  const port = process.env.PORT || 3002;
  await app.listen(port);
  console.log(`Event Collector service listening on port ${port}`);
}

bootstrap();
