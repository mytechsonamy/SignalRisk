-- Migration 006: Convert cases table TEXT columns to UUID
-- Aligns cases table with the rest of the schema (merchants, decisions, etc. use UUID)
--
-- Prerequisites:
--   - All existing case IDs must be valid UUID format (case.repository.ts uses uuidv4())
--   - All merchant_id, decision_id references must be valid UUIDs
--
-- Rollback: see bottom of file

-- Enable uuid-ossp if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Convert id column: TEXT → UUID
ALTER TABLE cases
  ALTER COLUMN id TYPE UUID USING id::uuid;

-- Convert merchant_id column: TEXT → UUID
ALTER TABLE cases
  ALTER COLUMN merchant_id TYPE UUID USING merchant_id::uuid;

-- Convert decision_id column: TEXT → UUID
ALTER TABLE cases
  ALTER COLUMN decision_id TYPE UUID USING decision_id::uuid;

-- Convert entity_id column: TEXT → UUID
ALTER TABLE cases
  ALTER COLUMN entity_id TYPE UUID USING entity_id::uuid;

-- Rebuild indexes (they are automatically updated by ALTER COLUMN TYPE,
-- but we recreate them explicitly for clarity)
DROP INDEX IF EXISTS idx_cases_merchant_status;
DROP INDEX IF EXISTS idx_cases_merchant_entity;

CREATE INDEX idx_cases_merchant_status ON cases(merchant_id, status);
CREATE INDEX idx_cases_merchant_entity ON cases(merchant_id, entity_id);

-- ============================================================================
-- ROLLBACK (if needed):
-- ALTER TABLE cases ALTER COLUMN id TYPE TEXT USING id::text;
-- ALTER TABLE cases ALTER COLUMN merchant_id TYPE TEXT USING merchant_id::text;
-- ALTER TABLE cases ALTER COLUMN decision_id TYPE TEXT USING decision_id::text;
-- ALTER TABLE cases ALTER COLUMN entity_id TYPE TEXT USING entity_id::text;
-- ============================================================================
