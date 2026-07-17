import { getWealthSummary, getNetWorthHistory } from "@/lib/finance/aggregates";
import { ASSET_CATEGORY_COLOR } from "@/lib/finance/chartColors";
import { formatMoney, formatCompactMoney } from "@/lib/format/money";
import { ASSET_CATEGORY_LABELS } from "@/lib/finance/taxonomy";
import { StatTile } from "@/components/ui/StatTile";
import { GlassCard } from "@/components/ui/GlassCard";
import { AllocationDonut } from "@/components/charts/AllocationDonut";
import { NetWorthAreaChart } from "@/components/charts/NetWorthAreaChart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [summary, history] = await Promise.all([getWealthSummary(), getNetWorthHistory(24)]);

  const lastTwo = history.slice(-2);
  const monthlyChange =
    lastTwo.length === 2 ? lastTwo[1].netWorth - lastTwo[0].netWorth : null;

  const allocationData = summary.allocation
    .filter((entry) => entry.value !== 0)
    .map((entry) => ({
      label: ASSET_CATEGORY_LABELS[entry.category as keyof typeof ASSET_CATEGORY_LABELS] ?? entry.category,
      value: entry.value,
      color: ASSET_CATEGORY_COLOR[entry.category] ?? "#8a8296",
    }));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">Wealth Dashboard</p>
        <h1 className="mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">
          Net worth overview
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile label="Net worth" value={formatMoney(summary.netWorth)} />
        <StatTile
          label="Monthly change"
          value={monthlyChange !== null ? formatCompactMoney(monthlyChange) : "—"}
          delta={
            monthlyChange !== null
              ? {
                  value: formatCompactMoney(Math.abs(monthlyChange)),
                  direction: monthlyChange > 0 ? "up" : monthlyChange < 0 ? "down" : "flat",
                }
              : null
          }
        />
        <StatTile label="Liquid assets" value={formatMoney(summary.liquidAssets)} />
        <StatTile label="Cash position" value={formatMoney(summary.cashPosition)} />
        <StatTile label="Investment value" value={formatMoney(summary.investmentValue)} />
        <StatTile label="Business value" value={formatMoney(summary.businessValue)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <GlassCard className="lg:col-span-3">
          <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">
            Net worth over time
          </h2>
          <div className="mt-4">
            <NetWorthAreaChart data={history} />
          </div>
        </GlassCard>

        <GlassCard className="lg:col-span-2">
          <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">
            Asset allocation
          </h2>
          <div className="mt-4">
            {allocationData.length > 0 ? (
              <AllocationDonut data={allocationData} />
            ) : (
              <p className="text-sm text-(--color-ink-muted)">
                No assets yet — add one under Assets to get started.
              </p>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
