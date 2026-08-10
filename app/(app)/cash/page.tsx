import Link from "next/link";
import { getCategorySummary, getCategoryValueHistory, getNetWorthSummary, getAssetValueHistory } from "@/lib/finance/aggregates";
import { getChangeLogForCategory } from "@/lib/actions/changeLog";
import { formatMoney, formatPercent } from "@/lib/format/money";
import { formatShortDate } from "@/lib/format/date";
import { GlassCard } from "@/components/ui/GlassCard";
import { MetricGrid } from "@/components/ui/MetricGrid";
import { AccountCard } from "@/components/AccountCard";
import { ValuationHistoryChart } from "@/components/charts/ValuationHistoryChart";
import { ChangeHistoryTable } from "@/components/ChangeHistoryTable";

export const dynamic = "force-dynamic";

export default async function CashPage() {
  const [summary, history, netWorth, changeLog] = await Promise.all([
    getCategorySummary("cash"),
    getCategoryValueHistory("cash"),
    getNetWorthSummary(),
    getChangeLogForCategory("cash"),
  ]);

  const { accounts, currentValue, asOfDate } = summary;
  const perAssetHistory = new Map(
    await Promise.all(accounts.map(async (account) => [account.assetId, await getAssetValueHistory(account.assetId)] as const))
  );
  const largestBalance = accounts.reduce((max, account) => Math.max(max, account.currentValue), 0);
  const pctOfNetWorth = netWorth.netWorth > 0 ? currentValue / netWorth.netWorth : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">Liquid Assets</p>
          <h1 className="mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Cash</h1>
          {asOfDate ? <p className="mt-1 text-sm text-(--color-ink-muted)">Last updated {formatShortDate(asOfDate)}</p> : null}
        </div>
        <Link
          href="/assets/new?category=cash"
          className="rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap text-(--color-on-accent)"
          style={{ background: "var(--gradient-hero)" }}
        >
          + Add Cash Account
        </Link>
      </div>

      <div className="space-y-6">
        <GlassCard>
          <MetricGrid
            items={[
              { label: "Total Cash", value: formatMoney(currentValue) },
              { label: "Accounts", value: String(accounts.length) },
              { label: "Largest Balance", value: formatMoney(largestBalance) },
              { label: "% of Net Worth", value: pctOfNetWorth !== null ? formatPercent(pctOfNetWorth) : "—" },
            ]}
          />
        </GlassCard>

        <GlassCard>
          <h3 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">Cash Balance Over Time</h3>
          <div className="mt-4">
            <ValuationHistoryChart data={history} capitalLabel="Capital" currentValueLabel="Cash Balance" showCapitalNote={false} />
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {accounts.map((account) => (
            <AccountCard
              key={account.assetId}
              assetId={account.assetId}
              name={account.name}
              subcategory={account.subcategory}
              value={account.currentValue}
              lastUpdated={account.snapshotDate}
              history={perAssetHistory.get(account.assetId)}
            />
          ))}
          {accounts.length === 0 ? (
            <GlassCard className="sm:col-span-2 lg:col-span-4">
              <p className="text-sm text-(--color-ink-muted)">No cash balances reported yet.</p>
            </GlassCard>
          ) : null}
        </div>

        {accounts.length > 0 ? (
          <GlassCard padded={false} className="overflow-x-auto p-0">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-(--color-border-hairline) text-left text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase">
                  <th className="px-5 py-3 font-normal">Account</th>
                  <th className="px-5 py-3 text-right font-normal">Balance</th>
                  <th className="px-5 py-3 text-right font-normal">Allocation</th>
                  <th className="px-5 py-3 text-right font-normal">Updated</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.assetId} className="border-b border-(--color-border-hairline) last:border-0">
                    <td className="px-5 py-3 text-(--color-ink-primary)">{account.name}</td>
                    <td className="tabular px-5 py-3 text-right whitespace-nowrap text-(--color-ink-primary)">
                      {formatMoney(account.currentValue)}
                    </td>
                    <td className="tabular px-5 py-3 text-right whitespace-nowrap text-(--color-ink-muted)">
                      {currentValue > 0 ? formatPercent(account.currentValue / currentValue) : "—"}
                    </td>
                    <td className="tabular px-5 py-3 text-right whitespace-nowrap text-(--color-ink-muted)">
                      {formatShortDate(account.snapshotDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        ) : null}

        <ChangeHistoryTable entries={changeLog} />
      </div>
    </div>
  );
}
