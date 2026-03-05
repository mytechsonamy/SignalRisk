import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { DecisionTrend } from '../../types/analytics.types';

interface Props {
  trends: DecisionTrend[];
}

const CHART_COLORS = {
  allow: '#0E9F6E',
  review: '#D97706',
  block: '#E02424',
};

export default function TrendChart({ trends }: Props) {
  return (
    <div className="rounded-lg bg-surface-card shadow-md p-4">
      <h2 className="text-sm font-semibold text-text-primary mb-4">Decision Trends</h2>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={trends} margin={{ top: 4, right: 16, left: -8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="date"
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
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Line
            type="monotone"
            dataKey="allow"
            stroke={CHART_COLORS.allow}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="review"
            stroke={CHART_COLORS.review}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="block"
            stroke={CHART_COLORS.block}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
