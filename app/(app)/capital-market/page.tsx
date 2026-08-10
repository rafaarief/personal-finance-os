import { getCapitalMarketSummary, getCapitalMarketHistory } from "@/lib/finance/aggregates";
import { getChangeLogForCategory } from "@/lib/actions/changeLog";
import { formatShortDate } from "@/lib/format/date";
import { ValuationSection } from "@/components/ValuationSection";
import { ChangeHistoryTable } from "@/components/ChangeHistoryTable";

export const dynamic = "force-dynamic";

export default async function CapitalMarketPage() {
  const [summary, history, changeLog] = await Promise.all([
    getCapitalMarketSummary(),
    getCapitalMarketHistory(),
    getChangeLogForCategory("investment"),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">Liquid Assets</p>
        <h1 className="mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Capital Market</h1>
        {summary.asOfDate ? (
          <p className="mt-1 text-sm text-(--color-ink-muted)">Last updated {formatShortDate(summary.asOfDate)}</p>
        ) : null}
      </div>

      <ValuationSection summary={summary} history={history} capitalLabel="Capital" currentValueLabel="Current Value" gainLabel="Gain / Loss" />

      <ChangeHistoryTable entries={changeLog} />
    </div>
  );
}
