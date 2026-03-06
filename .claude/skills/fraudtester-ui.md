# Skill: fraudtester-ui

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | FRAUDTESTER_UI |
| **Category** | frontend |
| **Dependencies** | react-dashboard |

## Description
FraudTester UI sayfaları, Battle Arena real-time görselleştirme, ve adversarial fraud simulation platformu. Zustand store ile state yönetimi, Recharts ile detection rate gauge ve trend chart, mock setInterval ile live attack feed üretimi.

## Patterns
- **3-panel layout:** Attack Team (left, w-48) + Detection Score + Live Feed (center, flex-1) + Configuration (right, w-56)
- **RadialBarChart gauge:** `startAngle={200} endAngle={-20}`, `innerRadius="60%"` ile yarım daire gauge. Değer 0-100 arası `detectionRate * 100`. Renk: ≥80 green-500, ≥60 yellow-400, <60 red-500.
- **Mock data ile geliştirme:** `setInterval` her 600ms bir `AttackResult` üretir. Karar dağılımı: %70 BLOCKED, %15 DETECTED, %15 MISSED. Senaryo pool: 'Device Farm', 'Emulator Spoof', 'Bot Checkout', 'Velocity Evasion', 'SIM Swap'.
- **Store-driven UI:** `useFraudTesterStore` tek source-of-truth. `startBattle()` / `stopBattle()` / `updateConfig()` / `_addResult()`. liveFeed max 50 FIFO, battleHistory max 10.
- **Scenario filter + debounce:** FilterCategory pills + SortKey select + 300ms debounced search input.
- **Detection rate progress bar:** ≥90% `bg-green-500`, 70-89% `bg-yellow-400`, <70% `bg-red-500`.

## Code Examples

### fraud-tester.store.ts pattern
```typescript
import { create } from 'zustand';
import type { BattleStatus, BattleStats, AttackResult, BattleConfig, BattleHistoryEntry } from '../types/fraud-tester.types';

let _intervalId: ReturnType<typeof setInterval> | null = null;

export const useFraudTesterStore = create<FraudTesterStore>((set, get) => ({
  battleStatus: 'idle',
  // ...initial state...

  startBattle: () => {
    set({ battleStatus: 'running', liveFeed: [], stats: emptyStats });
    _intervalId = setInterval(() => {
      const { battleStatus } = get();
      if (battleStatus !== 'running') { clearInterval(_intervalId!); return; }
      const result = generateMockAttack(get().config);
      get()._addResult(result);
    }, 600);
  },

  stopBattle: () => {
    if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
    const { stats, battleHistory } = get();
    const entry: BattleHistoryEntry = { id: `battle-${Date.now()}`, timestamp: new Date().toISOString(), stats: { ...stats } };
    set({ battleStatus: 'completed', battleHistory: [entry, ...battleHistory].slice(0, 10) });
  },

  _addResult: (result) => {
    set((state) => {
      const newFeed = [result, ...state.liveFeed].slice(0, 50);
      return { liveFeed: newFeed, stats: calcStats(newFeed) };
    });
  },
}));
```

### DetectionRateGauge component
```tsx
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';

function DetectionGauge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const fill = pct >= 80 ? '#22c55e' : pct >= 60 ? '#eab308' : '#ef4444';
  const data = [{ name: 'Detection', value: pct, fill }];
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={160}>
        <RadialBarChart innerRadius="60%" outerRadius="90%" data={data} startAngle={200} endAngle={-20} barSize={16}>
          <RadialBar dataKey="value" background={{ fill: '#1e293b' }} cornerRadius={8} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-4xl font-bold tabular-nums text-text-primary">{pct}%</span>
      </div>
    </div>
  );
}
```

## Constraints
- TypeScript strict — tüm tipler `fraud-tester.types.ts`'den import edilmeli
- WCAG 2.1 AA — her karar tipi (BLOCKED/DETECTED/MISSED) hem renk hem metin ile ayırt edilmeli
- Mock data ile çalışmalı — backend bağlantısı Sprint 18'de gelecek
- `pnpm build` hata vermemeli — unused import yoktur
- Interval temizleme: `stopBattle()` ve component unmount sırasında interval kesinlikle temizlenmeli
- liveFeed max 50 öğe (FIFO), battleHistory max 10 öğe
