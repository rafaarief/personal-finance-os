import { and, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { currentMonthString, lastNMonths } from "@/lib/format/date";

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
  receivableValue: number;
  vehicleValue: number;
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
  let receivableValue = 0;
  let vehicleValue = 0;
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
    if (row.category === "receivable") receivableValue += value;
    if (row.category === "vehicle") vehicleValue += value;
  }

  return {
    netWorth,
    liquidAssets,
    nonLiquidAssets,
    cashPosition,
    investmentValue,
    businessValue,
    otherValue,
    receivableValue,
    vehicleValue,
    allocation,
  };
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
 * as a real "as of this date" statement rather than a partial re-import or
 * correction touching only a handful of accounts. Raised from 3 to 6 after
 * 2026-07-31 (a 3-account BCA/Bank Jago/Mandiri-only cash re-import, ~371M)
 * got picked up as "the latest statement" and made the dashboard show ~300M
 * net worth instead of the real ~870M+ from the 2026-07-01 full statement —
 * same failure mode as 2024-12-14 (4 assets, investment+business+vehicle
 * only, no cash) had already caused unnoticed. Every genuine full statement
 * on record covers >=6 assets across multiple categories; every known
 * partial-import artifact covers <=4. This is still a heuristic, not a
 * schema guarantee — a dedicated "statement" concept distinct from ad-hoc
 * snapshots would be the more robust long-term fix if a legitimate statement
 * ever reports fewer than this many accounts.
 */
