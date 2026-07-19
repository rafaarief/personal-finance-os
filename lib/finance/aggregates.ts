import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value);
}

// --- Module 1: Wealth Dashboard ---------------------------------------------

export interface WealthSummary {
  netWorth: number;
  liquidAssets: number;
  nonLiquidAssets: number;
  cashPosition: number;
  investmentValue: number;
  businessValue: number;
  otherValue: number;
  allocation: { category: string; value: number }[];
}

const LIQUID_CATEGORIES = new Set(["cash", "investment"]);

function summarizeByCategory(rows: { category: string; total: string | number }[]): WealthSummary {
  let netWorth = 0;
  let liquidAssets = 0;
  let nonLiquidAssets = 0;
  let cashPosition = 0;
  let investmentValue = 0;
  let businessValue = 0;
  let otherValue = 0;
  const allocation: { category: string; value: number }[] = [];

  for (const row of rows) {
    const value = toNumber(row.total);
    netWorth += value;
    allocation.push({ category: row.category, value });

    if (LIQUID_CATEGORIES.has(row.category)) liquidAssets += value;
    else nonLiquidAssets += value;

    if (row.category === "cash") cashPosition += value;
    if (row.category === "investment") investmentValue += value;
    if (row.category === "business") businessValue += value;
    if (row.category === "other") otherValue += value;
  }

  return { netWorth, liquidAssets, nonLiquidAssets, cashPosition, investmentValue, businessValue, otherValue, allocation };
}

/**
 * "Live" wealth summary — sums each active asset's current_value, whatever it
 * last happened to be set to. Fine for the Assets list / Cashflow's "ending
 * cash" (both are inherently "best known value right now" concepts), but NOT
 * what a "Wealth Dashboard as of [statement date]" should use: an asset with
 * no snapshot on that date still contributes its last-known value here, which
 * silently blends data from different actual dates. Use getWealthSummaryAsOf
 * for anything claiming to represent a specific snapshot date.
 */
export async function getWealthSummary(): Promise<WealthSummary> {
  const db = getDb();
  const rows = await db
    .select({
      category: schema.assets.category,
      total: sql<string>`coalesce(sum(${schema.assets.currentValue}), 0)`,
    })
    .from(schema.assets)
    .where(eq(schema.assets.isActive, true))
    .groupBy(schema.assets.category);

  return summarizeByCategory(rows);
}

/**
 * Minimum number of distinct assets a date needs a snapshot row for, to count
 * as a real "as of this date" statement rather than an incidental single-asset
 * touch (a manual edit in the Asset form, or a bank-account balance recompute
 * after a transaction import both create a snapshot for just the one asset
 * involved). Chosen empirically: every genuine historical/closing statement
 * imported so far covers >=4 assets; every known single-asset artifact covers
 * <=2. This is a heuristic, not a schema guarantee — a dedicated "statement"
 * concept distinct from ad-hoc snapshots would be the more robust long-term
 * fix if a legitimate statement ever reports fewer than this many accounts.
 */
const MIN_ASSETS_FOR_STATEMENT_DATE = 3;

/**
 * Most recent distinct snapshot date that looks like a real statement, and
 * the one immediately before it. Null if fewer than 1/2 exist.
 *
 * Only considers source='import' rows with enough assets to plausibly be a
 * full statement (see MIN_ASSETS_FOR_STATEMENT_DATE) — never source='manual',
 * and never a source='import' date that only touched one or two assets (e.g.
 * a bank-account recompute after a transaction import). Treating either as
 * "the latest snapshot date" would make every other asset silently vanish
 * from that date's totals (net worth would collapse to just that touch).
 */
export async function getLatestSnapshotDates(): Promise<{ latest: string | null; previous: string | null }> {
  const db = getDb();
  const rows = await db.execute<{ snapshot_date: string }>(sql`
    select snapshot_date from ${schema.assetValueSnapshots}
    where source = 'import'
    group by snapshot_date
    having count(distinct asset_id) >= ${MIN_ASSETS_FOR_STATEMENT_DATE}
    order by snapshot_date desc limit 2
  `);
  return {
    latest: rows[0]?.snapshot_date ?? null,
    previous: rows[1]?.snapshot_date ?? null,
  };
}

