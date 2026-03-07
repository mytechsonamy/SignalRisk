import { Controller, Get, Query, Logger } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('v1/analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('trends')
  async getTrends(@Query('days') days?: string) {
    const d = days === '30' ? 30 : 7;
    return this.analyticsService.getTrends(d);
  }

  @Get('velocity')
  async getVelocity() {
    return this.analyticsService.getVelocity();
  }

  @Get('risk-buckets')
  async getRiskBuckets() {
    return this.analyticsService.getRiskBuckets();
  }

  @Get('merchants')
  async getMerchantStats() {
    return this.analyticsService.getMerchantStats();
  }

  @Get('kpi')
  async getKpi() {
    return this.analyticsService.getKpi();
  }

  @Get('minute-trend')
  async getMinuteTrend() {
    return this.analyticsService.getMinuteTrend();
  }
}
