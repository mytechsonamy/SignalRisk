import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '../..');
const readJson = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf-8'));
const exists = (p: string) => fs.existsSync(path.join(ROOT, p));

describe('npm Workspace integrity', () => {
  it('root package.json exists', () => { expect(exists('package.json')).toBe(true); });

  it('root package.json has workspaces array', () => {
    const pkg = readJson('package.json');
    expect(Array.isArray(pkg.workspaces)).toBe(true);
    expect(pkg.workspaces.length).toBeGreaterThan(0);
  });

  it('root is marked private', () => {
    expect(readJson('package.json').private).toBe(true);
  });

  it('root has test:all script', () => {
    const pkg = readJson('package.json');
    expect(pkg.scripts?.['test:all']).toBeDefined();
  });

  it('root has build:all script', () => {
    expect(readJson('package.json').scripts?.['build:all']).toBeDefined();
  });

  it('@signalrisk/redis-module package exists', () => {
    expect(exists('packages/redis-module/package.json')).toBe(true);
    expect(readJson('packages/redis-module/package.json').name).toBe('@signalrisk/redis-module');
  });

  it('@signalrisk/telemetry package exists', () => {
    expect(exists('packages/telemetry/package.json')).toBe(true);
  });

  it('@signalrisk/mobile-sdk package exists', () => {
    expect(exists('packages/mobile-sdk/package.json')).toBe(true);
  });

  it('all packages/* have unique names', () => {
    const pkgDirs = fs.readdirSync(path.join(ROOT, 'packages'))
      .filter(d => exists(`packages/${d}/package.json`));
    const names = pkgDirs.map(d => readJson(`packages/${d}/package.json`).name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('workspaces array includes apps/*', () => {
    const ws = readJson('package.json').workspaces as string[];
    expect(ws.some(w => w.includes('apps'))).toBe(true);
  });

  it('workspaces array includes packages/*', () => {
    const ws = readJson('package.json').workspaces as string[];
    expect(ws.some(w => w.includes('packages'))).toBe(true);
  });

  it('.npmrc exists at root', () => {
    expect(exists('.npmrc')).toBe(true);
  });

  it('verify-workspaces.sh exists and is executable', () => {
    const scriptPath = path.join(ROOT, 'scripts/verify-workspaces.sh');
    expect(fs.existsSync(scriptPath)).toBe(true);
    const stat = fs.statSync(scriptPath);
    expect(stat.mode & 0o111).toBeGreaterThan(0);
  });
});
