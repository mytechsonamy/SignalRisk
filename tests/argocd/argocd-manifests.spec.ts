import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const ARGOCD_DIR = path.join(ROOT, 'infrastructure', 'argocd');
const APPS_DIR = path.join(ARGOCD_DIR, 'apps');
const PROJECTS_DIR = path.join(ARGOCD_DIR, 'projects');
const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows');

describe('ArgoCD manifests', () => {
  // 1. app-of-apps.yaml exists
  it('app-of-apps.yaml exists', () => {
    const filePath = path.join(ARGOCD_DIR, 'app-of-apps.yaml');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  // 2. signalrisk-staging.yaml exists
  it('signalrisk-staging.yaml exists', () => {
    const filePath = path.join(APPS_DIR, 'signalrisk-staging.yaml');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  // 3. signalrisk-production.yaml exists
  it('signalrisk-production.yaml exists', () => {
    const filePath = path.join(APPS_DIR, 'signalrisk-production.yaml');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  // 4. signalrisk.yaml (AppProject) exists
  it('signalrisk.yaml (AppProject) exists', () => {
    const filePath = path.join(PROJECTS_DIR, 'signalrisk.yaml');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  // 5. release.yml workflow exists
  it('release.yml workflow exists', () => {
    const filePath = path.join(WORKFLOWS_DIR, 'release.yml');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  // 6. app-of-apps.yaml contains 'argocd.argoproj.io'
  it('app-of-apps.yaml contains argocd.argoproj.io', () => {
    const filePath = path.join(ARGOCD_DIR, 'app-of-apps.yaml');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('argocd.argoproj.io');
  });

  // 7. staging has automated sync enabled
  it('staging has automated sync enabled', () => {
    const filePath = path.join(APPS_DIR, 'signalrisk-staging.yaml');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('automated:');
    expect(content).toContain('selfHeal: true');
  });

  // 8. production does NOT have automated sync (manual only)
  it('production does NOT have automated sync — manual approval required', () => {
    const filePath = path.join(APPS_DIR, 'signalrisk-production.yaml');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).not.toContain('automated:');
  });

  // 9. AppProject defines both staging and production destinations
  it('AppProject defines both staging and production destinations', () => {
    const filePath = path.join(PROJECTS_DIR, 'signalrisk.yaml');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('signalrisk-staging');
    expect(content).toContain('signalrisk-production');
  });

  // 10. release.yml triggers on tag push 'v*'
  it('release.yml triggers on tag push v*', () => {
    const filePath = path.join(WORKFLOWS_DIR, 'release.yml');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain("- 'v*'");
  });
});
