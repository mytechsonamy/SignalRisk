/**
 * Generates static OpenAPI JSON specs for each service by bootstrapping
 * NestJS apps and using SwaggerModule.createDocument.
 *
 * NOTE: This script requires all services to be buildable and their
 * dependencies (Redis, Kafka, PostgreSQL) to be available or mocked.
 * For offline spec generation, use the static YAML files in docs/api/specs/.
 *
 * Usage: npx ts-node scripts/generate-openapi.ts
 */

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';

interface ServiceConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AppModule: any;
  title: string;
  description: string;
  outputPath: string;
}

async function generateSpec(config: ServiceConfig): Promise<void> {
  const app = await NestFactory.create(config.AppModule, { logger: false });

  const docConfig = new DocumentBuilder()
    .setTitle(config.title)
    .setDescription(config.description)
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, docConfig);

  const dir = path.dirname(config.outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(config.outputPath, JSON.stringify(document, null, 2));
  await app.close();
  console.log(`Generated: ${config.outputPath}`);
}

async function main(): Promise<void> {
  const outputDir = path.join(__dirname, '../docs/api/generated');

  // Services are imported lazily to avoid circular dependency issues.
  // Each service's AppModule must be resolvable from the monorepo root.
  const services: ServiceConfig[] = [
    {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      AppModule: require('../apps/auth-service/src/app.module').AppModule,
      title: 'SignalRisk Auth Service',
      description: 'OAuth2 token issuance, merchant management',
      outputPath: path.join(outputDir, 'auth-service.json'),
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      AppModule: require('../apps/event-collector/src/app.module').AppModule,
      title: 'SignalRisk Event Collector',
      description: 'Real-time event ingestion for fraud signal collection',
      outputPath: path.join(outputDir, 'event-collector.json'),
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      AppModule: require('../apps/decision-service/src/app.module').AppModule,
      title: 'SignalRisk Decision Service',
      description: 'Orchestrates intelligence signals into ALLOW/REVIEW/BLOCK decisions',
      outputPath: path.join(outputDir, 'decision-service.json'),
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      AppModule: require('../apps/case-service/src/app.module').AppModule,
      title: 'SignalRisk Case Service',
      description: 'Fraud case management — list, retrieve, update, and bulk-action cases',
      outputPath: path.join(outputDir, 'case-service.json'),
    },
  ];

  for (const service of services) {
    try {
      await generateSpec(service);
    } catch (err) {
      console.error(`Failed to generate spec for ${service.title}:`, err);
    }
  }

  console.log('\nDone. JSON specs written to', outputDir);
  console.log('For static YAML specs without running services, see docs/api/specs/');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
