"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { tradeInputSchema } from "@/lib/schemas/trade";
import { requireAnyRole, actorLabel } from "@/lib/auth/currentUser";

/**
 * Trading Recap is shared workspace data (PRD requirement: both the owner and
 * the trading user see and edit the same trades), so both roles are allowed
 * here — requireAnyRole only rejects an unauthenticated caller. This is a
 * defense-in-depth check: middleware already keeps a TRADING_USER off every
 * non-/trading route (including this action's own invocation path), but the
 * action verifies for itself rather than trusting that alone.
 */
export async function createTrade(input: unknown) {
  const session = await requireAnyRole();
  const trade = tradeInputSchema.parse(input);
  const db = getDb();
  const actor = actorLabel(session);

  await db.insert(schema.trades).values({
    ticker: trade.ticker,
    market: trade.market,
    currency: trade.currency,
    marginAmount: trade.marginAmount.toString(),
    buyPrice: trade.buyPrice.toString(),
    sellPrice: trade.sellPrice?.toString() ?? null,
    quantity: trade.quantity?.toString() ?? null,
    buyDate: trade.buyDate,
    sellDate: trade.sellDate,
    status: trade.status,
    strategy: trade.strategy,
    notes: trade.notes,
    createdBy: actor,
    lastEditedBy: actor,
  });

  revalidatePath("/trading");
}

export async function updateTrade(tradeId: string, input: unknown) {
  const session = await requireAnyRole();
  const trade = tradeInputSchema.parse(input);
  const db = getDb();

  await db
    .update(schema.trades)
    .set({
      ticker: trade.ticker,
      market: trade.market,
      currency: trade.currency,
      marginAmount: trade.marginAmount.toString(),
      buyPrice: trade.buyPrice.toString(),
      sellPrice: trade.sellPrice?.toString() ?? null,
      quantity: trade.quantity?.toString() ?? null,
      buyDate: trade.buyDate,
      sellDate: trade.sellDate,
      status: trade.status,
      strategy: trade.strategy,
      notes: trade.notes,
      lastEditedBy: actorLabel(session),
      updatedAt: new Date(),
    })
    .where(eq(schema.trades.id, tradeId));

  revalidatePath("/trading");
}

export async function deleteTrade(tradeId: string) {
  await requireAnyRole();
  const db = getDb();
  await db.delete(schema.trades).where(eq(schema.trades.id, tradeId));
  revalidatePath("/trading");
}
