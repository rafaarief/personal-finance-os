import { desc } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db/client';
import { getWealthSummaryAsOf } from './aggregates';
import { calculateMonthlyClosing } from './monthlyClosingMath';

/** A September close compares September 1 with October 1, including liabilities. */
export async function getLatestMonthlyClosing() {
  const [report] = await getDb().select().from(schema.monthlyClosings)
    .orderBy(desc(schema.monthlyClosings.month)).limit(1);
  if (!report) return null;
  const [year, month] = report.month.split('-').map(Number);
  const closingDate = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const [opening, closing] = await Promise.all([
    getWealthSummaryAsOf(report.month), getWealthSummaryAsOf(closingDate),
  ]);
  return { month: report.month, incomeItems: report.incomeItems,
    ...calculateMonthlyClosing(report.incomeItems, opening.netWorth, closing.netWorth) };
}
