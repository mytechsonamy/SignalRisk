// JWT Revoke: Login → logout → aynı token ile istek → 401/503
// Sprint 18'de tam implement edilecek
import { test, expect } from '@playwright/test';

test.describe('JWT Revoke E2E', () => {
  test.todo('should issue a valid JWT token on successful login via client_credentials grant');
  test.todo('should add jti to Redis denylist and return 200 on logout');
  test.todo('should reject the revoked token with 401 or 503 on subsequent requests');
});
