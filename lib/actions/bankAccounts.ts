"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { requireOwner, actorLabel } from "@/lib/auth/currentUser";
import { recordChange, createdFields } from "@/lib/actions/changeLog";

const bankAccountInputSchema = z.object({
  bankCode: z.enum(["bca", "jago", "bni", "mandiri"]),
  accountName: z.string().min(1).max(100),
  accountNumberMasked: z.string().max(20).nullable().default(null),
  linkedAssetId: z.uuid().nullable().default(null),
});

export async function createBankAccount(formData: FormData) {
  const session = await requireOwner();
  const raw = Object.fromEntries(formData.entries());
  const input = bankAccountInputSchema.parse({
    bankCode: raw.bankCode,
    accountName: raw.accountName,
    accountNumberMasked: raw.accountNumberMasked || null,
    linkedAssetId: raw.linkedAssetId || null,
  });

  const db = getDb();
  const [created] = await db.insert(schema.bankAccounts).values(input).returning({ id: schema.bankAccounts.id });

  await recordChange({
    entityType: "bank_account",
    entityId: created.id,
    action: "create",
    changes: createdFields(input),
    label: input.accountName,
    changedBy: actorLabel(session),
  });

  revalidatePath("/settings");
  revalidatePath("/import");
}
