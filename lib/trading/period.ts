import type { TradeRow } from "./aggregates";

export const PERIOD_FILTERS = ["All Time", "This Month", "Last Month", "YTD", "Custom"] as const;
export type PeriodFilter = (typeof PERIOD_FILTERS)[number];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** [from, to] inclusive ISO dates, or nulls for "All Time" (no bound). Filters against buyDate — see getTrades for why. */
export function periodRange(filter: PeriodFilter, customFrom: string, customTo: string): { from: string | null; to: string | null } {
  const now = new Date();

  if (filter === "This Month") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    return { from: isoDate(from), to: isoDate(to) };
  }
  if (filter === "Last Month") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    return { from: isoDate(from), to: isoDate(to) };
  }
  if (filter === "YTD") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return { from: isoDate(from), to: isoDate(now) };
  }
  if (filter === "Custom") {
    return { from: customFrom || null, to: customTo || null };
  }
  return { from: null, to: null };
}

export function filterTradesByPeriod(trades: TradeRow[], filter: PeriodFilter, customFrom: string, customTo: string): TradeRow[] {
  const { from, to } = periodRange(filter, customFrom, customTo);
  if (!from && !to) return trades;
  return trades.filter((t) => (!from || t.buyDate >= from) && (!to || t.buyDate <= to));
}
