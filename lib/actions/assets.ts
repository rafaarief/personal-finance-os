"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, isNotNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { assetInputSchema } from "@/lib/schemas/asset";
import { requireOwner, actorLabel } from "@/lib/auth/currentUser";
import { recordChange, diffFields, createdFields } from "@/lib/actions/changeLog";
import { toNextStatementDate } from "@/lib/format/date";

export async function createAsset(formData: FormData) {
  const session = await requireOwner();
  const raw = Object.fromEntries(formData.entries());
  const input = assetInputSchema.parse({
    category: raw.category,
    subcategory: raw.subcategory,
    name: raw.name,
    currentValue: raw.currentValue,
    purchaseValue: raw.purchaseValue || null,
    currency: raw.currency || "IDR",
    notes: raw.notes || null,
  });

  const db = getDb();
  const now = new Date();
  const [asset] = await db
    .insert(schema.assets)
    .values({
      category: input.category,
      subcategory: input.subcategory,
      name: input.name,
      currentValue: input.currentValue.toString(),
      purchaseValue: input.purchaseValue?.toString() ?? null,
      currency: input.currency,
      notes: input.notes,
      lastUpdatedAt: now,
    })
    .returning({ id: schema.assets.id });

  await db.insert(schema.assetValueSnapshots).values({
    assetId: asset.id,
    snapshotDate: now.toISOString().slice(0, 10),
    currentValue: input.currentValue.toString(),
    source: "manual",
  });

  await recordChange({
    entityType: "asset",
    entityId: asset.id,
    category: input.category,
    action: "create",
    changes: createdFields({
      name: input.name,
      subcategory: input.subcategory,
      currentValue: input.currentValue,
      purchaseValue: input.purchaseValue,
      currency: input.currency,
      notes: input.notes,
    }),
    label: input.name,
    changedBy: actorLabel(session),
  });

  revalidatePath("/dashboard");
  revalidatePath("/assets");
  redirect("/assets");
}

export async function updateAssetValue(assetId: string, formData: FormData) {
  const session = await requireOwner();
  const raw = Object.fromEntries(formData.entries());
  const input = assetInputSchema.parse({
    category: raw.category,
    subcategory: raw.subcategory,
    name: raw.name,
    currentValue: raw.currentValue,
    purchaseValue: raw.purchaseValue || null,
    currency: raw.currency || "IDR",
    notes: raw.notes || null,
  });

  const db = getDb();
  const now = new Date();
  const snapshotDate = toNextStatementDate(now.toISOString().slice(0, 10));

  const [existing] = await db
    .select({
      category: schema.assets.category,
      subcategory: schema.assets.subcategory,
      name: schema.assets.name,
      currentValue: schema.assets.currentValue,
      purchaseValue: schema.assets.purchaseValue,
      currency: schema.assets.currency,
      notes: schema.assets.notes,
    })
    .from(schema.assets)
    .where(eq(schema.assets.id, assetId))
    .limit(1);

  await db
    .update(schema.assets)
    .set({
      category: input.category,
      subcategory: input.subcategory,
      name: input.name,
      currentValue: input.currentValue.toString(),
      purchaseValue: input.purchaseValue?.toString() ?? null,
      currency: input.currency,
      notes: input.notes,
      lastUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.assets.id, assetId));

  // Carry capital/book value forward on a brand-new snapshot row — this form
  // only ever edits Current Value, so it must never blank out a Capital
  // Market/Business asset's capital basis the way inserting a bare row would.
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

  await db
    .insert(schema.assetValueSnapshots)
    .values({
      assetId,
      snapshotDate,
      currentValue: input.currentValue.toString(),
      capitalContributed: priorCapital?.capitalContributed ?? null,
      source: "manual",
    })
    .onConflictDoUpdate({
      target: [schema.assetValueSnapshots.assetId, schema.assetValueSnapshots.snapshotDate],
      set: { currentValue: input.currentValue.toString(), source: "manual" },
    });

  if (existing) {
    const changes = diffFields(existing, {
      category: input.category,
      subcategory: input.subcategory,
      name: input.name,
      currentValue: input.currentValue.toString(),
      purchaseValue: input.purchaseValue?.toString() ?? null,
      currency: input.currency,
      notes: input.notes,
    });
    if (Object.keys(changes).length > 0) {
      await recordChange({
        entityType: "asset",
        entityId: assetId,
        category: input.category,
        action: "update",
        changes,
        label: input.name,
        changedBy: actorLabel(session),
      });
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/assets");
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/capital-market");
  revalidatePath("/business");
  redirect("/assets");
}

export async function archiveAsset(assetId: string) {
  const session = await requireOwner();
  const db = getDb();

  const [existing] = await db
    .select({ name: schema.assets.name, category: schema.assets.category })
    .from(schema.assets)
    .where(eq(schema.assets.id, assetId))
    .limit(1);

  await db.update(schema.assets).set({ isActive: false, updatedAt: new Date() }).where(eq(schema.assets.id, assetId));

  if (existing) {
    await recordChange({
      entityType: "asset",
      entityId: assetId,
      category: existing.category,
      action: "update",
      changes: { isActive: { before: true, after: false } },
      label: existing.name,
      changedBy: actorLabel(session),
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/assets");
  redirect("/assets");
}
