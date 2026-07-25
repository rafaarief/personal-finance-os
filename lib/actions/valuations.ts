"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNotNull, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";

const updateValueSchema = z.object({
  snapshotDate: z.string().min(1),
  currentValue: z.coerce.number().finite(),
  notes: z.string().max(2000).nullable().optional(),
  valuationMethod: z.string().max(100).nullable().optional(),
});

export type UpdateAssetCurrentValueInput = z.input<typeof updateValueSchema>;

/**
 * Edits an asset's Current Value (Capital Market market price, or Business
 * estimated value) for a given date — without ever touching its capital /
 * book value. Capital is carried forward from the closest known prior
 * snapshot (or, failing that, the closest known snapshot at all) so Gain/Loss
 * stays derivable after the edit. If a snapshot already exists for this
 * asset+date it's updated in place; otherwise a new one is inserted —
 * historical snapshots are never destroyed.
 */
export async function updateAssetCurrentValue(assetId: string, input: UpdateAssetCurrentValueInput) {
  const parsed = updateValueSchema.parse(input);
  const db = getDb();

  const [priorCapital] = await db
    .select({ capitalContributed: schema.assetValueSnapshots.capitalContributed })
    .from(schema.assetValueSnapshots)
    .where(
      and(
        eq(schema.assetValueSnapshots.assetId, assetId),
        lte(schema.assetValueSnapshots.snapshotDate, parsed.snapshotDate),
        isNotNull(schema.assetValueSnapshots.capitalContributed)
      )
    )
    .orderBy(desc(schema.assetValueSnapshots.snapshotDate))
    .limit(1);

  let carriedCapital = priorCapital?.capitalContributed ?? null;

  if (carriedCapital === null) {
    // Editing a date before any capital was ever recorded for this asset — fall back to the earliest known capital.
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
      snapshotDate: parsed.snapshotDate,
      currentValue: parsed.currentValue.toString(),
      capitalContributed: carriedCapital,
      notes: parsed.notes ?? null,
      valuationMethod: parsed.valuationMethod ?? null,
      source: "manual",
    })
    .onConflictDoUpdate({
      target: [schema.assetValueSnapshots.assetId, schema.assetValueSnapshots.snapshotDate],
      set: {
        currentValue: parsed.currentValue.toString(),
        capitalContributed: carriedCapital,
        notes: parsed.notes ?? null,
        valuationMethod: parsed.valuationMethod ?? null,
        source: "manual",
      },
    });

  revalidatePath("/capital-market");
  revalidatePath("/business");
  revalidatePath("/assets");
  revalidatePath("/dashboard");
}
