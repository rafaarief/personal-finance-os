/**
 * Pure, DB-free derivations over an already-fetched TradeRow[] — safe to
 * import from a Client Component (unlike lib/trading/aggregates.ts, which
 * pulls in the Postgres driver and can't be bundled for the browser). The
 * Trading page fetches all trades once server-side and the client filters/
 * derives from that in memory, so these run on both sides without a network
 * round-trip per filter change.
 */
import type { TradeRow, TradeCurrency } from "./aggregates";
import { isWinningTrade, isLosingTrade } from "./calculations";

export interface CurrencySummary {
  currency: TradeCurrency;
  tradesCount: number;
  capitalTraded: number;
  /** Null when no trade in this currency has closed yet — never fabricated as 0. */
  realizedPnl: number | null;
}

export interface TradeSummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  /** Among CLOSED trades only; null if none are closed yet. */
  winRate: number | null;
  averageReturnPct: number | null;
  bestTrade: TradeRow | null;
  worstTrade: TradeRow | null;
  /** Nominal capital/P&L, kept strictly separate per currency — never summed together. */
  byCurrency: CurrencySummary[];
}

/**
 * Win rate, average return, and best/worst trade are dimensionless (rates
 * and percentages), so — unlike capital/P&L — they're safe to combine across
 * IDR and USD trades. The nominal figures never are; see byCurrency.
 */
export function summarizeTrades(trades: TradeRow[]): TradeSummary {
  const closed = trades.filter((t) => t.status === "CLOSED" && t.realizedPnl !== null);
  const winning = closed.filter((t) => isWinningTrade(t.realizedPnl));
  const losing = closed.filter((t) => isLosingTrade(t.realizedPnl));

  const returnPcts = closed.map((t) => t.returnOnTradePct).filter((pct): pct is number => pct !== null);
  const averageReturnPct = returnPcts.length > 0 ? returnPcts.reduce((sum, pct) => sum + pct, 0) / returnPcts.length : null;

  const bestTrade = closed.reduce<TradeRow | null>((best, t) => {
    if (t.returnOnTradePct === null) return best;
    if (!best || best.returnOnTradePct === null || t.returnOnTradePct > best.returnOnTradePct) return t;
    return best;
  }, null);
  const worstTrade = closed.reduce<TradeRow | null>((worst, t) => {
    if (t.returnOnTradePct === null) return worst;
    if (!worst || worst.returnOnTradePct === null || t.returnOnTradePct < worst.returnOnTradePct) return t;
    return worst;
  }, null);

  const currencies: TradeCurrency[] = ["IDR", "USD"];
  const byCurrency: CurrencySummary[] = currencies.map((currency) => {
    const inCurrency = trades.filter((t) => t.currency === currency);
    const closedInCurrency = inCurrency.filter((t) => t.status === "CLOSED" && t.realizedPnl !== null);
    return {
      currency,
      tradesCount: inCurrency.length,
      capitalTraded: inCurrency.reduce((sum, t) => sum + t.marginAmount, 0),
      realizedPnl: closedInCurrency.length > 0 ? closedInCurrency.reduce((sum, t) => sum + (t.realizedPnl ?? 0), 0) : null,
    };
  });

  return {
    totalTrades: trades.length,
    winningTrades: winning.length,
    losingTrades: losing.length,
    winRate: closed.length > 0 ? (winning.length / closed.length) * 100 : null,
    averageReturnPct,
    bestTrade,
    worstTrade,
    byCurrency: byCurrency.filter((c) => c.tradesCount > 0),
  };
}

export interface CumulativePnlPoint {
  date: string;
  cumulativePnl: number;
}

/** Closed trades in one currency only, ordered by sell date, running total — never mixes currencies into one line. */
export function cumulativePnlSeries(trades: TradeRow[], currency: TradeCurrency): CumulativePnlPoint[] {
  const closed = trades
    .filter((t) => t.currency === currency && t.status === "CLOSED" && t.realizedPnl !== null && t.sellDate)
    .sort((a, b) => (a.sellDate! < b.sellDate! ? -1 : a.sellDate! > b.sellDate! ? 1 : 0));

  let running = 0;
  return closed.map((t) => {
    running += t.realizedPnl!;
    return { date: t.sellDate!, cumulativePnl: running };
  });
}

export interface TickerPerformance {
  ticker: string;
  trades: number;
  winRate: number | null;
  averageReturnPct: number | null;
  pnlByCurrency: { currency: TradeCurrency; total: number }[];
}

export function performanceByTicker(trades: TradeRow[]): TickerPerformance[] {
  const tickers = Array.from(new Set(trades.map((t) => t.ticker)));

  return tickers
    .map((ticker) => {
      const tickerTrades = trades.filter((t) => t.ticker === ticker);
      const closed = tickerTrades.filter((t) => t.status === "CLOSED" && t.realizedPnl !== null);
      const winning = closed.filter((t) => isWinningTrade(t.realizedPnl));
      const returnPcts = closed.map((t) => t.returnOnTradePct).filter((pct): pct is number => pct !== null);

      const pnlByCurrencyMap = new Map<TradeCurrency, number>();
      for (const t of closed) {
        pnlByCurrencyMap.set(t.currency, (pnlByCurrencyMap.get(t.currency) ?? 0) + (t.realizedPnl ?? 0));
      }

      return {
        ticker,
        trades: tickerTrades.length,
        winRate: closed.length > 0 ? (winning.length / closed.length) * 100 : null,
        averageReturnPct: returnPcts.length > 0 ? returnPcts.reduce((sum, pct) => sum + pct, 0) / returnPcts.length : null,
        pnlByCurrency: Array.from(pnlByCurrencyMap.entries()).map(([currency, total]) => ({ currency, total })),
      };
    })
    .sort((a, b) => b.trades - a.trades);
}

export interface MonthlyTradePerformance {
  month: string;
  trades: number;
  winRate: number | null;
  averageReturnPct: number | null;
  pnlByCurrency: { currency: TradeCurrency; total: number }[];
}

/** Grouped by sell month (when the trade's outcome was actually realized) — open trades with no sell date don't contribute a P&L row here. */
export function monthlyPerformance(trades: TradeRow[]): MonthlyTradePerformance[] {
  const closed = trades.filter((t) => t.status === "CLOSED" && t.realizedPnl !== null && t.sellDate);
  const months = Array.from(new Set(closed.map((t) => t.sellDate!.slice(0, 7)))).sort();

  return months.map((month) => {
    const monthTrades = closed.filter((t) => t.sellDate!.slice(0, 7) === month);
    const winning = monthTrades.filter((t) => isWinningTrade(t.realizedPnl));
    const returnPcts = monthTrades.map((t) => t.returnOnTradePct).filter((pct): pct is number => pct !== null);

    const pnlByCurrencyMap = new Map<TradeCurrency, number>();
    for (const t of monthTrades) {
      pnlByCurrencyMap.set(t.currency, (pnlByCurrencyMap.get(t.currency) ?? 0) + (t.realizedPnl ?? 0));
    }

    return {
      month,
      trades: monthTrades.length,
      winRate: monthTrades.length > 0 ? (winning.length / monthTrades.length) * 100 : null,
      averageReturnPct: returnPcts.length > 0 ? returnPcts.reduce((sum, pct) => sum + pct, 0) / returnPcts.length : null,
      pnlByCurrency: Array.from(pnlByCurrencyMap.entries()).map(([currency, total]) => ({ currency, total })),
    };
  });
}
