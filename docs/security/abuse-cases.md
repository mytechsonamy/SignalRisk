# SignalRisk Abuse Case Review

**Document type:** Security Analysis
**Classification:** Internal — Confidential
**Version:** 1.0
**Date:** 2026-03-06
**Scope:** SignalRisk fraud detection platform — all services and shared infrastructure

---

## Executive Summary

SignalRisk is a real-time fraud decision engine processing high-throughput event streams across multiple merchant tenants. Its threat surface spans five distinct attack categories: client-side SDK manipulation, token credential abuse, multi-tenant isolation bypass, rate and velocity system subversion, and event pipeline abuse.

This document catalogues concrete abuse cases that a motivated adversary — ranging from an individual fraudster to an organized crime ring — could attempt against the platform. For each abuse case the document identifies: who would attempt the attack, how it works technically, what the attacker gains, what the codebase already mitigates, and what gaps remain.

**Key findings:**

- The most critical unmitigated gap is the event-collector API key validation stub (`events.controller.ts` line 117: `// In production, this would validate against a merchant API key store`). Any caller with a non-empty string in the `Authorization` header is currently accepted.
- The `registerDevice` method in `fingerprint.service.ts` uses string interpolation for the `SET LOCAL app.merchant_id` statement, creating a secondary SQL injection surface that bypasses the otherwise-parameterized query pattern.
- Burst detection has a cold-start blind spot: if `baseline < 0.1` the `BurstService` returns `detected: false` unconditionally, which is exploitable during account warm-up.
- The refresh token store is entirely in-process memory (`RefreshTokenStore`). A service restart silently invalidates all issued refresh tokens with no revocation audit trail.
- The outbox relay polls without row-level locking (`SELECT ... FOR UPDATE SKIP LOCKED`), leaving a window where two relay instances could double-publish the same events.

**Overall risk posture:** Medium-High. Core cryptographic primitives (RS256, bcrypt, RLS) are sound; the largest risks are in validation gaps at ingestion boundaries and in the immaturity of operational controls.

---

## Platform Architecture Reference

| Service | Port | Primary Function |
|---------|------|-----------------|
| auth-service | 3001 | OAuth2 `client_credentials`, RS256 JWT, JWKS endpoint, refresh tokens |
| event-collector | 3002 | REST event ingestion, Kafka producer, backpressure, schema validation |
| device-intel-service | 3003 | Device fingerprinting, trust scoring, emulator detection |
| velocity-service | 3004 | Redis sorted-set velocity counters (6 dimensions), burst detection |
| PostgreSQL | 5432 | Multi-tenant storage with RESTRICTIVE RLS (`app.current_merchant_id`) |
| Kafka | 9092 | Event streaming (`signalrisk.events.raw`, `signalrisk.events.dlq`) |
| Redis | 6379 | Velocity counters, device cache, token bucket (rate limiting) |

**JWT payload structure:**

```json
{
  "sub": "<merchant-or-user-uuid>",
  "merchant_id": "<uuid>",
  "role": "merchant | admin | analyst | viewer",
  "permissions": ["merchant"],
  "jti": "<uuid>",
  "iat": 1700000000,
  "exp": 1700003600,
  "iss": "signalrisk-auth"
}
```

---

## Abuse Case Index

| ID | Category | Title | Severity |
|----|----------|-------|----------|
| AC-01 | SDK Tampering | Fake device attributes (GPU, sensor noise, androidId) | High |
| AC-02 | SDK Tampering | Replay attack with captured device fingerprints | Medium |
| AC-03 | SDK Tampering | Client-side bypass of emulator detection | High |
| AC-04 | Token Theft | JWT bearer token theft via network interception | High |
| AC-05 | Token Theft | Refresh token exfiltration | Critical |
| AC-06 | Token Theft | JTI reuse attempt | Medium |
| AC-07 | Tenant Impersonation | JWT claims tampering (merchant_id field) | Critical |
| AC-08 | Tenant Impersonation | RLS bypass via SQL injection in device attributes | Critical |
| AC-09 | Tenant Impersonation | Cross-tenant timing side-channel | Medium |
| AC-10 | Rate Limit Bypass | Distributed rate limit evasion | High |
| AC-11 | Rate Limit Bypass | Backpressure manipulation (fake overload signals) | Medium |
| AC-12 | Velocity Manipulation | Synthetic event injection to normalize baselines | High |
| AC-13 | Velocity Manipulation | Slow ramp-up baseline poisoning | High |
| AC-14 | Velocity Manipulation | HyperLogLog collision attack | Low |
| AC-15 | Event Pipeline | Dead letter queue flooding | Medium |
| AC-16 | Event Pipeline | Schema validation bypass via crafted payloads | High |
| AC-17 | Event Pipeline | Outbox table tampering | Critical |
| AC-18 | Operational | JWKS cache staleness during key rotation | Medium |
| AC-19 | Operational | Health check / configuration endpoint disclosure | Low |

---

## 1. SDK Tampering

### AC-01 — Fake Device Attributes

**Severity:** High

**Threat actor:** Fraudster operating at scale (farms, automated tooling) who needs devices to appear legitimate in the trust scoring system.

**Attack vector:**

The device fingerprint is generated server-side from five fields supplied by the client SDK:

```
fingerprint = SHA-256(screenResolution | gpuRenderer | timezone | webglHash | canvasHash)
```

An attacker controlling the client runtime can inject arbitrary values for any of these fields. By spoofing a real device's `gpuRenderer` (e.g., `"ANGLE (Apple, Apple M2, OpenGL 4.1)"`) and matching `screenResolution` and `timezone`, the attacker produces a fingerprint that collides with a known-good device in the merchant's device store. This causes the fraud engine to inherit that device's trust score and history.

