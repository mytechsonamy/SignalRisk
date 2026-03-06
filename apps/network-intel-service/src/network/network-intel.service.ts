/**
 * SignalRisk Network Intel — Network Intelligence Service
 *
 * Orchestrates GeoIP lookup, proxy/VPN/Tor detection, and geo mismatch scoring
 * to produce a composite risk score for a given IP address.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeoIpService } from '../geo/geo-ip.service';
import { GeoMismatchService } from '../geo/geo-mismatch.service';
import { ProxyDetector } from '../proxy/proxy-detector';

export interface NetworkAnalysisParams {
  ip: string;
  merchantId: string;
  msisdnCountry?: string;
  billingCountry?: string;
}

export interface NetworkSignalResult {
  ip: string;
  merchantId: string;
  country?: string;
  city?: string;
  asn?: string;
  isProxy: boolean;
  isVpn: boolean;
  isTor: boolean;
  isDatacenter: boolean;
  geoMismatchScore: number;
  riskScore: number;
}

@Injectable()
export class NetworkIntelService {
  private readonly logger = new Logger(NetworkIntelService.name);
  private readonly proxyDetector: ProxyDetector;

  constructor(
    private readonly geoIpService: GeoIpService,
    private readonly geoMismatchService: GeoMismatchService,
    private readonly configService: ConfigService,
  ) {
    const torExitNodesPath =
      this.configService.get<string>('torExitNodesPath') ?? 'data/tor-exit-nodes.txt';
    this.proxyDetector = new ProxyDetector(torExitNodesPath);
  }

  /**
   * Analyse a single IP address and return a composite network signal result.
   *
   * Risk score formula (clamped to [0, 100]):
   *   + 60  if isTor
   *   + 40  if isProxy or isVpn
   *   + 20  if isDatacenter
   *   + geoMismatchScore * 0.3
   */
  async analyze(params: NetworkAnalysisParams): Promise<NetworkSignalResult> {
    const { ip, merchantId, msisdnCountry, billingCountry } = params;

    // 1. GeoIP lookup
    const geoResult = this.geoIpService.lookup(ip);

    const country = geoResult?.country;
    const city = geoResult?.city;
    const asn = geoResult?.asn;

    // 2. Proxy / VPN / Tor / Datacenter detection
    const isTor = this.proxyDetector.isTorExitNode(ip);
    const isProxy = this.proxyDetector.isKnownProxy(ip);
    // VPN detection uses known commercial VPN provider ASN list
    // Skip when ENABLE_VPN_DETECTION is explicitly set to 'false'
    const isVpn =
      process.env.ENABLE_VPN_DETECTION !== 'false'
        ? this.proxyDetector.isVpnIp(asn)
        : false;
    const isDatacenter = this.proxyDetector.isDatacenterIp(asn);

    // 3. Geo mismatch scoring
    const { mismatchScore: geoMismatchScore } = this.geoMismatchService.calculateMismatchScore({
      ipCountry: country,
      msisdnCountry,
      billingCountry,
    });

    // 4. Composite risk score
    let riskScore = 0;
    if (isTor) riskScore += 60;
    if (isProxy || isVpn) riskScore += 40;
    if (isDatacenter) riskScore += 20;
    riskScore += geoMismatchScore * 0.3;

    // Clamp to [0, 100]
    riskScore = Math.min(100, Math.max(0, Math.round(riskScore)));

    this.logger.debug(
      `Network analysis for IP ${ip} (merchant ${merchantId}): ` +
        `isTor=${isTor}, isProxy=${isProxy}, isDatacenter=${isDatacenter}, ` +
        `geoMismatchScore=${geoMismatchScore}, riskScore=${riskScore}`,
    );

    return {
      ip,
      merchantId,
      country,
      city,
      asn,
      isProxy,
      isVpn,
      isTor,
      isDatacenter,
      geoMismatchScore,
      riskScore,
    };
  }
}
