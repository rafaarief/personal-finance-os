import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { runStatementExtraction } from "@/lib/statementImport/runExtraction";

// Fluid Compute on Vercel supports up to 800s; extraction of a few hundred
// rows in one Claude call is well within that, no background worker needed.
export const maxDuration = 800;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const bankAccountId = formData.get("bankAccountId");

  if (!(file instanceof File) || typeof bankAccountId !== "string" || !bankAccountId) {
    return NextResponse.json({ error: "file and bankAccountId are required" }, { status: 400 });
  }

  const db = getDb();
  const [bankAccount] = await db
    .select({ bankCode: schema.bankAccounts.bankCode })
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.id, bankAccountId))
    .limit(1);

  if (!bankAccount) {
    return NextResponse.json({ error: "Unknown bank account" }, { status: 404 });
  }

  const sourceFileType = file.name.toLowerCase().endsWith(".csv") ? "csv" : "pdf";
  const fileBuffer = await file.arrayBuffer();

  try {
    const { importId } = await runStatementExtraction({
      bankAccountId,
      bankCode: bankAccount.bankCode,
      sourceFilename: file.name,
      sourceFileType,
      fileBuffer,
    });

    return NextResponse.json({ importId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Statement extraction failed" },
      { status: 500 }
    );
  }
}
