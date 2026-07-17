import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { TransactionsLedger, type LedgerRow } from "@/components/TransactionsLedger";

export const dynamic = "force-dynamic";

export default async function TransactionsPage() {
  const db = getDb();

  const [rows, categories] = await Promise.all([
    db
      .select({
        id: schema.transactions.id,
        transactionDate: schema.transactions.transactionDate,
        description: schema.transactions.description,
        bankAccountName: schema.bankAccounts.accountName,
        moneyIn: schema.transactions.moneyIn,
        moneyOut: schema.transactions.moneyOut,
        categoryId: schema.transactions.categoryId,
        categoryKey: schema.categories.key,
        isBusiness: schema.transactions.isBusiness,
        isInternalTransfer: schema.transactions.isInternalTransfer,
      })
      .from(schema.transactions)
      .innerJoin(schema.bankAccounts, eq(schema.bankAccounts.id, schema.transactions.bankAccountId))
      .leftJoin(schema.categories, eq(schema.categories.id, schema.transactions.categoryId))
      .orderBy(desc(schema.transactions.transactionDate))
      .limit(300),
    db.select({ id: schema.categories.id, key: schema.categories.key, label: schema.categories.label }).from(schema.categories),
  ]);

  const ledgerRows: LedgerRow[] = rows.map((row) => ({
    ...row,
    moneyIn: row.moneyIn ? parseFloat(row.moneyIn) : null,
    moneyOut: row.moneyOut ? parseFloat(row.moneyOut) : null,
  }));

  return (
    <div className="space-y-6">
      <h1 className="font-(family-name:--font-display) text-3xl text-(--color-ink-primary)">Transactions</h1>
      <TransactionsLedger rows={ledgerRows} categories={categories} />
    </div>
  );
}
