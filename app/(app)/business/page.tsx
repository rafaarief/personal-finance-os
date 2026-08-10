import Link from "next/link";
import { getBusinessSummary, getBusinessValueHistory, getAllActiveAssetsForPicker } from "@/lib/finance/aggregates";
import { getChangeLogForCategory } from "@/lib/actions/changeLog";
import { formatShortDate } from "@/lib/format/date";
import { BUSINESS_VALUATION_METHODS } from "@/lib/finance/valuationMethods";
import { ValuationSection } from "@/components/ValuationSection";
import { ChangeHistoryTable } from "@/components/ChangeHistoryTable";
import { RecordTransferModal } from "@/components/RecordTransferModal";

export const dynamic = "force-dynamic";

export default async function BusinessPage() {
  const [summary, history, changeLog, transferAccounts] = await Promise.all([
    getBusinessSummary(),
    getBusinessValueHistory(),
    getChangeLogForCategory("business"),
    getAllActiveAssetsForPicker(),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">Non-Liquid Assets</p>
          <h1 className="mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Business Assets</h1>
          {summary.asOfDate ? (
            <p className="mt-1 text-sm text-(--color-ink-muted)">Last updated {formatShortDate(summary.asOfDate)}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RecordTransferModal accounts={transferAccounts} />
          <Link
            href="/assets/new?category=business"
            className="rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap text-(--color-on-accent)"
            style={{ background: "var(--gradient-hero)" }}
          >
            + Add Business Asset
          </Link>
        </div>
      </div>

      <ValuationSection
        summary={summary}
        history={history}
        capitalLabel="Capital / Book Value"
        currentValueLabel="Current Estimated Value"
        gainLabel="Value Gain / Loss"
        valuationMethods={BUSINESS_VALUATION_METHODS}
      />

      <ChangeHistoryTable entries={changeLog} />
    </div>
  );
}
