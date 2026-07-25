import { getDb, schema } from "@/lib/db/client";
import {
  getCashflowSummary,
  getTransactionsForMonth,
  getAvailableTransactionMonths,
  getMonthlyIncomeExpense,
  getExpenseByCategory,
  getIncomeBySource,
  getLargestTransactions,
  getRecurringExpenses,
  getBusinessVsPersonalSplit,
} from "@/lib/finance/aggregates";
import { EXPENSE_CATEGORY_COLOR, INCOME_CATEGORY_COLOR, colorForKey } from "@/lib/finance/chartColors";
import { formatMoney, formatPercent } from "@/lib/format/money";
import { currentMonthString } from "@/lib/format/date";
import { GlassCard } from "@/components/ui/GlassCard";
import { MetricGrid } from "@/components/ui/MetricGrid";
import { MonthSelector } from "@/components/MonthSelector";
import { CashflowLedger } from "@/components/CashflowLedger";
import { CategoryBarChart } from "@/components/charts/CategoryBarChart";
import { IncomeExpenseTrendChart } from "@/components/charts/IncomeExpenseTrendChart";

export const dynamic = "force-dynamic";

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const month = monthParam ?? currentMonthString();

  const db = getDb();

  const [
    summary,
    trend,
    transactions,
    categories,
    availableMonths,
    expenseByCategory,
    incomeBySource,
    largest,
    recurring,
    split,
  ] = await Promise.all([
    getCashflowSummary(month),
    getMonthlyIncomeExpense(12),
    getTransactionsForMonth(month),
    db.select({ id: schema.categories.id, key: schema.categories.key, label: schema.categories.label }).from(schema.categories),
    getAvailableTransactionMonths(),
    getExpenseByCategory(month),
    getIncomeBySource(month),
    getLargestTransactions(month, 8),
    getRecurringExpenses(),
    getBusinessVsPersonalSplit(month),
  ]);

  const netCashflow = summary.moneyIn - summary.moneyOut;
  const totalExpense = expenseByCategory.reduce((sum, row) => sum + row.total, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">Cashflow</p>
          <h1 className="mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Cash in motion</h1>
        </div>
        <MonthSelector month={month} months={availableMonths} />
      </div>

      <GlassCard>
        <h2 className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">Monthly Cashflow Statement</h2>
        <div className="mt-4">
          <MetricGrid
            maxCols={3}
            items={[
              { label: "Opening Cash", value: formatMoney(summary.beginningCash) },
              { label: "Money In", value: formatMoney(summary.moneyIn), color: "var(--color-delta-positive-strong)" },
              { label: "Money Out", value: formatMoney(summary.moneyOut), color: "var(--color-delta-negative-strong)" },
              {
                label: "Net Cashflow",
                value: `${netCashflow >= 0 ? "+" : "-"}${formatMoney(Math.abs(netCashflow))}`,
                color: netCashflow >= 0 ? "var(--color-delta-positive-strong)" : "var(--color-delta-negative-strong)",
              },
              { label: "Ending Cash", value: formatMoney(summary.endingCash) },
              { label: "Savings Rate", value: formatPercent(summary.savingRate) },
            ]}
          />
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">Cash in vs. cash out (12 months)</h2>
        <div className="mt-4">
          <IncomeExpenseTrendChart data={trend} />
        </div>
      </GlassCard>

      <div className="space-y-3">
        <h2 className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">Transactions</h2>
        <CashflowLedger rows={transactions} categories={categories} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassCard>
          <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">Where your money goes</h2>
          <div className="mt-4">
            {expenseByCategory.length > 0 ? (
              <>
                <CategoryBarChart
                  data={expenseByCategory.map((row) => ({
                    label: row.categoryLabel,
                    value: row.total,
                    color: colorForKey(EXPENSE_CATEGORY_COLOR, row.categoryKey),
                  }))}
                />
                <ul className="mt-4 space-y-1.5 text-sm">
                  {expenseByCategory.map((row) => (
                    <li key={row.categoryKey} className="flex items-center justify-between">
                      <span className="text-(--color-ink-secondary)">{row.categoryLabel}</span>
                      <span className="tabular text-(--color-ink-primary)">
                        {totalExpense > 0 ? formatPercent(row.total / totalExpense, 0) : "0%"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-(--color-ink-muted)">No expenses recorded for this month.</p>
            )}
          </div>
        </GlassCard>

        <GlassCard>
          <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">Income by source</h2>
          <div className="mt-4">
            {incomeBySource.length > 0 ? (
              <CategoryBarChart
                data={incomeBySource.map((row) => ({
                  label: row.categoryLabel,
                  value: row.total,
                  color: colorForKey(INCOME_CATEGORY_COLOR, row.categoryKey),
                }))}
              />
            ) : (
              <p className="text-sm text-(--color-ink-muted)">No income recorded for this month.</p>
            )}
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <GlassCard>
          <h2 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">Largest transactions</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {largest.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between">
                <span className="text-(--color-ink-secondary)">{tx.description}</span>
                <span className="tabular text-(--color-ink-primary)">{formatMoney(tx.amount)}</span>
              </li>
            ))}
            {largest.length === 0 ? <p className="text-(--color-ink-muted)">None.</p> : null}
          </ul>
        </GlassCard>

        <GlassCard>
          <h2 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">Recurring expenses</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {recurring.slice(0, 8).map((item) => (
              <li key={item.description} className="flex items-center justify-between">
                <span className="text-(--color-ink-secondary) capitalize">{item.description}</span>
                <span className="tabular text-(--color-ink-primary)">{formatMoney(item.averageAmount)}/mo</span>
              </li>
            ))}
            {recurring.length === 0 ? <p className="text-(--color-ink-muted)">None detected yet.</p> : null}
          </ul>
        </GlassCard>

        <GlassCard>
          <h2 className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">Business vs personal</h2>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-(--color-ink-secondary)">Business</span>
              <span className="tabular text-(--color-ink-primary)">{formatMoney(split.business)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-(--color-ink-secondary)">Personal</span>
              <span className="tabular text-(--color-ink-primary)">{formatMoney(split.personal)}</span>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
