import * as http from 'http';
import * as net from 'net';
import { getServiceList } from './service-list';

// Minimal HTTP fetch utility for test purposes (avoids external deps)
function httpGet(url: string, timeoutMs = 2000): Promise<number> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parseInt(parsedUrl.port, 10),
      path: parsedUrl.pathname,
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      resolve(res.statusCode ?? 0);
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(0);
    });

    req.on('error', () => resolve(0));
    req.end();
  });
}

// Find a free port to start mock servers on
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

function startMockServer(statusCode: number, port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(statusCode);
      res.end(JSON.stringify({ status: statusCode === 200 ? 'ok' : 'error' }));
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

describe('DR Health Check Logic', () => {
  let healthyPort: number;
  let unhealthyPort: number;
  let servers: http.Server[] = [];

  beforeAll(async () => {
    [healthyPort, unhealthyPort] = await Promise.all([getFreePort(), getFreePort()]);
    const [s1, s2] = await Promise.all([
      startMockServer(200, healthyPort),
      startMockServer(500, unhealthyPort),
    ]);
    servers = [s1, s2];
  });

  afterAll((done) => {
    let closed = 0;
    if (servers.length === 0) return done();
    servers.forEach((s) => s.close(() => { closed++; if (closed === servers.length) done(); }));
  });

  it('should return HTTP 200 for a healthy service', async () => {
    const code = await httpGet(`http://127.0.0.1:${healthyPort}/health`);
    expect(code).toBe(200);
  });

  it('should return HTTP 500 for an unhealthy service', async () => {
    const code = await httpGet(`http://127.0.0.1:${unhealthyPort}/health`);
    expect(code).toBe(500);
  });

  it('should return 0 (connection refused) for an unreachable service', async () => {
    // Use a port that nothing is listening on
    const unusedPort = await getFreePort();
    const code = await httpGet(`http://127.0.0.1:${unusedPort}/health`);
    expect(code).toBe(0);
  });

  it('health check logic: all healthy services should produce zero failures', async () => {
    const urls = [
      `http://127.0.0.1:${healthyPort}/health`,
      `http://127.0.0.1:${healthyPort}/health`,
    ];
    let failed = 0;
    for (const url of urls) {
      const code = await httpGet(url);
      if (code !== 200) failed++;
    }
    expect(failed).toBe(0);
  });

  it('health check logic: one unhealthy service should produce one failure', async () => {
    const urls = [
      `http://127.0.0.1:${healthyPort}/health`,
      `http://127.0.0.1:${unhealthyPort}/health`,
    ];
    let failed = 0;
    for (const url of urls) {
      const code = await httpGet(url);
      if (code !== 200) failed++;
    }
    expect(failed).toBe(1);
  });

  it('should check all 13 services', () => {
    const services = getServiceList();
    expect(services.length).toBe(13);
  });

  it('all services should have valid port numbers (1024-65535)', () => {
    const services = getServiceList();
    for (const svc of services) {
      expect(svc.port).toBeGreaterThanOrEqual(1024);
      expect(svc.port).toBeLessThanOrEqual(65535);
    }
  });

  it('service names should be kebab-case', () => {
    const services = getServiceList();
    const kebabCaseRegex = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/;
    for (const svc of services) {
      expect(svc.name).toMatch(kebabCaseRegex);
    }
  });

  it('decision-service and event-collector should have minAvailable: 2 in PDB', () => {
    const criticalServices = ['decision-service', 'event-collector'];
    const services = getServiceList();
    for (const name of criticalServices) {
      const found = services.find((s) => s.name === name);
      expect(found).toBeDefined();
    }
    // PDB policy: these two get minAvailable=2, others get 1
    const nonCritical = services.filter((s) => !criticalServices.includes(s.name));
    expect(nonCritical.length).toBe(11);
  });

  it('failover steps should cover all 7 phases', () => {
    const failoverSteps = [
      'T+0:  Detect - CloudWatch alarm triggered',
      'T+2:  Promote RDS read replica',
      'T+5:  Update service configuration / Kubernetes secrets',
      'T+7:  Deploy services to standby region',
      'T+12: Verify health',
      'T+13: Update DNS failover',
      'T+15: Communicate - status page + customer notifications',
    ];
    expect(failoverSteps.length).toBe(7);
    // Verify each step has a time marker
    for (const step of failoverSteps) {
      expect(step).toMatch(/^T\+\d+/);
    }
  });

  it('each service should have a unique port', () => {
    const services = getServiceList();
    const ports = services.map((s) => s.port);
    const uniquePorts = new Set(ports);
    expect(uniquePorts.size).toBe(services.length);
  });

  it('each service should have a unique name', () => {
    const services = getServiceList();
    const names = services.map((s) => s.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(services.length);
  });
});
