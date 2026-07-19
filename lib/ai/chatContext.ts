import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { computeFinancialSignals, computeHighlights } from "@/lib/finance/insights";
import {
  getWealthSummary,
  getMonthlyIncomeExpense,
  getRecurringExpenses,
  getInvestmentSummary,
} from "@/lib/finance/aggregates";
import { ALLOCATION_TARGETS, EMERGENCY_FUND_TARGET_MONTHS } from "@/lib/finance/targets";

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value);
}

async function getAssetList() {
  const db = getDb();
  const rows = await db
    .select({
      name: schema.assets.name,
      category: schema.assets.category,
      subcategory: schema.assets.subcategory,
      currentValue: schema.assets.currentValue,
      purchaseValue: schema.assets.purchaseValue,
      currency: schema.assets.currency,
      lastUpdatedAt: schema.assets.lastUpdatedAt,
    })
    .from(schema.assets)
    .where(eq(schema.assets.isActive, true));

  return rows.map((row) => ({
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    currentValue: toNumber(row.currentValue),
    purchaseValue: row.purchaseValue !== null ? toNumber(row.purchaseValue) : null,
    currency: row.currency,
    lastUpdatedAt: row.lastUpdatedAt,
  }));
}

async function getRecentTransactions(limit = 30) {
  const db = getDb();
  const rows = await db
    .select({
      date: schema.transactions.transactionDate,
      description: schema.transactions.description,
      moneyIn: schema.transactions.moneyIn,
      moneyOut: schema.transactions.moneyOut,
      isBusiness: schema.transactions.isBusiness,
      isInvestment: schema.transactions.isInvestment,
      isInternalTransfer: schema.transactions.isInternalTransfer,
      categoryLabel: schema.categories.label,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.categories.id, schema.transactions.categoryId))
    .orderBy(desc(schema.transactions.transactionDate))
    .limit(limit);

  return rows.map((row) => ({
    date: row.date,
    description: row.description,
    moneyIn: row.moneyIn !== null ? toNumber(row.moneyIn) : 0,
    moneyOut: row.moneyOut !== null ? toNumber(row.moneyOut) : 0,
    category: row.categoryLabel ?? "Uncategorized",
    isBusiness: row.isBusiness,
    isInvestment: row.isInvestment,
    isInternalTransfer: row.isInternalTransfer,
  }));
}

/**
 * Assembles a fresh JSON snapshot of the user's real financial data for the AI
 * chat's system prompt. Recomputed per-request (cheap aggregate queries, no
 * caching) so the assistant is never talking about stale numbers.
 */
export async function buildFinancialContext(): Promise<string> {
  const [signals, wealth, monthlyTrend, recurring, investment, assets, recentTransactions] = await Promise.all([
    computeFinancialSignals(),
    getWealthSummary(),
    getMonthlyIncomeExpense(12),
    getRecurringExpenses(),
    getInvestmentSummary(),
    getAssetList(),
    getRecentTransactions(30),
  ]);

  const highlights = computeHighlights(signals);

  const context = {
    currency: "IDR",
    asOfDate: signals.latestSnapshotDate,
    signals,
    highlights: highlights.map((h) => h.text),
    allocationTargets: ALLOCATION_TARGETS,
    emergencyFundTargetMonths: EMERGENCY_FUND_TARGET_MONTHS,
    liveWealthSummary: wealth,
    investmentSummary: investment,
    monthlyIncomeExpenseTrend: monthlyTrend,
    recurringExpenses: recurring,
    assets,
    recentTransactions,
  };

  return JSON.stringify(context);
}
