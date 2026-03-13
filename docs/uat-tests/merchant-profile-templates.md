# SignalRisk Synthetic Merchant Profile Templates

## 1. Purpose

These templates define the minimum merchant profiles required for synthetic UAT and production-like fraud simulation.

They are intended to be converted into JSON or YAML fixtures under a future `tests/simulation/profiles/` directory.

## 2. Shared Profile Schema

Use the following shape for all merchant profiles:

```yaml
profile_id: M1
name: low-risk-merchant
merchant_type: wallet | gaming | carrier-billing | checkout
risk_band: low | medium | high
regions:
  - TR
  - AE
daily_event_volume:
  min: 10000
  max: 30000
traffic_pattern:
  weekday_peak_hours: [10, 11, 12, 20, 21]
  burst_windows:
    - start_hour: 20
      duration_minutes: 45
event_mix:
  LOGIN: 0.35
  SIGNUP: 0.15
  PAYMENT: 0.40
  CHECKOUT: 0.10
truth_mix:
  legitimate: 0.90
  suspicious: 0.08
  fraud: 0.02
entity_behavior:
  avg_events_per_customer_per_day: 2.1
  avg_devices_per_customer: 1.2
  avg_accounts_per_device: 1.1
  shared_ip_rate: 0.08
fraud_modes:
  - device_farm
  - promo_abuse
webhook_behavior:
  enabled: true
  response_mode: 200_fast
analyst_behavior:
  fraud_confirm_rate: 0.65
  false_positive_rate: 0.08
  inconclusive_rate: 0.27
simulation_notes:
  - campaign windows should not automatically be treated as fraud
```

## 3. Profile M1 — Low-Risk Merchant

Use for:

- calm baseline traffic
- low false-positive tolerance
- proving the system does not over-block good traffic

```yaml
profile_id: M1
name: low-risk-wallet
merchant_type: wallet
risk_band: low
regions: [TR]
daily_event_volume:
  min: 10000
  max: 30000
traffic_pattern:
  weekday_peak_hours: [9, 10, 18, 19]
  burst_windows: []
event_mix:
  LOGIN: 0.40
  SIGNUP: 0.10
  PAYMENT: 0.45
  CHECKOUT: 0.05
truth_mix:
  legitimate: 0.94
  suspicious: 0.04
  fraud: 0.02
entity_behavior:
  avg_events_per_customer_per_day: 1.8
  avg_devices_per_customer: 1.1
  avg_accounts_per_device: 1.05
  shared_ip_rate: 0.05
fraud_modes:
  - occasional_proxy_use
  - low_volume_account_takeover
webhook_behavior:
  enabled: true
  response_mode: 200_fast
analyst_behavior:
  fraud_confirm_rate: 0.50
  false_positive_rate: 0.10
  inconclusive_rate: 0.40
```

## 4. Profile M2 — Growth Merchant

Use for:

- mixed legitimate and suspicious traffic
- campaign spikes
- repeat same-day actions that should not all be blocked

```yaml
profile_id: M2
name: growth-checkout-merchant
merchant_type: checkout
risk_band: medium
regions: [TR, AE]
daily_event_volume:
  min: 50000
  max: 200000
traffic_pattern:
  weekday_peak_hours: [11, 12, 20, 21]
  burst_windows:
    - start_hour: 20
      duration_minutes: 60
event_mix:
  LOGIN: 0.25
  SIGNUP: 0.15
  PAYMENT: 0.45
  CHECKOUT: 0.15
truth_mix:
  legitimate: 0.85
  suspicious: 0.10
  fraud: 0.05
entity_behavior:
  avg_events_per_customer_per_day: 2.7
  avg_devices_per_customer: 1.3
  avg_accounts_per_device: 1.2
  shared_ip_rate: 0.10
fraud_modes:
  - promo_abuse
  - slow_fraud
  - high_amount_new_device
webhook_behavior:
  enabled: true
  response_mode: 200_variable
analyst_behavior:
  fraud_confirm_rate: 0.58
  false_positive_rate: 0.12
  inconclusive_rate: 0.30
```

## 5. Profile M3 — High-Risk Merchant

Use for:

- aggressive fraud testing
- stateful and graph-heavy detection
- account farming, bot abuse, device sharing

```yaml
profile_id: M3
name: high-risk-gaming-billing
merchant_type: carrier-billing
risk_band: high
regions: [TR, EG, ZA]
daily_event_volume:
  min: 100000
  max: 500000
traffic_pattern:
  weekday_peak_hours: [14, 15, 21, 22, 23]
  burst_windows:
    - start_hour: 14
      duration_minutes: 30
    - start_hour: 21
      duration_minutes: 90
event_mix:
  LOGIN: 0.20
  SIGNUP: 0.20
  PAYMENT: 0.40
  CHECKOUT: 0.20
truth_mix:
  legitimate: 0.75
  suspicious: 0.12
  fraud: 0.13
entity_behavior:
  avg_events_per_customer_per_day: 4.3
  avg_devices_per_customer: 1.5
  avg_accounts_per_device: 1.8
  shared_ip_rate: 0.18
fraud_modes:
  - device_farm
  - bot_checkout
  - emulator_proxy_combo
  - fraud_ring
  - repeat_block_retry
webhook_behavior:
  enabled: true
  response_mode: 200_or_retry
analyst_behavior:
  fraud_confirm_rate: 0.72
  false_positive_rate: 0.07
  inconclusive_rate: 0.21
```

## 6. Optional Specialized Profiles

If needed, add:

- `M4` campaign-heavy but legitimate merchant
- `M5` telco-heavy merchant with SIM-swap style events
- `M6` noisy low-quality traffic merchant for stress testing

## 7. Fixture Generation Guidance

When converting these templates into fixtures:

- keep stable `profile_id`
- use deterministic seeds per run
- make fraud ratio and volume overrideable via env vars
- preserve `truth_mix` separately from observed system outcomes

## 8. Acceptance Rule

These templates are only useful if every generated event can later be traced back to:

- merchant profile
- scenario id
- expected truth
- expected downstream result

Without that traceability, synthetic UAT becomes noise rather than evidence.