For `androidId` or sensor noise (`sensorNoise[]`), the emulator detection check only tests if all elements are exactly zero; a small amount of synthetic jitter (e.g., all values `0.001`) passes the heuristic while still coming from a software-emulated environment.

**Impact:**

- Attacker inherits trust score of a legitimate device.
- Emulator farms can operate with non-zero but artificially uniform sensor noise.
- Device history (first seen, last seen) is contaminated.

**Current mitigations:**

- Server-side fingerprint generation: the hash is computed from client-supplied attributes server-side (`fingerprint.service.ts:generateFingerprint`), so the fingerprint cannot itself be spoofed without matching the underlying fields.
- Emulator detection checks `gpuRenderer` against 8 known emulator patterns and checks for all-zero `sensorNoise`.
- `is_emulator` flag is persisted at registration; downstream consumers can act on it.

**Gaps / Recommendations:**

1. **No attestation of attribute authenticity.** Client-supplied attributes are trusted verbatim. Integrate Google Play Integrity API (Android) or Apple App Attest (iOS) so that the attributes bundle is accompanied by a platform-signed integrity verdict. Without this, attribute spoofing is trivial.
2. **Sensor noise heuristic is weak.** The current check (`sensorNoise.every(n => n === 0)`) only catches default emulators. Add a statistical distribution test: real IMU sensors produce Gaussian-distributed noise; perfectly uniform or low-variance noise should raise suspicion.
3. **No cross-merchant device tracking.** The same spoofed fingerprint used across multiple merchant tenants is invisible due to per-tenant partitioning. A global device reputation layer (hashed fingerprint, no PII) would expose farm reuse.

---

### AC-02 — Replay Attack with Captured Fingerprints

**Severity:** Medium

**Threat actor:** Adversary who has captured legitimate device attributes (e.g., via a compromised SDK or traffic intercept) and replays them from a different physical device.

**Attack vector:**

Device attributes are transmitted from the SDK to the server via HTTPS. If an attacker captures this payload (through a compromised TLS proxy, SDK decompilation + traffic interception, or data breach of a partner), they can replay the exact attribute set from any device. The server computes an identical SHA-256 fingerprint and classifies the replayed request as the legitimate device, inheriting its trust score.

Unlike a network session token, device attributes are stable across sessions — there is no nonce or challenge-response in the fingerprint protocol.

**Impact:**

- Attacker can impersonate any device indefinitely (attributes do not expire).
- Particularly dangerous in combination with stolen credentials (AC-04): attacker appears as both a known device and a legitimate token holder.

**Current mitigations:**

- Fingerprint is matched per `merchant_id`, so a fingerprint captured from merchant A cannot be directly replayed against merchant B without also having that merchant's API key.
- Fuzzy matching (Jaccard similarity on bigrams, threshold 0.85) would catch exact replays as a match rather than new registration, limiting trust score farming from replays.

**Gaps / Recommendations:**

1. **Introduce per-session freshness proof.** Include a server-issued challenge (short-lived nonce) that the client SDK signs using a device-bound key (Android Keystore / iOS Secure Enclave). The fingerprint submission then includes the signed challenge, proving the request originated from the physical device that holds the key.
2. **Detect impossible travel on fingerprint matches.** If the same fingerprint is seen from geographically disparate IPs within a physically impossible timeframe, flag the device as potentially replayed.
3. **Monitor for exact fingerprint reuse across sessions originating from different IPs** as a heuristic signal.

---

### AC-03 — Client-Side Bypass of Emulator Detection

**Severity:** High

**Threat actor:** Sophisticated fraud operator running at scale using Android emulators (e.g., LDPlayer, Memu, modified AOSP) or rooted physical devices.

**Attack vector:**

The emulator detection heuristics run entirely server-side but depend on client-supplied data:

```
emulatorGpuPatterns = ['swiftshader', 'llvmpipe', 'softpipe', 'chromium',
                       'google inc', 'android emulator', 'genymotion', 'bluestacks']
```

Modern emulators (LDPlayer, Memu, GameLoop) use GPU passthrough to real host GPUs or Vulkan translation layers, producing legitimate GPU renderer strings (e.g., `"Qualcomm Adreno (TM) 650"`) even on emulated hardware. An attacker can additionally hook the SDK's data collection layer to intercept and replace `gpuRenderer` with any string before it is transmitted.

The `sensorNoise` bypass is even simpler: send `[0.001, 0.002, -0.001]` — small but non-zero values that pass the all-zero check.

**Impact:**

- Emulator farms pass the `is_emulator` check and receive a default trust score of 50, enabling them to transact without being flagged.
- At scale, this enables high-volume automated fraud with no friction from the device layer.

**Current mitigations:**

- Pattern matching covers the most common legacy emulators.
- `is_emulator` flag is persisted; downstream risk scoring can use it.

**Gaps / Recommendations:**

1. **Server-side Play Integrity / App Attest integration** (same as AC-01). This is the primary control gap; without hardware attestation, any client-supplied attribute is spoofable.
2. **Behavioral signals.** Emulators exhibit characteristic behavioral patterns: perfect timing regularity, zero tap pressure, absence of gyroscope drift. Collect and analyze these server-side.
3. **Expand GPU pattern list and use allowlist approach.** Rather than a denylist of known emulator GPUs, maintain an allowlist of known real device GPU families and flag anything that does not match.
4. **Cross-signal consistency checks.** Validate that the declared `platform` is consistent with the reported `gpuRenderer` family and `screenResolution`. An "android" platform with an Intel Arc GPU string is inconsistent.

---

## 2. Token Theft and Reuse

### AC-04 — JWT Bearer Token Theft via Network Interception

**Severity:** High

**Threat actor:** Network-positioned adversary (compromised proxy, rogue Wi-Fi, insider at hosting provider) or attacker who has extracted a token from a client application's memory or log files.

**Attack vector:**

