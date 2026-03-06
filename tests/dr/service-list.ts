export interface ServiceEntry {
  name: string;
  port: number;
}

export function getServiceList(): ServiceEntry[] {
  return [
    { name: 'auth-service', port: 3001 },
    { name: 'event-collector', port: 3000 },
    { name: 'device-intel-service', port: 3003 },
    { name: 'velocity-service', port: 3004 },
    { name: 'behavioral-service', port: 3005 },
    { name: 'network-intel-service', port: 3006 },
    { name: 'telco-intel-service', port: 3007 },
    { name: 'decision-service', port: 3002 },
    { name: 'case-service', port: 3010 },
    { name: 'webhook-service', port: 3011 },
    { name: 'graph-intel-service', port: 3012 },
    { name: 'rule-engine-service', port: 3008 },
    { name: 'feature-flag-service', port: 3013 },
  ];
}
