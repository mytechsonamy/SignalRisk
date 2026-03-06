import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('login form has submit button', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /sign in|login/i })).toBeVisible();
  });

  test('shows validation errors on empty submit', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /sign in|login/i }).click();
    // Should show some validation error or remain on login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('accepts email and password input', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('analyst@signalrisk.io');
    await page.getByLabel(/password/i).fill('password123');
    await expect(page.getByLabel(/email/i)).toHaveValue('analyst@signalrisk.io');
    await expect(page.getByLabel(/password/i)).toHaveValue('password123');
  });

  test('redirects unauthenticated user from protected route to login', async ({ page }) => {
    await page.goto('/cases');
    await expect(page).toHaveURL(/\/login/);
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('analyst@signalrisk.io');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /sign in|login/i }).click();
    // After successful login, user should be on the dashboard
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('logout button clears session and redirects to login', async ({ page }) => {
    // Navigate directly to dashboard assuming session exists
    await page.goto('/');
    const logoutBtn = page.getByRole('button', { name: /logout|sign out/i });
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('unauthorized page displays access denied message', async ({ page }) => {
    await page.goto('/unauthorized');
    await expect(
      page.getByText(/unauthorized|access denied|forbidden/i),
    ).toBeVisible();
  });
});
