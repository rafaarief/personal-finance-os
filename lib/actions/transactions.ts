"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { transactionEditSchema, manualTransferLinkSchema } from "@/lib/schemas/transaction";
import { INTERNAL_TRANSFER_KEY } from "@/lib/finance/taxonomy";
import { requireOwner, actorLabel } from "@/lib/auth/currentUser";
import { recordChange, diffFields } from "@/lib/actions/changeLog";

export async function updateTransaction(transactionId: string, input: unknown) {
  const session = await requireOwner();
  const edit = transactionEditSchema.parse(input);
  const db = getDb();

  const [existing] = await db
    .select({
      description: schema.transactions.description,
      categoryId: schema.transactions.categoryId,
      subcategoryId: schema.transactions.subcategoryId,
      isBusiness: schema.transactions.isBusiness,
      isInvestment: schema.transactions.isInvestment,
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.id, transactionId))
    .limit(1);

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

  if (existing) {
    const changes = diffFields(existing, {
      categoryId: edit.categoryId,
      subcategoryId: edit.subcategoryId,
      isBusiness: edit.isBusiness,
      isInvestment: edit.isInvestment,
    });
    if (Object.keys(changes).length > 0) {
      await recordChange({
        entityType: "transaction",
        entityId: transactionId,
        action: "update",
        changes,
        label: existing.description,
        changedBy: actorLabel(session),
      });
    }
  }

  revalidatePath("/transactions");
  revalidatePath("/expenses");
  revalidatePath("/cashflow");
  revalidatePath("/dashboard");
}

/** Manual internal-transfer confirmation for pairs the heuristic couldn't auto-link (e.g. counterpart imported later). */
export async function createManualTransferLink(input: unknown) {
  const session = await requireOwner();
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

  const linkedTransactions = await db
    .select({ id: schema.transactions.id, description: schema.transactions.description })
    .from(schema.transactions)
    .where(inArray(schema.transactions.id, [fromTransactionId, toTransactionId]));
  const descriptionById = new Map(linkedTransactions.map((row) => [row.id, row.description]));

  await db
    .update(schema.transactions)
    .set({ isInternalTransfer: true, categoryId: transferCategory?.id ?? null })
    .where(eq(schema.transactions.id, fromTransactionId));

  await db
    .update(schema.transactions)
    .set({ isInternalTransfer: true, categoryId: transferCategory?.id ?? null })
    .where(eq(schema.transactions.id, toTransactionId));

  const actor = actorLabel(session);
  await Promise.all(
    [fromTransactionId, toTransactionId].map((id) =>
      recordChange({
        entityType: "transaction",
        entityId: id,
        action: "update",
        changes: { isInternalTransfer: { before: false, after: true } },
        label: descriptionById.get(id) ?? "Transaction",
        changedBy: actor,
      })
    )
  );

  revalidatePath("/transactions");
  revalidatePath("/expenses");
  revalidatePath("/cashflow");
}
