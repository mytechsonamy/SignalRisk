/**
 * SignalRisk Network Intel — Proxy Detector
 *
 * Plain class (not injectable) that detects datacenter IPs, Tor exit nodes,
 * and known proxy/VPN IP ranges using in-memory sets loaded at startup.
 */

import * as fs from 'fs';
import * as net from 'net';

// ---------------------------------------------------------------------------
// Datacenter ASN prefixes — well-known cloud/hosting providers
// ---------------------------------------------------------------------------

const DATACENTER_ASNS = new Set([
  'AS14061',  // DigitalOcean
  'AS16509',  // Amazon AWS
  'AS15169',  // Google Cloud
  'AS8075',   // Microsoft Azure
  'AS13335',  // Cloudflare
  'AS20473',  // Choopa / Vultr
  'AS63949',  // Linode / Akamai
  'AS24940',  // Hetzner
  'AS16276',  // OVH
  'AS36351',  // SoftLayer (IBM Cloud)
  'AS396982', // Google Cloud (additional)
  'AS14618',  // Amazon AWS (additional)
  'AS7224',   // Amazon AWS (legacy)
]);

// ---------------------------------------------------------------------------
// Known proxy / VPN CIDR ranges (hardcoded for testing / MVP)
// ---------------------------------------------------------------------------

interface CidrRange {
  baseIp: number;
  mask: number;
}

const KNOWN_PROXY_CIDRS: string[] = [
  '192.168.100.0/24', // Example proxy range 1 (RFC 1918 extended, for testing)
  '10.8.0.0/16',      // Example VPN range (OpenVPN default)
  '172.16.100.0/24',  // Example proxy range 2
  '198.51.100.0/24',  // TEST-NET-2 (RFC 5737, documentation/test addresses)
  '203.0.113.0/24',   // TEST-NET-3 (RFC 5737)
];

// ---------------------------------------------------------------------------
// CIDR helpers
// ---------------------------------------------------------------------------

function ipToInt(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) return -1;
  return parts.reduce((acc, part) => (acc << 8) + parseInt(part, 10), 0) >>> 0;
}

function parseCidr(cidr: string): CidrRange | null {
  const [ipPart, prefixStr] = cidr.split('/');
  if (!ipPart || !prefixStr) return null;
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  const baseIp = ipToInt(ipPart);
  if (baseIp === -1) return null;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return { baseIp: (baseIp & mask) >>> 0, mask };
}

function isIpInCidr(ip: string, cidr: CidrRange): boolean {
  const ipInt = ipToInt(ip);
  if (ipInt === -1) return false;
  return (ipInt & cidr.mask) >>> 0 === cidr.baseIp;
}

// ---------------------------------------------------------------------------
// ProxyDetector
// ---------------------------------------------------------------------------

export class ProxyDetector {
  private readonly torExitNodes: Set<string>;
  private readonly knownProxyCidrs: CidrRange[];

  constructor(torExitNodesPath: string = 'data/tor-exit-nodes.txt') {
    this.torExitNodes = this.loadTorExitNodes(torExitNodesPath);
    this.knownProxyCidrs = this.parseProxyCidrs();
  }

  /**
   * Returns true if the ASN matches a known datacenter provider.
   * The check strips the 'AS' prefix for flexibility and is case-insensitive.
   */
  isDatacenterIp(asn: string | undefined): boolean {
    if (!asn) return false;
    const normalized = asn.toUpperCase().trim();
    // Accept both 'AS14061' and '14061' formats
    const withPrefix = normalized.startsWith('AS') ? normalized : `AS${normalized}`;
    return DATACENTER_ASNS.has(withPrefix);
  }

  /**
   * Returns true if the IP address is a known Tor exit node.
   */
  isTorExitNode(ip: string): boolean {
    if (!ip) return false;
    return this.torExitNodes.has(ip.trim());
  }

  /**
   * Returns true if the IP falls within any of the hardcoded proxy/VPN CIDR ranges.
   */
  isKnownProxy(ip: string): boolean {
    if (!ip || !net.isIPv4(ip)) return false;
    for (const cidr of this.knownProxyCidrs) {
      if (isIpInCidr(ip, cidr)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private loadTorExitNodes(filePath: string): Set<string> {
    if (!fs.existsSync(filePath)) {
      return new Set<string>();
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const ips = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));
      return new Set(ips);
    } catch {
      return new Set<string>();
    }
  }

  private parseProxyCidrs(): CidrRange[] {
    const parsed: CidrRange[] = [];
    for (const cidr of KNOWN_PROXY_CIDRS) {
      const range = parseCidr(cidr);
      if (range) {
        parsed.push(range);
      }
    }
    return parsed;
  }
}