/**
 * Wealth summary "as of" a specific snapshot date — only counts assets that
 * actually have a snapshot row on that exact date. This is what makes an
 * asset with no reported balance for a given statement (e.g. a blank line in
 * a bank statement) correctly drop out of that date's totals without ever
 * touching the asset's own current_value.
 */
export async function getWealthSummaryAsOf(snapshotDate: string): Promise<WealthSummary> {
  const db = getDb();
  const rows = await db
    .select({
      category: schema.assets.category,
      total: sql<string>`coalesce(sum(${schema.assetValueSnapshots.currentValue}), 0)`,
    })
    .from(schema.assetValueSnapshots)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.assetValueSnapshots.assetId))
    .where(eq(schema.assetValueSnapshots.snapshotDate, snapshotDate))
    .groupBy(schema.assets.category);

  return summarizeByCategory(rows);
}

export interface SnapshotChange {
  latestDate: string;
  latestTotal: number;
  previousDate: string | null;
  previousTotal: number | null;
  changeAmount: number | null;
  changePct: number | null;
}

/**
 * The change between the two most recent snapshot dates — deliberately NOT a
 * calendar "monthly" or "YoY" figure, since statement dates in this app are
 * irregular (see PRD note on snapshot cadence). Callers should label this
 * "snapshot change" / "period change vs {previousDate}", not "monthly change".
 */
export async function getSnapshotChange(): Promise<SnapshotChange | null> {
  const { latest, previous } = await getLatestSnapshotDates();
  if (!latest) return null;

  const latestSummary = await getWealthSummaryAsOf(latest);
  if (!previous) {
    return { latestDate: latest, latestTotal: latestSummary.netWorth, previousDate: null, previousTotal: null, changeAmount: null, changePct: null };
  }

  const previousSummary = await getWealthSummaryAsOf(previous);
  const changeAmount = latestSummary.netWorth - previousSummary.netWorth;
  const changePct = previousSummary.netWorth !== 0 ? changeAmount / previousSummary.netWorth : null;

  return {
    latestDate: latest,
    latestTotal: latestSummary.netWorth,
    previousDate: previous,
    previousTotal: previousSummary.netWorth,
    changeAmount,
    changePct,
  };
}

export interface NetWorthHistoryPoint {
  month: string; // YYYY-MM
  netWorth: number;
}

/** One point per month: the sum of each asset's latest snapshot value on/before that month. */
export async function getNetWorthHistory(monthsBack = 24): Promise<NetWorthHistoryPoint[]> {
  const db = getDb();
  const rows = await db.execute<{ month: string; net_worth: string }>(sql`
    with months as (
      select to_char(date_trunc('month', d), 'YYYY-MM') as month
      from generate_series(
        date_trunc('month', now()) - (${monthsBack}::int || ' months')::interval,
        date_trunc('month', now()),
        '1 month'
      ) as d
    ),
    latest_per_asset_month as (
      select
        m.month,
        s.asset_id,
        (array_agg(s.current_value order by s.snapshot_date desc))[1] as current_value
      from months m
      join ${schema.assetValueSnapshots} s
        on to_char(date_trunc('month', s.snapshot_date), 'YYYY-MM') <= m.month
      group by m.month, s.asset_id
    )
    select month, coalesce(sum(current_value), 0) as net_worth
    from latest_per_asset_month
    group by month
    order by month
  `);

  return rows.map((row) => ({ month: row.month, netWorth: toNumber(row.net_worth) }));
}

export interface NetWorthHistoryExactPoint {
  snapshotDate: string; // YYYY-MM-DD
  netWorth: number;
}

