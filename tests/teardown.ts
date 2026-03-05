import { Pool } from 'pg';

/**
 * Global teardown: runs once after all test suites.
 * - Drops all test schemas created during the run
 * - Cleans up the schema registry
 */
export default async function globalTeardown(): Promise<void> {
  const pool = new Pool({
    host: process.env.TEST_DB_HOST ?? 'localhost',
    port: parseInt(process.env.TEST_DB_PORT ?? '5432', 10),
    user: process.env.TEST_DB_USER ?? 'signalrisk_test',
    password: process.env.TEST_DB_PASSWORD ?? 'signalrisk_test',
    database: process.env.TEST_DB_NAME ?? 'signalrisk_test',
  });

  try {
    // Retrieve all test schemas
    const { rows } = await pool.query(
      'SELECT schema_name FROM _test_schema_registry',
    );

    for (const row of rows) {
      await pool.query(`DROP SCHEMA IF EXISTS "${row.schema_name}" CASCADE`);
      console.log(`[E2E Teardown] Dropped schema: ${row.schema_name}`);
    }

    // Clean the registry
    await pool.query('DELETE FROM _test_schema_registry');
    console.log('[E2E Teardown] Global teardown complete');
  } catch (error) {
    // Registry table may not exist if setup never ran successfully
    console.warn('[E2E Teardown] Cleanup warning:', (error as Error).message);
  } finally {
    await pool.end();
  }
}