JWT access tokens are transmitted as HTTP `Authorization: Bearer <token>` headers. A stolen token remains valid until its `exp` claim is reached (1 hour per `issueToken` implementation). During this window, any bearer of the token has full API access as the victimized merchant, including event submission and data queries.

The `JwtStrategy` validates signature and issuer (`signalrisk-auth`) but does not bind the token to a specific IP address, device, or TLS session. There is no per-request jti revocation check.

**Impact:**

- 1-hour window of full merchant API access per stolen token.
- Attacker can submit fraudulent events as the victim merchant, corrupting their fraud baseline.
- Attacker can query device intelligence and velocity data for the victim's customers.

**Current mitigations:**

- RS256 signature validation prevents token forgery.
- `ignoreExpiration: false` enforces the `exp` claim.
- Issuer validation (`signalrisk-auth`) prevents tokens from other systems being accepted.
- HTTPS transport (assumed in production) prevents passive interception.

**Gaps / Recommendations:**

1. **Token binding (DPoP — RFC 9449).** Bind the access token to a client-held key pair. The client proves possession of the private key on each request; a stolen token without the private key cannot be used.
2. **Mutual TLS (mTLS).** Require client certificates for service-to-service API calls. Binds token usage to a specific authenticated TLS identity.
3. **JTI revocation on suspicious activity.** Implement a Redis-backed JTI denylist. When anomalous activity is detected from a token, the JTI is added to the denylist. Validation checks the denylist on each request (hot Redis lookup, sub-millisecond).
4. **Reduce access token lifetime.** Consider 15-minute access tokens with silent refresh to reduce the theft window.

---

### AC-05 — Refresh Token Exfiltration

**Severity:** Critical

**Threat actor:** Attacker with code execution on the auth-service host, or access to the process memory / heap dump.

**Attack vector:**

Refresh tokens are stored in `RefreshTokenStore`, which is an in-process JavaScript `Map`. The raw token value is hashed with SHA-256 (`JwtTokenService.hashRefreshToken`) before storage, which is correct. However:

1. The store is ephemeral: a service restart clears all refresh tokens, creating availability issues and eliminating the audit trail.
2. There is no persistence layer: refresh token metadata (issuance time, last-used time, associated IP) is never written to PostgreSQL. This means there is no forensic record of token usage.
3. If an attacker dumps the Node.js heap (e.g., via a memory corruption exploit, or a mis-configured `--inspect` flag), they can extract the raw token values from the `Map` before they are hashed, because the raw token is passed to `hashRefreshToken` and the return value is stored — but the raw token lives in the function call stack during the `save()` call and may be present in closures.
4. Refresh token rotation is implemented (old token is revoked on use), but if an attacker uses the refresh token before the legitimate user, the legitimate user's next refresh attempt will fail with no distinguishable error from expiration.

**Impact:**

- Persistent API access for the lifetime of the refresh token (typically 30 days).
- Legitimate user is silently locked out if an attacker uses the token first.
- No audit trail of which refresh tokens were issued or used.

**Current mitigations:**

- Refresh tokens are stored as SHA-256 hashes, not in plaintext.
- Token rotation is implemented: each use issues a new token and revokes the old one.
- `isValid()` checks both expiry and revocation status.

**Gaps / Recommendations:**

1. **Persist refresh tokens to PostgreSQL** with full metadata: `jti`, `user_id`, `merchant_id`, `issued_at`, `last_used_at`, `last_used_ip`, `revoked_at`, `revoked_reason`. This enables forensic analysis and survives restarts.
2. **Detect refresh token theft via usage anomalies.** Alert if a refresh token is presented from an IP that differs significantly from the issuance IP (geolocation check).
3. **Implement refresh token families.** If a previously-used (rotated) refresh token is presented, treat it as a theft indicator and revoke the entire token family immediately.
4. **Never pass raw token values through call chains.** Ensure the raw token is hashed at the boundary and the hash is what flows internally.

---

### AC-06 — JTI Reuse Attempt

**Severity:** Medium

**Threat actor:** Attacker who has obtained a valid JWT and attempts to reuse it after logout/revocation.

**Attack vector:**

Each JWT contains a `jti` (JWT ID) claim that uniquely identifies the token. The current `JwtStrategy.validate()` extracts the `jti` from the payload and returns it to the request context, but performs no revocation check against any denylist. If a merchant calls a logout/revocation endpoint, the current implementation only revokes the refresh token (via `refreshTokenStore.revokeByTokenHash`). The access token identified by its `jti` remains valid until its `exp`, with no way to invalidate it early.

**Impact:**

- Post-logout access tokens remain usable for up to 1 hour.
- An attacker who obtained a token before the user logged out can continue using it.

**Current mitigations:**

- Access tokens have a 1-hour expiry (`expiresIn: 3600`).
- RS256 signature prevents forging tokens with recycled JTIs.

**Gaps / Recommendations:**

1. **Redis JTI denylist for access token revocation.** On logout or credential compromise, add the `jti` to a Redis SET with TTL equal to the token's remaining lifetime. The `JwtStrategy.validate()` method checks the denylist before returning the user context. This is a hot path; use a pipelined Redis GET with sub-millisecond latency.
2. **Emit a structured audit log event on every token issuance and revocation** including `jti`, `merchant_id`, `issued_at`, `client_ip`.

---

## 3. Tenant Impersonation

### AC-07 — JWT Claims Tampering (merchant_id Field)

**Severity:** Critical

**Threat actor:** Authenticated merchant attempting to access another merchant's data, or an attacker who has obtained a JWT from any merchant and attempts to elevate to another tenant's context.

**Attack vector:**

The `merchant_id` claim in the JWT payload determines which tenant's data the requester can access. This claim gates the PostgreSQL RLS session variable (`app.current_merchant_id`) set before database queries. A successful attack would require either:

