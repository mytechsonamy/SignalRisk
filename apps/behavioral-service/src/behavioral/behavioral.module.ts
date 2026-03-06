/**
 * SignalRisk Behavioral Service — Behavioral Module
 *
 * Registers all behavioral analysis providers and controllers.
 */

import { Module } from '@nestjs/common';
import { BehavioralController } from './behavioral.controller';
import { BehavioralService } from './behavioral.service';
import { SessionRiskService } from './session-risk.service';
import { BehavioralMlService } from './behavioral-ml.service';

@Module({
  controllers: [BehavioralController],
  providers: [BehavioralService, SessionRiskService, BehavioralMlService],
  exports: [BehavioralService, SessionRiskService, BehavioralMlService],
})
export class BehavioralModule {}
