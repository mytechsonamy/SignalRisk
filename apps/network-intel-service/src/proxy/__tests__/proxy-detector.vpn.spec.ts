/**
 * Unit tests for ProxyDetector.isVpnIp()
 *
 * VPN_PROVIDER_ASNS defined in proxy-detector.ts (exact values from source):
 *   AS9009   — M247 (NordVPN, ExpressVPN infrastructure)
 *   AS20860  — Iomart (VPN hosting)
 *   AS210644 — Mullvad VPN
 *   AS39351  — 31173 Services (Mullvad colocation)
 *   AS204953 — Surfshark
 *   AS62240  — Clouvider (used by VPN providers)
 *   AS35041  — Private Internet Access (PIA)
 *   AS40065  — IPVanish
 *   AS9268   — Leaseweb (CyberGhost)
 *   AS25820  — IT7 Networks (HideMyAss)
 *   AS53667  — Frantech Solutions (BulletVPN)
 *
 * normalizeAsn() converts to uppercase and prepends 'AS' if missing, so
 * inputs like 'as9009' or '9009' both match 'AS9009'.
 */

import { ProxyDetector } from '../proxy-detector';

describe('ProxyDetector.isVpnIp()', () => {
  let detector: ProxyDetector;

  beforeEach(() => {
    // Pass a nonexistent tor path so no filesystem I/O occurs
    detector = new ProxyDetector('/nonexistent/tor-exit-nodes.txt');
  });

  // ---------------------------------------------------------------------------
  // Known VPN ASNs → true (one per provider category)
  // ---------------------------------------------------------------------------

  it('should return true for Mullvad VPN ASN (AS210644)', () => {
    expect(detector.isVpnIp('AS210644')).toBe(true);
  });

  it('should return true for Surfshark ASN (AS204953)', () => {
    expect(detector.isVpnIp('AS204953')).toBe(true);
  });

  it('should return true for Private Internet Access ASN (AS35041)', () => {
    expect(detector.isVpnIp('AS35041')).toBe(true);
  });

  it('should return true for NordVPN / M247 ASN (AS9009)', () => {
    expect(detector.isVpnIp('AS9009')).toBe(true);
  });

  it('should return true for ExpressVPN / M247 ASN (AS9009 shared infrastructure)', () => {
    // ExpressVPN uses M247 (AS9009) infrastructure — same ASN entry
    expect(detector.isVpnIp('AS9009')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Non-VPN ASNs → false
  // ---------------------------------------------------------------------------

  it('should return false for Comcast ASN (AS7922)', () => {
    expect(detector.isVpnIp('AS7922')).toBe(false);
  });

  it('should return false for BT (British Telecom) ASN (AS2856)', () => {
    expect(detector.isVpnIp('AS2856')).toBe(false);
  });

  it('should return false for Turkcell ASN (AS9121)', () => {
    expect(detector.isVpnIp('AS9121')).toBe(false);
  });

  it('should return false for T-Mobile ASN (AS21928)', () => {
    expect(detector.isVpnIp('AS21928')).toBe(false);
  });

  it('should return false for Google (search/users) ASN (AS15169) — datacenter, not VPN list', () => {
    // AS15169 is in DATACENTER_ASNS, not VPN_PROVIDER_ASNS
    expect(detector.isVpnIp('AS15169')).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('should return false for undefined', () => {
    expect(detector.isVpnIp(undefined)).toBe(false);
  });

  it('should return false for null (cast as undefined-like via undefined coercion)', () => {
    // TypeScript signature is string | undefined; passing null via cast
    expect(detector.isVpnIp(null as unknown as undefined)).toBe(false);
  });

  it('should return true for lowercase asn (case-insensitive normalization)', () => {
    // normalizeAsn() calls toUpperCase() before the Set lookup
    expect(detector.isVpnIp('as210644')).toBe(true);
  });

  it('should return true for uppercase ASN without AS prefix (numeric only)', () => {
    // normalizeAsn() prepends 'AS' when the string does not already start with it
    expect(detector.isVpnIp('204953')).toBe(true);
  });
});
