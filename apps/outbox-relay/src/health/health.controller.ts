import { Controller, Get } from '@nestjs/common';
import { OutboxRelayService } from '../relay/outbox-relay.service';

@Controller('health')
export class HealthController {
  constructor(private readonly relayService: OutboxRelayService) {}

  @Get()
  async check() {
    const lag = await this.relayService.getLag();

    return {
      status: 'ok',
      service: 'outbox-relay',
      lastPollTime: this.relayService.lastPollTime?.toISOString() ?? null,
      eventsPublished: this.relayService.eventsPublished,
      lag,
      timestamp: new Date().toISOString(),
    };
  }
}
