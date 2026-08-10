"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { requireOwner, actorLabel } from "@/lib/auth/currentUser";
import { toNextStatementDate } from "@/lib/format/date";
import { setAssetValueAsOf, getLatestKnownValue } from "@/lib/finance/valueWrites";

const transferInputSchema = z
  .object({
    fromAssetId: z.uuid().nullable(),
    toAssetId: z.uuid().nullable(),
    /** Label for the non-asset side when fromAssetId/toAssetId is null (e.g. "External income", "Living expenses") — defaults to "External" if left blank. */
    externalLabel: z.string().max(100).nullable().optional(),
    amount: z.coerce.number().positive(),
    transferDate: z.string().min(1),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((input) => input.fromAssetId || input.toAssetId, {
    message: "Pick at least one account — both sides can't be External.",
  })
  .refine((input) => !input.fromAssetId || !input.toAssetId || input.fromAssetId !== input.toAssetId, {
    message: "From and To must be different accounts.",
  });

export type RecordAssetTransferInput = z.input<typeof transferInputSchema>;

async function assetName(assetId: string): Promise<string> {
  const db = getDb();
  const [row] = await db.select({ name: schema.assets.name }).from(schema.assets).where(eq(schema.assets.id, assetId)).limit(1);
  return row?.name ?? "Unknown asset";
}

/**
 * Marks a value change as money moving between two accounts (or between an
 * account and "External", for real income/expense rather than an internal
 * move) — e.g. Business drops 10M because it went to Cash, or Cash drops 20M
 * to fund a new "Project Nabil" business asset. Applies the opposite delta
 * to each real account side (via the shared setAssetValueAsOf, so capital
 * carry-forward and change-log entries stay consistent with a bare value
 * edit) and tags both sides' notes with the counterparty, so the marker
 * shows up on both the source and destination category page's History.
 */
export async function recordAssetTransfer(input: RecordAssetTransferInput) {
  const session = await requireOwner();
  const parsed = transferInputSchema.parse(input);
  const actor = actorLabel(session);
  const snapshotDate = toNextStatementDate(parsed.transferDate);

  const fromLabel = parsed.fromAssetId ? await assetName(parsed.fromAssetId) : parsed.externalLabel || "External";
  const toLabel = parsed.toAssetId ? await assetName(parsed.toAssetId) : parsed.externalLabel || "External";
  const suffix = parsed.notes ? ` — ${parsed.notes}` : "";

  if (parsed.fromAssetId) {
    const current = await getLatestKnownValue(parsed.fromAssetId);
    await setAssetValueAsOf({
      assetId: parsed.fromAssetId,
      snapshotDate,
      currentValue: current - parsed.amount,
      notes: `Transfer to ${toLabel}${suffix}`,
      changedBy: actor,
    });
  }

  if (parsed.toAssetId) {
    const current = await getLatestKnownValue(parsed.toAssetId);
    await setAssetValueAsOf({
      assetId: parsed.toAssetId,
      snapshotDate,
      currentValue: current + parsed.amount,
      notes: `Transfer from ${fromLabel}${suffix}`,
      changedBy: actor,
    });
  }

  revalidatePath("/cash");
  revalidatePath("/capital-market");
  revalidatePath("/business");
  revalidatePath("/assets");
  revalidatePath("/dashboard");
}