1. Forging a JWT with a different `merchant_id` — prevented by RS256 signature verification.
2. Decoding a legitimate JWT, modifying the payload, re-encoding the Base64, and submitting the malformed token — the signature would be invalid.
3. Obtaining a legitimate JWT issued to a high-privilege merchant and using it directly — this is authorization design, not cryptographic bypass.

However, the `JwtStrategy` is initialized with a static public key retrieved at startup (`keyManager.getCurrentSigningKey()`). If the key manager rotates keys without the strategy being re-initialized, the strategy will continue validating against the old key. A token signed with the new key would fail validation; a token signed with a compromised old key would still succeed.

**Impact:**

- Cross-tenant data access.
- Ability to submit fraudulent events to another merchant's pipeline.

**Current mitigations:**

- RS256 signature verification: only the auth-service's private key can produce valid tokens.
- Issuer check (`iss: 'signalrisk-auth'`) prevents tokens from other systems.
- `ignoreExpiration: false` enforces token lifetime.

**Gaps / Recommendations:**

1. **Dynamic JWKS validation.** Replace the static public key initialization in `JwtStrategy` with a JWKS-backed key fetcher that resolves the signing key per request using the `kid` header. This ensures that after key rotation, the strategy automatically uses the correct current key and rejects tokens signed with rotated-out keys.
2. **Validate `merchant_id` claim against the database** on sensitive operations to ensure the merchant is still active. A deactivated merchant's tokens should be rejected even if not yet expired.
3. **Log every cross-tenant access attempt** (i.e., where the JWT's `merchant_id` does not match a resource's `merchant_id`) as a high-severity security event.

---

### AC-08 — RLS Bypass via SQL Injection in Device Attributes

**Severity:** Critical

**Threat actor:** Authenticated merchant submitting crafted device attribute payloads to escape their RLS context.

**Attack vector:**

In `fingerprint.service.ts:registerDevice`, the tenant context is set using string interpolation:

```typescript
await client.query(`SET LOCAL app.merchant_id = '${merchantId}'`);
```

`merchantId` originates from the validated JWT payload (`payload.merchant_id`). However, if an attacker can influence the `merchantId` value — for example, if there is a code path where `merchantId` is taken from an unvalidated source, or if the JWT validation is bypassed — a payload such as:

```
'; SET LOCAL app.merchant_id = 'victim-merchant-uuid'; --
```

would override the RLS context. Even with JWT validation in place, the use of string interpolation for any security-critical session variable is a code smell that violates defense-in-depth.

Separately, the `getDeviceById` method and `getDeviceHistory` method use parameterized queries correctly (`$1`, `$2`), but the inconsistency in `registerDevice` represents a gap.

**Impact:**

- If exploited, attacker can read and write device records belonging to another tenant's RLS context.
- Even if direct exploitation requires JWT bypass, the pattern is dangerous and should be eliminated.

**Current mitigations:**

- `merchantId` is extracted from the RS256-signed JWT payload, which is extremely difficult to tamper with.
- PostgreSQL RESTRICTIVE RLS policies are applied to all tenant tables.
- Most queries use parameterized `$N` placeholders.

**Gaps / Recommendations:**

1. **Replace string interpolation with parameterized SET:** Use `SET LOCAL app.current_merchant_id TO $1` with a parameterized query. While PostgreSQL does not support parameter markers for `SET`, use `SELECT set_config('app.current_merchant_id', $1, true)` which fully supports parameterization. This is the correct pattern used in the test helper (`queryAsTenant`) — the production code should match.
2. **Audit all `client.query` calls** for string interpolation of any external or user-derived value.
3. **Add a linter rule (ESLint)** to prohibit template literals in `pg` query calls where the interpolated value is not a compile-time constant.

---

### AC-09 — Cross-Tenant Timing Side-Channel

**Severity:** Medium

**Threat actor:** Authenticated merchant systematically probing the API to infer whether specific device fingerprints or entity IDs exist in another tenant's data.

**Attack vector:**

When the device-intel-service performs a fingerprint lookup, it follows this sequence:
1. Redis cache lookup (fast, ~0.1ms)
2. Exact DB match (medium, ~2ms)
3. Prefix scan + fuzzy match (slow, ~5-20ms depending on candidates)

A timing-aware attacker can measure response latencies for different fingerprints under their own `merchant_id`. Because RLS filters rows before the query returns, a fingerprint that exists in another tenant's table but not in the attacker's will produce a "not found" result — but the query execution time may differ depending on index selectivity and PostgreSQL's internal processing.

This is a second-order risk (requires precise timing measurements and many samples to exploit), but for high-value targets (e.g., determining whether a known device is a customer of a competitor merchant) it may be worth the attacker's effort.

**Impact:**

- Inference of whether specific device fingerprints are registered with other tenants.
- Low-yield but zero-cost for a determined attacker.

**Current mitigations:**

- RESTRICTIVE RLS prevents data being returned across tenants.
- Redis cache means repeat queries return near-instantly regardless of DB state.

**Gaps / Recommendations:**

1. **Add artificial response time jitter** (5-15ms random delay) on device lookup responses that return "not found" to make timing attacks infeasible.
2. **Rate limit device lookup endpoints** per merchant to reduce the attacker's sampling rate.
3. **Monitor for unusually high rates of "not found" fingerprint queries** from a single merchant as an anomaly signal.

---

## 4. Rate Limit Bypass

### AC-10 — Distributed Rate Limit Evasion

**Severity:** High

**Threat actor:** Organized fraud operation with access to rotating IP addresses (residential proxies, botnets) and multiple merchant accounts.

**Attack vector:**

The backpressure system (`BackpressureService`) tracks in-flight requests and request timestamps in a process-local sliding window (`this.requestTimestamps: number[]`). This is a per-instance, in-memory counter. In a horizontally scaled deployment (multiple `event-collector` replicas), each instance has an independent counter. An attacker distributing requests across N instances can submit up to `N × maxConcurrent` requests per window before any single instance triggers the overload check.

