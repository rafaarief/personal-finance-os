"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";

const bankAccountInputSchema = z.object({
  bankCode: z.enum(["bca", "jago", "bni", "mandiri"]),
  accountName: z.string().min(1).max(100),
  accountNumberMasked: z.string().max(20).nullable().default(null),
  linkedAssetId: z.uuid().nullable().default(null),
});

export async function createBankAccount(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const input = bankAccountInputSchema.parse({
    bankCode: raw.bankCode,
    accountName: raw.accountName,
    accountNumberMasked: raw.accountNumberMasked || null,
    linkedAssetId: raw.linkedAssetId || null,
  });

  const db = getDb();
  await db.insert(schema.bankAccounts).values(input);

  revalidatePath("/settings");
  revalidatePath("/import");
}
