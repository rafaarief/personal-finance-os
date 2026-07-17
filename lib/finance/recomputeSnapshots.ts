import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";

/**
 * After a statement import commits, if the bank account is linked to an asset
 * (e.g. the "BCA" cash asset), push the latest known balance onto that asset
 * and record a snapshot for the period — this is what keeps the Wealth
 * Dashboard's historical chart current without any manual re-entry.
 */
export async function recomputeSnapshotForBankAccount(bankAccountId: string, latestBalance: number, asOf: Date) {
  const db = getDb();

  const [bankAccount] = await db
    .select({ linkedAssetId: schema.bankAccounts.linkedAssetId })
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.id, bankAccountId))
    .limit(1);

  if (!bankAccount?.linkedAssetId) return;

  const assetId = bankAccount.linkedAssetId;
  const snapshotDate = asOf.toISOString().slice(0, 10);

  await db
    .update(schema.assets)
    .set({ currentValue: latestBalance.toString(), lastUpdatedAt: asOf, updatedAt: asOf })
    .where(eq(schema.assets.id, assetId));

  await db
    .insert(schema.assetValueSnapshots)
    .values({
      assetId,
      snapshotDate,
      currentValue: latestBalance.toString(),
      source: "import",
    })
    .onConflictDoUpdate({
      target: [schema.assetValueSnapshots.assetId, schema.assetValueSnapshots.snapshotDate],
      set: { currentValue: latestBalance.toString(), source: "import" },
    });
}