Additionally, the per-merchant fairness service (`fairness.service.ts`) enforces fair queuing per merchant within a single instance, but if an attacker registers multiple merchant accounts, they can stripe requests across accounts to avoid per-merchant limits.

**Impact:**

- The effective rate limit for a distributed attacker is multiplied by the number of service replicas.
- Sustained high-volume event injection degrades processing latency for legitimate merchants.

**Current mitigations:**

- `BackpressureGuard` rejects requests when `inFlightRequests >= maxConcurrent (500)` or `requestTimestamps.length >= maxQueueDepth (5000)`.
- `FairnessService` implements per-merchant queue fairness within an instance.
- Schema validation rejects malformed events before they consume Kafka capacity.

**Gaps / Recommendations:**

1. **Move rate limiting state to Redis.** Replace the in-memory `requestTimestamps` array with a Redis sorted set (same pattern as the velocity counters) so that the rate limit applies across all replicas. A Redis `ZCARD` + `ZADD` pipeline can enforce a global request rate in under 1ms.
2. **Per-merchant rate limiting at the API gateway level.** Enforce token bucket limits keyed by `merchant_id` in Redis, separate from the global backpressure. This prevents a single merchant from monopolizing capacity even across distributed instances.
3. **IP reputation integration.** Reject or throttle requests from known residential proxy/VPN CIDR ranges using a threat intelligence feed (e.g., MaxMind, IPinfo).
4. **Detect merchant account enumeration.** Alert when a single IP or IP range is associated with an unusually high number of distinct merchant IDs.

---

### AC-11 — Backpressure Manipulation via Fake Lag Signals

**Severity:** Medium

**Threat actor:** Insider threat or attacker with write access to the `event-collector` environment, or a race-condition exploit in the backpressure state.

**Attack vector:**

The `BackpressureService.tryAcquire()` increments `inFlightRequests` and `BackpressureService.release()` decrements it. If `release()` is not called (e.g., due to an uncaught exception that exits before the `finally` block in the guard), `inFlightRequests` will monotonically increase until it reaches `maxConcurrent`, at which point the service rejects all new requests.

An attacker who can craft requests that reliably cause the `BackpressureGuard.canActivate()` to throw before calling `release()` can cause a denial-of-service by artificially exhausting the in-flight counter. Since the counter is in-memory and process-scoped, a service restart is required to recover.

**Impact:**

- Denial of service for the event-collector, causing all events to be rejected.
- Fraudsters benefit from a disabled fraud detection pipeline during the outage window.

**Current mitigations:**

- The `BackpressureGuard` uses `try/finally` semantics in `canActivate` (should be verified in the guard implementation).
- Process crashes are recovered by orchestration (Kubernetes restart policy).

**Gaps / Recommendations:**

1. **Audit the `BackpressureGuard.canActivate()` implementation** to verify that `release()` is called in all exit paths, including exception paths. Add integration tests specifically for exception-during-request scenarios.
2. **Add a watchdog that resets `inFlightRequests` to zero if no requests have completed in N seconds** — this detects leaked counters.
3. **Expose `getStatus()` metrics to a monitoring system** (Prometheus gauge) so anomalous counter growth is detected before it causes an outage.

---

## 5. Velocity Manipulation

### AC-12 — Synthetic Event Injection to Normalize Baselines

**Severity:** High

**Threat actor:** Sophisticated fraud operator who understands velocity-based fraud detection and wants to establish a "normal" baseline before executing a burst attack.

**Attack vector:**

The `VelocityService` maintains a 7-day rolling baseline (`baselineKey`) that the `BurstService` uses to compute the multiplier for burst detection. The burst check triggers when `currentRate >= baseline × 3.0`. An attacker with a valid merchant account submits a steady stream of synthetic but schema-valid events over several days, establishing an elevated baseline. When they execute the actual fraud burst, it is measured relative to the poisoned baseline and may not exceed the 3x threshold.

For example: if legitimate baseline is 10 tx/hour, the 3x threshold triggers at 30 tx/hour. If the attacker injects 20 tx/hour of synthetic events for 7 days, the new baseline becomes ~30 tx/hour. The attacker can now execute 90 tx/hour without triggering a burst alert.

**Impact:**

- Burst detection is evaded, allowing high-volume fraud to proceed undetected.
- The baseline is permanently poisoned for the duration of the attack.

**Current mitigations:**

- Schema validation (`EventSchemaValidator`) rejects structurally malformed events.
- Events require a valid API key (though the key validation is currently a stub — see executive summary).
- The baseline uses a 7-day window, making rapid poisoning harder.

**Gaps / Recommendations:**

1. **Anomaly detection on baseline trajectory.** Track the baseline value itself as a time series. A rapidly increasing baseline (e.g., >20% per day) is itself an anomaly signal. Alert and flag the merchant for review.
2. **Event source quality scoring.** Distinguish between events originating from verified devices (high trust score, non-emulator) and synthetic-looking events (new devices, emulator flags, no session history). Weight these differently in the baseline calculation.
3. **Absolute thresholds in addition to relative ones.** In addition to the 3x multiplier, enforce absolute thresholds (e.g., >1000 tx/hour for a merchant whose historical max is <200).
4. **Cross-dimension consistency.** If `tx_count_1h` is elevated but `unique_devices_24h` is abnormally low (i.e., few devices doing many transactions), flag it separately from a burst — this pattern is characteristic of synthetic injection.

---

### AC-13 — Slow Ramp-Up Baseline Poisoning

**Severity:** High

**Threat actor:** Patient, organized fraud operation willing to invest weeks in preparation.

**Attack vector:**

