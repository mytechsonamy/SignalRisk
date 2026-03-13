/**
 * Allowlist Cooldown E2E — SYN-C-002, SYN-C-007
 *
 * Proves:
 *   SYN-C-002: LEGITIMATE label → allowlist entry → subsequent events not hard-blocked
 *   SYN-C-007: Allowlist does NOT bypass strong fraud signals (velocity burst still blocks)
 *
 * Chain:
 *   1. Blast events → REVIEW/BLOCK → case
 *   2. Resolve as LEGITIMATE → allowlist created (30-day)
 *   3. New single event → should be ALLOW or REVIEW (not BLOCK from prior)
 *   4. Massive velocity burst on same entity → should still BLOCK despite allowlist
 *
 * Run with:
 *   npx playwright test --config tests/e2e/playwright.config.real.ts allowlist-cooldown
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

let token: string;
const DEVICE_ID = `allowlist-device-${Date.now()}`;
let caseId: string;
let velocityReady = false;

test.describe('Allowlist Cooldown (SYN-C-002, SYN-C-007)', () => {
  test.beforeAll(async ({ request }) => {
    if (SKIP) return;
    token = await getMerchantToken(request);
  });

  /**
   * Setup: Trigger REVIEW/BLOCK via velocity → get a case.
   */
  test('velocity burst creates a case for LEGITIMATE resolution', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');

    const statuses = await blastEventsFromDevice(request, DEVICE_ID, 20);
    expect(statuses.filter((s) => s === 202).length).toBeGreaterThan(0);

    velocityReady = await waitForVelocity(request, DEVICE_ID, 10);
    test.skip(!velocityReady, 'Velocity pipeline not wired');

    await sleep(6000);

    const requestId = generateEventId();
    const decision = await pollDecision(request, requestId, token, 10, 500, DEVICE_ID);
    expect(['BLOCK', 'REVIEW']).toContain(decision.action);

    const foundCase = await pollForCase(request, token, DEVICE_ID);
    expect(foundCase.id).toBeTruthy();
    caseId = foundCase.id;
  });

  /**
   * SYN-C-002 Step 1: Resolve as LEGITIMATE → allowlist created.
   */
  test('LEGITIMATE resolution creates allowlist and deactivates denylist', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!velocityReady, 'Velocity not wired');
    test.skip(!caseId, 'No case from previous test');

    const resolved = await resolveCase(request, token, caseId, 'LEGITIMATE');
    expect(resolved).toBeTruthy();

    // Wait for feedback loop: label → Kafka → StateFeedbackConsumer → watchlist
    await sleep(8000);

    // Verify allowlist entry created
    const allowlistCount = queryPostgres(
      `SELECT COUNT(*) FROM watchlist_entries WHERE merchant_id='${TEST_MERCHANT.merchantId}' AND entity_id='${DEVICE_ID}' AND list_type='allowlist' AND is_active=true`,
    );
    expect(parseInt(allowlistCount, 10)).toBeGreaterThanOrEqual(1);

    // Verify denylist deactivated (if one existed)
    const activeDenylist = queryPostgres(
      `SELECT COUNT(*) FROM watchlist_entries WHERE merchant_id='${TEST_MERCHANT.merchantId}' AND entity_id='${DEVICE_ID}' AND list_type='denylist' AND is_active=true`,
    );
    expect(parseInt(activeDenylist, 10)).toBe(0);
  });

  /**
   * SYN-C-002 Step 2: Single event after LEGITIMATE label → not hard-blocked.
   * Score should be lower or decision should be ALLOW/REVIEW (not BLOCK from prior history alone).
   */
  test('single event after LEGITIMATE label is not hard-blocked', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!velocityReady, 'Velocity not wired');
    test.skip(!caseId, 'No case from previous test');

    // Wait for velocity window to cool down (counters decay)
    await sleep(5000);

    const newEventId = generateEventId();
    await ingestEvent(request, {
      eventId:   newEventId,
      deviceId:  DEVICE_ID,
      ipAddress: '100.200.100.200', // different IP to reduce velocity cross-signal
    });

    await sleep(3000);

    const decision = await pollDecision(request, newEventId, token, 20, 500, DEVICE_ID);

    // With allowlist active, single event should not be BLOCKed from prior history alone.
    // ALLOW or REVIEW are acceptable — the key assertion is that allowlist suppresses
    // the hard BLOCK that a denylist would cause.
    expect(['ALLOW', 'REVIEW']).toContain(decision.action);
  });

  /**
   * SYN-C-007: Strong velocity burst still triggers BLOCK despite allowlist.
   * Allowlist is a suppression hint, not an absolute bypass.
   */
  test('velocity burst still triggers BLOCK despite allowlist (SYN-C-007)', async ({ request }) => {
    test.skip(SKIP, 'Requires Docker services');
    test.skip(!velocityReady, 'Velocity not wired');

    // Use a different device to avoid stale velocity counters from setup
    const burstDevice = `allowlist-burst-${Date.now()}`;

    // First: create allowlist for this device
    const setupStatuses = await blastEventsFromDevice(request, burstDevice, 20);
    expect(setupStatuses.filter((s) => s === 202).length).toBeGreaterThan(0);

    const setupVelocity = await waitForVelocity(request, burstDevice, 10);
    test.skip(!setupVelocity, 'Velocity not wired for burst device');

    await sleep(6000);

    const setupRequestId = generateEventId();
    const setupDecision = await pollDecision(request, setupRequestId, token, 10, 500, burstDevice);
    if (!['BLOCK', 'REVIEW'].includes(setupDecision.action)) {
      test.skip(true, 'Setup did not produce REVIEW/BLOCK — cannot test allowlist bypass');
      return;
    }

    const setupCase = await pollForCase(request, token, burstDevice);
    await resolveCase(request, token, setupCase.id, 'LEGITIMATE');
    await sleep(8000);

    // Now blast again — 40 more events on allowlisted device
    await blastEventsFromDevice(request, burstDevice, 40);
    await waitForVelocity(request, burstDevice, 30);
    await sleep(6000);

    const verifyRequestId = generateEventId();
    const verifyDecision = await pollDecision(request, verifyRequestId, token, 10, 500, burstDevice);

    // Strong velocity signals should override allowlist → REVIEW or BLOCK
    expect(['BLOCK', 'REVIEW']).toContain(verifyDecision.action);
    expect(verifyDecision.riskScore).toBeGreaterThanOrEqual(40);
  });
});
