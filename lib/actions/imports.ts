"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { findTransferMatches, type TransferCandidate } from "@/lib/statementImport/transferMatch";
import { recomputeSnapshotForBankAccount } from "@/lib/finance/recomputeSnapshots";
import { INTERNAL_TRANSFER_KEY, UNCATEGORIZED_KEY } from "@/lib/finance/taxonomy";

export interface CommitRowInput {
  date: string;
  description: string;
  counterparty: string | null;
  moneyIn: number | null;
  moneyOut: number | null;
  balanceAfter: number | null;
  dedupHash: string;
  isDuplicate: boolean;
  skip: boolean;
  categoryKey: string;
  isBusiness: boolean;
  isInvestment: boolean;
  aiConfidence: number;
  aiSuggestedCategoryKey: string;
  isLikelyInternalTransfer: boolean;
}

/** Steps 8-9 of the statement import pipeline: commit reviewed rows, run transfer matching, recompute snapshots. */
export async function commitStatementImport(importId: string, rows: CommitRowInput[]) {
  const db = getDb();

  const [statementImport] = await db
    .select()
    .from(schema.statementImports)
    .where(eq(schema.statementImports.id, importId))
    .limit(1);
  if (!statementImport) throw new Error("Import not found");

  const categories = await db.select().from(schema.categories);
  const categoryByKey = new Map(categories.map((category) => [category.key, category]));

  const rowsToInsert = rows.filter((row) => !row.skip && !row.isDuplicate);

  for (const row of rowsToInsert) {
    const category = categoryByKey.get(row.categoryKey) ?? categoryByKey.get(UNCATEGORIZED_KEY);
    const aiSuggestedCategory = categoryByKey.get(row.aiSuggestedCategoryKey);

    await db
      .insert(schema.transactions)
      .values({
        bankAccountId: statementImport.bankAccountId,
        statementImportId: importId,
        transactionDate: row.date,
        description: row.description,
        counterparty: row.counterparty,
        moneyIn: row.moneyIn?.toString() ?? null,
        moneyOut: row.moneyOut?.toString() ?? null,
        balanceAfter: row.balanceAfter?.toString() ?? null,
        categoryId: category?.id ?? null,
        isBusiness: row.isBusiness,
        isInvestment: row.isInvestment,
        aiConfidence: row.aiConfidence.toString(),
        aiSuggestedCategoryId: aiSuggestedCategory?.id ?? null,
        reviewedAt: new Date(),
        dedupHash: row.dedupHash,
      })
      .onConflictDoNothing({ target: [schema.transactions.bankAccountId, schema.transactions.dedupHash] });
  }

  // Transfer matching runs against new + recent existing rows (last 35 days) across ALL accounts,
  // since the counterpart side of a transfer may already be committed from a prior import.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 35);

  const candidateRows = await db
    .select({
      id: schema.transactions.id,
      bankAccountId: schema.transactions.bankAccountId,
      transactionDate: schema.transactions.transactionDate,
      moneyIn: schema.transactions.moneyIn,
      moneyOut: schema.transactions.moneyOut,
      description: schema.transactions.description,
    })
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.transactionDate, cutoff.toISOString().slice(0, 10)),
        eq(schema.transactions.isInternalTransfer, false)
      )
    );

  const candidates: TransferCandidate[] = candidateRows.map((row) => ({
    id: row.id,
    bankAccountId: row.bankAccountId,
    transactionDate: row.transactionDate,
    moneyIn: row.moneyIn ? parseFloat(row.moneyIn) : null,
    moneyOut: row.moneyOut ? parseFloat(row.moneyOut) : null,
    description: row.description,
  }));

  const matches = findTransferMatches(candidates);
  const transferCategory = categoryByKey.get(INTERNAL_TRANSFER_KEY);

  for (const match of matches) {
    await db
      .insert(schema.internalTransferLinks)
      .values({
        fromTransactionId: match.fromTransactionId,
        toTransactionId: match.toTransactionId,
        matchConfidence: match.matchConfidence.toString(),
        matchMethod: "amount_date_heuristic",
      })
      .onConflictDoNothing({ target: [schema.internalTransferLinks.fromTransactionId, schema.internalTransferLinks.toTransactionId] });

    await db
      .update(schema.transactions)
      .set({ isInternalTransfer: true, categoryId: transferCategory?.id ?? null })
      .where(inArray(schema.transactions.id, [match.fromTransactionId, match.toTransactionId]));
  }

  await db
    .update(schema.statementImports)
    .set({ status: "committed", committedAt: new Date() })
    .where(eq(schema.statementImports.id, importId));

  const latestRow = [...rowsToInsert]
    .filter((row) => row.balanceAfter !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);

  if (latestRow && latestRow.balanceAfter !== null) {
    await recomputeSnapshotForBankAccount(statementImport.bankAccountId, latestRow.balanceAfter, new Date(latestRow.date));
  }

  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/import");
}
