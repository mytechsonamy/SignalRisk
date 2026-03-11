import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, NotFoundException } from '@nestjs/common';
import { RuleRegistryService, AdminRuleDto } from './rule-registry.service';
import { Action } from '../dsl/ast';

@Controller('v1/admin/rules')
export class AdminRulesController {
  constructor(private readonly registry: RuleRegistryService) {}

  @Get()
  list(): AdminRuleDto[] {
    return this.registry.listAdmin();
  }

  @Post()
  create(
    @Body() body: { name: string; expression: string; outcome: Action; weight: number; isActive: boolean },
  ): AdminRuleDto {
    return this.registry.createAdmin(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: Partial<{ weight: number; isActive: boolean; expression: string }>,
  ): AdminRuleDto {
    const result = this.registry.updateAdmin(id, body);
    if (!result) throw new NotFoundException(`Rule ${id} not found`);
    return result;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): void {
    const deleted = this.registry.deleteAdmin(id);
    if (!deleted) throw new NotFoundException(`Rule ${id} not found`);
  }
}
