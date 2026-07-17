"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { transactionEditSchema, manualTransferLinkSchema } from "@/lib/schemas/transaction";
import { INTERNAL_TRANSFER_KEY } from "@/lib/finance/taxonomy";

export async function updateTransaction(transactionId: string, input: unknown) {
  const edit = transactionEditSchema.parse(input);
  const db = getDb();

  await db
    .update(schema.transactions)
    .set({
      categoryId: edit.categoryId,
      subcategoryId: edit.subcategoryId,
      isBusiness: edit.isBusiness,
      isInvestment: edit.isInvestment,
      updatedAt: new Date(),
    })
    .where(eq(schema.transactions.id, transactionId));

  revalidatePath("/transactions");
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
}

/** Manual internal-transfer confirmation for pairs the heuristic couldn't auto-link (e.g. counterpart imported later). */
export async function createManualTransferLink(input: unknown) {
  const { fromTransactionId, toTransactionId } = manualTransferLinkSchema.parse(input);
  const db = getDb();

  const [transferCategory] = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(eq(schema.categories.key, INTERNAL_TRANSFER_KEY))
    .limit(1);

  await db
    .insert(schema.internalTransferLinks)
    .values({
      fromTransactionId,
      toTransactionId,
      matchConfidence: "1.000",
      matchMethod: "manual",
    })
    .onConflictDoNothing({ target: [schema.internalTransferLinks.fromTransactionId, schema.internalTransferLinks.toTransactionId] });

  await db
    .update(schema.transactions)
    .set({ isInternalTransfer: true, categoryId: transferCategory?.id ?? null })
    .where(eq(schema.transactions.id, fromTransactionId));

  await db
    .update(schema.transactions)
    .set({ isInternalTransfer: true, categoryId: transferCategory?.id ?? null })
    .where(eq(schema.transactions.id, toTransactionId));

  revalidatePath("/transactions");
  revalidatePath("/expenses");
}
