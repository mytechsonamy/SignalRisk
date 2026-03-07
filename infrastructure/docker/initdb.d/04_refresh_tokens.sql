-- 004_refresh_tokens.sql
-- SignalRisk: Refresh token storage for JWT token rotation and revocation

BEGIN;

CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    token_hash      VARCHAR(64) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE refresh_tokens IS 'Stores hashed refresh tokens for JWT rotation and revocation.';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 hash of the opaque refresh token.';
COMMENT ON COLUMN refresh_tokens.revoked_at IS 'Set when token is explicitly revoked or rotated.';

-- Index for token lookup (most common query)
CREATE UNIQUE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);

-- Index for revoking all tokens for a user
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);

-- Index for cleaning up expired tokens
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at)
    WHERE revoked_at IS NULL;

-- RLS policy: tenants can only see their own refresh tokens
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY refresh_tokens_tenant_isolation ON refresh_tokens
    USING (merchant_id = current_setting('app.merchant_id')::uuid);

COMMIT;
