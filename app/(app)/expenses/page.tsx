import {
  getMonthlyIncomeExpense,
  getExpenseByCategory,
  getIncomeBySource,
  getLargestTransactions,
  getRecurringExpenses,
  getBusinessVsPersonalSplit,
} from "@/lib/finance/aggregates";
import { EXPENSE_CATEGORY_COLOR, INCOME_CATEGORY_COLOR, colorForKey } from "@/lib/finance/chartColors";
import { formatMoney } from "@/lib/format/money";
import { StatTile } from "@/components/ui/StatTile";
import { GlassCard } from "@/components/ui/GlassCard";
import { CategoryBarChart } from "@/components/charts/CategoryBarChart";
import { IncomeExpenseTrendChart } from "@/components/charts/IncomeExpenseTrendChart";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const month = monthParam ?? currentMonth();

  const [trend, expenseByCategory, incomeBySource, largest, recurring, split] = await Promise.all([
    getMonthlyIncomeExpense(12),
    getExpenseByCategory(month),
    getIncomeBySource(month),
    getLargestTransactions(month, 8),
    getRecurringExpenses(),
    getBusinessVsPersonalSplit(month),
  ]);

  const thisMonth = trend.find((row) => row.month === month) ?? { income: 0, expense: 0, net: 0 };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">Expense & Income — {month}</p>
        <h1 className="mt-2 font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">
          Where the money went
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Income" value={formatMoney(thisMonth.income)} />
        <StatTile label="Expense" value={formatMoney(thisMonth.expense)} />
        <StatTile
          label="Net cashflow"
          value={formatMoney(thisMonth.net)}
          delta={{
            value: formatMoney(Math.abs(thisMonth.net)),
            direction: thisMonth.net > 0 ? "up" : thisMonth.net < 0 ? "down" : "flat",
          }}
        />
      </div>

      <GlassCard>
        <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">
          Income vs expense (12 months)
        </h2>
        <div className="mt-4">
          <IncomeExpenseTrendChart data={trend} />
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassCard>
          <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">Expense by category</h2>
          <div className="mt-4">
            {expenseByCategory.length > 0 ? (
              <CategoryBarChart
                data={expenseByCategory.map((row) => ({
                  label: row.categoryLabel,
                  value: row.total,
                  color: colorForKey(EXPENSE_CATEGORY_COLOR, row.categoryKey),
                }))}
              />
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