/**
 * One point per DISTINCT snapshot date (not month-bucketed) — for charting
 * historical wealth with real, irregular statement dates instead of
 * assuming every record is exactly one month apart.
 *
 * Same source='import' + MIN_ASSETS_FOR_STATEMENT_DATE filter as
 * getLatestSnapshotDates — a single-asset touch (manual edit or a bank
 * recompute) would otherwise show up as a full-net-worth data point using
 * just that one asset's value, faking a cliff in the chart.
 */
export async function getNetWorthHistoryExact(): Promise<NetWorthHistoryExactPoint[]> {
  const db = getDb();
  const rows = await db.execute<{ snapshot_date: string; total: string }>(sql`
    select snapshot_date, coalesce(sum(current_value), 0) as total
    from ${schema.assetValueSnapshots}
    where source = 'import'
    group by snapshot_date
    having count(distinct asset_id) >= ${MIN_ASSETS_FOR_STATEMENT_DATE}
    order by snapshot_date
  `);

  return rows.map((row) => ({ snapshotDate: row.snapshot_date, netWorth: toNumber(row.total) }));
}

// --- Module 5: Expense & Income Dashboard -----------------------------------

export interface MonthlyIncomeExpense {
  month: string;
  income: number;
  expense: number;
  net: number;
}

export async function getMonthlyIncomeExpense(monthsBack = 12): Promise<MonthlyIncomeExpense[]> {
  const db = getDb();
  const rows = await db.execute<{ month: string; income: string; expense: string }>(sql`
    select
      to_char(date_trunc('month', ${schema.transactions.transactionDate}), 'YYYY-MM') as month,
      coalesce(sum(${schema.transactions.moneyIn}) filter (where ${schema.categories.kind} = 'income'), 0) as income,
      coalesce(sum(${schema.transactions.moneyOut}) filter (where ${schema.categories.kind} = 'expense'), 0) as expense
    from ${schema.transactions}
    left join ${schema.categories} on ${schema.categories.id} = ${schema.transactions.categoryId}
    where ${schema.transactions.transactionDate} >= date_trunc('month', now()) - (${monthsBack}::int || ' months')::interval
    group by month
    order by month
  `);

  return rows.map((row) => {
    const income = toNumber(row.income);
    const expense = toNumber(row.expense);
    return { month: row.month, income, expense, net: income - expense };
  });
}

export interface CategoryBreakdown {
  categoryKey: string;
  categoryLabel: string;
  total: number;
}

export async function getExpenseByCategory(month: string): Promise<CategoryBreakdown[]> {
  const db = getDb();
  const rows = await db
    .select({
      categoryKey: schema.categories.key,
      categoryLabel: schema.categories.label,
      total: sql<string>`coalesce(sum(${schema.transactions.moneyOut}), 0)`,
    })
    .from(schema.transactions)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.transactions.categoryId))
    .where(
      and(
        eq(schema.categories.kind, "expense"),
        sql`to_char(${schema.transactions.transactionDate}, 'YYYY-MM') = ${month}`
      )
    )
    .groupBy(schema.categories.key, schema.categories.label)
    .orderBy(desc(sql`sum(${schema.transactions.moneyOut})`));

  return rows.map((row) => ({ ...row, total: toNumber(row.total) }));
}

export async function getIncomeBySource(month: string): Promise<CategoryBreakdown[]> {
  const db = getDb();
  const rows = await db
    .select({
      categoryKey: schema.categories.key,
      categoryLabel: schema.categories.label,
      total: sql<string>`coalesce(sum(${schema.transactions.moneyIn}), 0)`,
    })
    .from(schema.transactions)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.transactions.categoryId))
    .where(
      and(
        eq(schema.categories.kind, "income"),
        sql`to_char(${schema.transactions.transactionDate}, 'YYYY-MM') = ${month}`
      )
    )
    .groupBy(schema.categories.key, schema.categories.label)
    .orderBy(desc(sql`sum(${schema.transactions.moneyIn})`));

  return rows.map((row) => ({ ...row, total: toNumber(row.total) }));
}

