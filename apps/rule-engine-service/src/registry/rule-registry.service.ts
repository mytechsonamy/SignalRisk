import { Injectable, Logger } from '@nestjs/common';
import { RuleNode } from '../dsl/ast';
import { parseAll } from '../dsl/parser';

@Injectable()
export class RuleRegistryService {
  private readonly logger = new Logger(RuleRegistryService.name);
  private rules: Map<string, RuleNode> = new Map();

  /**
   * Parse DSL source and store all rules.
   * Existing rules with the same ID will be overwritten.
   */
  load(source: string): void {
    const parsed = parseAll(source);
    for (const rule of parsed) {
      this.rules.set(rule.id, rule);
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
}
