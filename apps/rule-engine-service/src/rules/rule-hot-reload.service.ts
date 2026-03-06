import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface RuleVersion {
  version: string;
  rules: string; // DSL string
  activatedAt: Date;
}

@Injectable()
export class RuleHotReloadService implements OnModuleInit {
  private readonly logger = new Logger(RuleHotReloadService.name);
  private currentVersion: string | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  // Use a simple read-write pattern: swap atomically via reference
  private activeRuleSet: any = null;
  private readonly POLL_INTERVAL_MS = 60_000;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.intervalId = setInterval(() => this.checkAndReload(), this.POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  async checkAndReload(): Promise<void> {
    try {
      const featureFlagUrl = this.configService.get<string>('FEATURE_FLAG_SERVICE_URL', 'http://localhost:3013');
      const response = await axios.get(`${featureFlagUrl}/flags/rule-engine-version`);
      const newVersion: string = response.data?.value;
      if (newVersion && newVersion !== this.currentVersion) {
        await this.loadVersion(newVersion);
      }
    } catch (err) {
      this.logger.error('Hot-reload check failed', err);
    }
  }

  async loadVersion(version: string): Promise<void> {
    try {
      // Fetch DSL for this version
      const featureFlagUrl = this.configService.get<string>('FEATURE_FLAG_SERVICE_URL', 'http://localhost:3013');
      const response = await axios.get(`${featureFlagUrl}/flags/rule-dsl-${version}`);
      const dsl: string = response.data?.value;
      if (!dsl) throw new Error(`No DSL for version ${version}`);

      // Validate (parse) before swapping
      const parsed = this.parseDsl(dsl);

      // Atomic swap
      this.activeRuleSet = parsed;
      this.currentVersion = version;

      await this.auditReload({ version, rules: dsl, activatedAt: new Date() });
      this.logger.log(`Rule set hot-reloaded to version ${version}`);
    } catch (err) {
      this.logger.error(`Failed to load version ${version}, keeping previous`, err);
      // Rollback: activeRuleSet unchanged (already not swapped on error)
    }
  }

  private parseDsl(dsl: string): any {
    // Basic validation: must have at least one RULE block
    if (!dsl.includes('RULE')) throw new Error('Invalid DSL: no RULE blocks found');
    return { dsl, parsedAt: new Date() };
  }

  private async auditReload(version: RuleVersion): Promise<void> {
    // Log to console (DB write would go here in prod)
    this.logger.log(`AUDIT: rule-reload version=${version.version} at=${version.activatedAt.toISOString()}`);
  }

  getActiveRuleSet(): any {
    return this.activeRuleSet;
  }

  getCurrentVersion(): string | null {
    return this.currentVersion;
  }

  async manualReload(version: string): Promise<void> {
    await this.loadVersion(version);
  }
}
