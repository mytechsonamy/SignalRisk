import { Pool } from 'pg';

/**
 * Global setup: runs once before all test suites.
 * - Validates DB connectivity
 * - Creates a shared test schema registry table
 */
export default async function globalSetup(): Promise<void> {
  const pool = new Pool({
    host: process.env.TEST_DB_HOST ?? 'localhost',
    port: parseInt(process.env.TEST_DB_PORT ?? '5432', 10),
    user: process.env.TEST_DB_USER ?? 'signalrisk_test',
    password: process.env.TEST_DB_PASSWORD ?? 'signalrisk_test',
    database: process.env.TEST_DB_NAME ?? 'signalrisk_test',
  });

  try {
    // Verify DB connection
    const result = await pool.query('SELECT NOW()');
    console.log(`[E2E Setup] Database connected at ${result.rows[0].now}`);

    // Ensure uuid-ossp extension exists
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Create a registry to track test schemas for cleanup
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _test_schema_registry (
        schema_name TEXT PRIMARY KEY,
        created_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    console.log('[E2E Setup] Global setup complete');
  } catch (error) {
    console.error('[E2E Setup] Failed to connect to test database:', error);
    console.error(
      '[E2E Setup] Ensure the test DB is running. Expected connection:',
      `host=${process.env.TEST_DB_HOST ?? 'localhost'}`,
      `port=${process.env.TEST_DB_PORT ?? '5432'}`,
      `db=${process.env.TEST_DB_NAME ?? 'signalrisk_test'}`,
    );
    throw error;
  } finally {
    await pool.end();
  }
}
