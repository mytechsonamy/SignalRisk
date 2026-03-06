import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../');

function resolve(...parts: string[]): string {
  return path.join(ROOT, ...parts);
}

describe('Production Readiness Check', () => {
  // 1. packages/health-check/src/health.controller.ts exists
  it('packages/health-check/src/health.controller.ts exists', () => {
    expect(fs.existsSync(resolve('packages/health-check/src/health.controller.ts'))).toBe(true);
  });

  // 2. packages/health-check/src/index.ts exists
  it('packages/health-check/src/index.ts exists', () => {
    expect(fs.existsSync(resolve('packages/health-check/src/index.ts'))).toBe(true);
  });

  // 3. docs/runbooks/go-live-checklist.md exists
  it('docs/runbooks/go-live-checklist.md exists', () => {
    expect(fs.existsSync(resolve('docs/runbooks/go-live-checklist.md'))).toBe(true);
  });

  // 4. docs/architecture/system-overview.md exists
  it('docs/architecture/system-overview.md exists', () => {
    expect(fs.existsSync(resolve('docs/architecture/system-overview.md'))).toBe(true);
  });

  // 5. docs/runbooks/load-testing.md exists
  it('docs/runbooks/load-testing.md exists', () => {
    expect(fs.existsSync(resolve('docs/runbooks/load-testing.md'))).toBe(true);
  });

  describe('go-live checklist content', () => {
    let checklistContent: string;

    beforeAll(() => {
      checklistContent = fs.readFileSync(
        resolve('docs/runbooks/go-live-checklist.md'),
        'utf-8',
      );
    });

    // 6. Infrastructure section
    it('has Infrastructure section', () => {
      expect(checklistContent).toContain('## Infrastructure');
    });

    // 7. Security section
    it('has Security section', () => {
      expect(checklistContent).toContain('## Security');
    });

    // 8. Compliance section
    it('has Compliance section', () => {
      expect(checklistContent).toContain('## Compliance');
    });

    // 9. Rollback Plan section
    it('has Rollback Plan section', () => {
      expect(checklistContent).toContain('## Rollback Plan');
    });

    // 10. At least 40 checklist items
    it('has at least 40 checklist items', () => {
      const items = (checklistContent.match(/- \[ \]/g) || []).length;
      expect(items).toBeGreaterThanOrEqual(40);
    });
  });

  describe('system-overview.md content', () => {
    let overviewContent: string;

    beforeAll(() => {
      overviewContent = fs.readFileSync(
        resolve('docs/architecture/system-overview.md'),
        'utf-8',
      );
    });

    // 11. Contains service map with decision-service
    it('contains service map with decision-service', () => {
      expect(overviewContent).toContain('decision-service');
    });

    // 12. Has SLAs table
    it('has SLAs table', () => {
      expect(overviewContent).toContain('## Key SLAs');
      expect(overviewContent).toContain('| Metric |');
    });
  });

  describe('README.md content', () => {
    let readmeContent: string;

    beforeAll(() => {
      readmeContent = fs.readFileSync(resolve('README.md'), 'utf-8');
    });

    // 13. Has Quick Start section
    it('has Quick Start section', () => {
      expect(readmeContent).toContain('## Quick Start');
    });

    // 14. Has docker-compose reference
    it('has docker-compose reference', () => {
      expect(readmeContent).toContain('docker-compose');
    });

    // 15. Has links to all major runbooks
    it('has links to all major runbooks', () => {
      expect(readmeContent).toContain('go-live-checklist.md');
      expect(readmeContent).toContain('disaster-recovery.md');
      expect(readmeContent).toContain('system-overview.md');
    });
  });
});
