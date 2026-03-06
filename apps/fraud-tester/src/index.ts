/**
 * @signalrisk/fraud-tester — Public API
 *
 * Re-exports all stable public interfaces, classes, and types.
 * Consumers should import from this entry point only.
 */

// Adapter interfaces and implementations
export type { FraudDecision, FraudTestEvent, IFraudSystemAdapter } from './adapters/base.adapter';
export { SignalRiskAdapter } from './adapters/signalrisk.adapter';
export type { SignalRiskAdapterConfig } from './adapters/signalrisk.adapter';
export { MockAdapter } from './adapters/mock.adapter';
export type { MockAdapterConfig, MockDecisionMode } from './adapters/mock.adapter';
export { ChaosAdapterWrapper } from './adapters/chaos-wrapper';
export type { ChaosConfig } from './adapters/chaos-wrapper';

// Scenario types
export type {
  AttackResult,
  BattleReport,
  FraudScenario,
  ScenarioResult,
} from './scenarios/types';

// Built-in scenario catalogue
export { deviceFarmScenario } from './scenarios/catalog/device-farm.scenario';
export { botCheckoutScenario } from './scenarios/catalog/bot-checkout.scenario';
export { velocityEvasionScenario } from './scenarios/catalog/velocity-evasion.scenario';
export { emulatorSpoofScenario } from './scenarios/catalog/emulator-spoof.scenario';
export { simSwapScenario } from './scenarios/catalog/sim-swap.scenario';

// Reporter
export { DetectionReporter } from './reporter/detection-reporter';

// Orchestrator
export { ScenarioRunner } from './orchestrator/orchestrator';

// Agents
export type { IFraudTestAgent } from './agents/base.agent';
export { FraudSimulationAgent } from './agents/fraud-simulation.agent';
export { AdversarialAgent } from './agents/adversarial.agent';
export type { AdversarialPattern } from './agents/adversarial.agent';
export { ChaosAgent } from './agents/chaos.agent';
export type { ChaosMode } from './agents/chaos.agent';

// Server
export { createServer } from './api/server';
