"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { assetInputSchema } from "@/lib/schemas/asset";

export async function createAsset(formData: FormData) {
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

  revalidatePath("/dashboard");
  revalidatePath("/assets");
  redirect("/assets");
}

export async function updateAssetValue(assetId: string, formData: FormData) {
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

  await db
    .insert(schema.assetValueSnapshots)
    .values({
      assetId,
      snapshotDate: now.toISOString().slice(0, 10),
      currentValue: input.currentValue.toString(),
      source: "manual",
    })
    .onConflictDoUpdate({
      target: [schema.assetValueSnapshots.assetId, schema.assetValueSnapshots.snapshotDate],
      set: { currentValue: input.currentValue.toString(), source: "manual" },
    });

  revalidatePath("/dashboard");
  revalidatePath("/assets");
  revalidatePath(`/assets/${assetId}`);
  redirect("/assets");
}

export async function archiveAsset(assetId: string) {
  const db = getDb();
  await db.update(schema.assets).set({ isActive: false, updatedAt: new Date() }).where(eq(schema.assets.id, assetId));
  revalidatePath("/dashboard");
  revalidatePath("/assets");
  redirect("/assets");
}
