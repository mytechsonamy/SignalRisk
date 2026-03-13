import { useCallback, useEffect, useRef, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { api } from '../lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeType = 'account' | 'device' | 'merchant';
type FilterMode = 'all' | 'fraud' | 'rings' | 'suspicious';

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  isFraud?: boolean;
  isEmulator?: boolean;
  trustScore?: number;
  isSuspicious?: boolean;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type: 'USES_DEVICE' | 'USES_IP' | 'USED_BY';
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface FraudRing {
  deviceId: string;
  fraudAccounts: string[];
  allAccounts: string[];
  riskScore: number;
}

interface SuspiciousDevice {
  deviceId: string;
  sharedAcrossMerchants: string[];
  sharingCount: number;
}

interface AnalyzeResult {
  riskScore: number;
  connectedFraudCount: number;
  sharedDeviceCount: number;
  sharedIpCount: number;
  fraudRingDetected: boolean;
}

interface GraphSummary {
  graphData: GraphData;
  fraudRings: FraudRing[];
  suspiciousDevices: SuspiciousDevice[];
}

// ── Colors & drawing constants ─────────────────────────────────────────────────

const COLORS = {
  account: '#6c63ff',
  device: '#38a169',
  merchant: '#d69e2e',
  fraud: '#e53e3e',
  suspicious: '#dd6b20',
  emulator: '#805ad5',
} as const;

const LINK_COLORS: Record<string, string> = {
  USES_DEVICE: 'rgba(108,99,255,0.6)',
  USES_IP: 'rgba(56,161,105,0.6)',
  USED_BY: 'rgba(214,158,46,0.6)',
};

function getNodeColor(node: GraphNode): string {
  if (node.type === 'account' && node.isFraud) return COLORS.fraud;
  if (node.type === 'device' && node.isEmulator) return COLORS.emulator;
  if (node.type === 'device' && node.isSuspicious) return COLORS.suspicious;
  return COLORS[node.type];
}

function getNodeSize(node: GraphNode): number {
  if (node.isFraud || node.isSuspicious) return 10;
  if (node.type === 'merchant') return 10;
  if (node.type === 'device') return 8;
  return 8;
}

// ── Small reusable components ─────────────────────────────────────────────────

function RiskBadge({ score }: { score: number }) {
  const level = score >= 70 ? 'HIGH' : score >= 30 ? 'MED' : 'LOW';
  const cls =
    score >= 70
      ? 'bg-red-700 text-white border border-red-500'
      : score >= 30
        ? 'bg-orange-700 text-white border border-orange-500'
        : 'bg-green-700 text-white border border-green-500';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold ${cls}`}>
      {level} {score}
    </span>
  );
}

function KpiCard({
  label,
  value,
  icon,
  variant = 'neutral',
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  variant?: 'neutral' | 'fraud' | 'suspicious';
}) {
  const cardCls =
    variant === 'fraud'
      ? 'bg-red-950 border-red-700'
      : variant === 'suspicious'
        ? 'bg-orange-950 border-orange-700'
        : 'bg-surface-card border-surface-border';
  const iconCls =
    variant === 'fraud'
      ? 'text-red-300'
      : variant === 'suspicious'
        ? 'text-orange-300'
        : 'text-text-secondary';
  const labelCls =
    variant === 'fraud'
      ? 'text-red-300'
      : variant === 'suspicious'
        ? 'text-orange-300'
        : 'text-text-secondary';
  const valueCls =
    variant === 'fraud'
      ? 'text-white'
      : variant === 'suspicious'
        ? 'text-white'
        : 'text-text-primary';

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${cardCls}`}>
      <span className={`text-xl flex-shrink-0 ${iconCls}`}>{icon}</span>
      <div>
        <p className={`text-xs leading-none mb-1 ${labelCls}`}>{label}</p>
        <p className={`text-2xl font-bold leading-none ${valueCls}`}>{value}</p>
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-brand-primary text-white'
          : 'bg-surface-card border border-surface-border text-gray-800 hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

// ── Legend icon badges ────────────────────────────────────────────────────────

function LegendItem({
  color,
  nodeType,
  label,
}: {
  color: string;
  nodeType: 'account' | 'device' | 'merchant';
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: color }}
        aria-hidden="true"
      >
        {nodeType === 'account' && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="1.2" strokeLinecap="round">
            <circle cx="5" cy="3.5" r="1.5" fill="rgba(255,255,255,0.92)" stroke="none" />
            <path d="M1.5 9c0-1.93 1.57-3.5 3.5-3.5S8.5 7.07 8.5 9" />
          </svg>
        )}
        {nodeType === 'device' && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2.5" y="1" width="5" height="8" rx="1" />
            <circle cx="5" cy="7.8" r="0.6" fill="rgba(255,255,255,0.92)" stroke="none" />
          </svg>
        )}
        {nodeType === 'merchant' && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1.5" y="5" width="7" height="4" />
            <polyline points="0.5,5 5,1 9.5,5" />
            <rect x="3.5" y="7" width="3" height="2" />
          </svg>
        )}
      </div>
      <span className="text-xs text-text-secondary">{label}</span>
    </div>
  );
}

