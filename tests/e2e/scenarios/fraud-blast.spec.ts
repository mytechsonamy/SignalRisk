// Fraud Blast: Aynı device fingerprint ile 50 event → velocity tetikleme → BLOCK
// Sprint 18'de tam implement edilecek
import { test, expect } from '@playwright/test';

test.describe('Fraud Blast E2E', () => {
  test.todo('should trigger velocity threshold breach after 50 events from same device fingerprint');
  test.todo('should return BLOCK decision when velocity rules are triggered');
  test.todo('should create a case in case-service for the blocked entity');
});
