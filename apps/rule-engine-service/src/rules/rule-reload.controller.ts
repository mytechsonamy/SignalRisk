import { Controller, Post, Body, Get } from '@nestjs/common';
import { RuleHotReloadService } from './rule-hot-reload.service';

@Controller('rules')
export class RuleReloadController {
  constructor(private readonly hotReload: RuleHotReloadService) {}

  @Post('reload')
  async reload(@Body() body: { version: string }): Promise<{ success: boolean; version: string }> {
    await this.hotReload.manualReload(body.version);
    return { success: true, version: this.hotReload.getCurrentVersion() ?? 'unknown' };
  }

  @Get('version')
  getVersion(): { version: string | null } {
    return { version: this.hotReload.getCurrentVersion() };
  }
}
