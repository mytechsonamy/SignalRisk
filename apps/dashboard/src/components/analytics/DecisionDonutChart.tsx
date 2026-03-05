import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { DecisionTrend } from '../../types/analytics.types';

interface Props {
  trends: DecisionTrend[];
}

const COLORS = {
  ALLOW: '#0E9F6E',
  REVIEW: '#D97706',
  BLOCK: '#E02424',
};

export default function DecisionDonutChart({ trends }: Props) {
  const totals = trends.reduce(
    (acc, t) => ({
      allow: acc.allow + t.allow,
      review: acc.review + t.review,
      block: acc.block + t.block,
    }),
    { allow: 0, review: 0, block: 0 },
  );

  const data = [
    { name: 'ALLOW', value: totals.allow },
    { name: 'REVIEW', value: totals.review },
    { name: 'BLOCK', value: totals.block },
  ];

  return (
    <div className="rounded-lg bg-surface-card shadow-md p-4">
      <h2 className="text-sm font-semibold text-text-primary mb-4">Decision Outcomes</h2>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={COLORS[entry.name as keyof typeof COLORS]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: '0.375rem',
              fontSize: '12px',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
