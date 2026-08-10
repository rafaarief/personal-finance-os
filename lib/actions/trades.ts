"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { tradeInputSchema } from "@/lib/schemas/trade";
import { requireAnyRole, actorLabel } from "@/lib/auth/currentUser";
import { recordChange, diffFields, createdFields, deletedFields } from "@/lib/actions/changeLog";

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

  const [created] = await db
    .insert(schema.trades)
    .values({
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
    })
    .returning({ id: schema.trades.id });

  await recordChange({
    entityType: "trade",
    entityId: created.id,
    action: "create",
    changes: createdFields({
      ticker: trade.ticker,
      market: trade.market,
      currency: trade.currency,
      marginAmount: trade.marginAmount,
      buyPrice: trade.buyPrice,
      sellPrice: trade.sellPrice ?? null,
      quantity: trade.quantity ?? null,
      buyDate: trade.buyDate,
      sellDate: trade.sellDate ?? null,
      status: trade.status,
      strategy: trade.strategy ?? null,
    }),
    label: trade.ticker,
    changedBy: actor,
  });

  revalidatePath("/trading");
}

export async function updateTrade(tradeId: string, input: unknown) {
  const session = await requireAnyRole();
  const trade = tradeInputSchema.parse(input);
  const db = getDb();

  const [existing] = await db
    .select({
      ticker: schema.trades.ticker,
      market: schema.trades.market,
      currency: schema.trades.currency,
      marginAmount: schema.trades.marginAmount,
      buyPrice: schema.trades.buyPrice,
      sellPrice: schema.trades.sellPrice,
      quantity: schema.trades.quantity,
      buyDate: schema.trades.buyDate,
      sellDate: schema.trades.sellDate,
      status: schema.trades.status,
      strategy: schema.trades.strategy,
      notes: schema.trades.notes,
    })
    .from(schema.trades)
    .where(eq(schema.trades.id, tradeId))
    .limit(1);

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

  if (existing) {
    const changes = diffFields(existing, {
      ticker: trade.ticker,
      market: trade.market,
      currency: trade.currency,
      marginAmount: trade.marginAmount.toString(),
      buyPrice: trade.buyPrice.toString(),
      sellPrice: trade.sellPrice?.toString() ?? null,
      quantity: trade.quantity?.toString() ?? null,
      buyDate: trade.buyDate,
      sellDate: trade.sellDate ?? null,
      status: trade.status,
      strategy: trade.strategy ?? null,
      notes: trade.notes ?? null,
    });
    if (Object.keys(changes).length > 0) {
      await recordChange({
        entityType: "trade",
        entityId: tradeId,
        action: "update",
        changes,
        label: trade.ticker,
        changedBy: actorLabel(session),
      });
    }
  }

  revalidatePath("/trading");
}

export async function deleteTrade(tradeId: string) {
  const session = await requireAnyRole();
  const db = getDb();

  const [existing] = await db
    .select({
      ticker: schema.trades.ticker,
      market: schema.trades.market,
      currency: schema.trades.currency,
      marginAmount: schema.trades.marginAmount,
      buyPrice: schema.trades.buyPrice,
      sellPrice: schema.trades.sellPrice,
      quantity: schema.trades.quantity,
      buyDate: schema.trades.buyDate,
      sellDate: schema.trades.sellDate,
      status: schema.trades.status,
    })
    .from(schema.trades)
    .where(eq(schema.trades.id, tradeId))
    .limit(1);

  await db.delete(schema.trades).where(eq(schema.trades.id, tradeId));

  if (existing) {
    await recordChange({
      entityType: "trade",
      entityId: tradeId,
      action: "delete",
      changes: deletedFields(existing),
      label: existing.ticker,
      changedBy: actorLabel(session),
    });
  }

  revalidatePath("/trading");
}
