import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { callKimiChat, getKimiApiKey, KimiRequestError } from "./kimiClient";
import { financialReviewResponseSchema, type FinancialReviewResponse } from "@/lib/schemas/financialReview";
import { ALLOCATION_TARGETS } from "@/lib/finance/targets";
import type { FinancialSignals, Highlight } from "@/lib/finance/insights";
import { formatMoney, formatPercent } from "@/lib/format/money";

const SYSTEM_PROMPT = `You are a financial analyst writing a short, direct review for a personal wealth dashboard.

You will receive JSON with the user's current financial signals (already computed — trust these numbers, don't recompute or second-guess them) and their allocation targets.

Write:
- "summary": 2-4 sentences in plain English synthesizing what happened and what it means. Reference specific numbers from the input. No greeting, no sign-off, no bullet points — flowing prose.
- "recommendation": one concrete, actionable sentence (or null if nothing meaningfully needs attention right now). Be specific (amounts, thresholds), not generic advice like "keep saving."

Respond with ONLY a JSON object matching exactly: {"summary": string, "recommendation": string | null}. No markdown, no code fences, no other text.`;

function buildFallbackSummary(signals: FinancialSignals): FinancialReviewResponse {
  const parts: string[] = [];
  parts.push(`Net worth is currently ${formatMoney(signals.netWorth)}.`);
  if (signals.snapshotChangeAmount !== null && signals.previousSnapshotDate) {
    parts.push(
      `That's a ${signals.snapshotChangeAmount >= 0 ? "gain" : "drop"} of ${formatMoney(Math.abs(signals.snapshotChangeAmount))} since the ${signals.previousSnapshotDate} snapshot.`
    );
  }
  if (signals.liquidityRatio !== null) {
    parts.push(`Liquid assets make up ${formatPercent(signals.liquidityRatio)} of total net worth.`);
  }
  if (signals.emergencyFundMonths !== null) {
    parts.push(`Your cash position covers ${signals.emergencyFundMonths.toFixed(1)} months of average expenses.`);
  }
  return { summary: parts.join(" "), recommendation: null };
}

async function callKimiForReview(signals: FinancialSignals, highlights: Highlight[]): Promise<FinancialReviewResponse> {
  const payload = {
    signals: {
      netWorth: signals.netWorth,
      snapshotChangeAmount: signals.snapshotChangeAmount,
      snapshotChangePct: signals.snapshotChangePct,
      previousSnapshotDate: signals.previousSnapshotDate,
      netWorthIsAllTimeHigh: signals.netWorthIsAllTimeHigh,
      liquidityRatio: signals.liquidityRatio,
      cashAllocationPct: signals.cashAllocationPct,
      investmentAllocationPct: signals.investmentAllocationPct,
      businessAllocationPct: signals.businessAllocationPct,
      otherAllocationPct: signals.otherAllocationPct,
      emergencyFundMonths: signals.emergencyFundMonths,
      currentMonthIncome: signals.currentMonthIncome,
      currentMonthExpense: signals.currentMonthExpense,
      expenseMoMChangePct: signals.expenseMoMChangePct,
      investmentGainPct: signals.investmentGainPct,
      healthStatus: signals.healthStatus,
    },
    highlights: highlights.map((h) => h.text),
    allocationTargets: ALLOCATION_TARGETS,
    currency: "IDR",
  };

  const raw = await callKimiChat([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(payload) },
  ]);

  let parsedJson: unknown;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsedJson = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    throw new KimiRequestError(`Kimi response was not valid JSON: ${raw.slice(0, 200)}`);
  }

  const parsed = financialReviewResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new KimiRequestError(`Kimi response failed validation: ${parsed.error.message}`);
  }

  return parsed.data;
}

/**
 * Returns today's AI narrative, generating + caching it on first call of the
 * day. The `financial_reviews` row (keyed by reviewDate, unique) *is* the
 * cache — a second call the same day just reads it back, no Kimi call.
 * Highlights/allocation numbers on the page are always computed fresh
 * (cheap, deterministic); only the AI prose is what's cached here.
 */
export async function getOrCreateTodaysReview(
  signals: FinancialSignals,
  highlights: Highlight[]
): Promise<FinancialReviewResponse> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const [existing] = await db
    .select()
    .from(schema.financialReviews)
    .where(eq(schema.financialReviews.reviewDate, today))
    .limit(1);

  if (existing) {
    return { summary: existing.summary, recommendation: existing.recommendation };
  }

  let result: FinancialReviewResponse;
  if (getKimiApiKey()) {
    try {
      result = await callKimiForReview(signals, highlights);
    } catch (error) {
      console.warn("Kimi review generation failed, using fallback summary:", error);
      result = buildFallbackSummary(signals);
    }
  } else {
    result = buildFallbackSummary(signals);
  }

  await db
    .insert(schema.financialReviews)
    .values({
      reviewDate: today,
      netWorth: signals.netWorth.toString(),
      highlights: highlights,
      summary: result.summary,
      recommendation: result.recommendation,
    })
    .onConflictDoNothing({ target: schema.financialReviews.reviewDate });

  return result;
}
