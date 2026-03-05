import { Injectable, Inject, Logger } from '@nestjs/common';
import { Driver } from 'neo4j-driver';
import { NEO4J_DRIVER } from './graph-driver.provider';
import { DeviceNode, SessionNode, SharingResult, VelocityRing } from './graph.types';

@Injectable()
export class GraphIntelService {
  private readonly logger = new Logger(GraphIntelService.name);

  constructor(
    @Inject(NEO4J_DRIVER) private readonly driver: Driver,
  ) {}

  async upsertDevice(device: DeviceNode): Promise<void> {
    const session = this.driver.session();
    try {
      await session.run(
        `MERGE (d:Device {deviceId: $deviceId})
         SET d.merchantId = $merchantId, d.trustScore = $trustScore, d.isEmulator = $isEmulator, d.firstSeenAt = $firstSeenAt
         MERGE (m:Merchant {merchantId: $merchantId})
         MERGE (d)-[:USED_BY]->(m)`,
        {
          deviceId: device.deviceId,
          merchantId: device.merchantId,
          trustScore: device.trustScore,
          isEmulator: device.isEmulator,
          firstSeenAt: device.firstSeenAt,
        },
      );
    } finally {
      await session.close();
    }
  }

  async linkDeviceToSession(deviceId: string, sessionId: string, session: SessionNode): Promise<void> {
    const neo4jSession = this.driver.session();
    try {
      await neo4jSession.run(
        `MERGE (d:Device {deviceId: $deviceId})
         MERGE (s:Session {sessionId: $sessionId})
         SET s.merchantId = $merchantId, s.riskScore = $riskScore, s.isBot = $isBot
         MERGE (d)-[:USED_IN]->(s)`,
        {
          deviceId,
          sessionId,
          merchantId: session.merchantId,
          riskScore: session.riskScore,
          isBot: session.isBot,
        },
      );
    } finally {
      await neo4jSession.close();
    }
  }

  async detectDeviceSharing(deviceId: string): Promise<SharingResult> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (d:Device {deviceId: $deviceId})-[:USED_BY]->(m:Merchant)
         RETURN collect(m.merchantId) as merchants, count(m) as sharingCount`,
        { deviceId },
      );

      if (result.records.length === 0) {
        return {
          deviceId,
          sharedAcrossMerchants: [],
          sharingCount: 0,
          isSuspicious: false,
        };
      }

      const record = result.records[0];
      const merchants = record.get('merchants') as string[];
      const sharingCountRaw = record.get('sharingCount');
      const sharingCount = typeof sharingCountRaw === 'object' && sharingCountRaw !== null && 'toNumber' in sharingCountRaw
        ? (sharingCountRaw as { toNumber(): number }).toNumber()
        : Number(sharingCountRaw);

      return {
        deviceId,
        sharedAcrossMerchants: merchants,
        sharingCount,
        isSuspicious: sharingCount >= 3,
      };
    } finally {
      await session.close();
    }
  }

  async detectVelocityRing(merchantId: string): Promise<VelocityRing> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (m1:Merchant {merchantId: $merchantId})<-[:USED_BY]-(d:Device)-[:USED_BY]->(m2:Merchant)
         WHERE m2.merchantId <> $merchantId
         WITH m2.merchantId as partner, count(d) as sharedCount, avg(d.trustScore) as avgTrust
         WHERE sharedCount >= 2
         RETURN collect(partner) as ringMembers, sum(sharedCount) as totalShared, avg(avgTrust) as avgTrustScore`,
        { merchantId },
      );

      if (result.records.length === 0) {
        return {
          merchantId,
          ringMembers: [],
          sharedDeviceCount: 0,
          avgTrustScore: 0,
          riskLevel: 'LOW',
        };
      }

      const record = result.records[0];
      const ringMembers = record.get('ringMembers') as string[];
      const totalSharedRaw = record.get('totalShared');
      const avgTrustScoreRaw = record.get('avgTrustScore');

      const sharedDeviceCount = typeof totalSharedRaw === 'object' && totalSharedRaw !== null && 'toNumber' in totalSharedRaw
        ? (totalSharedRaw as { toNumber(): number }).toNumber()
        : Number(totalSharedRaw ?? 0);

      const avgTrustScore = typeof avgTrustScoreRaw === 'object' && avgTrustScoreRaw !== null && 'toNumber' in avgTrustScoreRaw
        ? (avgTrustScoreRaw as { toNumber(): number }).toNumber()
        : Number(avgTrustScoreRaw ?? 0);

      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      if (sharedDeviceCount >= 5) {
        riskLevel = 'HIGH';
      } else if (sharedDeviceCount >= 2) {
        riskLevel = 'MEDIUM';
      } else {
        riskLevel = 'LOW';
      }

      return {
        merchantId,
        ringMembers,
        sharedDeviceCount,
        avgTrustScore,
        riskLevel,
      };
    } finally {
      await session.close();
    }
  }

  async getDeviceNeighbors(deviceId: string): Promise<{ deviceIds: string[]; count: number }> {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `MATCH (d:Device {deviceId: $deviceId})-[:USED_BY*1..2]-(neighbor:Device)
         WHERE neighbor.deviceId <> $deviceId
         RETURN collect(DISTINCT neighbor.deviceId) as deviceIds, count(DISTINCT neighbor) as count`,
        { deviceId },
      );

      if (result.records.length === 0) {
        return { deviceIds: [], count: 0 };
      }

      const record = result.records[0];
      const deviceIds = record.get('deviceIds') as string[];
      const countRaw = record.get('count');
      const count = typeof countRaw === 'object' && countRaw !== null && 'toNumber' in countRaw
        ? (countRaw as { toNumber(): number }).toNumber()
        : Number(countRaw ?? 0);

      return { deviceIds, count };
    } finally {
      await session.close();
    }
  }
}
