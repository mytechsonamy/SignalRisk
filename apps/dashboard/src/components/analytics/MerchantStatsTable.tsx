import type { MerchantStat } from '../../types/analytics.types';

interface Props {
  merchants: MerchantStat[];
}

export default function MerchantStatsTable({ merchants }: Props) {
  const sorted = [...merchants].sort((a, b) => b.eventVolume - a.eventVolume);

  return (
    <div className="rounded-lg bg-surface-card shadow-md p-4">
      <h2 className="text-sm font-semibold text-text-primary mb-4">Merchant Statistics</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border">
              <th className="text-left py-2 px-3 text-text-secondary font-medium">Merchant</th>
              <th className="text-right py-2 px-3 text-text-secondary font-medium">Volume</th>
              <th className="text-right py-2 px-3 text-text-secondary font-medium">Avg Risk Score</th>
              <th className="text-right py-2 px-3 text-text-secondary font-medium">Block Rate</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((merchant) => (
              <tr
                key={merchant.merchantId}
                className="border-b border-surface-border last:border-0 hover:bg-surface-hover"
              >
                <td className="py-2 px-3 text-text-primary font-medium">{merchant.name}</td>
                <td className="py-2 px-3 text-right text-text-secondary">
                  {merchant.eventVolume.toLocaleString()}
                </td>
                <td className="py-2 px-3 text-right text-text-secondary">
                  {merchant.avgRiskScore.toFixed(1)}
                </td>
                <td className="py-2 px-3 text-right">
                  <span
                    className={
                      merchant.blockRate > 0.1
                        ? 'text-decision-block font-medium'
                        : 'text-text-secondary'
                    }
                  >
                    {(merchant.blockRate * 100).toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-text-secondary">
                  No merchant data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
