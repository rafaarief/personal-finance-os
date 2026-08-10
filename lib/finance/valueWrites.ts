import { and, desc, eq, isNotNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { recordChange, diffFields } from "@/lib/actions/changeLog";

export interface SetAssetValueParams {
  assetId: string;
  /** Already rolled to a statement date (toNextStatementDate) — this function writes it as-is. */
  snapshotDate: string;
  currentValue: number;
  notes?: string | null;
  valuationMethod?: string | null;
  changedBy: string;
}

/**
 * Writes (or updates) one asset's value snapshot for a specific date,
 * carrying capital/book value forward the same way a bare value edit always
 * has — shared by the single-asset "Edit Current Value" action and the
 * transfer action, so both go through identical carry-forward + change-log
 * logic instead of two copies drifting apart. Not a Server Action itself
 * (this file has no "use server") — callers own their own auth check.
 */
export async function setAssetValueAsOf(params: SetAssetValueParams): Promise<void> {
  const { assetId, snapshotDate, currentValue, notes = null, valuationMethod = null, changedBy } = params;
  const db = getDb();

  const [assetRow] = await db
    .select({ name: schema.assets.name, category: schema.assets.category })
    .from(schema.assets)
    .where(eq(schema.assets.id, assetId))
    .limit(1);

  const [existingSnapshot] = await db
    .select({
      currentValue: schema.assetValueSnapshots.currentValue,
      notes: schema.assetValueSnapshots.notes,
      valuationMethod: schema.assetValueSnapshots.valuationMethod,
    })
    .from(schema.assetValueSnapshots)
    .where(and(eq(schema.assetValueSnapshots.assetId, assetId), eq(schema.assetValueSnapshots.snapshotDate, snapshotDate)))
    .limit(1);

  // Carry capital/book value forward — this never blanks out a Capital
  // Market/Business asset's cost basis just because a bare value write
  // didn't set one.
  const [priorCapital] = await db
    .select({ capitalContributed: schema.assetValueSnapshots.capitalContributed })
    .from(schema.assetValueSnapshots)
    .where(
      and(
        eq(schema.assetValueSnapshots.assetId, assetId),
        lte(schema.assetValueSnapshots.snapshotDate, snapshotDate),
        isNotNull(schema.assetValueSnapshots.capitalContributed)
      )
    )
    .orderBy(desc(schema.assetValueSnapshots.snapshotDate))
    .limit(1);

  let carriedCapital = priorCapital?.capitalContributed ?? null;
  if (carriedCapital === null) {
    const [earliestCapital] = await db
      .select({ capitalContributed: schema.assetValueSnapshots.capitalContributed })
      .from(schema.assetValueSnapshots)
      .where(and(eq(schema.assetValueSnapshots.assetId, assetId), isNotNull(schema.assetValueSnapshots.capitalContributed)))
      .orderBy(schema.assetValueSnapshots.snapshotDate)
      .limit(1);
    carriedCapital = earliestCapital?.capitalContributed ?? null;
  }

  await db
    .insert(schema.assetValueSnapshots)
    .values({
      assetId,
      snapshotDate,
      currentValue: currentValue.toString(),
      capitalContributed: carriedCapital,
      notes,
      valuationMethod,
      source: "manual",
    })
    .onConflictDoUpdate({
      target: [schema.assetValueSnapshots.assetId, schema.assetValueSnapshots.snapshotDate],
      set: { currentValue: currentValue.toString(), capitalContributed: carriedCapital, notes, valuationMethod, source: "manual" },
    });

  const changes = diffFields(
    {
      currentValue: existingSnapshot?.currentValue ?? null,
      notes: existingSnapshot?.notes ?? null,
      valuationMethod: existingSnapshot?.valuationMethod ?? null,
    },
    { currentValue: currentValue.toString(), notes, valuationMethod }
  );
  if (Object.keys(changes).length > 0) {
    await recordChange({
      entityType: "asset",
      entityId: assetId,
      category: assetRow?.category ?? null,
      action: existingSnapshot ? "update" : "create",
      changes,
      label: assetRow?.name ?? "Unknown asset",
      changedBy,
    });
  }
}

/** The most recently recorded value for an asset, regardless of date — the same "current value" every category page already displays. 0 if the asset has no snapshot yet. */
export async function getLatestKnownValue(assetId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ currentValue: schema.assetValueSnapshots.currentValue })
    .from(schema.assetValueSnapshots)
    .where(eq(schema.assetValueSnapshots.assetId, assetId))
    .orderBy(desc(schema.assetValueSnapshots.snapshotDate), desc(schema.assetValueSnapshots.createdAt))
    .limit(1);
  return row ? Number(row.currentValue) : 0;
}