A more sophisticated variant of AC-12. Instead of injecting a large volume of synthetic events, the attacker slowly increases their transaction rate by 5-10% per day over 2-3 weeks. The 7-day rolling average (`getBaseline`) moves upward gradually. Because each day's increase is small relative to the baseline, no single-day anomaly is detectable from velocity alone.

The burst service computes:

```typescript
const hoursInWindow = this.baselineWindowSeconds / 3600; // 168 hours
return totalEvents / hoursInWindow;
```

A slow ramp from 10 tx/hour to 100 tx/hour over 20 days would show ~55 tx/hour average in the 7-day window by day 20, making a burst to 165 tx/hour appear "normal" relative to the 3x threshold.

**Impact:**

- Fraud bursts below the multiplier threshold pass undetected.
- Attack is difficult to distinguish from organic merchant growth.

**Current mitigations:**

- 7-day baseline window limits how fast the baseline can shift (max shift per day ≈ 1/7 of the window).
- Burst detection across 6 dimensions means the attacker must ramp all dimensions simultaneously.

**Gaps / Recommendations:**

1. **Compare merchant velocity against cohort peers.** A merchant growing 10x faster than similar merchants in the same industry vertical is anomalous even if within their own historical baseline.
2. **Maintain a longer-term anchor baseline (30-day or 90-day) alongside the 7-day operational baseline.** Alert when the 7-day baseline diverges significantly from the 30-day anchor.
3. **Manual review trigger for new merchants.** Merchants with fewer than 30 days of history should have tighter absolute limits and human review of any burst pattern.

---

### AC-14 — HyperLogLog Collision Attack

**Severity:** Low

**Threat actor:** Highly technical adversary attempting to force false unique-count readings in the Redis HyperLogLog structures.

**Attack vector:**

Redis HyperLogLog provides cardinality estimation with a standard error of 0.81%. The algorithm is deterministic for a given hash function and input; there is no secret salt. An attacker who knows the Redis HyperLogLog implementation internals could craft device fingerprints or IP addresses that all hash to the same HyperLogLog register, causing the estimated cardinality to undercount unique devices or IPs. This would suppress the `unique_devices_24h` and `unique_ips_24h` signals, potentially masking a distributed attack.

In practice, this requires detailed knowledge of Redis's HyperLogLog hash function and the ability to generate fingerprints or IP addresses that satisfy the collision constraint, which is computationally expensive.

**Impact:**

- Undercounting of unique devices/IPs, potentially masking distributed fraud.
- Requires significant attacker sophistication; low probability of exploitation.

**Current mitigations:**

- Redis HyperLogLog uses MurmurHash64A with an internal seed, making targeted collision attacks difficult without Redis source access.
- The `unique_devices_24h` and `unique_ips_24h` signals are supplementary to transaction count signals.

**Gaps / Recommendations:**

1. **Supplement HyperLogLog with exact counting for small cardinalities.** When estimated cardinality is below a threshold (e.g., <100), maintain an exact Redis SET in parallel for validation. Significant divergence between the exact count and HLL estimate is a signal.
2. **For high-value merchants, consider exact counting over a shorter window** (1h exact count via sorted set `ZCARD`) in addition to the HLL estimate.

---

## 6. Kafka / Event Pipeline Abuse

### AC-15 — Dead Letter Queue Flooding

**Severity:** Medium

**Threat actor:** Attacker (or a faulty integration) submitting high volumes of invalid events to intentionally flood the DLQ and obscure legitimate failures.

**Attack vector:**

The `EventsService.ingest()` method validates each event and routes invalid ones to the DLQ via `DlqService.sendBatchToDlq()`. If an attacker submits a high volume of structurally invalid events (events that pass the API key check but fail schema validation), each one generates a DLQ message to the `signalrisk.events.dlq` topic. A sustained flood of invalid events would:

1. Fill the DLQ topic partition, potentially reaching Kafka retention limits and causing genuine failure events to be dropped.
2. Overwhelm DLQ monitoring and alerting, burying legitimate operational failures.
3. Consume Kafka broker write capacity, degrading throughput for valid events.

Note that the `sendBatchToDlq` failure is currently swallowed (`logger.error` but no re-throw in the service), meaning DLQ flooding-induced Kafka errors are silent from the caller's perspective.

**Impact:**

- Loss of genuine failure visibility in the DLQ.
- Kafka capacity degradation.
- Alert fatigue in operations team.

**Current mitigations:**

- Schema validation happens before DLQ routing, so random payloads are rejected.
- `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` rejects payloads with unknown fields at the HTTP level.
- The backpressure guard limits overall request volume.

**Gaps / Recommendations:**

1. **Rate limit DLQ write rate per merchant.** A single merchant should not be able to generate more than X DLQ events per minute. If the merchant exceeds this threshold, reject subsequent invalid events with `429` without writing to the DLQ.
2. **Separate DLQ topics per failure reason** (`dlq.validation-failed`, `dlq.processing-error`) with different retention policies. Validation failures can have shorter retention (24h) since they are likely malformed integrations, not actionable operational failures.
3. **DLQ depth alerting.** Alert when DLQ depth (unpublished messages) exceeds a threshold, distinguishing between a sudden spike (attack) and a gradual increase (integration issue).
4. **Consider not writing structurally trivial failures** (empty payload, missing required fields) to the DLQ at all — return a 400 error only, and log the failure locally. Reserve DLQ for events that pass basic validation but fail semantic checks.

---

### AC-16 — Schema Validation Bypass via Crafted Payloads

**Severity:** High

**Threat actor:** Attacker probing the validation layer to find event types or field combinations that pass validation but carry malicious or misleading data.

**Attack vector:**

The `EventSchemaValidator` validates events against type-specific JSON schemas. Known attack vectors against schema validators include:

