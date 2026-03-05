import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          name: 'merchant-rate-limit',
          ttl: configService.get<number>('rateLimit.ttl') || 60_000,
          limit: configService.get<number>('rateLimit.limit') || 1000,
        },
      ],
    }),
  ],
  controllers: [EventsController],
  providers: [
    EventsService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class EventsModule {}
