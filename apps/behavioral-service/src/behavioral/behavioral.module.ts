/**
 * SignalRisk Behavioral Service — Behavioral Module
 *
 * Registers all behavioral analysis providers and controllers.
 */

import { Module } from '@nestjs/common';
import { BehavioralController } from './behavioral.controller';
import { BehavioralService } from './behavioral.service';
import { SessionRiskService } from './session-risk.service';

@Module({
  controllers: [BehavioralController],
  providers: [BehavioralService, SessionRiskService],
  exports: [BehavioralService, SessionRiskService],
})
export class BehavioralModule {}
