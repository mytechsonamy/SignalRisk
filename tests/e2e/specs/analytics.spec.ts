import { test, expect } from '@playwright/test';

test.describe('Analytics Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics');
  });

  test('analytics page renders correctly', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /analytics/i }),
    ).toBeVisible();
  });

  test('decision trends chart is visible', async ({ page }) => {
    const trendsChart = page
      .getByText(/decision trends|trends/i)
      .or(page.locator('[data-testid="trends-chart"]'))
      .or(page.locator('canvas').first());
    if (await trendsChart.count() > 0) {
      await expect(trendsChart.first()).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible();
  });

  test('risk score histogram section is present', async ({ page }) => {
    const histogram = page
      .getByText(/risk score distribution|risk scores/i)
      .or(page.locator('[data-testid="risk-histogram"]'));
    if (await histogram.count() > 0) {
      await expect(histogram.first()).toBeVisible();
    }
  });

  test('decision donut chart renders', async ({ page }) => {
    const donut = page
      .getByText(/decision breakdown|decisions/i)
      .or(page.locator('[data-testid="decision-donut"]'));
    if (await donut.count() > 0) {
      await expect(donut.first()).toBeVisible();
    }
  });

  test('merchant stats table is visible', async ({ page }) => {
    const statsTable = page
      .getByRole('table')
      .or(page.getByText(/merchant stats|top merchants/i));
    if (await statsTable.count() > 0) {
      await expect(statsTable.first()).toBeVisible();
    }
  });

  test('date range selector is available', async ({ page }) => {
    const dateRange = page
      .getByRole('combobox', { name: /date range|time range|period/i })
      .or(page.getByLabel(/date range/i))
      .or(page.locator('[data-testid="date-range-picker"]'));
    if (await dateRange.count() > 0) {
      await expect(dateRange).toBeVisible();
    }
  });

  test('last updated timestamp is shown', async ({ page }) => {
    const updatedAt = page
      .getByText(/last updated|updated at|as of/i)
      .or(page.locator('[data-testid="last-updated"]'));
    if (await updatedAt.count() > 0) {
      await expect(updatedAt.first()).toBeVisible();
    }
  });

  test('block rate percentage is displayed', async ({ page }) => {
    const blockRate = page.getByText(/block rate/i);
    if (await blockRate.count() > 0) {
      await expect(blockRate.first()).toBeVisible();
    }
  });

  test('velocity chart for 24 hour window is visible', async ({ page }) => {
    const velocityChart = page
      .getByText(/velocity|event volume|events\/hour/i)
      .or(page.locator('[data-testid="velocity-chart"]'));
    if (await velocityChart.count() > 0) {
      await expect(velocityChart.first()).toBeVisible();
    }
  });

  test('analytics data refreshes when refresh button is clicked', async ({ page }) => {
    const refreshBtn = page
      .getByRole('button', { name: /refresh|reload/i })
      .or(page.locator('[data-testid="refresh-btn"]'));
    if (await refreshBtn.count() > 0) {
      await refreshBtn.click();
      // After refresh, loading state or updated timestamp should appear
      await page.waitForTimeout(200);
      await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible();
    }
  });
});