1. **Type coercion abuse.** If the schema allows `"amount": number` and the validator coerces `"amount": "100"` (string) to a number, an attacker can inject unexpected data types.
2. **Additional property injection.** If `forbidNonWhitelisted` is not enforced at the Kafka consumer level (only at the HTTP controller), additional properties could survive the HTTP layer and be processed downstream.
3. **Nested object injection.** Deeply nested JSON structures may trigger stack overflows or exponential validation time in some JSON Schema validators (billion laughs attack on `anyOf`/`oneOf` with recursive references).
4. **Unicode normalization attacks.** Field values containing Unicode normalization sequences (e.g., overlong UTF-8, right-to-left override characters) may pass string-length validation but render incorrectly in downstream UIs.

**Impact:**

- Malformed data persisted to PostgreSQL or passed to downstream ML models.
- Validation infrastructure DoS via payload complexity.

**Current mitigations:**

- `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` at the HTTP controller level strips unknown fields.
- `EventSchemaValidator` performs per-type validation before Kafka publish.
- NestJS class-transformer applies type coercion rules defined in `CreateEventDto`.

**Gaps / Recommendations:**

1. **Enforce a maximum payload size limit** at the HTTP level (e.g., NestJS body size limit, 64KB per event). Deeply nested JSON is bounded by payload size.
2. **Add a maximum nesting depth check** in the schema validator before running the full JSON Schema validation.
3. **Validate at Kafka consumer level as well**, not just at ingestion. This protects against events injected directly into Kafka (bypassing the HTTP layer).
4. **Test the validator against OWASP JSON fuzzing payloads** as part of the CI pipeline.

---

### AC-17 — Outbox Table Tampering

**Severity:** Critical

**Threat actor:** Attacker with database write access (compromised application credential, SQL injection, or insider threat) targeting the `outbox_events` table.

**Attack vector:**

The `OutboxRelayService` polls the `outbox_events` table for rows where `published_at IS NULL` and publishes them to Kafka. The query does not use row-level locking:

```sql
SELECT id, aggregate_type, aggregate_id, event_type, payload, created_at
FROM outbox_events
WHERE published_at IS NULL
ORDER BY created_at ASC
LIMIT $1
```

This creates two attack surfaces:

1. **Direct row insertion.** An attacker with `INSERT` access to `outbox_events` can inject arbitrary event payloads into the Kafka pipeline, bypassing all HTTP-level validation (schema validation, backpressure, API key checks). These events will be published to `signalrisk.events.raw` as trusted platform events.

2. **Double-publish race.** Without `FOR UPDATE SKIP LOCKED`, two relay instances polling simultaneously can pick up the same rows. Both will publish to Kafka and then race to mark as published. This results in duplicate events downstream, which could double-count velocity signals and corrupt fraud decisions.

**Impact:**

- Arbitrary event injection into the fraud pipeline with full platform trust.
- Kafka-level data corruption via duplicate events.
- Potential to inject crafted events that trigger or suppress fraud decisions.

**Current mitigations:**

- The `DedupService` maintains a deduplication watermark; events with IDs below the watermark are not re-processed.
- `outbox_events.id` is a UUID, making predictable ID guessing impractical.

**Gaps / Recommendations:**

1. **Add `FOR UPDATE SKIP LOCKED` to the outbox poll query.** This is the standard pattern for outbox relay implementations:
   ```sql
   SELECT ... FROM outbox_events
   WHERE published_at IS NULL
   ORDER BY created_at ASC
   LIMIT $1
   FOR UPDATE SKIP LOCKED
   ```
2. **Restrict database permissions.** The application service account used by the outbox relay should have `SELECT, UPDATE` on `outbox_events` only — not `INSERT`. Event insertion should only be possible via the application's transactional path.
3. **Add a `payload_checksum` column** (SHA-256 of the payload JSON) computed at insertion time. The relay should verify the checksum before publishing. Tampering with the payload after insertion would fail the checksum.
4. **Validate outbox events against the same schema registry** as the HTTP ingestion path before publishing to Kafka.

---

## 7. Operational Security

### AC-18 — Key Rotation Timing Attack (JWKS Cache Staleness)

**Severity:** Medium

**Threat actor:** Insider or attacker who can observe or influence the timing of key rotation operations.

**Attack vector:**

The `JwtStrategy` is initialized with the public key from `keyManager.getCurrentSigningKey()` at service startup. This is a static initialization — the strategy does not dynamically reload keys when rotation occurs. If the auth-service rotates its RS256 key pair:

1. Newly issued tokens are signed with the new private key.
2. Downstream services (`event-collector`, `device-intel-service`, etc.) continue validating against the old public key cached at startup.
3. Newly issued tokens fail validation on downstream services until those services restart.

There is a window during which the system is in an inconsistent state: some services accept old-key tokens, some accept new-key tokens, none accept both simultaneously.

An attacker who can trigger key rotation (e.g., via a compromised admin credential) can selectively cause token validation failures across services, enabling denial-of-service or forcing emergency restarts that reset operational state (e.g., the in-memory refresh token store).

**Impact:**

- Service disruption during key rotation.
- Forced restarts clear the in-memory refresh token store, logging out all active sessions.
- If an attacker can exfiltrate the private key during the rotation window, they can sign tokens that older services (still using the old public key) will accept.

**Current mitigations:**

- RS256 key management is handled by `KeyManager`.
- Key IDs (`kid`) are included in JWKS to disambiguate signing keys.

**Gaps / Recommendations:**

1. **Implement dynamic JWKS-based key resolution.** The `JwtStrategy` should resolve the signing key per request using the `kid` header, fetching from the JWKS endpoint (with an in-memory cache, TTL 5-15 minutes). This matches the architecture constraint in `oauth2-auth-service.md`: "JWT validation: Local validation with cached JWKS (no network call per request)."
2. **Overlap period during key rotation.** Maintain both old and new public keys in the JWKS endpoint for a transition period (e.g., 2x the access token lifetime = 2 hours). Services validate against any key in the JWKS that matches the token's `kid`.
3. **Alert on JWKS key count changes** as an operational event requiring approval.

