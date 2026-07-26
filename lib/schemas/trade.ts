import { z } from "zod";

export const tradeMarketSchema = z.enum(["INDONESIA", "US", "OTHER"]);
export const tradeCurrencySchema = z.enum(["IDR", "USD"]);
export const tradeStatusSchema = z.enum(["OPEN", "CLOSED"]);

/** Sell price present => status defaults to CLOSED (per spec); caller can still force OPEN (e.g. a partial fill they don't want counted as realized yet). */
export const tradeInputSchema = z
  .object({
    ticker: z.string().trim().min(1).max(20).toUpperCase(),
    market: tradeMarketSchema,
    currency: tradeCurrencySchema,
    marginAmount: z.coerce.number().finite().nonnegative(),
    buyPrice: z.coerce.number().finite().positive(),
    sellPrice: z.coerce.number().finite().positive().nullable().default(null),
    quantity: z.coerce.number().finite().positive().nullable().default(null),
    buyDate: z.string().min(1),
    sellDate: z.string().nullable().default(null),
    status: tradeStatusSchema.optional(),
    strategy: z.string().max(200).nullable().default(null),
    notes: z.string().max(4000).nullable().default(null),
  })
  .transform((input) => ({
    ...input,
    status: input.status ?? (input.sellPrice !== null ? "CLOSED" : "OPEN"),
  }));

export type TradeInput = z.input<typeof tradeInputSchema>;
