import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const K6_SCRIPT = path.join(REPO_ROOT, 'scripts', 'load-test', 'full-stack-load-test.js');
const SHELL_SCRIPT = path.join(REPO_ROOT, 'scripts', 'load-test', 'run-load-test.sh');

describe('Load test script validation', () => {
  let k6Content: string;
  let shellContent: string;

  beforeAll(() => {
    k6Content = fs.readFileSync(K6_SCRIPT, 'utf8');
    shellContent = fs.readFileSync(SHELL_SCRIPT, 'utf8');
  });

  // Test 1
  it('full-stack-load-test.js exists', () => {
    expect(fs.existsSync(K6_SCRIPT)).toBe(true);
  });

  // Test 2
  it('run-load-test.sh exists', () => {
    expect(fs.existsSync(SHELL_SCRIPT)).toBe(true);
  });

  // Test 3
  it('k6 script contains ramping-arrival-rate executor', () => {
    expect(k6Content).toContain('ramping-arrival-rate');
  });

  // Test 4
  it('k6 script has 5000 target rate', () => {
    expect(k6Content).toContain('5000');
  });

  // Test 5
  it('k6 script defines p99 threshold < 100ms', () => {
    expect(k6Content).toMatch(/p\(99\)<100/);
  });

  // Test 6
  it('k6 script defines p95 threshold < 50ms', () => {
    expect(k6Content).toMatch(/p\(95\)<50/);
  });

  // Test 7
  it('k6 script defines error rate threshold < 0.005', () => {
    expect(k6Content).toContain('rate<0.005');
  });

  // Test 8
  it('k6 script has 3 scenario types (normal, high-risk, edge)', () => {
    expect(k6Content).toContain("'normal'");
    expect(k6Content).toContain("'high-risk'");
    expect(k6Content).toContain("'edge'");
  });

  // Test 9
  it('k6 script has handleSummary export', () => {
    expect(k6Content).toContain('export function handleSummary');
  });

  // Test 10
  it('run-load-test.sh contains k6 run command', () => {
    expect(shellContent).toContain('k6 run');
  });
});
