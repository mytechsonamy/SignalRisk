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
import { useDashboardStore } from '../../store/dashboard.store';

const CHART_COLORS = {
  ALLOW: '#0E9F6E',
  REVIEW: '#FF5A1F',
  BLOCK: '#E02424',
};

export default function TrendChart() {
  const { trend } = useDashboardStore();

  const displayData = trend.slice(-30);

  return (
    <div className="rounded-lg bg-surface-card shadow-md p-4" role="region" aria-label="Decision trend chart">
      <h2 className="text-sm font-semibold text-text-primary mb-4">Decisions — Last 60 Minutes</h2>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={displayData} margin={{ top: 4, right: 16, left: -8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="minute"
            tick={{ fontSize: 10, fill: '#6B7280' }}
            interval="preserveStartEnd"
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={false} />
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
            dataKey="ALLOW"
            stroke={CHART_COLORS.ALLOW}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="REVIEW"
            stroke={CHART_COLORS.REVIEW}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="BLOCK"
            stroke={CHART_COLORS.BLOCK}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
