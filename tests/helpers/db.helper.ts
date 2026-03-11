import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

/**
 * Database helper for E2E tests.
 *
 * Each test suite gets an isolated PostgreSQL schema, ensuring parallel
 * test execution without data collisions. The schema includes full RLS
 * policy replication so tenant isolation is tested end-to-end.
 */

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.TEST_DB_HOST ?? 'localhost',
      port: parseInt(process.env.TEST_DB_PORT ?? '5432', 10),
      user: process.env.TEST_DB_USER ?? 'signalrisk_test',
      password: process.env.TEST_DB_PASSWORD ?? 'signalrisk_test',
      database: process.env.TEST_DB_NAME ?? 'signalrisk_test',
      max: 10,
    });
  }
  return pool;
}

/**
 * Create an isolated schema for this test suite with all required tables and RLS policies.
 * Returns the schema name for use in SET search_path.
 */
export async function createIsolatedSchema(suiteName?: string): Promise<string> {
  const schemaName = `test_${(suiteName ?? 'suite').replace(/[^a-z0-9]/gi, '_')}_${uuidv4().slice(0, 8)}`;
  const db = getPool();

  await db.query(`CREATE SCHEMA "${schemaName}"`);

  // Create non-superuser role for RLS testing (superusers bypass ALL RLS)
  await db.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'signalrisk_app') THEN
        CREATE ROLE signalrisk_app LOGIN PASSWORD 'signalrisk_app';
      END IF;
    END $$;
  `);
  await db.query(`GRANT USAGE ON SCHEMA "${schemaName}" TO signalrisk_app`);

  // Register for global teardown cleanup
  await db.query(
    'INSERT INTO _test_schema_registry (schema_name) VALUES ($1) ON CONFLICT DO NOTHING',
    [schemaName],
  );

  // Create tables within the isolated schema
  await db.query(`
    SET search_path TO "${schemaName}";

    -- Merchants (tenants)
    CREATE TABLE merchants (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      api_key     TEXT UNIQUE,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- Users
    CREATE TABLE users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id UUID NOT NULL REFERENCES merchants(id),
      email       TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'analyst',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- Devices (fingerprints)
    CREATE TABLE devices (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id     UUID NOT NULL REFERENCES merchants(id),
      fingerprint     TEXT NOT NULL,
      device_type     TEXT,
      first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
      last_seen_at    TIMESTAMPTZ DEFAULT NOW()
    );

    -- Fraud events
    CREATE TABLE events (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id     UUID NOT NULL REFERENCES merchants(id),
      device_id       UUID REFERENCES devices(id),
      event_type      TEXT NOT NULL,
      ip_address      INET,
      payload         JSONB DEFAULT '{}',
      risk_score      NUMERIC(5,2),
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    -- Decisions (fraud verdicts)
    CREATE TABLE decisions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id     UUID NOT NULL REFERENCES merchants(id),
      event_id        UUID NOT NULL REFERENCES events(id),
      verdict         TEXT NOT NULL,
      confidence      NUMERIC(5,4),
      reasons         JSONB DEFAULT '[]',
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    -- Enable RLS on all tenant tables (FORCE = applies to table owner too)
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE users FORCE ROW LEVEL SECURITY;
    ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE devices FORCE ROW LEVEL SECURITY;
    ALTER TABLE events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE events FORCE ROW LEVEL SECURITY;
    ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE decisions FORCE ROW LEVEL SECURITY;

    -- RESTRICTIVE RLS policies: only rows matching current merchant_id
    CREATE POLICY users_tenant_isolation ON users
      FOR ALL
      USING (merchant_id = current_setting('app.current_merchant_id')::UUID);

    CREATE POLICY devices_tenant_isolation ON devices
      FOR ALL
      USING (merchant_id = current_setting('app.current_merchant_id')::UUID);

    CREATE POLICY events_tenant_isolation ON events
      FOR ALL
      USING (merchant_id = current_setting('app.current_merchant_id')::UUID);

    CREATE POLICY decisions_tenant_isolation ON decisions
      FOR ALL
      USING (merchant_id = current_setting('app.current_merchant_id')::UUID);

    -- Reset search path
    SET search_path TO public;
  `);

  // Grant table access to the non-superuser role (for RLS testing)
  await db.query(`GRANT ALL ON ALL TABLES IN SCHEMA "${schemaName}" TO signalrisk_app`);

  return schemaName;
}

/**
 * Execute a query within a specific tenant's RLS context.
 * Sets the app.current_merchant_id session variable before executing.
 */
export async function queryAsTenant(
  schemaName: string,
  merchantId: string,
  query: string,
  params: unknown[] = [],
): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> {
  const db = getPool();
  const client: PoolClient = await db.connect();

  try {
    // Switch to non-superuser role so RLS policies are enforced
    await client.query('SET ROLE signalrisk_app');
    await client.query(`SET search_path TO "${schemaName}"`);
    await client.query(`SET app.current_merchant_id TO '${merchantId}'`);
    const result = await client.query(query, params);
    return { rows: result.rows, rowCount: result.rowCount };
  } finally {
    await client.query('RESET app.current_merchant_id');
    await client.query('RESET search_path');
    await client.query('RESET ROLE');
    client.release();
  }
}

/**
 * Execute a query as a superuser (bypasses RLS). Use for seeding data.
 * Disables row_security temporarily so FORCE ROW LEVEL SECURITY is bypassed.
 */
export async function queryAsSuper(
  schemaName: string,
  query: string,
  params: unknown[] = [],
): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> {
  const db = getPool();
  const client: PoolClient = await db.connect();

  try {
    await client.query(`SET search_path TO "${schemaName}"`);
    await client.query('SET LOCAL row_security TO off');
    const result = await client.query(query, params);
    return { rows: result.rows, rowCount: result.rowCount };
  } finally {
    await client.query('RESET row_security');
    await client.query('RESET search_path');
    client.release();
  }
}

/**
 * Drop an isolated schema (also called from global teardown).
 */
export async function dropSchema(schemaName: string): Promise<void> {
  const db = getPool();
  await db.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await db.query('DELETE FROM _test_schema_registry WHERE schema_name = $1', [schemaName]);
}

/**
 * Clean all data from tenant tables within a schema (without dropping schema).
 */
export async function truncateTables(schemaName: string): Promise<void> {
  const db = getPool();
  await db.query(`
    SET search_path TO "${schemaName}";
    TRUNCATE decisions, events, devices, users, merchants CASCADE;
    SET search_path TO public;
  `);
}

/**
 * Close the shared pool. Call in afterAll if needed.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
