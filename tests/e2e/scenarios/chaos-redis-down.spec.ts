// Chaos: Redis down → admin endpoint 503, event ingestion devam eder, recovery sonrası normal
// Sprint 18'de tam implement edilecek
import { test, expect } from '@playwright/test';

test.describe('Chaos — Redis Down E2E', () => {
  test.todo('should return 503 on admin/auth endpoints when Redis is unavailable (fail-closed)');
  test.todo('should continue accepting events on event-collector when Redis is unavailable (degraded mode)');
  test.todo('should recover to normal operation after Redis comes back online');
});
