/**
 * Capture screenshots of all dashboard pages for documentation.
 * Uses API-based auth token injection + sidebar click navigation
 * to avoid ProtectedRoute race condition with page.goto().
 *
 * Run:  npx tsx scripts/capture-screenshots.ts
 */
import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const BASE = 'http://localhost:5173';
const AUTH_URL = process.env.AUTH_URL ?? 'http://localhost:3001';
const OUT = path.resolve(__dirname, '../docs/screenshots');

/** Sidebar link label → screenshot file name mapping */
const MAIN_NAV = [
  { label: 'Overview',     name: '01-overview' },
  { label: 'Cases',        name: '02-cases' },
  { label: 'Rules',        name: '03-rules' },
  { label: 'Fraud Ops',    name: '04-fraud-ops' },
  { label: 'Analytics',    name: '05-analytics-risk-trends' },
  { label: 'Graph Intel',  name: '06-graph-intel' },
  { label: 'Live Feed',    name: '07-live-feed' },
  { label: 'Settings',     name: '08-settings' },
  { label: 'Admin',        name: '09-admin' },
];

const FRAUD_TESTER_NAV = [
  { label: 'Battle Arena',  name: '10-battle-arena' },
  { label: 'Scenarios',     name: '11-scenarios' },
  { label: 'Reports',       name: '12-reports' },
  { label: 'Configuration', name: '13-agent-config' },
];

async function getAuthToken(): Promise<{ token: string; user: { id: string; email: string; role: string } }> {
  const resp = await fetch(`${AUTH_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@signalrisk.io', password: 'admin123' }),
  });

  if (!resp.ok) {
    throw new Error(`Auth login failed: ${resp.status} ${await resp.text()}`);
  }

  const body = await resp.json() as {
    accessToken?: string;
    access_token?: string;
    token?: string;
    user?: { id: string; email: string; role: string };
  };

  const token = body.accessToken ?? body.access_token ?? body.token ?? '';
  const user = body.user ?? { id: 'admin', email: 'admin@signalrisk.io', role: 'admin' };

  if (!token) throw new Error(`No token in auth response: ${JSON.stringify(body)}`);
  return { token, user };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // Get auth token via API
  console.log('Getting auth token from auth-service...');
  const { token, user } = await getAuthToken();
  console.log(`Auth OK: ${user.email} (${user.role})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // 1. Capture login page (before auth injection)
  console.log('Capturing: 00-login');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, '00-login.png'), fullPage: false });

  // 2. Inject auth token into localStorage
  console.log('Injecting auth token into localStorage...');
  await page.evaluate(
    ({ t, u }) => {
      localStorage.setItem('signalrisk_token', t);
      localStorage.setItem('signalrisk_user', JSON.stringify(u));
    },
    { t: token, u: user },
  );

  // 3. Navigate to home (single page load to bootstrap the SPA)
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Verify auth worked — should see sidebar
  const hasSidebar = await page.locator('aside[aria-label="Main navigation"]').isVisible().catch(() => false);
  if (!hasSidebar) {
    console.error('ERROR: Sidebar not visible — auth may have failed');
    await browser.close();
    process.exit(1);
  }
  console.log('Auth successful, sidebar visible.');

  // 4. Capture each main nav page via sidebar click
  for (const item of MAIN_NAV) {
    console.log(`Capturing: ${item.name} (clicking "${item.label}")`);
    const link = page.locator(`aside a:has(span:text-is("${item.label}"))`);
    await link.click();
    await page.waitForTimeout(2000); // let page render
    await page.screenshot({ path: path.join(OUT, `${item.name}.png`), fullPage: false });
  }

  // 5. Capture Fraud Tester pages via sidebar click
  for (const item of FRAUD_TESTER_NAV) {
    console.log(`Capturing: ${item.name} (clicking "${item.label}")`);
    const link = page.locator(`aside a:has(span:text-is("${item.label}"))`);
    await link.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, `${item.name}.png`), fullPage: false });
  }

  // 6. Analytics sub-tabs
  // First click back to Analytics
  console.log('Capturing: 05b-analytics-velocity');
  await page.locator('aside a:has(span:text-is("Analytics"))').click();
  await page.waitForTimeout(1500);
  const velocityTab = page.locator('button:text-is("Velocity"), [role="tab"]:text-is("Velocity"), a:text-is("Velocity")');
  if (await velocityTab.count() > 0) {
    await velocityTab.first().click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: path.join(OUT, '05b-analytics-velocity.png'), fullPage: false });

  console.log('Capturing: 05c-analytics-merchant-stats');
  const merchantTab = page.locator('button:text-is("Merchant Stats"), [role="tab"]:text-is("Merchant Stats"), a:text-is("Merchant Stats")');
  if (await merchantTab.count() > 0) {
    await merchantTab.first().click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: path.join(OUT, '05c-analytics-merchant-stats.png'), fullPage: false });

  // 7. Admin sub-tab (System Health)
  console.log('Capturing: 09b-admin-system-health');
  await page.locator('aside a:has(span:text-is("Admin"))').click();
  await page.waitForTimeout(1500);
  const healthTab = page.locator('button:text-is("System Health"), [role="tab"]:text-is("System Health"), a:text-is("System Health")');
  if (await healthTab.count() > 0) {
    await healthTab.first().click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: path.join(OUT, '09b-admin-system-health.png'), fullPage: false });

  await browser.close();

  const total = MAIN_NAV.length + FRAUD_TESTER_NAV.length + 4; // +4: login, velocity, merchant-stats, system-health
  console.log(`\nDone! ${total} screenshots saved to ${OUT}`);
}

main().catch(console.error);
