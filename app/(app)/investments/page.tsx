import { getInvestmentSummary } from "@/lib/finance/aggregates";
import { CATEGORICAL_SLOTS, OTHER_COLOR } from "@/lib/finance/chartColors";
import { formatMoney, formatPercent } from "@/lib/format/money";
import { StatTile } from "@/components/ui/StatTile";
import { GlassCard } from "@/components/ui/GlassCard";
import { AllocationDonut } from "@/components/charts/AllocationDonut";

export const dynamic = "force-dynamic";

export default async function InvestmentsPage() {
  const summary = await getInvestmentSummary();

  const sorted = [...summary.allocation].sort((a, b) => b.currentValue - a.currentValue);
  const slotColors = Object.values(CATEGORICAL_SLOTS);
  const top = sorted.slice(0, 7).map((asset, index) => ({
    label: asset.name,
    value: asset.currentValue,
    color: slotColors[index],
  }));
  const rest = sorted.slice(7);
  const restTotal = rest.reduce((sum, asset) => sum + asset.currentValue, 0);
  const allocationData = restTotal > 0 ? [...top, { label: "Other", value: restTotal, color: OTHER_COLOR }] : top;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">Investment Dashboard</p>
        <h1 className="mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">
          Portfolio performance
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Current value" value={formatMoney(summary.currentValue)} />
        <StatTile label="Cost basis" value={formatMoney(summary.costBasis)} />
        <StatTile
          label="Unrealized gain"
          value={formatMoney(summary.unrealizedGain)}
          delta={{
            value: formatPercent(summary.roi),
            direction: summary.unrealizedGain > 0 ? "up" : summary.unrealizedGain < 0 ? "down" : "flat",
          }}
        />
        <StatTile label="ROI" value={formatPercent(summary.roi)} />
      </div>

      <GlassCard>
        <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">Holdings allocation</h2>
        <div className="mt-4">
          {allocationData.length > 0 ? (
            <AllocationDonut data={allocationData} />
          ) : (
            <p className="text-sm text-(--color-ink-muted)">No investment, business, gold, or property assets yet.</p>
          )}
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">Holdings</h2>
        <div className="mt-4 space-y-2 text-sm">
          {sorted.map((asset) => (
            <div key={asset.name} className="flex items-center justify-between border-b border-(--color-border-hairline) py-2 last:border-0">
              <div>
                <p className="text-(--color-ink-primary)">{asset.name}</p>
                <p className="text-xs text-(--color-ink-muted)">{asset.subcategory}</p>
              </div>
              <p className="tabular text-(--color-ink-primary)">{formatMoney(asset.currentValue)}</p>
            </div>
          ))}
          {sorted.length === 0 ? <p className="text-(--color-ink-muted)">No holdings yet.</p> : null}
        </div>
      </GlassCard>
    </div>
  );
}
