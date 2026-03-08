import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlagsRepository } from './flags.repository';
import {
  FeatureFlag,
  FlagCheckResult,
  CreateFlagDto,
  UpdateFlagDto,
} from './flags.types';

@Injectable()
export class FlagsService {
  constructor(
    private readonly repo: FlagsRepository,
    private readonly configService: ConfigService,
  ) {}

  isEnabled(flagName: string, merchantId: string): FlagCheckResult {
    const flag = this.repo.findByName(flagName);

    if (!flag) {
      return { flagName, merchantId, enabled: false, reason: 'not_found' };
    }

    if (!flag.enabled) {
      return { flagName, merchantId, enabled: false, reason: 'disabled' };
    }

    // Explicit allowlist takes priority
    if (flag.merchantIds?.includes(merchantId)) {
      return { flagName, merchantId, enabled: true, reason: 'allowlist' };
    }

    // Full rollout (default to 100% if not set)
    if ((flag.rolloutPercentage ?? 100) >= 100) {
      return { flagName, merchantId, enabled: true, reason: 'full_rollout' };
    }

    // 0% rollout (and not in allowlist)
    if (flag.rolloutPercentage <= 0) {
      return { flagName, merchantId, enabled: false, reason: 'rollout' };
    }

    // Deterministic hash-based rollout
    const hash = this.deterministicHash(`${merchantId}:${flagName}`);
    const bucket = hash % 100;
    const enabled = bucket < flag.rolloutPercentage;
    return { flagName, merchantId, enabled, reason: 'rollout' };
  }

  deterministicHash(input: string): number {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash) + input.charCodeAt(i);
      hash = hash & hash; // convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  getAll(): FeatureFlag[] {
    return this.repo.findAll();
  }

  getFlag(name: string): FeatureFlag {
    const flag = this.repo.findByName(name);
    if (!flag) {
      throw new NotFoundException(`Feature flag '${name}' not found`);
    }
    return flag;
  }

  createFlag(dto: CreateFlagDto): FeatureFlag {
    return this.repo.create(dto);
  }

  updateFlag(name: string, dto: UpdateFlagDto): FeatureFlag {
    const updated = this.repo.update(name, dto);
    if (!updated) {
      throw new NotFoundException(`Feature flag '${name}' not found`);
    }
    return updated;
  }

  deleteFlag(name: string): void {
    const deleted = this.repo.delete(name);
    if (!deleted) {
      throw new NotFoundException(`Feature flag '${name}' not found`);
    }
  }
}
