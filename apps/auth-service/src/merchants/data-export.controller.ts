import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { DataExportService } from './data-export.service';
import { AdminGuard } from './guards/admin.guard';

@Controller('v1/merchants')
@UseGuards(AdminGuard)
export class DataExportController {
  constructor(private readonly dataExportService: DataExportService) {}

  @Get(':id/data-export')
  async exportData(@Param('id') id: string, @Res() res: Response) {
    const data = await this.dataExportService.exportMerchantData(id);
    const filename = `export-${id}-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(data);
  }
}