---

### AC-19 — Health Check / Configuration Endpoint Disclosure

**Severity:** Low

**Threat actor:** External reconnaissance attacker mapping the platform's internal structure before a more targeted attack.

**Attack vector:**

NestJS applications commonly expose health check endpoints (e.g., `/health`, `/metrics`, `/ready`, `/live`) that can reveal:

- Service versions and dependencies.
- Database connection state (confirming the DB host).
- Redis connection state (confirming the cache host).
- Kafka connection state (confirming broker addresses).
- Internal service names and ports.

If these endpoints are accessible without authentication from outside the cluster, they provide a roadmap for targeting internal infrastructure. The `OutboxRelayService.getLag()` and similar health-adjacent methods already query internal state.

**Impact:**

- Infrastructure discovery facilitating more targeted attacks.
- Low direct impact, but accelerates reconnaissance phase.

**Current mitigations:**

- Not assessed from the codebase; depends on network/ingress configuration.

**Gaps / Recommendations:**

1. **Restrict health endpoints to internal network only** via network policy or API gateway routing rules. Never expose `/health`, `/metrics`, or `/ready` to the public internet.
2. **Authenticate the `/metrics` endpoint** with a separate scrape credential if exposed to a monitoring network segment.
3. **Sanitize health check responses** to not include internal hostnames, port numbers, or version strings in production responses.
4. **Disable NestJS default error stack traces in production** (`app.useGlobalFilters(new HttpExceptionFilter())` without stack exposure).

---

## Risk Matrix

The following matrix plots each abuse case by **Likelihood** (how easy/probable is exploitation) and **Impact** (what the attacker gains if successful). Severity is the combined assessment.

| ID | Abuse Case | Likelihood | Impact | Severity |
|----|-----------|-----------|--------|----------|
| AC-01 | Fake device attributes | High | High | **High** |
| AC-02 | Fingerprint replay | Medium | Medium | **Medium** |
| AC-03 | Emulator detection bypass | High | High | **High** |
| AC-04 | JWT bearer theft | Medium | High | **High** |
| AC-05 | Refresh token exfiltration | Low | Critical | **Critical** |
| AC-06 | JTI reuse post-logout | Medium | Medium | **Medium** |
| AC-07 | JWT claims tampering | Low | Critical | **Critical** |
| AC-08 | SQL injection in SET LOCAL | Low | Critical | **Critical** |
| AC-09 | Cross-tenant timing side-channel | Low | Low | **Low** |
| AC-10 | Distributed rate limit evasion | High | High | **High** |
| AC-11 | Backpressure counter exhaustion | Medium | Medium | **Medium** |
| AC-12 | Synthetic baseline normalization | Medium | High | **High** |
| AC-13 | Slow ramp-up baseline poisoning | Low | High | **High** |
| AC-14 | HyperLogLog collision | Very Low | Low | **Low** |
| AC-15 | DLQ flooding | High | Medium | **Medium** |
| AC-16 | Schema validation bypass | Medium | High | **High** |
| AC-17 | Outbox table tampering | Low | Critical | **Critical** |
| AC-18 | JWKS cache staleness | Low | Medium | **Medium** |
| AC-19 | Health endpoint disclosure | High | Low | **Low** |

---

## Prioritized Remediation Roadmap

### Immediate (Sprint 1 — before production launch)

| Priority | Abuse Case | Action |
|----------|-----------|--------|
| P0 | AC-08 | Replace `SET LOCAL app.merchant_id = '${merchantId}'` with `SELECT set_config('app.current_merchant_id', $1, true)` in `fingerprint.service.ts:registerDevice` |
| P0 | Event Collector | Replace the API key validation stub with real validation against the merchant API key store |
| P0 | AC-17 | Add `FOR UPDATE SKIP LOCKED` to outbox relay poll query; restrict DB user permissions |
| P1 | AC-05 | Persist refresh tokens to PostgreSQL; implement token family revocation |
| P1 | AC-06 | Implement Redis JTI denylist for access token revocation |

### Short-term (Sprint 2-3)

| Priority | Abuse Case | Action |
|----------|-----------|--------|
| P1 | AC-18 | Implement dynamic JWKS-based key resolution in `JwtStrategy` |
| P1 | AC-10 | Move backpressure counters to Redis for cross-replica rate limiting |
| P2 | AC-12, AC-13 | Add baseline trajectory anomaly detection; implement cohort-based comparison |
| P2 | AC-03 | Integrate Play Integrity API and App Attest for hardware attestation |
| P2 | AC-16 | Add payload size limits; validate at Kafka consumer level |

### Medium-term (Sprint 4-6)

| Priority | Abuse Case | Action |
|----------|-----------|--------|
| P2 | AC-01, AC-02 | Implement per-session challenge/response for device fingerprint freshness |
| P2 | AC-04 | Evaluate DPoP (RFC 9449) token binding for service-to-service calls |
| P3 | AC-11 | Watchdog for in-flight counter leaks; Prometheus metrics for backpressure state |
| P3 | AC-15 | Implement per-merchant DLQ rate limiting; separate DLQ topics by failure type |
| P3 | AC-19 | Restrict health endpoints to internal network via ingress policy |

---

## Appendix: References

- RFC 9449 — OAuth 2.0 Demonstrating Proof of Possession (DPoP)
- RFC 7009 — OAuth 2.0 Token Revocation
- RFC 7517 — JSON Web Key (JWK)
- OWASP API Security Top 10 (2023)
- Google Play Integrity API documentation
- Apple App Attest documentation
- Redis HyperLogLog implementation notes (Redis 7.x)
- PostgreSQL Row Level Security documentation
- NestJS Validation Pipe documentation