export interface LargestTransaction {
  id: string;
  transactionDate: string;
  description: string;
  amount: number;
}

export async function getLargestTransactions(month: string, limit = 10): Promise<LargestTransaction[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.transactions.id,
      transactionDate: schema.transactions.transactionDate,
      description: schema.transactions.description,
      moneyOut: schema.transactions.moneyOut,
    })
    .from(schema.transactions)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.transactions.categoryId))
    .where(
      and(
        ne(schema.categories.kind, "transfer"),
        sql`to_char(${schema.transactions.transactionDate}, 'YYYY-MM') = ${month}`
      )
    )
    .orderBy(desc(schema.transactions.moneyOut))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    transactionDate: row.transactionDate,
    description: row.description,
    amount: toNumber(row.moneyOut),
  }));
}

/** Counterparty + amount bucket appearing in >=3 of the trailing 6 months = likely recurring. */
export async function getRecurringExpenses(): Promise<{ description: string; averageAmount: number; monthsSeen: number }[]> {
  const db = getDb();
  const rows = await db.execute<{ description: string; average_amount: string; months_seen: string }>(sql`
    select
      lower(trim(${schema.transactions.description})) as description,
      avg(${schema.transactions.moneyOut}) as average_amount,
      count(distinct to_char(${schema.transactions.transactionDate}, 'YYYY-MM')) as months_seen
    from ${schema.transactions}
    join ${schema.categories} on ${schema.categories.id} = ${schema.transactions.categoryId}
    where ${schema.categories.kind} = 'expense'
      and ${schema.transactions.transactionDate} >= date_trunc('month', now()) - interval '6 months'
    group by lower(trim(${schema.transactions.description}))
    having count(distinct to_char(${schema.transactions.transactionDate}, 'YYYY-MM')) >= 3
    order by months_seen desc, average_amount desc
  `);

  return rows.map((row) => ({
    description: row.description,
    averageAmount: toNumber(row.average_amount),
    monthsSeen: parseInt(row.months_seen, 10),
  }));
}

export async function getBusinessVsPersonalSplit(month: string): Promise<{ business: number; personal: number }> {
  const db = getDb();
  const [row] = await db
    .select({
      business: sql<string>`coalesce(sum(${schema.transactions.moneyOut}) filter (where ${schema.transactions.isBusiness}), 0)`,
      personal: sql<string>`coalesce(sum(${schema.transactions.moneyOut}) filter (where not ${schema.transactions.isBusiness}), 0)`,
    })
    .from(schema.transactions)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.transactions.categoryId))
    .where(
      and(
        eq(schema.categories.kind, "expense"),
        sql`to_char(${schema.transactions.transactionDate}, 'YYYY-MM') = ${month}`
      )
    );

  return { business: toNumber(row?.business), personal: toNumber(row?.personal) };
}

// --- Module 6: Investment Dashboard ------------------------------------------

/** Physical/alternative holdings that behave like investments even though they sit in the "other" asset category. */
const INVESTMENT_SUBCATEGORIES = new Set(["Gold", "Property"]);

export interface InvestmentSummary {
  currentValue: number;
  /** null when cost basis isn't known for at least one holding — never coerced to 0, which would fabricate a gain. */
  costBasis: number | null;
  unrealizedGain: number | null;
  roi: number | null;
  allocation: { name: string; subcategory: string; currentValue: number; costBasis: number | null }[];
}

/**
 * Investment holdings only — business assets (PWN, Baswara, BoothyCall, etc.) are a
 * separate portfolio and must not be blended into "investment" totals here; the
 * Investment Dashboard is specifically about the investment-category assets (plus
 * the Gold/Property carve-out) per product decision, not private-equity-style stakes.
 */
