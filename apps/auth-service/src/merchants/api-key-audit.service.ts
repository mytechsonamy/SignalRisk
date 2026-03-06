import { Injectable, Logger } from '@nestjs/common';

export interface ApiKeyAuditEntry {
  merchantId: string;
  keyPrefix: string;   // first 8 chars of API key
  endpoint: string;
  timestamp: Date;
  ip: string;
  userAgent: string;
}

@Injectable()
export class ApiKeyAuditService {
  private readonly logger = new Logger(ApiKeyAuditService.name);
  private auditLog: ApiKeyAuditEntry[] = [];
  readonly MAX_ENTRIES = 10000;

  logUsage(entry: ApiKeyAuditEntry): void {
    this.auditLog.push(entry);
    if (this.auditLog.length > this.MAX_ENTRIES) {
      this.auditLog.shift(); // circular buffer
    }
    this.checkSuspiciousUsage(entry.merchantId, entry.keyPrefix);
  }

  getRecentUsage(merchantId: string, keyPrefix: string, limit = 100): ApiKeyAuditEntry[] {
    return this.auditLog
      .filter(e => e.merchantId === merchantId && e.keyPrefix === keyPrefix)
      .slice(-limit);
  }

  checkSuspiciousUsage(merchantId: string, keyPrefix: string): boolean {
    const oneHourAgo = new Date(Date.now() - 3600000);
    const recent = this.auditLog.filter(
      e =>
        e.merchantId === merchantId &&
        e.keyPrefix === keyPrefix &&
        e.timestamp > oneHourAgo,
    );
    const distinctIPs = new Set(recent.map(e => e.ip)).size;
    if (distinctIPs > 5) {
      this.logger.warn(
        `Suspicious API key usage: merchant=${merchantId} key=${keyPrefix} distinctIPs=${distinctIPs}`,
      );
      return true;
    }
    return false;
  }

  getAuditLog(): ApiKeyAuditEntry[] {
    return [...this.auditLog];
  }
}
