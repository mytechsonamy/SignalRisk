-- Cases table for case-service — Sprint 26 (updated: UUID columns)
-- Stores fraud investigation cases created from REVIEW/BLOCK decisions

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS cases (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id      UUID NOT NULL,
    decision_id      UUID NOT NULL,
    entity_id        UUID NOT NULL,
    action           TEXT NOT NULL CHECK (action IN ('REVIEW', 'BLOCK')),
    risk_score       NUMERIC(5,2) NOT NULL DEFAULT 0,
    risk_factors     JSONB NOT NULL DEFAULT '[]',
    status           TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED')),
    priority         TEXT NOT NULL DEFAULT 'LOW' CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
    sla_deadline     TIMESTAMPTZ NOT NULL,
    sla_breached     BOOLEAN NOT NULL DEFAULT false,
    assigned_to      TEXT,
    resolution       TEXT CHECK (resolution IS NULL OR resolution IN ('FRAUD', 'LEGITIMATE', 'INCONCLUSIVE')),
    resolution_notes TEXT,
    resolved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cases_merchant_status ON cases(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_cases_merchant_entity ON cases(merchant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_cases_sla_breached ON cases(sla_deadline) WHERE sla_breached = false AND status != 'RESOLVED';

-- RLS for tenant isolation
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_cases ON cases
    AS RESTRICTIVE
    FOR ALL
    USING (merchant_id = current_setting('app.merchant_id'))
    WITH CHECK (merchant_id = current_setting('app.merchant_id'));
