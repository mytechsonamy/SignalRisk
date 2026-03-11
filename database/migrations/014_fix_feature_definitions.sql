-- 014: Align feature_definitions with runtime + DSL naming
-- Fixes naming mismatches between registry, DSL rules, and runtime signal production.

-- Add device features that DSL actually references (uniqueIps24h, txCount1h)
INSERT INTO feature_definitions (feature_name, entity_type, data_type, "window", source_service, redis_key_pattern, description, version)
VALUES
  ('stateful.device.uniqueIps24h', 'device', 'hll', '24h', 'velocity-service',
   '{merchantId}:vel:uip:device:{entityId}', 'Unique IPs from this device in 24h', 1),
  ('stateful.device.txCount1h', 'device', 'counter', '1h', 'velocity-service',
   '{merchantId}:vel:tx:device:{entityId}', 'Transaction count for device in 1h', 1),
  ('stateful.ip.txCount1h', 'ip', 'counter', '1h', 'velocity-service',
   '{merchantId}:vel:tx:ip:{entityId}', 'Transaction count from IP in 1h', 1)
ON CONFLICT (feature_name, version) DO NOTHING;

-- Mark features not yet produced at runtime as inactive
UPDATE feature_definitions SET is_active = false
WHERE feature_name IN (
  'stateful.ip.signupCount10m',
  'stateful.ip.paymentCount1h',
  'stateful.ip.failedLogins30m'
) AND version = 1;

-- Track this migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('014', '014_fix_feature_definitions', NOW())
ON CONFLICT (version) DO NOTHING;
