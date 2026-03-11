import { Injectable, Logger } from '@nestjs/common';
import { RuleNode, Action } from '../dsl/ast';
import { parseAll } from '../dsl/parser';

export interface AdminRuleDto {
  id: string;
  name: string;
  expression: string;
  outcome: Action;
  weight: number;
  isActive: boolean;
}

@Injectable()
export class RuleRegistryService {
  private readonly logger = new Logger(RuleRegistryService.name);
  private rules: Map<string, RuleNode> = new Map();
  /** Track active/inactive state per rule (all rules active by default) */
  private activeState: Map<string, boolean> = new Map();
  /** Store original DSL expression per rule for admin display */
  private expressions: Map<string, string> = new Map();

  /**
   * Parse DSL source and store all rules.
   * Existing rules with the same ID will be overwritten.
   */
  load(source: string): void {
    const parsed = parseAll(source);
    for (const rule of parsed) {
      this.rules.set(rule.id, rule);
      this.activeState.set(rule.id, true);
      this.logger.log(`Loaded rule: ${rule.id} → ${rule.action} (weight=${rule.weight})`);
    }
    this.logger.log(`Registry now contains ${this.rules.size} rule(s)`);
  }

  getAll(): RuleNode[] {
    return Array.from(this.rules.values());
  }

  getById(id: string): RuleNode | undefined {
    return this.rules.get(id);
  }

  count(): number {
    return this.rules.size;
  }

  /** Admin: list all rules as DTOs */
  listAdmin(): AdminRuleDto[] {
    return Array.from(this.rules.values()).map((r) => ({
      id: r.id,
      name: r.id,
      expression: this.expressions.get(r.id) ?? this.conditionToString(r),
      outcome: r.action,
      weight: r.weight,
      isActive: this.activeState.get(r.id) ?? true,
    }));
  }

  /** Admin: update a rule's weight, active state, or expression */
  updateAdmin(id: string, patch: Partial<{ weight: number; isActive: boolean; expression: string }>): AdminRuleDto | null {
    const rule = this.rules.get(id);
    if (!rule) return null;

    if (patch.weight !== undefined) {
      rule.weight = patch.weight;
    }
    if (patch.isActive !== undefined) {
      this.activeState.set(id, patch.isActive);
    }
    if (patch.expression !== undefined) {
      this.expressions.set(id, patch.expression);
    }

    return {
      id: rule.id,
      name: rule.id,
      expression: this.expressions.get(id) ?? this.conditionToString(rule),
      outcome: rule.action,
      weight: rule.weight,
      isActive: this.activeState.get(id) ?? true,
    };
  }

  /** Admin: create a new rule from admin DTO */
  createAdmin(dto: { name: string; expression: string; outcome: Action; weight: number; isActive: boolean }): AdminRuleDto {
    const id = dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const rule: RuleNode = {
      type: 'rule',
      id,
      condition: { type: 'comparison', field: 'manual', operator: '==', value: true },
      action: dto.outcome,
      weight: dto.weight,
      missingPolicy: 'SKIP',
    };
    this.rules.set(id, rule);
    this.activeState.set(id, dto.isActive);
    this.expressions.set(id, dto.expression);
    this.logger.log(`Admin created rule: ${id}`);
    return {
      id,
      name: dto.name,
      expression: dto.expression,
      outcome: dto.outcome,
      weight: dto.weight,
      isActive: dto.isActive,
    };
  }

  /** Admin: delete a rule */
  deleteAdmin(id: string): boolean {
    const existed = this.rules.delete(id);
    this.activeState.delete(id);
    this.expressions.delete(id);
    return existed;
  }

  /** Check if a rule is active */
  isActive(id: string): boolean {
    return this.activeState.get(id) ?? true;
  }

  private conditionToString(rule: RuleNode): string {
    return `${rule.id} → ${rule.action} (weight=${rule.weight})`;
  }
}
