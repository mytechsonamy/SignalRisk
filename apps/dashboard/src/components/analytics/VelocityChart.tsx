import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { VelocityPoint } from '../../types/analytics.types';

interface Props {
  velocity: VelocityPoint[];
}

export default function VelocityChart({ velocity }: Props) {
  return (
    <div className="rounded-lg bg-surface-card shadow-md p-4">
      <h2 className="text-sm font-semibold text-text-primary mb-4">Events per Hour</h2>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={velocity} margin={{ top: 4, right: 16, left: -8, bottom: 4 }}>
          <defs>
            <linearGradient id="velocityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="hour"
            tick={{ fontSize: 10, fill: '#6B7280' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#6B7280' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: '0.375rem',
              fontSize: '12px',
            }}
          />
          <Area
            type="monotone"
            dataKey="events"
            stroke="#3B82F6"
            strokeWidth={2}
            fill="url(#velocityGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
