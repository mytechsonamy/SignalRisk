import { Injectable } from '@nestjs/common';
import { NetworkInput, NetworkSignal } from './network.types';

// Known headless browser UA signatures
const HEADLESS_UA_PATTERNS = [
  'headlesschrome', 'puppeteer', 'playwright', 'phantomjs',
  'selenium', 'webdriver', 'bot/', 'crawler', 'spider',
];

// Datacenter/cloud ASN keywords
const DATACENTER_KEYWORDS = [
  'amazon', 'amazonaws', 'google', 'googlecloud', 'microsoft',
  'azure', 'digitalocean', 'hetzner', 'linode', 'vultr', 'ovh',
];

// Example Tor exit node CIDR ranges (simplified heuristic)
const TOR_IP_PREFIXES = ['185.220.', '199.249.', '23.129.', '204.13.', '162.247.'];

@Injectable()
export class NetworkAnalysisService {
  analyze(input: NetworkInput): NetworkSignal {
    const ua = (input.userAgent ?? '').toLowerCase();
    const headers = input.headers ?? {};
    const ip = input.ipAddress ?? '';
    let ipRiskScore = 0;
    let botScore = 0;

    // Headless browser detection
    const isHeadless = HEADLESS_UA_PATTERNS.some(p => ua.includes(p));
    if (isHeadless) botScore += 40;

    // Missing common browser headers
    const hasAcceptLanguage = 'accept-language' in headers || 'Accept-Language' in headers;
    const hasAcceptEncoding = 'accept-encoding' in headers || 'Accept-Encoding' in headers;
    if (!hasAcceptLanguage) botScore += 20;
    if (!hasAcceptEncoding) botScore += 10;

    // Datacenter detection via UA or known header patterns
    const isDatacenter = DATACENTER_KEYWORDS.some(k => ua.includes(k)) ||
      Object.values(headers).some(v => DATACENTER_KEYWORDS.some(k => v.toLowerCase().includes(k)));
    if (isDatacenter) ipRiskScore += 25;

    // Tor exit node detection
    const isTor = TOR_IP_PREFIXES.some(prefix => ip.startsWith(prefix));
    if (isTor) ipRiskScore += 50;

    // No IP = medium risk unknown
    if (!ip) ipRiskScore = 50;

    // Clamp
    ipRiskScore = Math.max(0, Math.min(100, ipRiskScore));
    botScore = Math.max(0, Math.min(100, botScore));

    return {
      isProxy: false,  // requires external IP DB lookup; default false
      isVpn: false,    // requires external lookup; default false
      isTor,
      isDatacenter,
      ipRiskScore: Math.round(ipRiskScore * 100) / 100,
      asnOrg: isDatacenter ? 'Cloud/Datacenter' : 'Unknown',
      countryCode: 'XX', // requires GeoIP lookup; default unknown
      botScore: Math.round(botScore * 100) / 100,
    };
  }
}
