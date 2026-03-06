import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '../..');
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));
const readJson = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf-8'));
const readFile = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

describe('Dashboard production build checks', () => {
  it('dashboard package.json has build script', () => {
    const pkg = readJson('apps/dashboard/package.json');
    expect(pkg.scripts?.build).toBeDefined();
  });

  it('vite.config.ts exists', () => {
    expect(exists('apps/dashboard/vite.config.ts')).toBe(true);
  });

  it('Dockerfile.nginx exists', () => {
    expect(exists('apps/dashboard/Dockerfile.nginx')).toBe(true);
  });

  it('nginx.conf exists', () => {
    expect(exists('apps/dashboard/nginx.conf')).toBe(true);
  });

  it('nginx.conf has SPA fallback (try_files index.html)', () => {
    const conf = readFile('apps/dashboard/nginx.conf');
    expect(conf).toContain('index.html');
    expect(conf).toContain('try_files');
  });

  it('nginx.conf has /health endpoint', () => {
    expect(readFile('apps/dashboard/nginx.conf')).toContain('/health');
  });

  it('Dockerfile.nginx uses multi-stage build', () => {
    const dockerfile = readFile('apps/dashboard/Dockerfile.nginx');
    expect(dockerfile).toContain('AS builder');
    expect(dockerfile).toContain('FROM nginx');
  });

  it('check-bundle-size.sh exists and is executable', () => {
    const scriptPath = path.join(ROOT, 'scripts/check-bundle-size.sh');
    expect(fs.existsSync(scriptPath)).toBe(true);
    const stat = fs.statSync(scriptPath);
    expect(stat.mode & 0o111).toBeGreaterThan(0);
  });

  it('CI workflow contains dashboard-build job', () => {
    const ci = readFile('.github/workflows/ci.yml');
    expect(ci).toContain('dashboard-build');
  });

  it('CI workflow uploads dashboard-dist artifact', () => {
    const ci = readFile('.github/workflows/ci.yml');
    expect(ci).toContain('dashboard-dist');
  });

  it('vite.config.ts has build configuration', () => {
    const conf = readFile('apps/dashboard/vite.config.ts');
    expect(conf).toContain('build');
  });

  it('dashboard has index.html entry point', () => {
    expect(exists('apps/dashboard/index.html')).toBe(true);
  });
});
