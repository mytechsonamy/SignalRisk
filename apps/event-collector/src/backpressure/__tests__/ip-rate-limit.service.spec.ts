import { Test, TestingModule } from '@nestjs/testing';
import { IpRateLimitService } from '../ip-rate-limit.service';

describe('IpRateLimitService', () => {
  let service: IpRateLimitService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IpRateLimitService],
    }).compile();

    service = module.get<IpRateLimitService>(IpRateLimitService);
  });

  it('should allow first request with remaining=99', () => {
    const result = service.checkIp('1.2.3.4');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99);
  });

  it('should allow the 100th request and deny the 101st', () => {
    const ip = '5.6.7.8';
    // First 99 requests
    for (let i = 0; i < 99; i++) {
      service.checkIp(ip);
    }
    // 100th request — should be allowed
    const hundredth = service.checkIp(ip);
    expect(hundredth.allowed).toBe(true);
    expect(hundredth.remaining).toBe(0);

    // 101st request — should be denied
    const denied = service.checkIp(ip);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it('should reset window after 60s', () => {
    const ip = '9.10.11.12';
    const realDateNow = Date.now;
    const startTime = realDateNow();

    Date.now = jest.fn(() => startTime);

    // Use up all 100 requests
    for (let i = 0; i < 100; i++) {
      service.checkIp(ip);
    }
    const deniedBeforeReset = service.checkIp(ip);
    expect(deniedBeforeReset.allowed).toBe(false);

    // Move time forward past the 60s window
    Date.now = jest.fn(() => startTime + 61000);

    const afterReset = service.checkIp(ip);
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.remaining).toBe(99);

    Date.now = realDateNow;
  });

  it('should track different IPs independently', () => {
    const ip1 = '10.0.0.1';
    const ip2 = '10.0.0.2';

    // Exhaust ip1
    for (let i = 0; i < 100; i++) {
      service.checkIp(ip1);
    }
    const ip1Denied = service.checkIp(ip1);
    expect(ip1Denied.allowed).toBe(false);

    // ip2 should still be fresh
    const ip2Result = service.checkIp(ip2);
    expect(ip2Result.allowed).toBe(true);
    expect(ip2Result.remaining).toBe(99);
  });

  it('should decrement remaining count correctly', () => {
    const ip = '20.30.40.50';
    const r1 = service.checkIp(ip);
    expect(r1.remaining).toBe(99);

    const r2 = service.checkIp(ip);
    expect(r2.remaining).toBe(98);

    const r3 = service.checkIp(ip);
    expect(r3.remaining).toBe(97);
  });

  it('should start a new window when a new IP is seen', () => {
    const ip = '100.200.300.400';
    const result = service.checkIp(ip);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(service.LIMIT - 1);
  });
});
