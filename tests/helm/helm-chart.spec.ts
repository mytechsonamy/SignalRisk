import * as fs from 'fs';
import * as path from 'path';

const helmRoot = path.resolve(__dirname, '../../infrastructure/helm/signalrisk');
const templatesRoot = path.join(helmRoot, 'templates');

describe('Helm umbrella chart — SignalRisk', () => {
  // Test 1: Chart.yaml exists
  it('Chart.yaml exists', () => {
    expect(fs.existsSync(path.join(helmRoot, 'Chart.yaml'))).toBe(true);
  });

  // Test 2: values.yaml exists
  it('values.yaml exists', () => {
    expect(fs.existsSync(path.join(helmRoot, 'values.yaml'))).toBe(true);
  });

  // Test 3: values-staging.yaml exists
  it('values-staging.yaml exists', () => {
    expect(fs.existsSync(path.join(helmRoot, 'values-staging.yaml'))).toBe(true);
  });

  // Test 4: values-production.yaml exists
  it('values-production.yaml exists', () => {
    expect(fs.existsSync(path.join(helmRoot, 'values-production.yaml'))).toBe(true);
  });

  // Test 5: decision-service/deployment.yaml exists
  it('decision-service/deployment.yaml exists', () => {
    expect(fs.existsSync(path.join(templatesRoot, 'decision-service', 'deployment.yaml'))).toBe(true);
  });

  // Test 6: decision-service/service.yaml exists
  it('decision-service/service.yaml exists', () => {
    expect(fs.existsSync(path.join(templatesRoot, 'decision-service', 'service.yaml'))).toBe(true);
  });

  // Test 7: decision-service/hpa.yaml exists
  it('decision-service/hpa.yaml exists', () => {
    expect(fs.existsSync(path.join(templatesRoot, 'decision-service', 'hpa.yaml'))).toBe(true);
  });

  // Test 8: auth-service/deployment.yaml exists
  it('auth-service/deployment.yaml exists', () => {
    expect(fs.existsSync(path.join(templatesRoot, 'auth-service', 'deployment.yaml'))).toBe(true);
  });

  // Test 9: event-collector/deployment.yaml exists
  it('event-collector/deployment.yaml exists', () => {
    expect(fs.existsSync(path.join(templatesRoot, 'event-collector', 'deployment.yaml'))).toBe(true);
  });

  // Test 10: All 13 services have deployment.yaml
  it('all 13 services have deployment.yaml', () => {
    const services = [
      'auth-service',
      'event-collector',
      'device-intel-service',
      'velocity-engine',
      'behavioral-service',
      'network-intel-service',
      'telco-intel-service',
      'decision-service',
      'case-service',
      'webhook-service',
      'graph-intel-service',
      'rule-engine-service',
      'feature-flag-service',
    ];

    for (const service of services) {
      const deploymentPath = path.join(templatesRoot, service, 'deployment.yaml');
      expect(fs.existsSync(deploymentPath)).toBe(true);
    }
  });

  // Test 11: values.yaml contains global.imageRegistry
  it('values.yaml contains global.imageRegistry', () => {
    const content = fs.readFileSync(path.join(helmRoot, 'values.yaml'), 'utf-8');
    expect(content).toContain('imageRegistry');
  });

  // Test 12: values-staging.yaml overrides replicaCount to 1
  it('values-staging.yaml overrides replicaCount to 1', () => {
    const content = fs.readFileSync(path.join(helmRoot, 'values-staging.yaml'), 'utf-8');
    expect(content).toContain('replicaCount: 1');
  });
});
