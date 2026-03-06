# Skill: signal-contracts

## Metadata
| Key | Value |
|-----|-------|
| **Agent Types** | BACKEND_NODE |
| **Category** | backend |

## Description
Typed signal contracts shared across all SignalRisk intelligence modules. Defined as TypeScript interfaces in `packages/signal-contracts/` and imported by the Rule Engine and Decision Engine. Changes after Sprint 3 freeze require impact assessment.

## Patterns
- Shared npm package: `@signalrisk/signal-contracts`
- One interface per intelligence module
- Semantic versioning: breaking changes = major version bump
- Rule Engine imports these types for type-safe evaluation
- Signal contracts frozen after Sprint 3 milestone

## Code Examples
```typescript
// packages/signal-contracts/src/index.ts

export interface DeviceSignals {
  device_id: string;
  trust_score: number;          // 0-100
  is_emulator: boolean;
  fingerprint_stability: number; // 0-1.0
  days_since_first_seen: number;
}

export interface VelocitySignals {
  tx_count_1h: number;
  tx_count_24h: number;
  amount_sum_1h: number;
  unique_devices_24h: number;
  burst_detected: boolean;
}

export interface BehavioralSignals {
  session_risk_score: number;    // 0-100
  timing_cv: number;            // coefficient of variation
  nav_entropy: number;          // navigation entropy
  is_bot: boolean;
  bot_confidence: number;       // 0-1.0
}

export interface NetworkSignals {
  is_proxy: boolean;
  is_vpn: boolean;
  is_tor: boolean;
  geo_mismatch: boolean;
  country_code: string;
  risk_country: boolean;
}

export interface TelcoSignals {
  carrier_name: string;
  msisdn_type: 'prepaid' | 'postpaid' | 'unknown';
  sim_swap_days: number | null;  // null if not available
  line_type: string;
  enrichment_available: boolean;
}

// Combined signal set for Decision Engine
export interface AllSignals {
  device?: DeviceSignals;
  velocity?: VelocitySignals;
  behavioral?: BehavioralSignals;
  network?: NetworkSignals;
  telco?: TelcoSignals;
  available: string[];  // list of available signal types
}
```

## Constraints
- Signal contracts are FROZEN after Sprint 3 -- changes require Rule Engine impact assessment
- All fields must have JSDoc comments explaining units and ranges
- Optional fields (marked with `?`) indicate the module may be unavailable (graceful degradation)
- Published as npm package: `@signalrisk/signal-contracts`
- Breaking changes require major version bump and E7 (Rule Engine) migration
