import { getDb, schema } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { parsePdfStatement } from "./parsePdf";
import { parseCsvStatement } from "./parseCsv";
import { extractTransactions } from "@/lib/ai/extractTransactions";
import { computeDedupHash } from "./dedup";
import type { ExtractedTransaction } from "@/lib/schemas/extraction";

export interface ExtractedRowWithDedup extends ExtractedTransaction {
  dedupHash: string;
  isDuplicate: boolean;
}

/**
 * Steps 2-6 of the statement import pipeline: create the `statement_imports`
 * row, extract text (PDF/CSV), call Claude, flag duplicates against existing
 * transactions on this account, and persist the raw result for the review UI.
 */
export async function runStatementExtraction({
  bankAccountId,
  bankCode,
  sourceFilename,
  sourceFileType,
  fileBuffer,
}: {
  bankAccountId: string;
  bankCode: string;
  sourceFilename: string;
  sourceFileType: "pdf" | "csv";
  fileBuffer: ArrayBuffer;
}): Promise<{ importId: string }> {
  const db = getDb();

  const [statementImport] = await db
    .insert(schema.statementImports)
    .values({ bankAccountId, sourceFilename, sourceFileType, status: "parsing" })
    .returning({ id: schema.statementImports.id });

  try {
    const statementText =
      sourceFileType === "pdf" ? await parsePdfStatement(fileBuffer) : parseCsvStatement(fileBuffer);

    const categories = await db
      .select({ key: schema.categories.key, label: schema.categories.label, kind: schema.categories.kind })
      .from(schema.categories);

    const extracted = await extractTransactions({ bankCode, statementText, categories });

    const existingHashes = new Set(
      (
        await db
          .select({ dedupHash: schema.transactions.dedupHash })
          .from(schema.transactions)
          .where(eq(schema.transactions.bankAccountId, bankAccountId))
      ).map((row) => row.dedupHash)
    );

    const rowsWithDedup: ExtractedRowWithDedup[] = extracted.transactions.map((row) => {
      const dedupHash = computeDedupHash({
        bankAccountId,
        transactionDate: row.date,
        moneyIn: row.moneyIn,
        moneyOut: row.moneyOut,
        balanceAfter: row.balanceAfter,
        description: row.description,
      });
      return { ...row, dedupHash, isDuplicate: existingHashes.has(dedupHash) };
    });

    const totalDuplicate = rowsWithDedup.filter((row) => row.isDuplicate).length;

    await db
      .update(schema.statementImports)
      .set({
        status: "reviewing",
        rawExtractedJson: { ...extracted, transactions: rowsWithDedup },
        statementPeriodStart: extracted.statementPeriodStart,
        statementPeriodEnd: extracted.statementPeriodEnd,
        totalExtracted: rowsWithDedup.length,
        totalNew: rowsWithDedup.length - totalDuplicate,
        totalDuplicate,
      })
      .where(eq(schema.statementImports.id, statementImport.id));

    return { importId: statementImport.id };
  } catch (error) {
    await db
      .update(schema.statementImports)
      .set({ status: "failed", errorMessage: error instanceof Error ? error.message : String(error) })
      .where(eq(schema.statementImports.id, statementImport.id));
    throw error;
  }
}
