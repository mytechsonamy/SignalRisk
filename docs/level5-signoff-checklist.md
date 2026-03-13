# SignalRisk Level 5 Signoff Checklist

> Date: 12 March 2026
> Purpose: final release-readiness checklist for declaring Level 5 production readiness

## 1. Evidence Integrity

- [x] `scripts/generate-evidence.sh` no longer writes static `PASS` for checks that were not actually executed
- [x] every blocking test section records `execution_status`
- [x] every blocking test section records `report_collection_status`
- [x] failed blocking tests appear as `FAILED`, not `unknown`
- [x] evidence pack does not hide execution failures behind successful report generation

## 2. G8 Release Trust

- [x] `G8` fails when the target sprint or release evidence is stale
- [x] `G8` fails when blocker or waiver status is missing
- [x] `G8` fails when signoff fields are missing
- [x] `G8` verifies required evidence sections, not just file presence
- [x] `G8` output matches the actual current release target

## 3. Runtime Telemetry

- [x] `signalrisk.entity_profile.update_errors` is emitted on entity profile update failure
- [x] `signalrisk.feature_snapshot.write_errors` is emitted on snapshot write failure
- [x] `signalrisk.watchlist.check_timeouts` is emitted on watchlist timeout fallback
- [x] `signalrisk.entity_type.fallbacks` is emitted on missing `entityType`
- [x] decision-service emits decision telemetry for normal, denylist, and cached decision paths

## 4. Prod-Like Validation

- [ ] prod-like validation runs without seed-login fallback
- [ ] operator invite -> login -> password change flow passes
- [ ] RS256 WebSocket tenant isolation passes
- [ ] `entityType` is preserved from decision -> case -> label -> watchlist
- [ ] FRAUD -> denylist -> next decision BLOCK path passes
- [ ] LEGITIMATE -> allowlist cooldown path passes
- [ ] feature snapshot persistence is verified against `decision_feature_snapshots`

## 5. Auth and Seed Boundaries

- [x] password grant is explicitly unsupported or fully implemented, with docs matching reality
- [x] no support script depends on hardcoded dashboard credentials
- [x] dev-only seed credentials are documented as dev-only
- [x] production-like validation paths do not depend on seed fallback behavior

## 6. Documentation Sync

- [x] `docs/TECHNICAL.md` matches the actual auth and decision behavior
- [x] `docs/USER-GUIDE.md` matches the real operator login flow
- [x] `docs/testing/uat-plan.md` includes the current prod-like validation profile
- [x] `docs/architecture/system-overview.md` reflects current ports, topics, and feedback loop behavior
- [x] `docs/level5-final-hardening-plan.md` reflects current blocker status

## 7. Final Signoff

- [ ] latest sprint or release evidence pack is attached
- [ ] open blockers are explicitly listed, or `no blockers` is stated
- [ ] waivers are explicitly listed, or `no waivers` is stated
- [ ] release recommendation is explicitly stated
- [ ] final signoff includes author and date

## Release Verdict

- [ ] Level 5 READY
- [ ] Level 5 NOT READY

Notes:
