"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner, actorLabel } from "@/lib/auth/currentUser";
import { toNextStatementDate } from "@/lib/format/date";
import { setAssetValueAsOf } from "@/lib/finance/valueWrites";

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
 * book value. The date is rolled forward to its representative month-start
 * statement date first (toNextStatementDate), so an edit made any day in
 * August lands on 1 September, keeping the net worth chart on clean monthly
 * boundaries. If a snapshot already exists for the resolved date it's
 * updated in place; otherwise a new one is inserted — historical snapshots
 * are never destroyed.
 */
export async function updateAssetCurrentValue(assetId: string, input: UpdateAssetCurrentValueInput) {
  const session = await requireOwner();
  const parsed = updateValueSchema.parse(input);

  await setAssetValueAsOf({
    assetId,
    snapshotDate: toNextStatementDate(parsed.snapshotDate),
    currentValue: parsed.currentValue,
    notes: parsed.notes ?? null,
    valuationMethod: parsed.valuationMethod ?? null,
    changedBy: actorLabel(session),
  });

  revalidatePath("/capital-market");
  revalidatePath("/business");
  revalidatePath("/assets");
  revalidatePath("/cash");
  revalidatePath("/dashboard");
}
