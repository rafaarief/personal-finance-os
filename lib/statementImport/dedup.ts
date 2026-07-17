import { createHash } from "node:crypto";

function normalizeDescription(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeAmount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value.toFixed(2);
}

interface DedupHashInput {
  bankAccountId: string;
  transactionDate: string;
  moneyIn: number | null;
  moneyOut: number | null;
  balanceAfter: number | null;
  description: string;
}

/**
 * Includes `balanceAfter` deliberately — it's what disambiguates two
 * visually-identical transactions on the same day (e.g. two coffees at the
 * same price), since the running balance differs after each one.
 */
export function computeDedupHash(input: DedupHashInput): string {
  const parts = [
    input.bankAccountId,
    input.transactionDate,
    normalizeAmount(input.moneyIn),
    normalizeAmount(input.moneyOut),
    normalizeAmount(input.balanceAfter),
    normalizeDescription(input.description),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
