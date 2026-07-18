import { getWealthSummary, getNetWorthHistory } from "@/lib/finance/aggregates";
import { computeFinancialSignals, computeHighlights } from "@/lib/finance/insights";
import { getOrCreateTodaysReview } from "@/lib/ai/generateFinancialReview";
import { ASSET_CATEGORY_COLOR } from "@/lib/finance/chartColors";
import { formatMoney, formatPercent } from "@/lib/format/money";
import { ASSET_CATEGORY_LABELS } from "@/lib/finance/taxonomy";
import { StatTile } from "@/components/ui/StatTile";
import { HealthBadge } from "@/components/ui/HealthBadge";
import { GlassCard } from "@/components/ui/GlassCard";
import { HighlightsList } from "@/components/HighlightsList";
import { AIReviewCard } from "@/components/AIReviewCard";
import { AllocationDonut } from "@/components/charts/AllocationDonut";
import { NetWorthAreaChart } from "@/components/charts/NetWorthAreaChart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const signals = await computeFinancialSignals();
  const highlights = computeHighlights(signals);

  const [summary, history, review] = await Promise.all([
    getWealthSummary(),
    getNetWorthHistory(24),
    getOrCreateTodaysReview(signals, highlights),
  ]);

  const allocationData = summary.allocation
    .filter((entry) => entry.value !== 0)
    .map((entry) => ({
      label: ASSET_CATEGORY_LABELS[entry.category as keyof typeof ASSET_CATEGORY_LABELS] ?? entry.category,
      value: entry.value,
      color: ASSET_CATEGORY_COLOR[entry.category] ?? "#8a8296",
    }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">Your Financial Position</p>
          <h1 className="mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">
            Net worth overview
          </h1>
        </div>
        <HealthBadge status={signals.healthStatus} />
      </div>

      <GlassCard>
        <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Net Worth</p>
        <p className="tabular mt-2 font-(family-name:--font-display) text-5xl text-(--color-ink-primary)">
          {formatMoney(signals.netWorth)}
        </p>
        {signals.netWorthYoyChangePct !== null ? (
          <p
            className="mt-2 flex items-center gap-1 text-sm font-medium"
            style={{
              color:
                signals.netWorthYoyChangePct >= 0
                  ? "var(--color-delta-positive-strong)"
                  : "var(--color-delta-negative-strong)",
            }}
          >
            <span aria-hidden>{signals.netWorthYoyChangePct >= 0 ? "▲" : "▼"}</span>
            {formatPercent(signals.netWorthYoyChangePct)} YoY
          </p>
        ) : null}
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Liquid Cash" value={formatMoney(summary.cashPosition)} />
        <StatTile
          label="Emergency Fund"
          value={signals.emergencyFundMonths !== null ? `${signals.emergencyFundMonths.toFixed(1)} months` : "—"}
        />
        <StatTile label="Investment Allocation" value={formatPercent(signals.investmentAllocationPct)} />
        <StatTile label="Business Allocation" value={formatPercent(signals.businessAllocationPct)} />
        <StatTile label="Cash Allocation" value={formatPercent(signals.cashAllocationPct)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HighlightsList highlights={highlights} />
        <AIReviewCard summary={review.summary} recommendation={review.recommendation} />
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
