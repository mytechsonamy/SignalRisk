import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { recordEntityTypeFallback } from '@signalrisk/telemetry';
import { CaseRepository } from './case.repository';
import {
  Case,
  CaseListParams,
  CasePriority,
  CaseResolution,
  CaseStatus,
  DecisionEvent,
} from './case.types';
import { UpdateCaseDto } from './dto/update-case.dto';
import { BulkActionDto } from './dto/bulk-action.dto';
import { LabelPublisherService } from '../kafka/label-publisher.service';

@Injectable()
export class CaseService {
  private readonly logger = new Logger(CaseService.name);

  constructor(
    private readonly caseRepository: CaseRepository,
    @Optional() private readonly labelPublisher?: LabelPublisherService,
  ) {}

  async createFromDecision(decision: DecisionEvent): Promise<Case> {
    const priority = this.computePriority(decision.riskScore);
    const slaHours = decision.action === 'BLOCK' ? 4 : 24;
    const slaDeadline = new Date(Date.now() + slaHours * 3_600_000);

    const entityType = decision.entityType;
    if (!entityType) {
      this.logger.warn(
        `Decision ${decision.requestId} missing entityType — defaulting to 'customer'`,
      );
      recordEntityTypeFallback({ decision_id: decision.requestId, merchant_id: decision.merchantId });
    }

    this.logger.log(
      `Creating case for decision ${decision.requestId} ` +
        `(action=${decision.action}, score=${decision.riskScore}, priority=${priority})`,
    );

    return this.caseRepository.create({
      merchantId: decision.merchantId,
      decisionId: decision.requestId,
      entityId: decision.entityId,
      entityType: entityType || 'customer',
      action: decision.action as 'REVIEW' | 'BLOCK',
      riskScore: decision.riskScore,
      riskFactors: decision.riskFactors,
      status: 'OPEN',
      priority,
      slaDeadline,
    });
  }

  async getCase(id: string, merchantId: string): Promise<Case | null> {
    return this.caseRepository.findById(id, merchantId);
  }

  async listCases(
    params: CaseListParams,
  ): Promise<{ cases: Case[]; total: number; page: number; limit: number }> {
    const { cases, total } = await this.caseRepository.findMany(params);
    return { cases, total, page: params.page, limit: params.limit };
  }

  async updateCase(
    id: string,
    merchantId: string,
    update: UpdateCaseDto,
  ): Promise<Case> {
    const resolvedAt =
      update.resolution != null && update.resolution !== undefined
        ? new Date()
        : undefined;

    const updated = await this.caseRepository.update(id, merchantId, {
      status: update.status,
      assignedTo: update.assignedTo,
      resolution: update.resolution as CaseResolution | null | undefined,
      resolutionNotes: update.resolutionNotes,
      resolvedAt,
    });

    if (!updated) {
      throw new NotFoundException(`Case ${id} not found`);
    }

    // Publish analyst label on resolution (ADR-012)
    if (updated.resolution != null && this.labelPublisher) {
      this.labelPublisher.publishLabel({
        caseId: updated.id,
        merchantId: updated.merchantId,
        entityId: updated.entityId,
        entityType: updated.entityType || 'customer',
        resolution: updated.resolution,
        resolutionNotes: updated.resolutionNotes,
        resolvedAt: updated.resolvedAt?.toISOString() ?? new Date().toISOString(),
        timestamp: new Date().toISOString(),
      }).catch((err) => {
        this.logger.warn(`Failed to publish label for case ${updated.id}: ${(err as Error).message}`);
      });
    }

    return updated;
  }

  async bulkAction(
    ids: string[],
    merchantId: string,
    action: BulkActionDto,
  ): Promise<{ updated: number }> {
    let status: CaseStatus | undefined;
    let assignedTo: string | undefined;
    let resolution: CaseResolution | undefined;
    let resolvedAt: Date | undefined;

    switch (action.action) {
      case 'RESOLVE':
        status = 'RESOLVED';
        resolution = 'INCONCLUSIVE';
        resolvedAt = new Date();
        break;
      case 'ESCALATE':
        status = 'ESCALATED';
        break;
      case 'ASSIGN':
        status = 'IN_REVIEW';
        assignedTo = action.assignedTo;
        break;
    }

    const updated = await this.caseRepository.bulkUpdate(ids, merchantId, {
      status,
      assignedTo,
      resolution,
      resolvedAt,
    });

    return { updated };
  }

  private computePriority(riskScore: number): CasePriority {
    if (riskScore >= 70) return 'HIGH';
    if (riskScore >= 50) return 'MEDIUM';
    return 'LOW';
  }
}
