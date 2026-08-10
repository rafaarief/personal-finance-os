"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { getCashReconciliation } from "@/lib/finance/aggregates";
import { ADJUSTMENT_INCOME_KEY, ADJUSTMENT_EXPENSE_KEY } from "@/lib/finance/taxonomy";
import { requireOwner, actorLabel } from "@/lib/auth/currentUser";
import { recordChange } from "@/lib/actions/changeLog";

function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 0));
  return date.toISOString().slice(0, 10);
}

/**
 * Records the gap between a month's tracked transactions and the account's
 * next real statement balance as an explicit "Cash Adjustment" transaction —
 * so Ending Cash always matches the actual reported balance instead of
 * silently drifting. Idempotent: re-running the same month updates the same
 * row (keyed on bankAccountId + a stable dedup key) rather than duplicating
 * it, so it can be safely re-applied whenever new statement data arrives.
 */
export async function applyCashAdjustment(month: string, cashAssetId: string) {
  const session = await requireOwner();
  const db = getDb();

  const reconciliation = await getCashReconciliation(month, cashAssetId);
  if (reconciliation.gap === null) {
    throw new Error("No next-period statement recorded yet for this account — nothing to reconcile against.");
  }
  if (Math.abs(reconciliation.gap) < 1) {
    return { applied: false as const, gap: reconciliation.gap };
  }

  const [bankAccount] = await db
    .select({ id: schema.bankAccounts.id })
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.linkedAssetId, cashAssetId))
    .limit(1);
  if (!bankAccount) {
    throw new Error("This cash account has no linked bank account to attribute the adjustment to.");
  }

  const categoryKey = reconciliation.gap > 0 ? ADJUSTMENT_INCOME_KEY : ADJUSTMENT_EXPENSE_KEY;
  const [category] = await db.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.key, categoryKey)).limit(1);
  if (!category) {
    throw new Error(`Category "${categoryKey}" is missing — run the categories seed first.`);
  }

  const amount = Math.abs(reconciliation.gap).toFixed(2);
  const dedupHash = `cash-adjustment:${month}`;

  const [existing] = await db
    .select({ id: schema.transactions.id, moneyIn: schema.transactions.moneyIn, moneyOut: schema.transactions.moneyOut })
    .from(schema.transactions)
    .where(and(eq(schema.transactions.bankAccountId, bankAccount.id), eq(schema.transactions.dedupHash, dedupHash)))
    .limit(1);

  const [row] = await db
    .insert(schema.transactions)
    .values({
      bankAccountId: bankAccount.id,
      transactionDate: lastDayOfMonth(month),
      description: `Cash Adjustment (${month})`,
      moneyIn: reconciliation.gap > 0 ? amount : null,
      moneyOut: reconciliation.gap < 0 ? amount : null,
      categoryId: category.id,
      dedupHash,
    })
    .onConflictDoUpdate({
      target: [schema.transactions.bankAccountId, schema.transactions.dedupHash],
      set: {
        moneyIn: reconciliation.gap > 0 ? amount : null,
        moneyOut: reconciliation.gap < 0 ? amount : null,
        categoryId: category.id,
        updatedAt: new Date(),
      },
    })
    .returning({ id: schema.transactions.id });

  await recordChange({
    entityType: "cash_adjustment",
    entityId: row.id,
    action: existing ? "update" : "create",
    changes: {
      gap: { before: existing ? (Number(existing.moneyIn ?? 0) - Number(existing.moneyOut ?? 0)) : null, after: reconciliation.gap },
      amount: { before: null, after: amount },
    },
    label: `Cash Adjustment (${month})`,
    changedBy: actorLabel(session),
  });

  revalidatePath("/cashflow");
  revalidatePath("/dashboard");
  return { applied: true as const, gap: reconciliation.gap };
}
