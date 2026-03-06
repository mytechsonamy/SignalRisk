import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ChargebackConsumerService } from './chargeback-consumer.service';
import { CreateChargebackDto } from './dto/create-chargeback.dto';
import { ChargebackEvent } from './chargeback.types';

@Controller('v1/chargebacks')
export class ChargebackController {
  constructor(private readonly chargebackConsumerService: ChargebackConsumerService) {}

  @Post()
  @HttpCode(202)
  async submitChargeback(@Body() dto: CreateChargebackDto): Promise<{ processed: boolean }> {
    const event: ChargebackEvent = {
      caseId: dto.caseId,
      merchantId: dto.merchantId,
      decisionId: dto.decisionId ?? '',
      firedRuleIds: dto.firedRuleIds,
      outcome: dto.outcome,
      amount: dto.amount,
      currency: dto.currency ?? 'USD',
      timestamp: new Date().toISOString(),
    };
    await this.chargebackConsumerService.processEvent(event);
    return { processed: true };
  }
}
