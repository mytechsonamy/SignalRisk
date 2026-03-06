# Skill: adversarial-testing

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | FRAUD_TESTER_BACKEND |
| **Category** | testing |
| **Dependencies** | fraud-simulation, fraudtester-adapter |

## Description
Adversarial testing, fraud detection sistemini yenmeye çalışan red team yaklaşımıdır. Normal fraud simulation'dan farkı: adversarial agent tespit edilmemeyi hedefler, yani düşük TPR (true positive rate) adversarial başarı anlamına gelir. Chaos agent ise sistemin dayanıklılığını test eder — detection oranı değil, hata toleransı ve graceful degradation ölçülür.

## Patterns

### Adversarial Başarı Metrikleri (Ters Yorumlama)
- **Normal simulation:** Yüksek TPR = iyi (sistem fraudu yakalıyor)
- **Adversarial simulation:** Düşük TPR = adversarial başarı (saldırgan sistemi atlatıyor)
- `detectionRate` 0.12 → adversarial agent %88 başarı oranında sistemi atlatıyor
- UI'da "Kaçış Oranı" (escape rate) gösterilir, progress bar rengi tersine çevrilir: düşük = kötü sinyal

### Adversarial Attack Patterns

**Emulator Bypass:**
- Gerçek cihaz metadatasını (GPU renderer, sensor data, build props) kopyalar
- Emulator detection signal'larını (isEmulator flag, motion sensor absence) maskeler
- Hedef: `device-intel-service`'in emulator tespitini atlatmak

**Slow Fraud:**
- İşlemleri 12 saate yayarak velocity threshold'larının altında kalır
- Her işlem arası random delay: `Math.random() * 3600000` ms (0-60 dakika)
- Hedef: `velocity-service`'in `txPerHour` limitini aşmadan fraud gerçekleştirmek

**Bot Evasion:**
- İnsan benzeri davranış: mouse trajectory noise, typing cadence jitter, scroll events
- Session duration'ı normal dağılıma yakın tutar (Gaussian noise)
- Hedef: `behavioral-service`'in bot detection signal'larını atlatmak

### Chaos Injection Patterns

**Timeout Injection:**
- Her request'e configurable timeout ekler (`timeoutMs`: 100ms-30s)
- Graceful degradation testi: partial signal ile karar verebiliyor mu?
- Beklenen: sistem timeout olan sinyali "unavailable" olarak işaretler, kalan sinyallerle karar üretir

**Partial Failure:**
- `failureRate` oranında (%0-50) network hataları inject eder
- Remaining events'in işlenip işlenmediğini doğrular
- Beklenen: failed events DLQ'ya düşer, successful events normal akışta işlenir

**Stress Test:**
- 500 event/s burst ile rate limiting ve backpressure davranışını test eder
- Beklenen: `event-collector` rate limit'e göre 429 döner, Kafka backpressure devreye girer

### ChaosAdapterWrapper Decorator Pattern
Mevcut fraud-tester adapter'ını wrap ederek chaos inject eder:

```typescript
export class ChaosAdapterWrapper implements FraudTesterAdapter {
  constructor(
    private readonly inner: FraudTesterAdapter,
    private readonly chaosMode: 'timeout' | 'partialFailure' | 'stress' | 'all',
    private readonly failureRate: number = 0.3,
    private readonly timeoutMs: number = 5000,
  ) {}

  async submitEvent(event: FraudEvent): Promise<DecisionResponse> {
    if (this.chaosMode === 'timeout' || this.chaosMode === 'all') {
      await this.injectTimeout();
    }
    if (this.chaosMode === 'partialFailure' || this.chaosMode === 'all') {
      if (Math.random() < this.failureRate) {
        throw new Error('ChaosAdapter: injected network failure');
      }
    }
    return this.inner.submitEvent(event);
  }

  private injectTimeout(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.timeoutMs));
  }
}
```

## Code Examples

### AdversarialAgent kullanımı
```typescript
import { AdversarialAgent } from './agents/adversarial.agent';

const agent = new AdversarialAgent({
  attackPattern: 'emulator-bypass',
  intensity: 7,           // 1-10; yüksek yoğunluk = daha sofistike evasion
  targetAdapter: adapter,
});

const result = await agent.runScenario('adversarial-emulator-bypass');
// result.detectionRate düşükse adversarial başarılı:
// 0.12 → agent %88 oranında tespiti atlatıyor (adversarial WIN)
// 0.85 → sistem %85 oranında saldırıyı tespit ediyor (defense WIN)

console.log(`Adversarial escape rate: ${((1 - result.detectionRate) * 100).toFixed(0)}%`);
```

### ChaosAdapterWrapper örneği
```typescript
import { SignalRiskAdapter } from './adapters/signalrisk.adapter';
import { ChaosAdapterWrapper } from './adapters/chaos-wrapper.adapter';

const base = new SignalRiskAdapter({ baseUrl: 'http://localhost:3002' });

// Partial failure modu: %30 request hata alır
const chaosAdapter = new ChaosAdapterWrapper(base, 'partialFailure', 0.3);

// Timeout modu: her request 5s gecikmeli
const timeoutAdapter = new ChaosAdapterWrapper(base, 'timeout', 0, 5000);

// Stress test: wrapper olmadan doğrudan yüksek concurrency ile çağır
const stressResults = await Promise.allSettled(
  Array.from({ length: 500 }, () => base.submitEvent(generateEvent()))
);
const successCount = stressResults.filter((r) => r.status === 'fulfilled').length;
console.log(`Stress test throughput: ${successCount}/500 events processed`);
```

## Constraints
- Adversarial `detectionRate` 0-1 arası float; UI'da ters yorumla: düşük = adversarial başarısı
- Chaos senaryolarda `detectionRate` null olabilir — N/A göster, bar render etme
- `ChaosAdapterWrapper` mevcut adapter interface'ini implement etmeli — LSP ihlal etme
- Stress test 500 event/s: `event-collector` rate limit (1000/min) altında — 429 beklenmez
- Chaos inject'te thrown Error'lar DLQ flow'unu test eder — swallow etme
- `timeoutMs` sadece Timeout modunda aktif; Partial Failure modunda `failureRate` aktif
- Her iki agent da `AgentSettings.enabled: true` ile başlar (Sprint 19'dan itibaren)
