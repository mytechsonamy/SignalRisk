-- seed.sql
-- SignalRisk: Test data for 2 merchants
-- Run AFTER all migrations. Uses BYPASSRLS or superuser connection.

BEGIN;

-- ============================================================================
-- Merchants
-- ============================================================================
INSERT INTO merchants (id, name, api_key_prefix, status, settings) VALUES
(
    'a1000000-0000-0000-0000-000000000001',
    'Acme Payments',
    'sk_acme_live',
    'ACTIVE',
    '{
        "risk_thresholds": {"block": 85, "review": 60},
        "webhook_url": "https://acme.example.com/webhooks/signalrisk",
        "features": {"velocity_check": true, "device_reputation": true, "geo_anomaly": true}
    }'::jsonb
),
(
    'b2000000-0000-0000-0000-000000000002',
    'Bravo Commerce',
    'sk_bravo_liv',
    'ACTIVE',
    '{
        "risk_thresholds": {"block": 90, "review": 70},
        "webhook_url": "https://bravo.example.com/hooks/fraud",
        "features": {"velocity_check": true, "device_reputation": true, "geo_anomaly": false}
    }'::jsonb
);

-- ============================================================================
-- Users (dashboard)
-- ============================================================================
-- Passwords are bcrypt hash of 'changeme123' (test only)
INSERT INTO users (id, merchant_id, email, password_hash, role) VALUES
(
    'u1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'admin@acme.example.com',
    '$2b$12$LJ3m4ys9Rq0Hd1jFh0vCOeGxNpR5Kk8mZwY1T2VbNcSqX0DaWvKe',
    'ADMIN'
),
(
    'u1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001',
    'analyst@acme.example.com',
    '$2b$12$LJ3m4ys9Rq0Hd1jFh0vCOeGxNpR5Kk8mZwY1T2VbNcSqX0DaWvKe',
    'ANALYST'
),
(
    'u2000000-0000-0000-0000-000000000001',
    'b2000000-0000-0000-0000-000000000002',
    'admin@bravo.example.com',
    '$2b$12$LJ3m4ys9Rq0Hd1jFh0vCOeGxNpR5Kk8mZwY1T2VbNcSqX0DaWvKe',
    'ADMIN'
),
(
    'u2000000-0000-0000-0000-000000000002',
    'b2000000-0000-0000-0000-000000000002',
    'senior@bravo.example.com',
    '$2b$12$LJ3m4ys9Rq0Hd1jFh0vCOeGxNpR5Kk8mZwY1T2VbNcSqX0DaWvKe',
    'SENIOR_ANALYST'
);

-- ============================================================================
-- Devices
-- ============================================================================
INSERT INTO devices (id, merchant_id, fingerprint, fingerprint_prefix, trust_score, is_emulator, attributes) VALUES
-- Acme devices
(
    'd1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'fp_abc123def456gh789ij0kl',
    'fp_abc12',
    82.50,
    false,
    '{"os": "iOS 17.4", "browser": "Safari 17", "screen": "1170x2532", "timezone": "America/New_York", "webgl_hash": "a3f8c9d2"}'::jsonb
),
(
    'd1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001',
    'fp_xyz789uvw012st345qr6',
    'fp_xyz78',
    15.00,
    true,
    '{"os": "Android 14", "browser": "Chrome 122", "screen": "1080x2400", "timezone": "UTC", "webgl_hash": "emulator_sig"}'::jsonb
),
-- Bravo devices
(
    'd2000000-0000-0000-0000-000000000001',
    'b2000000-0000-0000-0000-000000000002',
    'fp_mno456pqr789st012uv3',
    'fp_mno45',
    91.00,
    false,
    '{"os": "Windows 11", "browser": "Edge 122", "screen": "1920x1080", "timezone": "Europe/London", "webgl_hash": "b7e2d1f5"}'::jsonb
),
(
    'd2000000-0000-0000-0000-000000000002',
    'b2000000-0000-0000-0000-000000000002',
    'fp_ghi012jkl345mn678op9',
    'fp_ghi01',
    42.30,
    false,
    '{"os": "macOS 14.3", "browser": "Firefox 123", "screen": "2560x1440", "timezone": "Asia/Tokyo", "webgl_hash": "c4a9e8f1"}'::jsonb
);

-- ============================================================================
-- Events (March 2026 partition)
-- ============================================================================
INSERT INTO events (id, merchant_id, device_id, session_id, type, payload, created_at) VALUES
-- Acme events: normal user session
(
    'e1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    's1000000-0000-0000-0000-000000000001',
    'PAGE_VIEW',
    '{"url": "/checkout", "referrer": "/cart", "duration_ms": 3200}'::jsonb,
    '2026-03-01 10:00:00+00'
),
(
    'e1000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    's1000000-0000-0000-0000-000000000001',
    'PAYMENT',
    '{"amount_cents": 4999, "currency": "USD", "card_bin": "411111"}'::jsonb,
    '2026-03-01 10:01:30+00'
),
-- Acme events: suspicious emulator
(
    'e1000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000002',
    's1000000-0000-0000-0000-000000000002',
    'LOGIN',
    '{"method": "password", "ip": "185.220.101.42", "geo": "RU"}'::jsonb,
    '2026-03-02 03:15:00+00'
),
-- Bravo events
(
    'e2000000-0000-0000-0000-000000000001',
    'b2000000-0000-0000-0000-000000000002',
    'd2000000-0000-0000-0000-000000000001',
    's2000000-0000-0000-0000-000000000001',
    'SIGNUP',
    '{"email_domain": "gmail.com", "signup_method": "google_oauth"}'::jsonb,
    '2026-03-01 14:30:00+00'
),
(
    'e2000000-0000-0000-0000-000000000002',
    'b2000000-0000-0000-0000-000000000002',
    'd2000000-0000-0000-0000-000000000002',
    's2000000-0000-0000-0000-000000000002',
    'PAYMENT',
    '{"amount_cents": 29900, "currency": "GBP", "card_bin": "540000"}'::jsonb,
    '2026-03-03 09:45:00+00'
);

