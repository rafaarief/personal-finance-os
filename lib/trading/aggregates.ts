import { desc, eq, and, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { calculateTrade } from "./calculations";

export type TradeMarket = "INDONESIA" | "US" | "OTHER";
export type TradeCurrency = "IDR" | "USD";
export type TradeStatus = "OPEN" | "CLOSED";

export interface TradeRow {
  id: string;
  ticker: string;
  market: TradeMarket;
  currency: TradeCurrency;
  marginAmount: number;
  buyPrice: number;
  sellPrice: number | null;
  quantity: number | null;
  buyDate: string;
  sellDate: string | null;
  status: TradeStatus;
  strategy: string | null;
  notes: string | null;
  createdBy: string;
  lastEditedBy: string | null;
  createdAt: string;
  updatedAt: string;
  priceReturnPct: number | null;
  buyValue: number | null;
  sellValue: number | null;
  realizedPnl: number | null;
  returnOnTradePct: number | null;
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value);
}

function toNullableNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return parseFloat(value);
}

export interface TradeFilter {
  /** Inclusive, filtered against buyDate — every trade has one, so this never silently excludes an OPEN trade the way filtering on sellDate would. */
  from?: string;
  to?: string;
}

/** All trades in the shared trading workspace — visible to OWNER and TRADING_USER alike (this data is not private to either account). */
export async function getTrades(filter?: TradeFilter): Promise<TradeRow[]> {
  const db = getDb();
  const conditions = [];
  if (filter?.from) conditions.push(gte(schema.trades.buyDate, filter.from));
  if (filter?.to) conditions.push(lte(schema.trades.buyDate, filter.to));

  const rows = await db
    .select()
    .from(schema.trades)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.trades.buyDate));

  return rows.map((row) => {
    const buyPrice = toNumber(row.buyPrice);
    const sellPrice = toNullableNumber(row.sellPrice);
    const quantity = toNullableNumber(row.quantity);
    const calc = calculateTrade({ buyPrice, sellPrice, quantity });

    return {
      id: row.id,
      ticker: row.ticker,
      market: row.market,
      currency: row.currency,
      marginAmount: toNumber(row.marginAmount),
      buyPrice,
      sellPrice,
      quantity,
      buyDate: row.buyDate,
      sellDate: row.sellDate,
      status: row.status,
      strategy: row.strategy,
      notes: row.notes,
      createdBy: row.createdBy,
      lastEditedBy: row.lastEditedBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...calc,
    };
  });
}

export async function getTradeById(id: string): Promise<TradeRow | null> {
  const db = getDb();
  const [row] = await db.select().from(schema.trades).where(eq(schema.trades.id, id)).limit(1);
  if (!row) return null;

  const buyPrice = toNumber(row.buyPrice);
  const sellPrice = toNullableNumber(row.sellPrice);
  const quantity = toNullableNumber(row.quantity);
  const calc = calculateTrade({ buyPrice, sellPrice, quantity });

  return {
    id: row.id,
    ticker: row.ticker,
    market: row.market,
    currency: row.currency,
    marginAmount: toNumber(row.marginAmount),
    buyPrice,
    sellPrice,
    quantity,
    buyDate: row.buyDate,
    sellDate: row.sellDate,
    status: row.status,
    strategy: row.strategy,
    notes: row.notes,
    createdBy: row.createdBy,
    lastEditedBy: row.lastEditedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...calc,
  };
}
