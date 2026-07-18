import { getCashflowSummary } from "@/lib/finance/aggregates";
import { formatMoney, formatPercent } from "@/lib/format/money";
import { StatTile } from "@/components/ui/StatTile";

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
        <StatTile label="Saving rate" value={formatPercent(summary.savingRate)} />
        <StatTile label="Investment rate" value={formatPercent(summary.investmentRate)} />
        <StatTile label="Burn rate" value={`${formatMoney(summary.burnRate)}/mo`} />
        <StatTile label="Runway" value={summary.runwayMonths !== null ? `${summary.runwayMonths.toFixed(1)} mo` : "∞"} />
      </div>

      <div className="max-w-sm">
        <StatTile
          label="Emergency fund ratio"
          value={summary.emergencyFundRatio !== null ? `${summary.emergencyFundRatio.toFixed(1)}x monthly expense` : "—"}
        />
      </div>
    </div>
  );
}
