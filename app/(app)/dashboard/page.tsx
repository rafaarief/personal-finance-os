import { getLatestMonthlyClosing } from "@/lib/finance/monthlyClosing";
import { getNetWorthHistoryExact, getAccountsPayable } from "@/lib/finance/aggregates";
import { computeFinancialSignals, computeHighlights } from "@/lib/finance/insights";
import { getOrCreateTodaysReview } from "@/lib/ai/generateFinancialReview";
import { ASSET_CLASS_COLOR, ASSET_CLASS_LABELS } from "@/lib/finance/hierarchy";
import { formatMoney, formatPercent } from "@/lib/format/money";
import { formatShortDate } from "@/lib/format/date";
import { HealthBadge } from "@/components/ui/HealthBadge";
import { GlassCard } from "@/components/ui/GlassCard";
import { CategorySummaryCard } from "@/components/ui/CategorySummaryCard";
import { HighlightsList } from "@/components/HighlightsList";
import { AIReviewCard } from "@/components/AIReviewCard";
import { FinanceChat } from "@/components/FinanceChat";
import { AllocationDonut } from "@/components/charts/AllocationDonut";
import { NetWorthAreaChart } from "@/components/charts/NetWorthAreaChart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const signals = await computeFinancialSignals();
  const [payables, monthlyClosing] = await Promise.all([getAccountsPayable(), getLatestMonthlyClosing()]);
  const closingLabel = monthlyClosing ? new Date(`${monthlyClosing.month}T00:00:00Z`).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
  const highlights = computeHighlights(signals);

  const [history, review] = await Promise.all([getNetWorthHistoryExact(), getOrCreateTodaysReview(signals, highlights)]);

  const otherAssetsTotal = signals.otherValue + signals.receivableValue + signals.vehicleValue;
  const nonLiquidPct = signals.netWorth > 0 ? signals.nonLiquidAssets / signals.netWorth : null;

  const allocationData = [
    { assetClass: "CASH" as const, value: signals.cashPosition },
    { assetClass: "CAPITAL_MARKET" as const, value: signals.investmentValue },
    { assetClass: "BUSINESS" as const, value: signals.businessValue },
    { assetClass: "OTHER_ASSET" as const, value: otherAssetsTotal },
  ]
    .filter((entry) => entry.value !== 0)
    .map((entry) => ({
      label: ASSET_CLASS_LABELS[entry.assetClass],
      value: entry.value,
      color: ASSET_CLASS_COLOR[entry.assetClass],
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
        <p className="kpi-figure-lg mt-2 font-(family-name:--font-display) text-(--color-ink-primary)">
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

      {monthlyClosing ? (
        <section aria-label={`Tutup buku ${closingLabel}`} className="space-y-3">
          <h2 className="font-(family-name:--font-display) text-xl">Tutup buku {closingLabel}</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <GlassCard>
              <h3 className="text-sm text-(--color-ink-muted)">Pemasukan {closingLabel}</h3>
              <p className="kpi-figure mt-2">{formatMoney(monthlyClosing.income)}</p>
              <div className="mt-4 space-y-2 text-sm">
                {monthlyClosing.incomeItems.map((item) => (
                  <div key={item.source} className="flex flex-wrap justify-between gap-2">
                    <span>{item.source}</span><span>{formatMoney(item.amount)}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
            <GlassCard>
              <h3 className="text-sm text-(--color-ink-muted)">Pengeluaran {closingLabel} (estimasi)</h3>
              <p className="kpi-figure mt-2">{formatMoney(monthlyClosing.expense)}</p>
              <p className="mt-4 text-sm text-(--color-ink-muted)">Pemasukan dikurangi saving.</p>
            </GlassCard>
            <GlassCard>
              <h3 className="text-sm text-(--color-ink-muted)">Saving {closingLabel}</h3>
              <p className="kpi-figure mt-2">{formatMoney(monthlyClosing.saving)}</p>
              <p className="mt-4 text-sm text-(--color-ink-muted)">Perubahan net worth dari awal bulan ke awal bulan berikutnya, setelah kewajiban.</p>
            </GlassCard>
          </div>
          <p className="text-xs text-(--color-ink-muted)">Perubahan valuasi aset juga memengaruhi saving dan estimasi pengeluaran.</p>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CategorySummaryCard
          title="Liquid Assets"
          total={signals.liquidAssets}
          percentOfNetWorth={signals.liquidityRatio}
          changePct={signals.liquidAssetsMoMChangePct}
          changeAmount={signals.liquidAssetsMoMChangeAmount}
          previousMonthLabel={signals.previousMonthLabel}
          breakdown={[
            {
              label: "Cash",
              value: signals.cashPosition,
              color: ASSET_CLASS_COLOR.CASH,
              changePct: signals.cashMoMChangePct,
              changeAmount: signals.cashMoMChangeAmount,
            },
            {
              label: "Capital Market",
              value: signals.investmentValue,
              color: ASSET_CLASS_COLOR.CAPITAL_MARKET,
              changePct: signals.investmentMoMChangePct,
              changeAmount: signals.investmentMoMChangeAmount,
            },
          ]}
        />
        <CategorySummaryCard
          title="Non-Liquid Assets"
          total={signals.nonLiquidAssets}
          percentOfNetWorth={nonLiquidPct}
          changePct={signals.nonLiquidAssetsMoMChangePct}
          changeAmount={signals.nonLiquidAssetsMoMChangeAmount}
          previousMonthLabel={signals.previousMonthLabel}
          breakdown={[
            {
              label: "Business",
              value: signals.businessValue,
              color: ASSET_CLASS_COLOR.BUSINESS,
              changePct: signals.businessMoMChangePct,
              changeAmount: signals.businessMoMChangeAmount,
            },
            {
              label: "Other Assets",
              value: otherAssetsTotal,
              color: ASSET_CLASS_COLOR.OTHER_ASSET,
              changePct: signals.otherAssetsMoMChangePct,
              changeAmount: signals.otherAssetsMoMChangeAmount,
              secondary: [
                { label: "Receivables", value: signals.receivableValue },
                { label: "Vehicle", value: signals.vehicleValue },
              ].filter((item) => item.value > 0),
            },
          ]}
        />
      </div>

      {signals.totalLiabilities > 0 ? (
        <GlassCard>
          <h2 className="font-(family-name:--font-display) text-xl">Accounts Payable</h2>
          {payables.map((entry) => (
            <div key={entry.creditor} className="mt-3 flex flex-wrap justify-between gap-2">
              <span>{entry.creditor}</span><span>{formatMoney(entry.amount)}</span>
            </div>
          ))}
          <p className="mt-3 text-sm text-(--color-ink-muted)">
            Total assets {formatMoney(signals.liquidAssets + signals.nonLiquidAssets)} − accounts payable {formatMoney(signals.totalLiabilities)} = net worth {formatMoney(signals.netWorth)}.
          </p>
        </GlassCard>
      ) : null}

      <GlassCard>
        <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">Net worth over time</h2>
        <div className="mt-4">
          <NetWorthAreaChart data={history} />
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HighlightsList highlights={highlights} />
        <AIReviewCard summary={review.summary} recommendation={review.recommendation} />
      </div>

      <GlassCard>
        <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">Asset allocation</h2>
        <div className="mt-4">
          {allocationData.length > 0 ? (
            <AllocationDonut data={allocationData} />
          ) : (
            <p className="text-sm text-(--color-ink-muted)">No assets yet — add one under Assets to get started.</p>
          )}
        </div>
        {signals.receivableValue > 0 || signals.vehicleValue > 0 ? (
          <div className="mt-4 space-y-1 border-t border-(--color-border-hairline) pt-3 text-xs text-(--color-ink-muted)">
            <p className="tracking-[0.1em] uppercase">Within Other Assets</p>
            {signals.receivableValue > 0 ? (
              <div className="flex justify-between">
                <span>Receivables</span>
                <span className="tabular whitespace-nowrap">{formatMoney(signals.receivableValue)}</span>
              </div>
            ) : null}
            {signals.vehicleValue > 0 ? (
              <div className="flex justify-between">
                <span>Vehicle</span>
                <span className="tabular whitespace-nowrap">{formatMoney(signals.vehicleValue)}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </GlassCard>

      <FinanceChat />
    </div>
  );
}
