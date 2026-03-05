export interface BehavioralSignal {
  sessionId: string;
  merchantId: string;
  sessionRiskScore: number;   // 0-100
  botProbability: number;     // 0-1
  isBot: boolean;
  indicators: string[];       // e.g. ['uniform_timing', 'no_mouse_jitter']
  timingCv?: number;          // click timing coefficient of variation
  navigationEntropy?: number; // nav path entropy bits
}
