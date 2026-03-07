import { useState, useCallback } from 'react';

// ─── Signal Schema ────────────────────────────────────────────────────────────

type FieldType = 'number' | 'boolean' | 'string' | 'string[]';

interface FieldDef {
  label: string;
  type: FieldType;
  placeholder?: string;
}

const SIGNAL_SCHEMA: Record<string, Record<string, FieldDef>> = {
  device: {
    trustScore: { label: 'Trust Score', type: 'number', placeholder: '0-100' },
    isEmulator: { label: 'Is Emulator', type: 'boolean' },
    emulatorConfidence: { label: 'Emulator Confidence', type: 'number', placeholder: '0-1' },
    platform: { label: 'Platform', type: 'string', placeholder: 'web, android, ios' },
    daysSinceFirstSeen: { label: 'Days Since First Seen', type: 'number', placeholder: '0+' },
  },
  velocity: {
    txCount1h: { label: 'TX Count (1h)', type: 'number', placeholder: '0+' },
    txCount24h: { label: 'TX Count (24h)', type: 'number', placeholder: '0+' },
    amountSum1h: { label: 'Amount Sum (1h)', type: 'number', placeholder: '0+' },
    uniqueDevices24h: { label: 'Unique Devices (24h)', type: 'number', placeholder: '0+' },
    uniqueIps24h: { label: 'Unique IPs (24h)', type: 'number', placeholder: '0+' },
    uniqueSessions1h: { label: 'Unique Sessions (1h)', type: 'number', placeholder: '0+' },
    burstDetected: { label: 'Burst Detected', type: 'boolean' },
    burstRatio: { label: 'Burst Ratio', type: 'number', placeholder: '0+' },
  },
  behavioral: {
    sessionRiskScore: { label: 'Session Risk Score', type: 'number', placeholder: '0-100' },
    botProbability: { label: 'Bot Probability', type: 'number', placeholder: '0-1' },
    isBot: { label: 'Is Bot', type: 'boolean' },
    timingCv: { label: 'Timing CV', type: 'number', placeholder: '0+' },
    navigationEntropy: { label: 'Navigation Entropy', type: 'number', placeholder: '0+' },
  },
  network: {
    isProxy: { label: 'Is Proxy', type: 'boolean' },
    isVpn: { label: 'Is VPN', type: 'boolean' },
    isTor: { label: 'Is Tor', type: 'boolean' },
    isDatacenter: { label: 'Is Datacenter', type: 'boolean' },
    country: { label: 'Country', type: 'string', placeholder: 'US, TR, NG...' },
    geoMismatchScore: { label: 'Geo Mismatch Score', type: 'number', placeholder: '0-100' },
    riskScore: { label: 'Risk Score', type: 'number', placeholder: '0-100' },
  },
  telco: {
    prepaidProbability: { label: 'Prepaid Probability', type: 'number', placeholder: '0-1' },
    isPorted: { label: 'Is Ported', type: 'boolean' },
    lineType: { label: 'Line Type', type: 'string', placeholder: 'prepaid, postpaid, unknown' },
    countryCode: { label: 'Country Code', type: 'string', placeholder: 'TR, US...' },
  },
};

const SIGNAL_LABELS: Record<string, string> = {
  device: 'Device',
  velocity: 'Velocity',
  behavioral: 'Behavioral',
  network: 'Network',
  telco: 'Telco',
};