const MIN_ASSETS_FOR_STATEMENT_DATE = 6;

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
 * Wealth summary "as of" a specific date — each active asset contributes its
 * own most recent snapshot ON OR BEFORE that date (carry-forward), same
 * pattern as getCategoryValueHistory's `filled` CTE. An asset with NO
 * snapshot at or before the date correctly contributes nothing (never
 * fabricated), but an asset last touched earlier keeps its last known value
 * instead of silently dropping to zero just because nobody happened to touch
 * it again on this exact date. Deliberately NOT an exact snapshot_date match
 * — that earlier approach made a single-account touch (e.g. one bank
 * recompute after a transaction import) starve out every other asset from
 * "today's" total the moment its date coincided with 2+ other unrelated
 * single-account touches (see MIN_ASSETS_FOR_STATEMENT_DATE's own caveat).
 */
export async function getWealthSummaryAsOf(snapshotDate: string): Promise<WealthSummary> {
  const db = getDb();
  const rows = await db.execute<{ category: string; total: string }>(sql`
    with active_assets as (
      select id, category from ${schema.assets} where is_active = true
    ),
    latest_per_asset as (
      select aa.category, f.current_value
      from active_assets aa
      join lateral (
        select s.current_value
        from ${schema.assetValueSnapshots} s
        where s.asset_id = aa.id and s.snapshot_date <= ${snapshotDate}
        order by s.snapshot_date desc
        limit 1
      ) f on true
    )
    select category, coalesce(sum(current_value), 0) as total
    from latest_per_asset
    group by category
  `);

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

// --- Module 6a: Capital Market / Business valuation (per-asset, individually editable) ---

export interface LatestAssetValue {
  assetId: string;
  name: string;
  subcategory: string;
  currentValue: number;
  /** Null — never 0 — when this asset's capital/book value isn't known yet. */
  capitalContributed: number | null;
  snapshotDate: string;
  notes: string | null;
  valuationMethod: string | null;
}

/**
 * Each active asset in `category`'s OWN most recent snapshot, regardless of
 * whether other assets in the same category were touched on that date. This
 * is what makes an individual "Edit Current Value" on e.g. just Stockbit show
 * up immediately without waiting for a full re-statement of every account —
 * unlike the Cash section, which still keys off one shared statement date.
 */
export async function getLatestAssetValues(category: string): Promise<LatestAssetValue[]> {
  const db = getDb();
  const rows = await db.execute<{
    asset_id: string;
    name: string;
    subcategory: string;
    snapshot_date: string;
    current_value: string;
    capital_contributed: string | null;
    notes: string | null;
    valuation_method: string | null;
  }>(sql`
    select distinct on (s.asset_id)
      s.asset_id, a.name, a.subcategory, s.snapshot_date, s.current_value, s.capital_contributed, s.notes, s.valuation_method
    from ${schema.assetValueSnapshots} s
    join ${schema.assets} a on a.id = s.asset_id
    where a.category = ${category} and a.is_active = true
    order by s.asset_id, s.snapshot_date desc, s.created_at desc
  `);

  // Carry capital forward when the LATEST row itself didn't set it — e.g. an
  // edit made through the generic Asset form (which only ever touches
  // current_value) must not blank out capital that a prior snapshot recorded.
  const carried = await Promise.all(
    rows.map(async (row) => {
      if (row.capital_contributed !== null) return row.capital_contributed;
      const db2 = getDb();
      const [prior] = await db2
        .select({ capitalContributed: schema.assetValueSnapshots.capitalContributed })
        .from(schema.assetValueSnapshots)
        .where(
          and(
            eq(schema.assetValueSnapshots.assetId, row.asset_id),
            lte(schema.assetValueSnapshots.snapshotDate, row.snapshot_date),
            isNotNull(schema.assetValueSnapshots.capitalContributed)
          )
        )
        .orderBy(desc(schema.assetValueSnapshots.snapshotDate))
        .limit(1);
      return prior?.capitalContributed ?? null;
    })
  );

  return rows
    .map((row, index) => ({
      assetId: row.asset_id,
      name: row.name,
      subcategory: row.subcategory,
      currentValue: toNumber(row.current_value),
      capitalContributed: carried[index] !== null ? toNumber(carried[index]!) : null,
      snapshotDate: row.snapshot_date,
      notes: row.notes,
      valuationMethod: row.valuation_method,
    }))
    .sort((a, b) => b.currentValue - a.currentValue);
}

export interface AssetValueHistoryPoint {
  snapshotDate: string;
  currentValue: number;
}

/** Every recorded snapshot for one asset, oldest first — the source for the small history chart in the edit modal. Every prior value stays exactly as recorded; editing only ever adds or updates the snapshot for the date being edited. */
export async function getAssetValueHistory(assetId: string): Promise<AssetValueHistoryPoint[]> {
  const db = getDb();
  const rows = await db
    .select({ snapshotDate: schema.assetValueSnapshots.snapshotDate, currentValue: schema.assetValueSnapshots.currentValue })
    .from(schema.assetValueSnapshots)
    .where(eq(schema.assetValueSnapshots.assetId, assetId))
    .orderBy(schema.assetValueSnapshots.snapshotDate);

  return rows.map((row) => ({ snapshotDate: row.snapshotDate, currentValue: toNumber(row.currentValue) }));
}

export interface CategoryAccount extends LatestAssetValue {
  gainLoss: number | null;
  returnPct: number | null;
}

export interface CategorySummary {
  /** Most recent snapshot date across all accounts in this category — accounts update independently, so this is a "freshest as of" label, not a shared statement date. */
  asOfDate: string | null;
  currentValue: number;
  /** Null when NO account has known capital yet; sum of only the known accounts when some (not all) do. */
  capitalContributed: number | null;
  /** Only ever set when EVERY account's capital is known — a mixed known/unknown sum can't safely net to one gain figure. */
  gainLoss: number | null;
  returnPct: number | null;
  /** True when some accounts have known capital and others don't — surfaced in the UI as "Partial data". */
  partialData: boolean;
  accounts: CategoryAccount[];
}

/**
 * Capital Market / Business summary: current value vs. capital (contributed /
 * book value), each read independently per asset so wealth growth from a
 * fresh capital injection is never confused with valuation performance.
 * Capital is only ever carried forward from a prior snapshot by
 * updateAssetCurrentValue — nothing here derives it from current_value deltas.
 */
export async function getCategorySummary(category: string): Promise<CategorySummary> {
  const rows = await getLatestAssetValues(category);

  const accounts: CategoryAccount[] = rows.map((row) => {
    const gainLoss = row.capitalContributed !== null ? row.currentValue - row.capitalContributed : null;
    const returnPct =
      row.capitalContributed !== null && row.capitalContributed > 0 ? (gainLoss! / row.capitalContributed) * 100 : null;
    return { ...row, gainLoss, returnPct };
  });

  const currentValue = accounts.reduce((sum, a) => sum + a.currentValue, 0);
  const knownAccounts = accounts.filter((a) => a.capitalContributed !== null);
  const allKnown = accounts.length > 0 && knownAccounts.length === accounts.length;
  const noneKnown = knownAccounts.length === 0;
  const partialData = !allKnown && !noneKnown;

  const capitalContributed = noneKnown ? null : knownAccounts.reduce((sum, a) => sum + a.capitalContributed!, 0);
  const gainLoss = allKnown ? currentValue - capitalContributed! : null;
  const returnPct = allKnown && capitalContributed! > 0 ? (gainLoss! / capitalContributed!) * 100 : null;

  const asOfDate = accounts.reduce<string | null>(
    (latest, a) => (latest === null || a.snapshotDate > latest ? a.snapshotDate : latest),
    null
  );

  return { asOfDate, currentValue, capitalContributed, gainLoss, returnPct, partialData, accounts };
}

export interface CategoryHistoryPoint {
  snapshotDate: string;
  currentValue: number;
  /** Null for any date where at least one included account's capital is unknown as of that date — never partially summed into a misleading line. */
  capitalContributed: number | null;
}

/**
 * One point per distinct snapshot date recorded for this category, with each
 * asset's value forward-filled from its own most recent snapshot at or
 * before that date (accounts update on their own schedule, not in lockstep
 * "statements"). This is what makes the Capital/Business vs. Current Value
 * chart diverge smoothly as individual accounts get edited, instead of
 * dipping every time only one account has a snapshot on a given day.
 */
export async function getCategoryValueHistory(category: string): Promise<CategoryHistoryPoint[]> {
  const db = getDb();
  const rows = await db.execute<{
    snapshot_date: string;
    current_value: string | null;
    capital_contributed: string | null;
    known_count: string;
    total_count: string;
  }>(sql`
    with dates as (
      select distinct s.snapshot_date
      from ${schema.assetValueSnapshots} s
      join ${schema.assets} a on a.id = s.asset_id
      where a.category = ${category}
    ),
    active_assets as (
      select id from ${schema.assets} where category = ${category} and is_active = true
    ),
    filled as (
      select d.snapshot_date, aa.id as asset_id, f.current_value,
        coalesce(f.capital_contributed, cap.capital_contributed) as capital_contributed
      from dates d
      cross join active_assets aa
      join lateral (
        select s2.current_value, s2.capital_contributed
        from ${schema.assetValueSnapshots} s2
        where s2.asset_id = aa.id and s2.snapshot_date <= d.snapshot_date
        order by s2.snapshot_date desc
        limit 1
      ) f on true
      left join lateral (
        select s3.capital_contributed
        from ${schema.assetValueSnapshots} s3
        where s3.asset_id = aa.id and s3.snapshot_date <= d.snapshot_date and s3.capital_contributed is not null
        order by s3.snapshot_date desc
        limit 1
      ) cap on true
    )
    select
      snapshot_date,
      sum(current_value) as current_value,
      sum(capital_contributed) as capital_contributed,
      count(*) filter (where capital_contributed is not null) as known_count,
      count(*) as total_count
    from filled
    group by snapshot_date
    order by snapshot_date
  `);

  return rows.map((row) => ({
    snapshotDate: row.snapshot_date,
    currentValue: toNumber(row.current_value),
    capitalContributed: row.known_count === row.total_count ? toNumber(row.capital_contributed) : null,
  }));
}

export const getCapitalMarketSummary = () => getCategorySummary("investment");
export const getCapitalMarketHistory = () => getCategoryValueHistory("investment");
export const getBusinessSummary = () => getCategorySummary("business");
export const getBusinessValueHistory = () => getCategoryValueHistory("business");

export interface NetWorthSummary {
  netWorth: number;
  liquidAssets: number;
  nonLiquidAssets: number;
  cashPosition: number;
  capitalMarketValue: number;
  businessValue: number;
  otherAssetsValue: number;
  receivableValue: number;
  vehicleValue: number;
  /** Most recent update across all cash accounts — each account now updates independently, so this is a "freshest as of" label, not one shared statement date. */
  cashAsOfDate: string | null;
}

function sumCurrentValue(rows: LatestAssetValue[]): number {
  return rows.reduce((sum, row) => sum + row.currentValue, 0);
}

function latestDateOf(rows: LatestAssetValue[]): string | null {
  return rows.reduce<string | null>((latest, row) => (latest === null || row.snapshotDate > latest ? row.snapshotDate : latest), null);
}

/**
 * Net worth using every asset class's own freshest current value — Cash,
 * Receivables, and Vehicle now read the same way Capital Market and Business
 * already did: each account's own latest snapshot, not one shared statement
 * date. That's what makes an individual "Edit Current Value" on e.g. just
 * BCA show up in Net Worth immediately, without waiting for a full
 * re-statement of every other account. Capital/book value is never
 * substituted for current value here.
 */
export async function getNetWorthSummary(): Promise<NetWorthSummary> {
  const [cash, capitalMarket, business, receivable, vehicle, other] = await Promise.all([
    getLatestAssetValues("cash"),
    getCategorySummary("investment"),
    getCategorySummary("business"),
    getLatestAssetValues("receivable"),
    getLatestAssetValues("vehicle"),
    getLatestAssetValues("other"),
  ]);

  const cashPosition = sumCurrentValue(cash);
  const capitalMarketValue = capitalMarket.currentValue;
  const businessValue = business.currentValue;
  const receivableValue = sumCurrentValue(receivable);
  const vehicleValue = sumCurrentValue(vehicle);
  const otherAssetsValue = sumCurrentValue(other) + receivableValue + vehicleValue;

  const liquidAssets = cashPosition + capitalMarketValue;
  const nonLiquidAssets = businessValue + otherAssetsValue;

  return {
    netWorth: liquidAssets + nonLiquidAssets,
    liquidAssets,
    nonLiquidAssets,
    cashPosition,
    capitalMarketValue,
    businessValue,
    otherAssetsValue,
    receivableValue,
    vehicleValue,
    cashAsOfDate: latestDateOf(cash),
  };
}

// --- Module 5: Expense & Income Dashboard -----------------------------------

export interface MonthlyIncomeExpense {
  month: string;
  income: number;
  expense: number;
  net: number;
}

/**
 * Cash-movement based, not category based — keyed off is_internal_transfer
 * directly so an un-reviewed/uncategorized import still shows up in the
 * trend instead of silently reading as Rp0 for that month (see
 * getCashflowSummary for the same fix and why).
 */
export async function getMonthlyIncomeExpense(monthsBack = 12): Promise<MonthlyIncomeExpense[]> {
  const db = getDb();
  const rows = await db.execute<{ month: string; income: string; expense: string }>(sql`
    select
      to_char(date_trunc('month', ${schema.transactions.transactionDate}), 'YYYY-MM') as month,
      coalesce(sum(${schema.transactions.moneyIn}) filter (where not ${schema.transactions.isInternalTransfer}), 0) as income,
      coalesce(sum(${schema.transactions.moneyOut}) filter (where not ${schema.transactions.isInternalTransfer}), 0) as expense
    from ${schema.transactions}
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
    .where(
      and(
        eq(schema.transactions.isInternalTransfer, false),
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

/** Counterparty + amount bucket appearing in >=3 of the trailing 6 months = likely recurring. Cash-movement based (see getCashflowSummary) — not gated on categorization. */
export async function getRecurringExpenses(): Promise<{ description: string; averageAmount: number; monthsSeen: number }[]> {
  const db = getDb();
  const rows = await db.execute<{ description: string; average_amount: string; months_seen: string }>(sql`
    select
      lower(trim(${schema.transactions.description})) as description,
      avg(${schema.transactions.moneyOut}) as average_amount,
      count(distinct to_char(${schema.transactions.transactionDate}, 'YYYY-MM')) as months_seen
    from ${schema.transactions}
    where not ${schema.transactions.isInternalTransfer}
      and ${schema.transactions.moneyOut} is not null
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
    .where(
      and(
        eq(schema.transactions.isInternalTransfer, false),
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

/**
 * Total cash (sum of each active cash asset's own latest snapshot at or
 * before `asOfDate`, forward-filled per asset) — the real, known balance at
 * a point in time, not today's live figure. This is what lets Opening Cash
 * for a month equal the actual balance the month started with, instead of a
 * number back-solved from today regardless of which month is being viewed.
 *
 * Inclusive (`<=`), not strictly-before — a statement dated exactly on the
 * 1st (e.g. "2026-07-01") IS that month's opening balance; excluding it (an
 * earlier bug here used `<`) skipped straight past the real reported balance
 * to whatever stale value predated it, which is why Opening Cash used to
 * come out lower than the actual statement.
 */
async function getCashBalanceAsOf(asOfDate: string, optionalAssetId?: string): Promise<number> {
  const db = getDb();
  const rows = await db.execute<{ total: string }>(sql`
    select coalesce(sum(f.current_value), 0) as total
    from (select id from ${schema.assets} where category = 'cash' and is_active = true ${optionalAssetId ? sql`and id = ${optionalAssetId}` : sql``}) a
    join lateral (
      select s.current_value
      from ${schema.assetValueSnapshots} s
      where s.asset_id = a.id and s.snapshot_date <= ${asOfDate}
      order by s.snapshot_date desc
      limit 1
    ) f on true
  `);
  return toNumber(rows[0]?.total);
}

/**
 * `cashAssetId` scopes the whole statement to one cash account (e.g. "BCA
 * only") instead of every cash account combined — both the flows (via the
 * transaction's bank account being linked to that asset) and the Opening/
 * Ending balance. Omit it for "All".
 */
export async function getCashflowSummary(month: string, cashAssetId?: string): Promise<CashflowSummary> {
  const db = getDb();

  // Deliberately keyed off transactions.is_internal_transfer, NOT categories.kind — an
  // uncategorized transaction (category_id null) still moved real cash and must count
  // here. Filtering on a LEFT JOINed category's kind instead used to silently exclude
  // every uncategorized row from Money In/Out (NULL != 'transfer' is NULL, not true,
  // so the FILTER dropped it) — a whole month of un-reviewed imports would show Rp0.
  const [flows] = await db
    .select({
      moneyIn: sql<string>`coalesce(sum(${schema.transactions.moneyIn}) filter (where not ${schema.transactions.isInternalTransfer}), 0)`,
      moneyOut: sql<string>`coalesce(sum(${schema.transactions.moneyOut}) filter (where not ${schema.transactions.isInternalTransfer}), 0)`,
      investmentOut: sql<string>`coalesce(sum(${schema.transactions.moneyOut}) filter (where ${schema.transactions.isInvestment}), 0)`,
    })
    .from(schema.transactions)
    .innerJoin(schema.bankAccounts, eq(schema.bankAccounts.id, schema.transactions.bankAccountId))
    .where(
      and(
        sql`to_char(${schema.transactions.transactionDate}, 'YYYY-MM') = ${month}`,
        cashAssetId ? eq(schema.bankAccounts.linkedAssetId, cashAssetId) : undefined
      )
    );

  const moneyIn = toNumber(flows?.moneyIn);
  const moneyOut = toNumber(flows?.moneyOut);
  const investmentOut = toNumber(flows?.investmentOut);

  // Opening Cash(month) = the real balance the month actually started with (chains to
  // the prior month's real end-of-month balance); Ending Cash(month) = Opening + this
  // month's P&L — computed forward, never read from today's live balance regardless of
  // which month is being viewed (that was the bug: every month used to show TODAY's
  // cash position as "Ending Cash").
  const beginningCash = await getCashBalanceAsOf(`${month}-01`, cashAssetId);
  const endingCash = beginningCash + moneyIn - moneyOut;

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

export interface CashAccountOption {
  id: string;
  name: string;
}

/** Active cash accounts (BCA, BNI, Bank Jago, Mandiri, e-wallets, ...) — populates the Cashflow statement's account filter. */
export async function getCashAccountsList(): Promise<CashAccountOption[]> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.assets.id, name: schema.assets.name })
    .from(schema.assets)
    .where(and(eq(schema.assets.category, "cash"), eq(schema.assets.isActive, true)))
    .orderBy(schema.assets.name);
  return rows;
}

export interface CashReconciliation {
  month: string;
  cashAssetId: string;
  /** Opening + tracked Money In/Out for this account this month. */
  computedEnding: number;
  /** The account's own real balance as of the start of next month, from its latest snapshot — null if nothing's been recorded for/after that date. */
  actualNextOpening: number | null;
  /**
   * actualNextOpening - computedEnding. Positive => unexplained cash appeared
   * (record as Adjustment Income); negative => cash is missing versus what
   * the ledger implies (record as Adjustment Expense). Null when
   * actualNextOpening is unknown — never guessed.
   */
  gap: number | null;
}

function nextMonthStart(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 1));
  return date.toISOString().slice(0, 10);
}

/**
 * How far a month's tracked transactions (Opening + Money In - Money Out)
 * land from the account's own next real statement balance — the same
 * "chain" getCashflowSummary computes, surfaced explicitly so a persistent
 * gap can be recorded as a visible Adjustment entry instead of silently
 * carried forward forever.
 */
export async function getCashReconciliation(month: string, cashAssetId: string): Promise<CashReconciliation> {
  const summary = await getCashflowSummary(month, cashAssetId);
  const nextStart = nextMonthStart(month);

  const db = getDb();
  const [hasFutureData] = await db
    .select({ id: schema.assetValueSnapshots.id })
    .from(schema.assetValueSnapshots)
    .where(and(eq(schema.assetValueSnapshots.assetId, cashAssetId), gte(schema.assetValueSnapshots.snapshotDate, nextStart)))
    .limit(1);

  const actualNextOpening = hasFutureData ? await getCashBalanceAsOf(nextStart, cashAssetId) : null;
  const gap = actualNextOpening !== null ? actualNextOpening - summary.endingCash : null;

  return { month, cashAssetId, computedEnding: summary.endingCash, actualNextOpening, gap };
}

export interface CashflowTransactionRow {
  id: string;
  transactionDate: string;
  description: string;
  counterparty: string | null;
  bankAccountName: string;
  moneyIn: number | null;
  moneyOut: number | null;
  categoryId: string | null;
  categoryKey: string | null;
  categoryLabel: string | null;
  categoryKind: "income" | "expense" | "transfer" | null;
  isBusiness: boolean;
  isInvestment: boolean;
  isInternalTransfer: boolean;
}

/** Every transaction in the given month, for the unified Cashflow page's transaction table — replaces the standalone /transactions full-history query with a month-scoped one. */
export async function getTransactionsForMonth(month: string): Promise<CashflowTransactionRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.transactions.id,
      transactionDate: schema.transactions.transactionDate,
      description: schema.transactions.description,
      counterparty: schema.transactions.counterparty,
      bankAccountName: schema.bankAccounts.accountName,
      moneyIn: schema.transactions.moneyIn,
      moneyOut: schema.transactions.moneyOut,
      categoryId: schema.transactions.categoryId,
      categoryKey: schema.categories.key,
      categoryLabel: schema.categories.label,
      categoryKind: schema.categories.kind,
      isBusiness: schema.transactions.isBusiness,
      isInvestment: schema.transactions.isInvestment,
      isInternalTransfer: schema.transactions.isInternalTransfer,
    })
    .from(schema.transactions)
    .innerJoin(schema.bankAccounts, eq(schema.bankAccounts.id, schema.transactions.bankAccountId))
    .leftJoin(schema.categories, eq(schema.categories.id, schema.transactions.categoryId))
    .where(sql`to_char(${schema.transactions.transactionDate}, 'YYYY-MM') = ${month}`)
    .orderBy(desc(schema.transactions.transactionDate));

  return rows.map((row) => ({
    ...row,
    moneyIn: row.moneyIn !== null ? toNumber(row.moneyIn) : null,
    moneyOut: row.moneyOut !== null ? toNumber(row.moneyOut) : null,
  }));
}

/**
 * Options for the Cashflow month selector, most recent first: the trailing 13
 * months from today (so the current month — and next month, once it starts —
 * is always pickable even before any transaction has been recorded for it)
 * unioned with every "YYYY-MM" that actually has a transaction (so older
 * imported history, e.g. 2023-2025, stays reachable too). Deliberately NOT
 * just "distinct months with data" — that alone would make an about-to-start
 * month impossible to select until its first transaction lands.
 */
export async function getAvailableTransactionMonths(): Promise<string[]> {
  const db = getDb();
  const rows = await db.execute<{ month: string }>(sql`
    select distinct to_char(${schema.transactions.transactionDate}, 'YYYY-MM') as month
    from ${schema.transactions}
    order by month desc
  `);
  const dataMonths = rows.map((row) => row.month);
  const rollingWindow = lastNMonths(currentMonthString(), 13);

  return Array.from(new Set([...rollingWindow, ...dataMonths])).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}
