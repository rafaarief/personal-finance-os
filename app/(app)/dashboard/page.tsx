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
    <div className="overview space-y-8">
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

      <GlassCard className="overview-hero">
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
        <section aria-label={`Tutup buku ${closingLabel}`} className="closing-panel">
          <div className="closing-heading">
            <div><p className="overview-eyebrow">RINGKASAN BULANAN</p><h2>Tutup buku {closingLabel}</h2></div>
            <span className="closing-period">Pemasukan − pengeluaran = saving</span>
          </div>
          <div className="closing-metrics">
            <div className="closing-metric">
              <p className="closing-label"><span className="metric-icon">↙</span>Pemasukan</p>
              <p className="closing-number">{formatMoney(monthlyClosing.income)}</p>
              <p className="closing-caption">{monthlyClosing.incomeItems.length} sumber pemasukan</p>
            </div>
            <div className="closing-metric">
              <p className="closing-label"><span className="metric-icon">↗</span>Pengeluaran <span className="estimate-tag">Estimasi</span></p>
              <p className="closing-number">{formatMoney(monthlyClosing.expense)}</p>
              <p className="closing-caption">Pemasukan dikurangi saving</p>
            </div>
            <div className="closing-metric closing-saving">
              <p className="closing-label"><span className="metric-icon">+</span>Saving</p>
              <p className="closing-number">{formatMoney(monthlyClosing.saving)}</p>
              <p className="closing-caption">Kenaikan net worth setelah kewajiban</p>
            </div>
          </div>
          <details className="closing-details">
            <summary>Rincian pemasukan & cara perhitungan <span aria-hidden>＋</span></summary>
            <div className="closing-details-content">
              <dl>{monthlyClosing.incomeItems.map((item) => (
                <div key={item.source}><dt>{item.source}</dt><dd>{formatMoney(item.amount)}</dd></div>
              ))}</dl>
              <p>Saving dihitung dari perubahan net worth awal bulan ke awal bulan berikutnya. Perubahan valuasi aset juga memengaruhi saving dan estimasi pengeluaran.</p>
            </div>
          </details>
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
        <GlassCard className="overview-payable">
          <div className="payable-heading"><h2 className="font-(family-name:--font-display) text-xl">Accounts Payable</h2><span className="estimate-tag">Pengurang net worth</span></div>
          {payables.map((entry) => (
            <div key={entry.creditor} className="mt-3 flex flex-wrap justify-between gap-2">
              <span>{entry.creditor}</span><span>{formatMoney(entry.amount)}</span>
            </div>
          ))}
          <div className="balance-equation">
            <div><span>Total aset</span><strong>{formatMoney(signals.liquidAssets + signals.nonLiquidAssets)}</strong></div>
            <div><span>− Kewajiban</span><strong>{formatMoney(signals.totalLiabilities)}</strong></div>
            <div><span>= Net worth</span><strong>{formatMoney(signals.netWorth)}</strong></div>
          </div>
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
