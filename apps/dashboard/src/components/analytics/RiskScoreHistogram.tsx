import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { RiskBucket } from '../../types/analytics.types';

interface Props {
  data: RiskBucket[];
}

export default function RiskScoreHistogram({ data }: Props) {
  return (
    <div className="rounded-lg bg-surface-card shadow-md p-4">
      <h2 className="text-sm font-semibold text-text-primary mb-4">Risk Score Distribution</h2>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 16, left: -8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="range"
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
          <Bar dataKey="count" fill="#3B82F6" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
