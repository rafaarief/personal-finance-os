import { z } from "zod";

/**
 * Zod is the actual authority for Claude's extraction output — the JSON Schema
 * sent to the API as a tool's `input_schema` is advisory, this is what gets
 * validated. Mirrors kol-finder's `packages/ai/src/nicheClassifier.ts` pattern
 * (forced tool-use, parse `tool_use.input`, re-validate with Zod).
 */
export const extractedTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  description: z.string().min(1),
  counterparty: z.string().nullable().default(null),
  moneyIn: z.number().nonnegative().nullable().default(null),
  moneyOut: z.number().nonnegative().nullable().default(null),
  balanceAfter: z.number().nullable().default(null),
  /** Must be one of the live `categories.key` values passed into the prompt. */
  suggestedCategoryKey: z.string().min(1),
  suggestedSubcategoryKey: z.string().nullable().default(null),
  /** 0-1, how confident the model is in the category suggestion. */
  confidence: z.number().min(0).max(1),
  isBusiness: z.boolean().default(false),
  isInvestment: z.boolean().default(false),
  /** Advisory only — never auto-links by itself, see transferMatch.ts. */
  isLikelyInternalTransfer: z.boolean().default(false),
});
export type ExtractedTransaction = z.infer<typeof extractedTransactionSchema>;

export const extractedStatementSchema = z.object({
  statementPeriodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  statementPeriodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  transactions: z.array(extractedTransactionSchema),
});
export type ExtractedStatement = z.infer<typeof extractedStatementSchema>;

/** The JSON Schema handed to Claude as the forced tool's `input_schema`. Zod above is still re-validated after. */
export const emitExtractedTransactionsToolSchema = {
  name: "emit_extracted_transactions",
  description:
    "Emit every transaction row found in the bank statement, in chronological order, with a suggested category and confidence for each.",
  input_schema: {
    type: "object" as const,
    properties: {
      statementPeriodStart: { type: ["string", "null"], description: "YYYY-MM-DD, if determinable" },
      statementPeriodEnd: { type: ["string", "null"], description: "YYYY-MM-DD, if determinable" },
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD" },
            description: { type: "string" },
            counterparty: { type: ["string", "null"] },
            moneyIn: { type: ["number", "null"] },
            moneyOut: { type: ["number", "null"] },
            balanceAfter: { type: ["number", "null"] },
            suggestedCategoryKey: { type: "string" },
            suggestedSubcategoryKey: { type: ["string", "null"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            isBusiness: { type: "boolean" },
            isInvestment: { type: "boolean" },
            isLikelyInternalTransfer: { type: "boolean" },
          },
          required: ["date", "description", "suggestedCategoryKey", "confidence"],
        },
      },
    },
    required: ["transactions"],
  },
};
