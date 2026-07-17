import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { GlassCard } from "@/components/ui/GlassCard";
import { UploadStatementForm } from "@/components/UploadStatementForm";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const db = getDb();
  const [bankAccounts, imports] = await Promise.all([
    db
      .select({ id: schema.bankAccounts.id, accountName: schema.bankAccounts.accountName })
      .from(schema.bankAccounts)
      .where(eq(schema.bankAccounts.isActive, true)),
    db
      .select({
        id: schema.statementImports.id,
        sourceFilename: schema.statementImports.sourceFilename,
        status: schema.statementImports.status,
        totalExtracted: schema.statementImports.totalExtracted,
        totalNew: schema.statementImports.totalNew,
        totalDuplicate: schema.statementImports.totalDuplicate,
        createdAt: schema.statementImports.createdAt,
        accountName: schema.bankAccounts.accountName,
      })
      .from(schema.statementImports)
      .leftJoin(schema.bankAccounts, eq(schema.bankAccounts.id, schema.statementImports.bankAccountId))
      .orderBy(desc(schema.statementImports.createdAt))
      .limit(20),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Import statement</h1>

      <GlassCard className="max-w-lg">
        <UploadStatementForm bankAccounts={bankAccounts} />
      </GlassCard>

      <div className="space-y-3">
        <h2 className="text-sm tracking-[0.15em] text-(--color-ink-muted) uppercase">Recent imports</h2>
        {imports.length === 0 ? (
          <p className="text-sm text-(--color-ink-secondary)">No imports yet.</p>
        ) : (
          <div className="space-y-2">
            {imports.map((item) => (
              <Link key={item.id} href={`/import/${item.id}/review`}>
                <GlassCard className="flex items-center justify-between !p-4 transition hover:border-(--color-cat-purple)">
                  <div>
                    <p className="text-(--color-ink-primary)">{item.sourceFilename}</p>
                    <p className="text-xs text-(--color-ink-muted)">
                      {item.accountName} · {item.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-(--color-ink-secondary)">{item.status}</p>
                    <p className="text-xs text-(--color-ink-muted)">
                      {item.totalNew} new · {item.totalDuplicate} duplicate
                    </p>
                  </div>
                </GlassCard>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
