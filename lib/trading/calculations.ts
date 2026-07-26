/**
 * Pure trade math — no DB access, so it's cheap to unit test directly. Every
 * field is null (never 0) when its inputs aren't available yet (e.g. an OPEN
 * trade has no sell price), matching the rest of the app's rule: never
 * fabricate a number from missing data.
 */
export interface TradeCalcInput {
  buyPrice: number;
  sellPrice: number | null;
  quantity: number | null;
}

export interface TradeCalc {
  /** (Sell - Buy) / Buy * 100 — price move alone, independent of position size. */
  priceReturnPct: number | null;
  buyValue: number | null;
  sellValue: number | null;
  /** (Sell - Buy) * Quantity. */
  realizedPnl: number | null;
  /** Realized P&L / Buy Value * 100 — return on the capital actually deployed in this trade. */
  returnOnTradePct: number | null;
}

export function calculateTrade({ buyPrice, sellPrice, quantity }: TradeCalcInput): TradeCalc {
  const priceReturnPct = sellPrice !== null && buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : null;

  const buyValue = quantity !== null ? buyPrice * quantity : null;
  const sellValue = sellPrice !== null && quantity !== null ? sellPrice * quantity : null;
  const realizedPnl = sellPrice !== null && quantity !== null ? (sellPrice - buyPrice) * quantity : null;
  const returnOnTradePct = realizedPnl !== null && buyValue !== null && buyValue > 0 ? (realizedPnl / buyValue) * 100 : null;

  return { priceReturnPct, buyValue, sellValue, realizedPnl, returnOnTradePct };
}

/** A trade "wins" if its realized P&L is positive; flat (exactly 0) trades count as neither. */
export function isWinningTrade(realizedPnl: number | null): boolean {
  return realizedPnl !== null && realizedPnl > 0;
}

export function isLosingTrade(realizedPnl: number | null): boolean {
  return realizedPnl !== null && realizedPnl < 0;
}
