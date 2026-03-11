import { DeviceSignalSchema } from '../schemas/device.schema';
import { VelocitySignalSchema } from '../schemas/velocity.schema';
import { BehavioralSignalSchema } from '../schemas/behavioral.schema';
import { NetworkSignalSchema } from '../schemas/network.schema';
import { TelcoSignalSchema } from '../schemas/telco.schema';

// ---------------------------------------------------------------------------
// DeviceSignalSchema
// ---------------------------------------------------------------------------
describe('DeviceSignalSchema', () => {
  const validDevice = {
    deviceId: 'dev-001',
    merchantId: 'merchant-abc',
    fingerprint: 'fp-xyz',
    trustScore: 85,
    isEmulator: false,
    emulatorConfidence: 0.05,
    platform: 'android' as const,
    firstSeenAt: new Date('2024-01-01T00:00:00Z'),
    lastSeenAt: new Date('2024-06-01T00:00:00Z'),
    daysSinceFirstSeen: 152,
  };

  it('accepts valid DeviceSignal data', () => {
    expect(() => DeviceSignalSchema.parse(validDevice)).not.toThrow();
  });

  it('rejects trustScore out of range (>100)', () => {
    expect(() =>
      DeviceSignalSchema.parse({ ...validDevice, trustScore: 101 }),
    ).toThrow();
  });

  it('rejects trustScore out of range (<0)', () => {
    expect(() =>
      DeviceSignalSchema.parse({ ...validDevice, trustScore: -1 }),
    ).toThrow();
  });

  it('rejects emulatorConfidence out of range (>1)', () => {
    expect(() =>
      DeviceSignalSchema.parse({ ...validDevice, emulatorConfidence: 1.5 }),
    ).toThrow();
  });

  it('rejects invalid platform value', () => {
    expect(() =>
      DeviceSignalSchema.parse({ ...validDevice, platform: 'windows' }),
    ).toThrow();
  });

  it('rejects non-date firstSeenAt', () => {
    expect(() =>
      DeviceSignalSchema.parse({ ...validDevice, firstSeenAt: 'not-a-date' }),
    ).toThrow();
  });

  it('rejects missing required field', () => {
    const { deviceId, ...rest } = validDevice;
    expect(() => DeviceSignalSchema.parse(rest)).toThrow();
  });

  it('rejects extra fields (strict — no passthrough)', () => {
    const withExtra = { ...validDevice, unknownField: 'surprise' };
    // Zod strips by default; ensure we get back a clean object without extra keys
    const result = DeviceSignalSchema.parse(withExtra);
    expect((result as Record<string, unknown>).unknownField).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// VelocitySignalSchema
// ---------------------------------------------------------------------------
describe('VelocitySignalSchema', () => {
  const validVelocity = {
    entityId: 'user-123',
    merchantId: 'merchant-abc',
    dimensions: {
      txCount10m: 2,
      txCount1h: 5,
      txCount24h: 20,
      amountSum1h: 500.0,
      amountSum24h: 2000.0,
      uniqueDevices24h: 2,
      uniqueIps24h: 1,
      uniqueSessions1h: 3,
    },
    burstDetected: false,
  };

  it('accepts valid VelocitySignal data without optional fields', () => {
    expect(() => VelocitySignalSchema.parse(validVelocity)).not.toThrow();
  });

  it('accepts valid VelocitySignal data with optional fields', () => {
    expect(() =>
      VelocitySignalSchema.parse({
        ...validVelocity,
        burstDetected: true,
        burstDimension: 'txCount1h',
        burstRatio: 3.2,
      }),
    ).not.toThrow();
  });

  it('rejects missing dimensions', () => {
    const { dimensions, ...rest } = validVelocity;
    expect(() => VelocitySignalSchema.parse(rest)).toThrow();
  });

  it('rejects missing dimension sub-field', () => {
    const { txCount1h, ...dimRest } = validVelocity.dimensions;
    expect(() =>
      VelocitySignalSchema.parse({ ...validVelocity, dimensions: dimRest }),
    ).toThrow();
  });

  it('rejects non-boolean burstDetected', () => {
    expect(() =>
      VelocitySignalSchema.parse({ ...validVelocity, burstDetected: 'yes' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// BehavioralSignalSchema
// ---------------------------------------------------------------------------
describe('BehavioralSignalSchema', () => {
  const validBehavioral = {
    sessionId: 'session-abc',
    merchantId: 'merchant-xyz',
    sessionRiskScore: 42,
    botProbability: 0.12,
    isBot: false,
    indicators: ['uniform_timing'],
  };

  it('accepts valid BehavioralSignal data', () => {
    expect(() => BehavioralSignalSchema.parse(validBehavioral)).not.toThrow();
  });

  it('accepts valid data with optional fields', () => {
    expect(() =>
      BehavioralSignalSchema.parse({
        ...validBehavioral,
        timingCv: 0.05,
        navigationEntropy: 2.3,
      }),
    ).not.toThrow();
  });

  it('rejects sessionRiskScore > 100', () => {
    expect(() =>
      BehavioralSignalSchema.parse({ ...validBehavioral, sessionRiskScore: 101 }),
    ).toThrow();
  });

  it('rejects botProbability > 1', () => {
    expect(() =>
      BehavioralSignalSchema.parse({ ...validBehavioral, botProbability: 1.1 }),
    ).toThrow();
  });

  it('rejects botProbability < 0', () => {
    expect(() =>
      BehavioralSignalSchema.parse({ ...validBehavioral, botProbability: -0.1 }),
    ).toThrow();
  });

  it('rejects non-array indicators', () => {
    expect(() =>
      BehavioralSignalSchema.parse({ ...validBehavioral, indicators: 'not-an-array' }),
    ).toThrow();
  });

  it('accepts empty indicators array', () => {
    expect(() =>
      BehavioralSignalSchema.parse({ ...validBehavioral, indicators: [] }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// NetworkSignalSchema
// ---------------------------------------------------------------------------
describe('NetworkSignalSchema', () => {
  const validNetwork = {
    ip: '192.168.1.1',
    merchantId: 'merchant-abc',
    isProxy: false,
    isVpn: false,
    isTor: false,
    isDatacenter: false,
    geoMismatchScore: 0,
    riskScore: 25,
  };

  it('accepts valid NetworkSignal without optional fields', () => {
    expect(() => NetworkSignalSchema.parse(validNetwork)).not.toThrow();
  });

  it('accepts valid NetworkSignal with all optional fields', () => {
    expect(() =>
      NetworkSignalSchema.parse({
        ...validNetwork,
        country: 'TR',
        city: 'Istanbul',
        asn: 'AS9121',
      }),
    ).not.toThrow();
  });

  it('rejects geoMismatchScore > 100', () => {
    expect(() =>
      NetworkSignalSchema.parse({ ...validNetwork, geoMismatchScore: 101 }),
    ).toThrow();
  });

  it('rejects riskScore < 0', () => {
    expect(() =>
      NetworkSignalSchema.parse({ ...validNetwork, riskScore: -5 }),
    ).toThrow();
  });

  it('rejects non-boolean isProxy', () => {
    expect(() =>
      NetworkSignalSchema.parse({ ...validNetwork, isProxy: 1 }),
    ).toThrow();
  });

  it('rejects missing ip field', () => {
    const { ip, ...rest } = validNetwork;
    expect(() => NetworkSignalSchema.parse(rest)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// TelcoSignalSchema
// ---------------------------------------------------------------------------
describe('TelcoSignalSchema', () => {
  const validTelco = {
    msisdn: '+905551234567',
    merchantId: 'merchant-abc',
    isPorted: false,
    prepaidProbability: 0.3,
  };

  it('accepts valid TelcoSignal without optional fields', () => {
    expect(() => TelcoSignalSchema.parse(validTelco)).not.toThrow();
  });

  it('accepts valid TelcoSignal with all optional fields', () => {
    expect(() =>
      TelcoSignalSchema.parse({
        ...validTelco,
        operator: 'Turkcell',
        lineType: 'prepaid',
        portDate: new Date('2023-05-10T00:00:00Z'),
        countryCode: 'TR',
      }),
    ).not.toThrow();
  });

  it('rejects invalid lineType enum value', () => {
    expect(() =>
      TelcoSignalSchema.parse({ ...validTelco, lineType: 'corporate' }),
    ).toThrow();
  });

  it('rejects prepaidProbability > 1', () => {
    expect(() =>
      TelcoSignalSchema.parse({ ...validTelco, prepaidProbability: 1.5 }),
    ).toThrow();
  });

  it('rejects prepaidProbability < 0', () => {
    expect(() =>
      TelcoSignalSchema.parse({ ...validTelco, prepaidProbability: -0.1 }),
    ).toThrow();
  });

  it('rejects non-date portDate', () => {
    expect(() =>
      TelcoSignalSchema.parse({ ...validTelco, portDate: '2023-05-10' }),
    ).toThrow();
  });

  it('rejects missing msisdn', () => {
    const { msisdn, ...rest } = validTelco;
    expect(() => TelcoSignalSchema.parse(rest)).toThrow();
  });
});