const OPERATORS_BY_TYPE: Record<FieldType, { value: string; label: string }[]> = {
  number: [
    { value: '>', label: '>' },
    { value: '>=', label: '>=' },
    { value: '<', label: '<' },
    { value: '<=', label: '<=' },
    { value: '==', label: '==' },
    { value: '!=', label: '!=' },
  ],
  boolean: [
    { value: '==', label: '==' },
    { value: '!=', label: '!=' },
  ],
  string: [
    { value: '==', label: '==' },
    { value: '!=', label: '!=' },
    { value: 'IN', label: 'IN' },
    { value: 'NOT_IN', label: 'NOT IN' },
  ],
  'string[]': [
    { value: 'IN', label: 'IN' },
    { value: 'NOT_IN', label: 'NOT IN' },
  ],
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Condition {
  id: string;
  signal: string;
  field: string;
  operator: string;
  value: string;
  connector: 'AND' | 'OR';
}

interface Props {
  conditions: Condition[];
  onChange: (conditions: Condition[]) => void;
}

function makeId() {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function defaultCondition(): Condition {
  return { id: makeId(), signal: 'device', field: 'trustScore', operator: '<', value: '', connector: 'AND' };
}

// ─── DSL Generator ────────────────────────────────────────────────────────────

function getFieldDef(signal: string, field: string): FieldDef | undefined {
  return SIGNAL_SCHEMA[signal]?.[field];
}

function formatValue(cond: Condition): string {
  const def = getFieldDef(cond.signal, cond.field);
  if (!def) return cond.value;

  if (def.type === 'boolean') return cond.value;
  if (def.type === 'number') return cond.value;
  if ((cond.operator === 'IN' || cond.operator === 'NOT_IN') && def.type === 'string') {
    const items = cond.value.split(',').map((s) => `"${s.trim()}"`).filter((s) => s !== '""');
    return `[${items.join(', ')}]`;
  }
  return `"${cond.value}"`;
}

export function conditionsToDsl(conditions: Condition[]): string {
  if (conditions.length === 0) return '';
  return conditions
    .map((c, i) => {
      const expr = `${c.signal}.${c.field} ${c.operator} ${formatValue(c)}`;
      if (i === 0) return expr;
      return `${c.connector} ${expr}`;
    })
    .join(' ');
}

export function parseDslToConditions(dsl: string): Condition[] | null {
  if (!dsl.trim()) return null;

  const conditions: Condition[] = [];
  // Match patterns like: [AND|OR] signal.field op value
  const re = /(?:(AND|OR)\s+)?(\w+)\.(\w+)\s+(>|>=|<|<=|==|!=|IN|NOT_IN)\s+(.+?)(?=\s+(?:AND|OR)\s+\w+\.\w+|$)/g;
  let match;

  while ((match = re.exec(dsl)) !== null) {
    const [, connector, signal, field, operator, rawValue] = match;
    let value = rawValue.trim();

    // Strip quotes from string values
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    // Convert list to comma-separated
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).replace(/"/g, '').trim();
    }

    if (SIGNAL_SCHEMA[signal]?.[field]) {
      conditions.push({
        id: makeId(),
        signal,
        field,
        operator,
        value,
        connector: (connector as 'AND' | 'OR') || 'AND',
      });
    }
  }

  return conditions.length > 0 ? conditions : null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const selectClass =
  'rounded-md border border-surface-border bg-surface-input px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary';
const inputClass =
  'rounded-md border border-surface-border bg-surface-input px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary';

export default function RuleBuilder({ conditions, onChange }: Props) {
  const rows = conditions.length === 0 ? [defaultCondition()] : conditions;

  const update = useCallback(
    (id: string, patch: Partial<Condition>) => {
      const next = rows.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...patch };
        // Reset operator + value when signal or field changes
        if (patch.signal || patch.field) {
          const sig = patch.signal ?? c.signal;
          const fld = patch.field ?? (patch.signal ? Object.keys(SIGNAL_SCHEMA[sig])[0] : c.field);
          const def = getFieldDef(sig, fld);
          if (patch.signal) updated.field = fld;
          if (def) {
            updated.operator = OPERATORS_BY_TYPE[def.type][0].value;
            updated.value = def.type === 'boolean' ? 'true' : '';
          }
        }
        return updated;
      });
      onChange(next);
    },
    [rows, onChange],
  );

  const addRow = () => onChange([...rows, defaultCondition()]);
  const removeRow = (id: string) => {
    const next = rows.filter((c) => c.id !== id);
    onChange(next.length === 0 ? [defaultCondition()] : next);
  };

  return (
    <div className="space-y-2">
      {rows.map((cond, idx) => {
        const fieldDef = getFieldDef(cond.signal, cond.field);
        const fieldType = fieldDef?.type ?? 'string';
        const operators = OPERATORS_BY_TYPE[fieldType];
        const fields = SIGNAL_SCHEMA[cond.signal] ?? {};

        return (
          <div key={cond.id} className="flex items-center gap-2 flex-wrap">
            {/* Connector (AND/OR) — shown for 2nd+ row */}
            {idx > 0 ? (
              <select
                value={cond.connector}
                onChange={(e) => update(cond.id, { connector: e.target.value as 'AND' | 'OR' })}
                className={`${selectClass} w-16`}
              >
                <option value="AND">AND</option>
                <option value="OR">OR</option>
              </select>
            ) : (
              <span className="w-16 text-xs text-text-secondary text-center">WHERE</span>
            )}

            {/* Signal */}
            <select
              value={cond.signal}
              onChange={(e) => update(cond.id, { signal: e.target.value })}
              className={`${selectClass} w-28`}
              aria-label="Signal"
            >
              {Object.entries(SIGNAL_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>

            {/* Field */}
            <select
              value={cond.field}
              onChange={(e) => update(cond.id, { field: e.target.value })}
              className={`${selectClass} w-44`}
              aria-label="Field"
            >
              {Object.entries(fields).map(([key, def]) => (
                <option key={key} value={key}>{def.label}</option>
              ))}
            </select>

            {/* Operator */}
            <select
              value={cond.operator}
              onChange={(e) => update(cond.id, { operator: e.target.value })}
              className={`${selectClass} w-20`}
              aria-label="Operator"
            >
              {operators.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>

            {/* Value */}
            {fieldType === 'boolean' ? (
              <select
                value={cond.value || 'true'}
                onChange={(e) => update(cond.id, { value: e.target.value })}
                className={`${selectClass} w-20`}
                aria-label="Value"
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                type={fieldType === 'number' ? 'number' : 'text'}
                value={cond.value}
                onChange={(e) => update(cond.id, { value: e.target.value })}
                placeholder={fieldDef?.placeholder ?? 'Value'}
                className={`${inputClass} w-28`}
                aria-label="Value"
                step={fieldType === 'number' ? 'any' : undefined}
              />
            )}

            {/* Remove button */}
            <button
              type="button"
              onClick={() => removeRow(cond.id)}
              className="rounded p-1 text-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
              aria-label="Remove condition"
              title="Remove condition"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRow}
        className="mt-1 rounded-md border border-dashed border-surface-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-brand-primary hover:text-brand-primary transition-colors"
      >
        + Add Condition
      </button>

      {/* DSL Preview */}
      <div className="mt-3 rounded-md bg-gray-50 border border-surface-border px-3 py-2">
        <div className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1">Generated DSL</div>
        <code className="text-xs font-mono text-text-secondary break-all">
          {conditionsToDsl(rows) || '(empty)'}
        </code>
      </div>
    </div>
  );
}
