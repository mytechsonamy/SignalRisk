import { NetworkAnalysisService } from '../network-analysis.service';
import { NetworkInput } from '../network.types';

describe('NetworkAnalysisService', () => {
  let service: NetworkAnalysisService;

  beforeEach(() => {
    service = new NetworkAnalysisService();
  });

  // Test 1: HeadlessChrome UA gets botScore >= 40
  it('should give botScore >= 40 for HeadlessChrome UA', () => {
    const input: NetworkInput = {
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0 HeadlessChrome/120.0.0.0',
      headers: { 'accept-language': 'en-US', 'accept-encoding': 'gzip' },
    };
    const result = service.analyze(input);
    expect(result.botScore).toBeGreaterThanOrEqual(40);
  });

  // Test 2: Puppeteer UA gets botScore >= 40
  it('should give botScore >= 40 for Puppeteer UA', () => {
    const input: NetworkInput = {
      ipAddress: '1.2.3.4',
      userAgent: 'puppeteer/21.0.0 Chrome/120.0.0.0',
      headers: { 'accept-language': 'en-US', 'accept-encoding': 'gzip' },
    };
    const result = service.analyze(input);
    expect(result.botScore).toBeGreaterThanOrEqual(40);
  });

  // Test 3: Missing Accept-Language header adds +20 to botScore
  it('should add +20 to botScore when Accept-Language is missing', () => {
    const input: NetworkInput = {
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      headers: { 'accept-encoding': 'gzip, deflate, br' },
    };
    const result = service.analyze(input);
    expect(result.botScore).toBe(20);
  });

  // Test 4: Missing Accept-Encoding adds +10 to botScore
  it('should add +10 to botScore when Accept-Encoding is missing', () => {
    const input: NetworkInput = {
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    };
    const result = service.analyze(input);
    expect(result.botScore).toBe(10);
  });

  // Test 5: Both headers missing: botScore = 30 (no UA penalty)
  it('should return botScore=30 when both headers missing and no headless UA', () => {
    const input: NetworkInput = {
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      headers: {},
    };
    const result = service.analyze(input);
    expect(result.botScore).toBe(30);
  });

  // Test 6: Datacenter keyword in UA (amazonaws) sets isDatacenter=true and ipRiskScore += 25
  it('should set isDatacenter=true and ipRiskScore=25 for amazonaws UA', () => {
    const input: NetworkInput = {
      ipAddress: '1.2.3.4',
      userAgent: 'aws-sdk/2.0 amazonaws',
      headers: { 'accept-language': 'en-US', 'accept-encoding': 'gzip' },
    };
    const result = service.analyze(input);
    expect(result.isDatacenter).toBe(true);
    expect(result.ipRiskScore).toBe(25);
  });

  // Test 7: Tor IP prefix (185.220.x.x) sets isTor=true and ipRiskScore >= 50
  it('should set isTor=true and ipRiskScore >= 50 for Tor IP', () => {
    const input: NetworkInput = {
      ipAddress: '185.220.101.50',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      headers: { 'accept-language': 'en-US', 'accept-encoding': 'gzip' },
    };
    const result = service.analyze(input);
    expect(result.isTor).toBe(true);
    expect(result.ipRiskScore).toBeGreaterThanOrEqual(50);
  });

  // Test 8: No IP address returns ipRiskScore=50
  it('should return ipRiskScore=50 when no IP address provided', () => {
    const input: NetworkInput = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      headers: { 'accept-language': 'en-US', 'accept-encoding': 'gzip' },
    };
    const result = service.analyze(input);
    expect(result.ipRiskScore).toBe(50);
  });

  // Test 9: Clean residential UA with all headers: low botScore (0)
  it('should return botScore=0 for clean residential UA with all headers', () => {
    const input: NetworkInput = {
      ipAddress: '93.184.216.34',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      headers: {
        'accept-language': 'en-US,en;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
      },
    };
    const result = service.analyze(input);
    expect(result.botScore).toBe(0);
  });

  // Test 10: Scores always in [0, 100]
  it('should clamp all scores to [0, 100]', () => {
    const input: NetworkInput = {
      ipAddress: '185.220.101.50',
      userAgent: 'HeadlessChrome puppeteer selenium',
      headers: {},
    };
    const result = service.analyze(input);
    expect(result.botScore).toBeGreaterThanOrEqual(0);
    expect(result.botScore).toBeLessThanOrEqual(100);
    expect(result.ipRiskScore).toBeGreaterThanOrEqual(0);
    expect(result.ipRiskScore).toBeLessThanOrEqual(100);
  });

  // Test 11: isProxy and isVpn default to false
  it('should default isProxy and isVpn to false', () => {
    const input: NetworkInput = {
      ipAddress: '1.2.3.4',
      userAgent: 'Mozilla/5.0',
      headers: { 'accept-language': 'en-US', 'accept-encoding': 'gzip' },
    };
    const result = service.analyze(input);
    expect(result.isProxy).toBe(false);
    expect(result.isVpn).toBe(false);
  });

  // Test 12: isTor=false for normal IP
  it('should return isTor=false for normal IP', () => {
    const input: NetworkInput = {
      ipAddress: '93.184.216.34',
      userAgent: 'Mozilla/5.0',
      headers: { 'accept-language': 'en-US', 'accept-encoding': 'gzip' },
    };
    const result = service.analyze(input);
    expect(result.isTor).toBe(false);
  });
});
