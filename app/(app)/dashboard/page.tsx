import { getWealthSummaryAsOf, getNetWorthHistoryExact } from "@/lib/finance/aggregates";
import { computeFinancialSignals, computeHighlights } from "@/lib/finance/insights";
import { getOrCreateTodaysReview } from "@/lib/ai/generateFinancialReview";
import { ASSET_CATEGORY_COLOR } from "@/lib/finance/chartColors";
import { formatMoney, formatPercent } from "@/lib/format/money";
import { formatShortDate } from "@/lib/format/date";
import { ASSET_CATEGORY_LABELS } from "@/lib/finance/taxonomy";
import { StatTile } from "@/components/ui/StatTile";
import { HealthBadge } from "@/components/ui/HealthBadge";
import { GlassCard } from "@/components/ui/GlassCard";
import { HighlightsList } from "@/components/HighlightsList";
import { AIReviewCard } from "@/components/AIReviewCard";
import { FinanceChat } from "@/components/FinanceChat";
import { AllocationDonut } from "@/components/charts/AllocationDonut";
import { NetWorthAreaChart } from "@/components/charts/NetWorthAreaChart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const signals = await computeFinancialSignals();
  const highlights = computeHighlights(signals);

  const [summary, history, review] = await Promise.all([
    signals.latestSnapshotDate ? getWealthSummaryAsOf(signals.latestSnapshotDate) : null,
    getNetWorthHistoryExact(),
    getOrCreateTodaysReview(signals, highlights),
  ]);

  const allocationData = (summary?.allocation ?? [])
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
          {signals.latestSnapshotDate ? (
            <p className="mt-1 text-sm text-(--color-ink-muted)">
              As of {formatShortDate(signals.latestSnapshotDate)}
            </p>
          ) : null}
        </div>
        <HealthBadge status={signals.healthStatus} />
      </div>

      <GlassCard>
        <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Net Worth</p>
        <p className="tabular mt-2 font-(family-name:--font-display) text-3xl leading-tight break-words text-(--color-ink-primary) sm:text-4xl lg:text-5xl">
          {formatMoney(signals.netWorth)}
        </p>
        {signals.snapshotChangeAmount !== null && signals.previousSnapshotDate ? (
          <p
            className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-medium"
            style={{
              color:
                signals.snapshotChangeAmount >= 0
                  ? "var(--color-delta-positive-strong)"
                  : "var(--color-delta-negative-strong)",
            }}
          >
            <span aria-hidden>{signals.snapshotChangeAmount >= 0 ? "▲" : "▼"}</span>
            {formatMoney(Math.abs(signals.snapshotChangeAmount))}
            {signals.snapshotChangePct !== null ? ` (${formatPercent(Math.abs(signals.snapshotChangePct))})` : ""}
            <span className="font-normal text-(--color-ink-muted)">
              snapshot change vs {formatShortDate(signals.previousSnapshotDate)}
            </span>
          </p>
        ) : null}
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="Liquid Assets"
          value={formatMoney(signals.liquidAssets)}
          hint={signals.liquidityRatio !== null ? `${formatPercent(signals.liquidityRatio)} of net worth` : undefined}
        />
        <StatTile
          label="Cash Position"
          value={formatMoney(signals.cashPosition)}
          hint={signals.cashAllocationPct !== null ? formatPercent(signals.cashAllocationPct) : undefined}
        />
        <StatTile
          label="Investment Value"
          value={formatMoney(signals.investmentValue)}
          hint={signals.investmentAllocationPct !== null ? formatPercent(signals.investmentAllocationPct) : undefined}
        />
        <StatTile
          label="Business Value"
          value={formatMoney(signals.businessValue)}
          hint={signals.businessAllocationPct !== null ? formatPercent(signals.businessAllocationPct) : undefined}
        />
        <StatTile
          label="Other Value"
          value={formatMoney(signals.otherValue)}
          hint={signals.otherAllocationPct !== null ? formatPercent(signals.otherAllocationPct) : undefined}
        />
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

      <FinanceChat />
    </div>
  );
}
