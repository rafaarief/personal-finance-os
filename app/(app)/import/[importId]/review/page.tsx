import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { GlassCard } from "@/components/ui/GlassCard";
import { ReviewTable } from "@/components/ReviewTable";
import type { ExtractedRowWithDedup } from "@/lib/statementImport/runExtraction";

export const dynamic = "force-dynamic";

export default async function ImportReviewPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params;
  const db = getDb();

  const [statementImport] = await db
    .select()
    .from(schema.statementImports)
    .where(eq(schema.statementImports.id, importId))
    .limit(1);

  if (!statementImport) notFound();

  const categories = await db
    .select({ key: schema.categories.key, label: schema.categories.label, kind: schema.categories.kind })
    .from(schema.categories)
    .orderBy(schema.categories.sortOrder);

  if (statementImport.status === "failed") {
    return (
      <div className="space-y-4">
        <h1 className="font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">
          {statementImport.sourceFilename}
        </h1>
        <GlassCard>
          <p className="text-(--color-status-critical)">Extraction failed: {statementImport.errorMessage}</p>
        </GlassCard>
      </div>
    );
  }

  if (statementImport.status === "committed") {
    return (
      <div className="space-y-4">
        <h1 className="font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">
          {statementImport.sourceFilename}
        </h1>
        <GlassCard>
          <p className="text-(--color-ink-secondary)">
            This import was already committed ({statementImport.totalNew} transactions).
          </p>
        </GlassCard>
      </div>
    );
  }

  const raw = statementImport.rawExtractedJson as { transactions: ExtractedRowWithDedup[] } | null;
  const rows = (raw?.transactions ?? []).map((row) => ({
    date: row.date,
    description: row.description,
    counterparty: row.counterparty,
    moneyIn: row.moneyIn,
    moneyOut: row.moneyOut,
    balanceAfter: row.balanceAfter,
    dedupHash: row.dedupHash,
    isDuplicate: row.isDuplicate,
    skip: row.isDuplicate,
    categoryKey: row.suggestedCategoryKey,
    isBusiness: row.isBusiness,
    isInvestment: row.isInvestment,
    aiConfidence: row.confidence,
    aiSuggestedCategoryKey: row.suggestedCategoryKey,
    isLikelyInternalTransfer: row.isLikelyInternalTransfer,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">
          Review: {statementImport.sourceFilename}
        </h1>
        <p className="mt-1 text-sm text-(--color-ink-secondary)">
          {statementImport.totalExtracted} extracted · {statementImport.totalNew} new ·{" "}
          {statementImport.totalDuplicate} duplicate
        </p>
      </div>

      <ReviewTable importId={importId} initialRows={rows} categories={categories} />
    </div>
  );
}