-- ============================================================================
-- Decisions
-- ============================================================================
INSERT INTO decisions (id, merchant_id, request_id, device_id, risk_score, decision, risk_factors, signals, latency_ms, created_at) VALUES
-- Acme: clean transaction
(
    'dc100000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'rq100000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    22.50,
    'ALLOW',
    '[{"factor": "device_trust", "score": 10, "detail": "Known device, high trust"}, {"factor": "velocity", "score": 12.5, "detail": "Normal transaction frequency"}]'::jsonb,
    '{"device_age_days": 45, "session_duration_ms": 93000, "pages_visited": 4}'::jsonb,
    47,
    '2026-03-01 10:01:35+00'
),
-- Acme: blocked emulator
(
    'dc100000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001',
    'rq100000-0000-0000-0000-000000000002',
    'd1000000-0000-0000-0000-000000000002',
    95.00,
    'BLOCK',
    '[{"factor": "emulator", "score": 40, "detail": "Device flagged as emulator"}, {"factor": "geo_anomaly", "score": 30, "detail": "IP geolocation mismatch"}, {"factor": "velocity", "score": 25, "detail": "Rapid login attempts"}]'::jsonb,
    '{"device_age_days": 0, "session_duration_ms": 1200, "pages_visited": 1, "ip_country": "RU"}'::jsonb,
    31,
    '2026-03-02 03:15:05+00'
),
-- Bravo: review required
(
    'dc200000-0000-0000-0000-000000000001',
    'b2000000-0000-0000-0000-000000000002',
    'rq200000-0000-0000-0000-000000000001',
    'd2000000-0000-0000-0000-000000000002',
    68.00,
    'REVIEW',
    '[{"factor": "amount", "score": 25, "detail": "Transaction above merchant avg"}, {"factor": "geo_anomaly", "score": 28, "detail": "Timezone does not match billing country"}, {"factor": "device_trust", "score": 15, "detail": "Moderate trust score"}]'::jsonb,
    '{"device_age_days": 12, "session_duration_ms": 45000, "pages_visited": 2, "timezone_mismatch": true}'::jsonb,
    52,
    '2026-03-03 09:45:08+00'
);

-- ============================================================================
-- Outbox events
-- ============================================================================
INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, created_at, published_at) VALUES
(
    'ob100000-0000-0000-0000-000000000001',
    'decision',
    'dc100000-0000-0000-0000-000000000001',
    'decision.created',
    '{"merchant_id": "a1000000-0000-0000-0000-000000000001", "decision": "ALLOW", "risk_score": 22.5}'::jsonb,
    '2026-03-01 10:01:35+00',
    '2026-03-01 10:01:36+00'
),
(
    'ob100000-0000-0000-0000-000000000002',
    'decision',
    'dc100000-0000-0000-0000-000000000002',
    'decision.created',
    '{"merchant_id": "a1000000-0000-0000-0000-000000000001", "decision": "BLOCK", "risk_score": 95.0}'::jsonb,
    '2026-03-02 03:15:05+00',
    '2026-03-02 03:15:06+00'
),
(
    'ob200000-0000-0000-0000-000000000001',
    'decision',
    'dc200000-0000-0000-0000-000000000001',
    'decision.created',
    '{"merchant_id": "b2000000-0000-0000-0000-000000000002", "decision": "REVIEW", "risk_score": 68.0}'::jsonb,
    '2026-03-03 09:45:08+00',
    NULL
);

-- ============================================================================
-- Idempotency requests
-- ============================================================================
INSERT INTO idempotency_requests (request_id, merchant_id, response, created_at, expires_at) VALUES
(
    'rq100000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    '{"decision_id": "dc100000-0000-0000-0000-000000000001", "decision": "ALLOW", "risk_score": 22.5}'::jsonb,
    '2026-03-01 10:01:35+00',
    '2026-03-02 10:01:35+00'
);

-- ============================================================================
-- Processed events (Kafka consumer dedup)
-- ============================================================================
INSERT INTO processed_events (event_id, consumer_group, processed_at) VALUES
('ob100000-0000-0000-0000-000000000001', 'webhook-sender', '2026-03-01 10:01:37+00'),
('ob100000-0000-0000-0000-000000000001', 'analytics-consumer', '2026-03-01 10:01:38+00'),
('ob100000-0000-0000-0000-000000000002', 'webhook-sender', '2026-03-02 03:15:07+00');

COMMIT;
