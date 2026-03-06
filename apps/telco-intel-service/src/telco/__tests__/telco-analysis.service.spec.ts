import { TelcoAnalysisService } from '../telco-analysis.service';
import { TelcoInput } from '../telco.types';

describe('TelcoAnalysisService', () => {
  let service: TelcoAnalysisService;

  beforeEach(() => {
    service = new TelcoAnalysisService();
  });

  // Test 1: VoIP lineType adds +30 to riskScore
  it('should add +30 to riskScore for voip lineType', () => {
    const input: TelcoInput = {
      phoneNumber: '+15551234567',
      lineType: 'voip',
      carrierName: 'SomeLegitCarrier',
    };
    const result = service.analyze(input);
    expect(result.riskScore).toBe(30);
    expect(result.isVoip).toBe(true);
  });

  // Test 2: Disposable carrier (google voice) adds +40
  it('should add +40 to riskScore for disposable carrier (google voice)', () => {
    const input: TelcoInput = {
      phoneNumber: '+15551234567',
      carrierName: 'Google Voice',
      lineType: 'mobile',
    };
    const result = service.analyze(input);
    expect(result.riskScore).toBe(40);
    expect(result.isDisposable).toBe(true);
  });

  // Test 3: Burner carrier adds +25
  it('should add +25 to riskScore for burner carrier', () => {
    const input: TelcoInput = {
      phoneNumber: '+15551234567',
      carrierName: 'Burner App',
      lineType: 'mobile',
    };
    const result = service.analyze(input);
    expect(result.riskScore).toBe(25);
    expect(result.isBurner).toBe(true);
  });

  // Test 4: Country mismatch (ZA vs US) adds +20
  it('should add +20 to riskScore for country mismatch', () => {
    const input: TelcoInput = {
      phoneNumber: '+27821234567',
      countryCode: 'ZA',
      sessionCountryCode: 'US',
      lineType: 'mobile',
      carrierName: 'Vodacom',
    };
    const result = service.analyze(input);
    expect(result.riskScore).toBe(20);
    expect(result.countryMismatch).toBe(true);
  });

  // Test 5: Multiple factors stack: voip + disposable = 70 (clamped if over 100)
  it('should stack multiple risk factors (voip + disposable = 70)', () => {
    const input: TelcoInput = {
      phoneNumber: '+15551234567',
      lineType: 'voip',
      carrierName: 'Google Voice',
    };
    const result = service.analyze(input);
    expect(result.riskScore).toBe(70);
    expect(result.isVoip).toBe(true);
    expect(result.isDisposable).toBe(true);
  });

  // Test 6: No phoneNumber returns riskScore exactly 50
  it('should return riskScore=50 when no phoneNumber is provided', () => {
    const input: TelcoInput = {
      lineType: 'mobile',
      carrierName: 'Vodacom',
    };
    const result = service.analyze(input);
    expect(result.riskScore).toBe(50);
  });

  // Test 7: No phoneNumber overrides other factors (riskScore=50 regardless)
  it('should override all factors with riskScore=50 when no phoneNumber', () => {
    const input: TelcoInput = {
      lineType: 'voip',
      carrierName: 'Google Voice',
      countryCode: 'ZA',
      sessionCountryCode: 'US',
    };
    const result = service.analyze(input);
    expect(result.riskScore).toBe(50);
  });

  // Test 8: Clean mobile carrier returns riskScore=0
  it('should return riskScore=0 for clean mobile carrier', () => {
    const input: TelcoInput = {
      phoneNumber: '+15551234567',
      lineType: 'mobile',
      carrierName: 'Verizon',
      countryCode: 'US',
      sessionCountryCode: 'US',
    };
    const result = service.analyze(input);
    expect(result.riskScore).toBe(0);
  });

  // Test 9: riskScore always in [0, 100]
  it('should clamp riskScore to [0, 100]', () => {
    const input: TelcoInput = {
      phoneNumber: '+15551234567',
      lineType: 'voip',
      carrierName: 'Google Voice Burner',
      countryCode: 'ZA',
      sessionCountryCode: 'US',
    };
    const result = service.analyze(input);
    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  // Test 10: isVoip=false for mobile lineType
  it('should return isVoip=false for mobile lineType', () => {
    const input: TelcoInput = {
      phoneNumber: '+15551234567',
      lineType: 'mobile',
      carrierName: 'AT&T',
    };
    const result = service.analyze(input);
    expect(result.isVoip).toBe(false);
  });

  // Test 11: isDisposable=false for legitimate carrier
  it('should return isDisposable=false for legitimate carrier', () => {
    const input: TelcoInput = {
      phoneNumber: '+15551234567',
      lineType: 'mobile',
      carrierName: 'T-Mobile',
    };
    const result = service.analyze(input);
    expect(result.isDisposable).toBe(false);
  });

  // Test 12: confidence=0.3 when no phoneNumber, 0.8 when phoneNumber present
  it('should return confidence=0.3 when no phoneNumber and 0.8 when present', () => {
    const withPhone = service.analyze({ phoneNumber: '+15551234567', lineType: 'mobile' });
    const withoutPhone = service.analyze({ lineType: 'mobile' });
    expect(withPhone.confidence).toBe(0.8);
    expect(withoutPhone.confidence).toBe(0.3);
  });

  // Test 13: countryMismatch=false when countries match
  it('should return countryMismatch=false when countries match', () => {
    const input: TelcoInput = {
      phoneNumber: '+15551234567',
      countryCode: 'US',
      sessionCountryCode: 'US',
      lineType: 'mobile',
      carrierName: 'Verizon',
    };
    const result = service.analyze(input);
    expect(result.countryMismatch).toBe(false);
  });

  // Test 14: countryMismatch=false when sessionCountryCode not provided
  it('should return countryMismatch=false when sessionCountryCode not provided', () => {
    const input: TelcoInput = {
      phoneNumber: '+27821234567',
      countryCode: 'ZA',
      lineType: 'mobile',
      carrierName: 'Vodacom',
    };
    const result = service.analyze(input);
    expect(result.countryMismatch).toBe(false);
  });
});
