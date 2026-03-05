import { v4 as uuidv4 } from 'uuid';
import { queryAsSuper } from './db.helper';

/**
 * Test data factories for SignalRisk entities.
 *
 * All factories insert data via superuser (bypassing RLS) so they can
 * seed data for any merchant. Tests then query as a specific tenant
 * to verify isolation.
 */

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface Merchant {
  id: string;
  name: string;
  api_key: string;
  status: string;
}

export interface User {
  id: string;
  merchant_id: string;
  email: string;
  role: string;
}

export interface Device {
  id: string;
  merchant_id: string;
  fingerprint: string;
  device_type: string;
}

export interface FraudEvent {
  id: string;
  merchant_id: string;
  device_id: string | null;
  event_type: string;
  ip_address: string;
  payload: Record<string, unknown>;
  risk_score: number;
}

export interface Decision {
  id: string;
  merchant_id: string;
  event_id: string;
  verdict: string;
  confidence: number;
  reasons: string[];
}

// ────────────────────────────────────────────────────────────────────
// Factories
// ────────────────────────────────────────────────────────────────────

/**
 * Create a merchant (tenant) in the test schema.
 */
export async function createMerchant(
  schemaName: string,
  overrides: Partial<Merchant> = {},
): Promise<Merchant> {
  const merchant: Merchant = {
    id: overrides.id ?? uuidv4(),
    name: overrides.name ?? `Test Merchant ${uuidv4().slice(0, 6)}`,
    api_key: overrides.api_key ?? `sk_test_${uuidv4().replace(/-/g, '')}`,
    status: overrides.status ?? 'active',
  };

  await queryAsSuper(
    schemaName,
    `INSERT INTO merchants (id, name, api_key, status) VALUES ($1, $2, $3, $4)`,
    [merchant.id, merchant.name, merchant.api_key, merchant.status],
  );

  return merchant;
}

/**
 * Create a user belonging to a merchant.
 */
export async function createUser(
  schemaName: string,
  merchantId: string,
  overrides: Partial<User> = {},
): Promise<User> {
  const user: User = {
    id: overrides.id ?? uuidv4(),
    merchant_id: merchantId,
    email: overrides.email ?? `user-${uuidv4().slice(0, 6)}@test.signalrisk.io`,
    role: overrides.role ?? 'analyst',
  };

  await queryAsSuper(
    schemaName,
    `INSERT INTO users (id, merchant_id, email, role) VALUES ($1, $2, $3, $4)`,
    [user.id, user.merchant_id, user.email, user.role],
  );

  return user;
}

/**
 * Create a device fingerprint belonging to a merchant.
 */
export async function createDevice(
  schemaName: string,
  merchantId: string,
  overrides: Partial<Device> = {},
): Promise<Device> {
  const device: Device = {
    id: overrides.id ?? uuidv4(),
    merchant_id: merchantId,
    fingerprint: overrides.fingerprint ?? `fp_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
    device_type: overrides.device_type ?? 'mobile',
  };

  await queryAsSuper(
    schemaName,
    `INSERT INTO devices (id, merchant_id, fingerprint, device_type) VALUES ($1, $2, $3, $4)`,
    [device.id, device.merchant_id, device.fingerprint, device.device_type],
  );

  return device;
}

/**
 * Create a fraud event belonging to a merchant.
 */
export async function createEvent(
  schemaName: string,
  merchantId: string,
  overrides: Partial<FraudEvent> = {},
): Promise<FraudEvent> {
  const event: FraudEvent = {
    id: overrides.id ?? uuidv4(),
    merchant_id: merchantId,
    device_id: overrides.device_id ?? null,
    event_type: overrides.event_type ?? 'payment',
    ip_address: overrides.ip_address ?? '192.168.1.1',
    payload: overrides.payload ?? { amount: 99.99, currency: 'USD' },
    risk_score: overrides.risk_score ?? 0.5,
  };

  await queryAsSuper(
    schemaName,
    `INSERT INTO events (id, merchant_id, device_id, event_type, ip_address, payload, risk_score)
     VALUES ($1, $2, $3, $4, $5::INET, $6::JSONB, $7)`,
    [event.id, event.merchant_id, event.device_id, event.event_type, event.ip_address, JSON.stringify(event.payload), event.risk_score],
  );

  return event;
}

/**
 * Create a fraud decision for an event.
 */
export async function createDecision(
  schemaName: string,
  merchantId: string,
  eventId: string,
  overrides: Partial<Decision> = {},
): Promise<Decision> {
  const decision: Decision = {
    id: overrides.id ?? uuidv4(),
    merchant_id: merchantId,
    event_id: eventId,
    verdict: overrides.verdict ?? 'approve',
    confidence: overrides.confidence ?? 0.95,
    reasons: overrides.reasons ?? ['low_risk_score', 'known_device'],
  };

  await queryAsSuper(
    schemaName,
    `INSERT INTO decisions (id, merchant_id, event_id, verdict, confidence, reasons)
     VALUES ($1, $2, $3, $4, $5, $6::JSONB)`,
    [decision.id, decision.merchant_id, decision.event_id, decision.verdict, decision.confidence, JSON.stringify(decision.reasons)],
  );

  return decision;
}

/**
 * Convenience: create a complete merchant with user, device, event, and decision.
 * Returns all created entities.
 */
export async function createFullMerchantData(
  schemaName: string,
  merchantOverrides: Partial<Merchant> = {},
): Promise<{
  merchant: Merchant;
  user: User;
  device: Device;
  event: FraudEvent;
  decision: Decision;
}> {
  const merchant = await createMerchant(schemaName, merchantOverrides);
  const user = await createUser(schemaName, merchant.id);
  const device = await createDevice(schemaName, merchant.id);
  const event = await createEvent(schemaName, merchant.id, { device_id: device.id });
  const decision = await createDecision(schemaName, merchant.id, event.id);

  return { merchant, user, device, event, decision };
}
