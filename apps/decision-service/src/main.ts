import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
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

  const config = new DocumentBuilder()
    .setTitle('SignalRisk Decision Service')
    .setDescription('Orchestrates intelligence signals into ALLOW/REVIEW/BLOCK fraud decisions')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  app.enableShutdownHooks();

  const port = process.env.PORT || 3009;
  await app.listen(port);
  console.log(`Decision service listening on port ${port}`);
}

bootstrap();
