import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SlaMonitorService } from './sla-monitor.service';
import { SlaAlertService } from './sla-alert.service';
import { CaseModule } from '../cases/case.module';

@Module({
  imports: [ConfigModule, CaseModule],
  providers: [SlaMonitorService, SlaAlertService],
  exports: [SlaMonitorService],
})
export class SlaModule {}
