import { Injectable } from '@nestjs/common';
import { FeatureFlag, CreateFlagDto } from './flags.types';
import { randomUUID } from 'crypto';

@Injectable()
export class FlagsRepository {
  private readonly flags = new Map<string, FeatureFlag>();

  constructor() {
    this.seed([
      {
        name: 'rule-engine-v2',
        description: 'Next-gen rule engine',
        enabled: false,
        rolloutPercentage: 0,
        merchantIds: [],
      },
      {
        name: 'graph-scoring',
        description: 'Graph-based fraud scoring from Neo4j',
        enabled: true,
        rolloutPercentage: 0,
        merchantIds: [],
      },
      {
        name: 'burst-detection-v2',
        description: 'Improved burst detection algorithm',
        enabled: true,
        rolloutPercentage: 100,
        merchantIds: [],
      },
    ]);
  }

  private seed(
    items: Omit<FeatureFlag, 'id' | 'createdAt' | 'updatedAt'>[],
  ): void {
    for (const item of items) {
      this.create(item);
    }
  }

  findAll(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  findByName(name: string): FeatureFlag | undefined {
    return this.flags.get(name);
  }

  create(data: Omit<FeatureFlag, 'id' | 'createdAt' | 'updatedAt'>): FeatureFlag {
    const now = new Date();
    const flag: FeatureFlag = {
      id: randomUUID(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.flags.set(flag.name, flag);
    return flag;
  }

  update(
    name: string,
    data: Partial<Omit<FeatureFlag, 'id' | 'name' | 'createdAt'>>,
  ): FeatureFlag | undefined {
    const existing = this.flags.get(name);
    if (!existing) return undefined;

    const updated: FeatureFlag = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    this.flags.set(name, updated);
    return updated;
  }

  delete(name: string): boolean {
    return this.flags.delete(name);
  }
}