export async function getInvestmentSummary(): Promise<InvestmentSummary> {
  const db = getDb();
  const rows = await db
    .select({
      name: schema.assets.name,
      subcategory: schema.assets.subcategory,
      currentValue: schema.assets.currentValue,
      purchaseValue: schema.assets.purchaseValue,
      category: schema.assets.category,
    })
    .from(schema.assets)
    .where(eq(schema.assets.isActive, true));

  const investmentAssets = rows.filter(
    (row) => row.category === "investment" || INVESTMENT_SUBCATEGORIES.has(row.subcategory)
  );

  let currentValue = 0;
  let costBasis = 0;
  let costBasisKnownForAll = investmentAssets.length > 0;

  const allocation = investmentAssets.map((asset) => {
    const value = toNumber(asset.currentValue);
    currentValue += value;
    const assetCostBasis = asset.purchaseValue !== null ? toNumber(asset.purchaseValue) : null;
    if (assetCostBasis === null) costBasisKnownForAll = false;
    else costBasis += assetCostBasis;
    return { name: asset.name, subcategory: asset.subcategory, currentValue: value, costBasis: assetCostBasis };
  });

  const resolvedCostBasis = costBasisKnownForAll ? costBasis : null;
  const unrealizedGain = resolvedCostBasis !== null ? currentValue - resolvedCostBasis : null;
  const roi = resolvedCostBasis !== null && resolvedCostBasis > 0 ? unrealizedGain! / resolvedCostBasis : null;

  return { currentValue, costBasis: resolvedCostBasis, unrealizedGain, roi, allocation };
}

// --- Module 7: Cashflow Dashboard ---------------------------------------------

export interface CashflowSummary {
  beginningCash: number;
  moneyIn: number;
  moneyOut: number;
  endingCash: number;
  savingRate: number | null;
  investmentRate: number | null;
  burnRate: number;
  runwayMonths: number | null;
  emergencyFundRatio: number | null;
}

export async function getCashflowSummary(month: string): Promise<CashflowSummary> {
  const db = getDb();

  const [flows] = await db
    .select({
      moneyIn: sql<string>`coalesce(sum(${schema.transactions.moneyIn}) filter (where ${schema.categories.kind} != 'transfer'), 0)`,
      moneyOut: sql<string>`coalesce(sum(${schema.transactions.moneyOut}) filter (where ${schema.categories.kind} != 'transfer'), 0)`,
      investmentOut: sql<string>`coalesce(sum(${schema.transactions.moneyOut}) filter (where ${schema.transactions.isInvestment}), 0)`,
    })
    .from(schema.transactions)
    .leftJoin(schema.categories, eq(schema.categories.id, schema.transactions.categoryId))
    .where(sql`to_char(${schema.transactions.transactionDate}, 'YYYY-MM') = ${month}`);

  const moneyIn = toNumber(flows?.moneyIn);
  const moneyOut = toNumber(flows?.moneyOut);
  const investmentOut = toNumber(flows?.investmentOut);

  const wealth = await getWealthSummary();
  const endingCash = wealth.cashPosition;
  const beginningCash = endingCash - moneyIn + moneyOut;

  const savingRate = moneyIn > 0 ? (moneyIn - moneyOut) / moneyIn : null;
  const investmentRate = moneyIn > 0 ? investmentOut / moneyIn : null;
  const burnRate = Math.max(0, moneyOut - moneyIn);
  const runwayMonths = burnRate > 0 ? endingCash / burnRate : null;

  const monthlyExpenseAverage = await getMonthlyIncomeExpense(6);
  const avgExpense =
    monthlyExpenseAverage.length > 0
      ? monthlyExpenseAverage.reduce((sum, row) => sum + row.expense, 0) / monthlyExpenseAverage.length
      : 0;
  const emergencyFundRatio = avgExpense > 0 ? endingCash / avgExpense : null;

  return {
    beginningCash,
    moneyIn,
    moneyOut,
    endingCash,
    savingRate,
    investmentRate,
    burnRate,
    runwayMonths,
    emergencyFundRatio,
  };
}
