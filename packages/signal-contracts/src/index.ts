// Signal interfaces
export type { DeviceSignal } from './device.signal';
export type { VelocitySignal } from './velocity.signal';
export type { BehavioralSignal } from './behavioral.signal';
export type { NetworkSignal } from './network.signal';
export type { TelcoSignal } from './telco.signal';

// Zod schemas and inferred DTO types
export {
  DeviceSignalSchema,
  DeviceSignalDto,
} from './schemas/device.schema';

export {
  VelocitySignalSchema,
  VelocitySignalDto,
} from './schemas/velocity.schema';

export {
  BehavioralSignalSchema,
  BehavioralSignalDto,
} from './schemas/behavioral.schema';

export {
  NetworkSignalSchema,
  NetworkSignalDto,
} from './schemas/network.schema';

export {
  TelcoSignalSchema,
  TelcoSignalDto,
} from './schemas/telco.schema';
