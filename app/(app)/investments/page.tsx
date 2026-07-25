import { getCapitalMarketSummary, getCapitalMarketHistory } from "@/lib/finance/aggregates";
import { formatShortDate } from "@/lib/format/date";
import { CapitalMarketSection } from "@/components/CapitalMarketSection";

export const dynamic = "force-dynamic";

export default async function CapitalMarketPage() {
  const [summary, history] = await Promise.all([getCapitalMarketSummary(), getCapitalMarketHistory()]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">Liquid Assets</p>
        <h1 className="mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Capital Market</h1>
        {summary.asOfDate ? (
          <p className="mt-1 text-sm text-(--color-ink-muted)">As of {formatShortDate(summary.asOfDate)}</p>
        ) : null}
      </div>

      <CapitalMarketSection summary={summary} history={history} />
    </div>
  );
}
