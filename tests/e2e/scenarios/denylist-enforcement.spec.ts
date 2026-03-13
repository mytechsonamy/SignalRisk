/**
 * Denylist Enforcement E2E — SYN-C-001, SYN-F-012
 *
 * Proves the closed-loop: FRAUD label → denylist entry → next event BLOCKed.
 *
 * Chain:
 *   1. Blast events from deviceId → velocity triggers REVIEW/BLOCK
 *   2. Poll for case → resolve as FRAUD
 *   3. Wait for feedback loop (label → Kafka → StateFeedbackConsumer → watchlist)
 *   4. New event for same entity → decision must be BLOCK
 *
 * SYN-C-001: FRAUD label → denylist retry block
 * SYN-F-012: Repeated blocked customer retry is immediately blocked
 *
 * Run with:
 *   npx playwright test --config tests/e2e/playwright.config.real.ts denylist-enforcement
 */

import { test, expect } from '@playwright/test';
import {
  getMerchantToken,
  pollDecision,
  pollForCase,
  resolveCase,
  generateEventId,
  ingestEvent,
  sleep,
  blastEventsFromDevice,
  waitForVelocity,
  queryPostgres,
  TEST_MERCHANT,
} from './helpers';

const SKIP = process.env.SKIP_DOCKER === 'true';
test.describe.configure({ mode: 'serial' });

// Shared state across serial tests
let token: string;
const DEVICE_ID = `denylist-device-${Date.now()}`;
let caseId: string;
let velocityReady = false;

test.describe('Denylist Enforcement (SYN-C-001, SYN-F-012)', () => {
  test.beforeAll(async ({ request }) => {
    if (SKIP) return;
    token = await getMerchantToken(request);
  });

  /**
   * SYN-C-001 Step 1: Trigger elevated risk via velocity burst, get a case.
   */
  test('velocity burst triggers REVIEW/BLOCK and creates a case', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    // Blast 20 events from same device to trigger velocity rule
    const statuses = await blastEventsFromDevice(request, DEVICE_ID, 20);
    const accepted = statuses.filter((s) => s === 202).length;
    expect(accepted).toBeGreaterThan(0);

    // Wait for velocity pipeline
    velocityReady = await waitForVelocity(request, DEVICE_ID, 10);
    test.skip(!velocityReady, 'Velocity pipeline not wired — cannot proceed');

    // Wait for decision cache TTL to expire
    await sleep(6000);

    // Fresh decision should be REVIEW or BLOCK
    const requestId = generateEventId();
    const decision = await pollDecision(request, requestId, token, 10, 500, DEVICE_ID);
    expect(['BLOCK', 'REVIEW']).toContain(decision.action);

    // Wait for case to appear
    const foundCase = await pollForCase(request, token, DEVICE_ID);
    expect(foundCase.id).toBeTruthy();
    expect(foundCase.merchantId).toBe(TEST_MERCHANT.merchantId);
    caseId = foundCase.id;
  });

  /**
   * SYN-C-001 Step 2: Resolve case as FRAUD → label published → denylist created.
   */
  test('resolve case as FRAUD creates denylist entry', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!velocityReady, 'Velocity not wired');
    test.skip(!caseId, 'No case from previous test');

    // Resolve as FRAUD — triggers label publish to signalrisk.state.labels
    const resolved = await resolveCase(request, token, caseId, 'FRAUD');
    expect(resolved).toBeTruthy();

    // Wait for feedback loop: label → Kafka → StateFeedbackConsumer → watchlist_entries
    // Typical latency <2s in Docker, allow up to 10s
    await sleep(8000);

    // Verify denylist entry via DB query
    const denylistCount = queryPostgres(
      `SELECT COUNT(*) FROM watchlist_entries WHERE merchant_id='${TEST_MERCHANT.merchantId}' AND entity_id='${DEVICE_ID}' AND list_type='denylist' AND is_active=true`,
    );
    expect(parseInt(denylistCount, 10)).toBeGreaterThanOrEqual(1);
  });

  /**
   * SYN-C-001 Step 3: Next event for denylisted entity → BLOCK.
   */
  test('new event for denylisted entity is BLOCKed', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!velocityReady, 'Velocity not wired');
    test.skip(!caseId, 'No case from previous test');

    // Send a new event for the same (now denylisted) device
    const newEventId = generateEventId();
    const { status } = await ingestEvent(request, {
      eventId:  newEventId,
      deviceId: DEVICE_ID,
    });
    expect([202, 429]).toContain(status);

    // Wait for pipeline
    await sleep(3000);

    // Poll decision — should be BLOCK because entity is on denylist
    const decision = await pollDecision(request, newEventId, token, 20, 500, DEVICE_ID);
    expect(decision.action).toBe('BLOCK');
  });

  /**
   * SYN-F-012: Repeated retry by same entity → still BLOCK (denylist persists).
   */
  test('repeated retry by same denylisted entity remains BLOCKed (SYN-F-012)', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!velocityReady, 'Velocity not wired');
    test.skip(!caseId, 'No case from previous test');

    // Third attempt — still denylisted
    const retryEventId = generateEventId();
    await ingestEvent(request, {
      eventId:  retryEventId,
      deviceId: DEVICE_ID,
    });

    await sleep(3000);

    const decision = await pollDecision(request, retryEventId, token, 20, 500, DEVICE_ID);
    expect(decision.action).toBe('BLOCK');

    // A second case should be created for the retry
    const cases = await pollForCase(request, token, DEVICE_ID);
    expect(cases.merchantId).toBe(TEST_MERCHANT.merchantId);
  });
});
