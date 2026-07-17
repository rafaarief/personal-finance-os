import { getCashflowSummary } from "@/lib/finance/aggregates";
import { formatMoney, formatPercent } from "@/lib/format/money";
import { StatTile } from "@/components/ui/StatTile";
import { GlassCard } from "@/components/ui/GlassCard";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export const dynamic = "force-dynamic";

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const month = monthParam ?? currentMonth();
  const summary = await getCashflowSummary(month);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">Cashflow Dashboard — {month}</p>
        <h1 className="mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">
          Cash in motion
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Beginning cash" value={formatMoney(summary.beginningCash)} />
        <StatTile label="Money in" value={formatMoney(summary.moneyIn)} />
        <StatTile label="Money out" value={formatMoney(summary.moneyOut)} />
        <StatTile label="Ending cash" value={formatMoney(summary.endingCash)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard>
          <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Saving rate</p>
          <p className="tabular mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">
            {formatPercent(summary.savingRate)}
          </p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Investment rate</p>
          <p className="tabular mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">
            {formatPercent(summary.investmentRate)}
          </p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Burn rate</p>
          <p className="tabular mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">
            {formatMoney(summary.burnRate)}/mo
          </p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Runway</p>
          <p className="tabular mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">
            {summary.runwayMonths !== null ? `${summary.runwayMonths.toFixed(1)} mo` : "∞"}
          </p>
        </GlassCard>
      </div>

      <GlassCard className="max-w-sm">
        <p className="text-xs tracking-[0.15em] text-(--color-ink-muted) uppercase">Emergency fund ratio</p>
        <p className="tabular mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">
          {summary.emergencyFundRatio !== null ? `${summary.emergencyFundRatio.toFixed(1)}x monthly expense` : "—"}
        </p>
      </GlassCard>
    </div>
  );
}