function GuideTab() {
  return (
    <div className="space-y-5">
      {/* Legend */}
      <div>
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Node Types</p>
        <div className="space-y-1.5">
          <LegendItem color={COLORS.account} nodeType="account" label="Account" />
          <LegendItem color={COLORS.fraud} nodeType="account" label="Fraud Account" />
          <LegendItem color={COLORS.device} nodeType="device" label="Device" />
          <LegendItem color={COLORS.suspicious} nodeType="device" label="Suspicious Device" />
          <LegendItem color={COLORS.emulator} nodeType="device" label="Emulator" />
          <LegendItem color={COLORS.merchant} nodeType="merchant" label="Merchant" />
        </div>
      </div>

      {/* Link colors */}
      <div className="border-t border-surface-border pt-4">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Relationship Types</p>
        <div className="space-y-1.5">
          {[
            { color: LINK_COLORS.USES_DEVICE, label: 'USES_DEVICE (indigo)' },
            { color: LINK_COLORS.USES_IP, label: 'USES_IP (green)' },
            { color: LINK_COLORS.USED_BY, label: 'USED_BY (amber)' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <svg width="20" height="6" viewBox="0 0 20 6" aria-hidden="true">
                <line x1="0" y1="3" x2="20" y2="3" stroke={color} strokeWidth="2.5" />
              </svg>
              <span className="text-xs text-text-secondary font-mono">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div className="border-t border-surface-border pt-4">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">How to Use</p>
        <ol className="space-y-2.5">
          {[
            'Zoom and pan the graph to explore entity connections',
            'Click any node to inspect its properties in the detail panel',
            'Click an Account node and run Fraud Analysis to check ring membership',
            'Use the Highlight filters above to focus on high-risk subgraphs',
            'Click a Fraud Ring in the Rings tab to highlight and zoom to its nodes',
          ].map((step, i) => (
            <li key={i} className="flex gap-2 text-xs text-text-secondary">
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-surface-card border border-surface-border flex items-center justify-center text-xs font-bold text-text-secondary">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* Technical note */}
      <div className="border-t border-surface-border pt-4">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Neo4j Relationships</p>
        <p className="text-xs text-text-secondary leading-relaxed">
          This graph is built from Neo4j relationships: accounts sharing devices
          (<span className="font-mono">USES_DEVICE</span>), shared IPs
          (<span className="font-mono">USES_IP</span>), and devices shared across merchants
          (<span className="font-mono">USED_BY</span>). Fraud rings are detected via velocity analysis across merchant pairs.
        </p>
      </div>
    </div>
  );
}

// ── Left panel cards ───────────────────────────────────────────────────────────

function FraudRingCard({
  ring,
  onHighlight,
}: {
  ring: FraudRing;
  onHighlight: (ids: string[]) => void;
}) {
  return (
    <button
      className="w-full text-left rounded-lg bg-red-950 border border-red-800 p-3 hover:bg-red-900 transition-colors cursor-pointer"
      onClick={() => onHighlight([...ring.allAccounts, ring.deviceId])}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-xs font-semibold text-red-100 truncate flex-1">Ring via {ring.deviceId}</p>
        <RiskBadge score={ring.riskScore} />
      </div>
      <p className="text-xs text-red-300">
        {ring.fraudAccounts.length} confirmed fraud &bull; {ring.allAccounts.length} in ring
      </p>
      <p className="text-xs text-red-400 mt-1">Click to highlight in graph</p>
    </button>
  );
}

function SuspiciousDeviceCard({ device }: { device: SuspiciousDevice }) {
  return (
    <div className="rounded-lg bg-orange-950 border border-orange-700 p-3">
      <p className="text-xs font-semibold text-white truncate mb-1">{device.deviceId}</p>
      <p className="text-xs text-orange-300">
        Shared across {device.sharingCount} merchant{device.sharingCount !== 1 ? 's' : ''}
      </p>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {device.sharedAcrossMerchants.map((m) => (
          <span key={m} className="text-xs bg-orange-800 text-orange-100 rounded px-1.5 py-0.5">
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Node detail panel ─────────────────────────────────────────────────────────

function RiskMeter({ score }: { score: number }) {
  const color = score >= 70 ? '#e53e3e' : score >= 30 ? '#d69e2e' : '#38a169';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-text-secondary">Risk Score</span>
        <span className="text-xl font-bold" style={{ color }}>
          {score}
          <span className="text-sm font-normal text-text-secondary">/100</span>
        </span>
      </div>
      <div className="h-2 bg-surface-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
    </div>
  );
}

function NodePanel({
  node,
  analyzeResult,
  onAnalyze,
  analyzing,
  onClose,
}: {
  node: GraphNode;
  analyzeResult: AnalyzeResult | null;
  onAnalyze: (accountId: string) => void;
  analyzing: boolean;
  onClose: () => void;
}) {
  const typeLabel = node.type.charAt(0).toUpperCase() + node.type.slice(1);
  const color = getNodeColor(node);

  return (
    <div className="w-72 flex-shrink-0 bg-surface-card border-l border-surface-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            {node.type === 'account' && <circle cx="6" cy="6" r="5" fill={color} />}
            {node.type === 'device' && <rect x="1" y="1" width="10" height="10" fill={color} />}
            {node.type === 'merchant' && <polygon points="6,1 11,6 6,11 1,6" fill={color} />}
          </svg>
          <span className="text-sm font-semibold text-text-primary">{typeLabel} Details</span>
        </div>
        <button
          onClick={onClose}
          className="text-text-secondary hover:text-text-primary transition-colors w-6 h-6 flex items-center justify-center rounded hover:bg-surface-hover"
          aria-label="Close node detail panel"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Status badges */}
        <div className="flex flex-wrap gap-1.5">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-white"
            style={{ background: color }}
          >
            {node.type.toUpperCase()}
          </span>
          {node.isFraud && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-900/60 text-red-300 border border-red-700">
              CONFIRMED FRAUD
            </span>
          )}
          {node.isSuspicious && !node.isFraud && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-900/60 text-orange-300 border border-orange-700">
              SUSPICIOUS
            </span>
          )}
          {node.isEmulator && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-900/60 text-purple-300 border border-purple-700">
              EMULATOR
            </span>
          )}
        </div>

        {/* Entity ID */}
        <div className="rounded-md bg-surface-page border border-surface-border px-3 py-2">
          <p className="text-xs text-text-secondary mb-0.5">Entity ID</p>
          <p className="text-xs font-mono text-text-primary break-all">{node.id}</p>
        </div>

        {/* Device-specific fields */}
        {node.type === 'device' && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-surface-page border border-surface-border px-3 py-2">
              <p className="text-xs text-text-secondary mb-0.5">Trust Score</p>
              <p className="text-sm font-bold text-text-primary">
                {node.trustScore !== undefined ? (node.trustScore * 100).toFixed(0) + '%' : '—'}
              </p>
            </div>
            <div className="rounded-md bg-surface-page border border-surface-border px-3 py-2">
              <p className="text-xs text-text-secondary mb-0.5">Emulator</p>
              <p className={`text-sm font-bold ${node.isEmulator ? 'text-red-400' : 'text-green-500'}`}>
                {node.isEmulator ? 'Detected' : 'Clean'}
              </p>
            </div>
          </div>
        )}

        {/* Merchant fields */}
        {node.type === 'merchant' && (
          <div className="rounded-md bg-surface-page border border-surface-border px-3 py-2">
            <p className="text-xs text-text-secondary mb-0.5">Label</p>
            <p className="text-sm font-medium text-text-primary">{node.label}</p>
          </div>
        )}

        {/* Account analysis */}
        {node.type === 'account' && (
          <div className="space-y-3">
            <button
              onClick={() => onAnalyze(node.id)}
              disabled={analyzing}
              className="w-full rounded-md bg-brand-primary py-2.5 text-sm font-semibold text-white hover:bg-brand-primary-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {analyzing ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" />
                  </svg>
                  Analyzing network…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                  </svg>
                  Run Fraud Analysis
                </>
              )}
            </button>

            {!analyzeResult && !analyzing && (
              <p className="text-xs text-text-secondary text-center">
                Analyzes connections to known fraud accounts, shared devices, and ring membership
              </p>
            )}

            {analyzeResult && (
              <div className="space-y-3">
                <RiskMeter score={analyzeResult.riskScore} />

                {analyzeResult.fraudRingDetected && (
                  <div className="rounded-md bg-red-950/40 border border-red-800 px-3 py-2 flex items-center gap-2">
                    <svg className="h-4 w-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <p className="text-xs font-semibold text-red-300">Fraud ring membership detected</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      label: 'Fraud Neighbors',
                      value: analyzeResult.connectedFraudCount,
                      urgent: analyzeResult.connectedFraudCount > 0,
                    },
                    {
                      label: 'Shared Device',
                      value: `${analyzeResult.sharedDeviceCount} accts`,
                      urgent: false,
                    },
                    {
                      label: 'Shared IP',
                      value: `${analyzeResult.sharedIpCount} accts`,
                      urgent: false,
                    },
                    {
                      label: 'Ring Member',
                      value: analyzeResult.fraudRingDetected ? 'Yes' : 'No',
                      urgent: analyzeResult.fraudRingDetected,
                    },
                  ].map(({ label, value, urgent }) => (
                    <div
                      key={label}
                      className={`rounded-md border px-3 py-2 ${
                        urgent
                          ? 'bg-red-950/40 border-red-800'
                          : 'bg-surface-page border-surface-border'
                      }`}
                    >
                      <p className="text-xs text-text-secondary mb-0.5">{label}</p>
                      <p className={`text-sm font-bold ${urgent ? 'text-red-400' : 'text-text-primary'}`}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Loading / empty states ─────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex items-center justify-center h-full flex-col gap-4">
      <svg className="h-10 w-10 text-brand-primary animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="48" strokeDashoffset="16" opacity="0.3" />
        <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p className="text-sm text-text-secondary">Loading entity graph…</p>
    </div>
  );
}

function EmptyGraph() {
  return (
    <div className="flex items-center justify-center h-full flex-col gap-3">
      <svg className="h-12 w-12 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <circle cx="5" cy="12" r="2" />
        <circle cx="19" cy="5" r="2" />
        <circle cx="19" cy="19" r="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M7 12h3m4 0h3M17 6.5l-3 3.5M17 17.5l-3-3.5" />
      </svg>
      <p className="text-sm font-medium text-text-primary">Graph is empty</p>
      <p className="text-xs text-text-secondary text-center max-w-xs">
        No entity data available yet. Events will populate the graph as they are processed.
      </p>
    </div>
  );
}

// ── Canvas controls overlay ────────────────────────────────────────────────────

function CanvasControls({ graphRef }: { graphRef: React.RefObject<ForceGraphMethods<GraphNode> | undefined> }) {
  return (
    <div className="absolute top-3 right-3 flex flex-col gap-1.5 bg-surface-card/70 backdrop-blur-sm border border-surface-border rounded-lg p-1.5">
      <button
        onClick={() => graphRef.current?.zoomToFit(400)}
        className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors rounded hover:bg-surface-border whitespace-nowrap"
        aria-label="Fit graph to view"
        title="Fit view"
      >
        Fit view
      </button>
      <button
        onClick={() => {
          graphRef.current?.zoom(1, 400);
          graphRef.current?.centerAt(0, 0, 400);
        }}
        className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors rounded hover:bg-surface-border whitespace-nowrap"
        aria-label="Reset zoom to 100%"
        title="Reset zoom"
      >
        Reset zoom
      </button>
    </div>
  );
}

// ── Graph statistics footer pill ───────────────────────────────────────────────

function GraphStatsPill({ nodeCount, edgeCount }: { nodeCount: number; edgeCount: number }) {
  return (
    <div className="absolute bottom-4 left-4 bg-surface-card/70 backdrop-blur-sm border border-surface-border rounded-full px-3 py-1">
      <p className="text-xs text-text-secondary">
        {nodeCount} nodes &middot; {edgeCount} edges
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GraphIntelPage() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [fraudRings, setFraudRings] = useState<FraudRing[]>([]);
  const [suspiciousDevices, setSuspiciousDevices] = useState<SuspiciousDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [highlightNodeIds, setHighlightNodeIds] = useState<Set<string>>(new Set());
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [leftTab, setLeftTab] = useState<'rings' | 'devices' | 'guide'>('rings');
  const graphRef = useRef<ForceGraphMethods<GraphNode> | undefined>(undefined);
  const hasAutoFitted = useRef(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  // Reset auto-fit flag when new data arrives so the graph re-centers
  useEffect(() => { hasAutoFitted.current = false; }, [graphData]);

  // Push nodes apart so they don't overlap on initial layout
  useEffect(() => {
    if (graphData.nodes.length === 0) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (graphRef.current?.d3Force('charge') as any)?.strength(-320);
    graphRef.current?.d3ReheatSimulation();
  }, [graphData]);

  useEffect(() => {
    api
      .get<GraphSummary>('/v1/graph/summary')
      .then((data: GraphSummary) => {
        setGraphData(data.graphData);
        setFraudRings(data.fraudRings);
        setSuspiciousDevices(data.suspiciousDevices);
      })
      .catch(() => {
        // graph-intel endpoint may not be available — show empty state
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Derive highlight set from filter mode (single source of truth) ──────────

  useEffect(() => {
    if (filterMode === 'all') {
      setHighlightNodeIds(new Set());
      return;
    }
    if (filterMode === 'fraud') {
      setHighlightNodeIds(new Set(graphData.nodes.filter((n) => n.isFraud).map((n) => n.id)));
    } else if (filterMode === 'suspicious') {
      setHighlightNodeIds(new Set(graphData.nodes.filter((n) => n.isSuspicious).map((n) => n.id)));
    } else if (filterMode === 'rings') {
      const ids = new Set<string>();
      fraudRings.forEach((r) => {
        r.allAccounts.forEach((a) => ids.add(a));
        ids.add(r.deviceId);
      });
      setHighlightNodeIds(ids);
    }
  }, [filterMode, graphData.nodes, fraudRings]);

  // ── Event handlers ──────────────────────────────────────────────────────────

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    setAnalyzeResult(null);
  }, []);

  const handleAnalyze = useCallback(async (accountId: string) => {
    setAnalyzing(true);
    try {
      const result = await api.post<AnalyzeResult>('/v1/graph/analyze', { accountId });
      setAnalyzeResult(result);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const handleSearch = useCallback(() => {
    const term = searchInput.trim().toLowerCase();
    if (!term) {
      setHighlightNodeIds(new Set());
      setFilterMode('all');
      return;
    }
    setFilterMode('all');
    const matched = new Set(
      graphData.nodes
        .filter((n) => n.id.toLowerCase().includes(term) || n.label.toLowerCase().includes(term))
        .map((n) => n.id),
    );
    setHighlightNodeIds(matched);
    const first = graphData.nodes.find((n) => matched.has(n.id));
    if (first && graphRef.current && first.x !== undefined && first.y !== undefined) {
      graphRef.current.centerAt(first.x, first.y, 500);
      graphRef.current.zoom(3, 500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, graphData.nodes]);

  const highlightRing = useCallback(
    (ids: string[]) => {
      setHighlightNodeIds(new Set(ids));
      setFilterMode('all');
      setSearchInput('');
      const first = graphData.nodes.find((n) => ids.includes(n.id));
      if (first && graphRef.current && first.x !== undefined && first.y !== undefined) {
        graphRef.current.centerAt(first.x, first.y, 600);
        graphRef.current.zoom(2.5, 600);
      }
    },
    [graphData.nodes],
  );

  const handleFilterChange = useCallback(
    (mode: FilterMode) => {
      setFilterMode(mode);
      setSearchInput('');
      if (mode === 'all') setHighlightNodeIds(new Set());
    },
    [],
  );

  // ── Canvas rendering ────────────────────────────────────────────────────────

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const r = getNodeSize(node);
      const dimmed = highlightNodeIds.size > 0 && !highlightNodeIds.has(node.id);
      const color = getNodeColor(node);
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      ctx.globalAlpha = dimmed ? 0.12 : 1;

      // ── Glow ring behind badge (fraud / suspicious) ──────────────────────
      if ((node.isFraud || node.isSuspicious) && !dimmed) {
        const glowR = r + 4;
        const gradient = ctx.createRadialGradient(x, y, r, x, y, glowR + 4);
        gradient.addColorStop(0, node.isFraud ? 'rgba(252,129,129,0.5)' : 'rgba(246,173,85,0.5)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(x, y, glowR + 4, 0, 2 * Math.PI);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, 2 * Math.PI);
        ctx.strokeStyle = node.isFraud ? '#fc8181' : '#f6ad55';
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      // ── Badge circle (all node types use a circle badge) ─────────────────
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // ── White icon drawn inside badge ────────────────────────────────────
      const iconW = Math.max(r * 0.12, 0.8);
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = iconW;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (node.type === 'account') {
        // Person: filled head circle + shoulder arc
        const headR = r * 0.27;
        ctx.beginPath();
        ctx.arc(x, y - r * 0.22, headR, 0, 2 * Math.PI);
        ctx.fill();
        // Shoulders arc
        ctx.beginPath();
        ctx.arc(x, y + r * 0.72, r * 0.5, Math.PI * 1.18, Math.PI * 1.82);
        ctx.stroke();
      } else if (node.type === 'device') {
        // Smartphone: rounded-rect body + home dot
        const pw = r * 0.6, ph = r * 1.05;
        const px = x - pw / 2, py = y - ph / 2;
        const cr = pw * 0.22;
        ctx.beginPath();
        ctx.moveTo(px + cr, py);
        ctx.lineTo(px + pw - cr, py);
        ctx.quadraticCurveTo(px + pw, py, px + pw, py + cr);
        ctx.lineTo(px + pw, py + ph - cr);
        ctx.quadraticCurveTo(px + pw, py + ph, px + pw - cr, py + ph);
        ctx.lineTo(px + cr, py + ph);
        ctx.quadraticCurveTo(px, py + ph, px, py + ph - cr);
        ctx.lineTo(px, py + cr);
        ctx.quadraticCurveTo(px, py, px + cr, py);
        ctx.closePath();
        ctx.stroke();
        // Home button dot
        ctx.beginPath();
        ctx.arc(x, py + ph - r * 0.2, r * 0.1, 0, 2 * Math.PI);
        ctx.fill();
      } else if (node.type === 'merchant') {
        // Storefront: rectangle body + roof triangle + door
        const bw = r * 0.95, bh = r * 0.65;
        const bx = x - bw / 2, by = y - bh / 2 + r * 0.12;
        // Body
        ctx.beginPath();
        ctx.rect(bx, by, bw, bh);
        ctx.stroke();
        // Roof
        ctx.beginPath();
        ctx.moveTo(bx - r * 0.08, by);
        ctx.lineTo(x, by - r * 0.42);
        ctx.lineTo(bx + bw + r * 0.08, by);
        ctx.stroke();
        // Door
        const dw = bw * 0.3, dh = bh * 0.44;
        ctx.beginPath();
        ctx.rect(x - dw / 2, by + bh - dh, dw, dh);
        ctx.stroke();
      }

      // ── Label below badge ────────────────────────────────────────────────
      const isMerchant = node.type === 'merchant';
      if (!dimmed || isMerchant) {
        const fontSize = Math.max(10 / globalScale, 2);
        ctx.font = `${isMerchant ? '600 ' : ''}${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const labelY = y + r + 3 / globalScale;

        // Text shadow for readability against dark bg
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = isMerchant && dimmed ? 'rgba(226,232,240,0.35)' : '#f1f5f9';
        ctx.fillText(node.label, x, labelY);
        ctx.shadowBlur = 0;
      }

      ctx.globalAlpha = 1;
    },
    [highlightNodeIds],
  );

  const linkColorFn = useCallback(
    (link: object) => {
      const l = link as GraphLink;
      return LINK_COLORS[l.type] ?? 'rgba(108,99,255,0.25)';
    },
    [],
  );

  // ── Derived stats ────────────────────────────────────────────────────────────

  const totalNodes = graphData.nodes.length;
  const fraudAccountCount = graphData.nodes.filter((n) => n.isFraud).length;
  const suspDeviceCount = graphData.nodes.filter((n) => n.isSuspicious).length;
  const totalEdges = graphData.links.length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-surface-border flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Graph Intelligence</h1>
            <p className="mt-0.5 text-sm text-text-secondary">
              Entity relationship graph — detect fraud rings, device sharing, and cross-merchant account linking
            </p>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Search by account or device ID…"
                aria-label="Search by account or device ID"
                className="w-64 rounded-md border border-surface-border pl-9 pr-3 py-1.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <button
              onClick={handleSearch}
              className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primary-hover transition-colors"
            >
              Search
            </button>
            {highlightNodeIds.size > 0 && filterMode === 'all' && searchInput && (
              <button
                onClick={() => {
                  setHighlightNodeIds(new Set());
                  setSearchInput('');
                }}
                className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── KPI cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <KpiCard
            label="Entities in Graph"
            value={totalNodes}
            variant="neutral"
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <circle cx="5" cy="12" r="2" />
                <circle cx="19" cy="5" r="2" />
                <circle cx="19" cy="19" r="2" />
                <circle cx="12" cy="12" r="2" />
                <path d="M7 12h3m4 0h3M17 6.5l-3 3.5M17 17.5l-3-3.5" />
              </svg>
            }
          />
          <KpiCard
            label="Active Fraud Rings"
            value={fraudRings.length}
            variant={fraudRings.length > 0 ? 'fraud' : 'neutral'}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            }
          />
          <KpiCard
            label="Confirmed Fraud Accounts"
            value={fraudAccountCount}
            variant={fraudAccountCount > 0 ? 'fraud' : 'neutral'}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            }
          />
          <KpiCard
            label="Suspicious Devices"
            value={suspDeviceCount}
            variant={suspDeviceCount > 0 ? 'suspicious' : 'neutral'}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            }
          />
        </div>

        {/* ── Quick filters ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-text-secondary mr-1">Highlight:</span>
          <FilterButton
            active={filterMode === 'all'}
            onClick={() => handleFilterChange('all')}
          >
            All nodes
          </FilterButton>
          <FilterButton
            active={filterMode === 'rings'}
            onClick={() => handleFilterChange('rings')}
          >
            Fraud rings ({fraudRings.length})
          </FilterButton>
          <FilterButton
            active={filterMode === 'fraud'}
            onClick={() => handleFilterChange('fraud')}
          >
            Fraud accounts ({fraudAccountCount})
          </FilterButton>
          <FilterButton
            active={filterMode === 'suspicious'}
            onClick={() => handleFilterChange('suspicious')}
          >
            Suspicious devices ({suspDeviceCount})
          </FilterButton>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left panel ─────────────────────────────────────────────────── */}
        <div className="w-64 flex-shrink-0 border-r border-surface-border bg-surface-page flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-surface-border flex-shrink-0">
            {(
              [
                {
                  id: 'rings' as const,
                  label: `Rings${fraudRings.length > 0 ? ` (${fraudRings.length})` : ''}`,
                },
                {
                  id: 'devices' as const,
                  label: `Devices${suspiciousDevices.length > 0 ? ` (${suspiciousDevices.length})` : ''}`,
                },
                { id: 'guide' as const, label: 'Guide' },
              ]
            ).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setLeftTab(id)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  leftTab === id
                    ? 'text-text-primary border-b-2 border-brand-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                aria-label={`Switch to ${id} tab`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-3">
            {/* Rings tab */}
            {leftTab === 'rings' && (
              <div className="space-y-2">
                {fraudRings.length === 0 ? (
                  <div className="text-center py-8">
                    <svg className="h-8 w-8 text-green-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-medium text-text-primary">No fraud rings detected</p>
                    <p className="text-xs text-text-secondary mt-1">Graph looks clean</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-text-secondary mb-2">Click a ring to highlight it in the graph</p>
                    {fraudRings.map((ring) => (
                      <FraudRingCard key={ring.deviceId} ring={ring} onHighlight={highlightRing} />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Devices tab */}
            {leftTab === 'devices' && (
              <div className="space-y-2">
                {suspiciousDevices.length === 0 ? (
                  <div className="text-center py-8">
                    <svg className="h-8 w-8 text-green-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-medium text-text-primary">No suspicious devices</p>
                    <p className="text-xs text-text-secondary mt-1">No shared device signals</p>
                  </div>
                ) : (
                  suspiciousDevices.map((d) => (
                    <SuspiciousDeviceCard key={d.deviceId} device={d} />
                  ))
                )}
              </div>
            )}

            {/* Guide tab */}
            {leftTab === 'guide' && <GuideTab />}
          </div>
        </div>

        {/* ── Graph canvas ────────────────────────────────────────────────── */}
        <div className="flex-1 relative bg-[#0d0b1e] overflow-hidden">
          {loading ? (
            <LoadingSkeleton />
          ) : graphData.nodes.length === 0 ? (
            <EmptyGraph />
          ) : (
            <>
              <ForceGraph2D<GraphNode>
                ref={graphRef}
                graphData={graphData}
                nodeId="id"
                nodeCanvasObject={nodeCanvasObject}
                nodeCanvasObjectMode={() => 'replace'}
                linkColor={linkColorFn}
                linkWidth={1.5}
                linkDirectionalParticles={2}
                linkDirectionalParticleWidth={2}
                linkDirectionalParticleColor={() => '#a78bfa'}
                backgroundColor="#0d0b1e"
                onNodeClick={handleNodeClick}
                nodeLabel={(node: GraphNode) => `${node.type}: ${node.id}`}
                cooldownTicks={150}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.3}
                onEngineStop={() => {
                  if (!hasAutoFitted.current && graphRef.current) {
                    // Fit all nodes into view with generous padding
                    graphRef.current.zoomToFit(500, 120);
                    hasAutoFitted.current = true;
                  }
                }}
              />

              {/* Canvas controls — top-right */}
              <CanvasControls graphRef={graphRef} />

              {/* Graph stats pill — bottom-left */}
              <GraphStatsPill nodeCount={totalNodes} edgeCount={totalEdges} />

              {/* Idle hint — bottom-right, when no node selected */}
              {!selectedNode && (
                <div className="absolute bottom-4 right-4 bg-surface-card/80 backdrop-blur-sm border border-surface-border rounded-lg px-3 py-2">
                  <p className="text-xs text-text-secondary">
                    Click any node to inspect &bull; Account nodes support fraud analysis
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right panel — node detail ───────────────────────────────────── */}
        {selectedNode && (
          <NodePanel
            node={selectedNode}
            analyzeResult={analyzeResult}
            onAnalyze={handleAnalyze}
            analyzing={analyzing}
            onClose={() => {
              setSelectedNode(null);
              setAnalyzeResult(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
