const TRANSFER_DESCRIPTION_PATTERNS = [
  /TRSF\s*E-?BANKING/i,
  /TRANSFER\s*(TO|FROM)/i,
  /BI-?FAST/i,
  /KE\s*REK/i,
  /KANTONG/i,
];

const MAX_DAY_GAP = 3;
const AMOUNT_TOLERANCE = 0.01;
const AUTO_LINK_THRESHOLD = 0.7;
const BASE_SCORE = 0.6;
const PATTERN_BOOST = 0.2;

export interface TransferCandidate {
  id: string;
  bankAccountId: string;
  transactionDate: string; // YYYY-MM-DD
  moneyIn: number | null;
  moneyOut: number | null;
  description: string;
}

export interface TransferMatch {
  fromTransactionId: string;
  toTransactionId: string;
  matchConfidence: number;
}

function dayGapBetween(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.abs(Date.parse(a) - Date.parse(b)) / msPerDay;
}

function patternBoost(description: string): number {
  return TRANSFER_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(description)) ? PATTERN_BOOST : 0;
}

/**
 * Two-stage transfer detection, stage 1 (deterministic): for every money-out
 * row, look for a money-in row on a *different* owned account within
 * ±3 days at an exact matching amount, boosted by description pattern hits.
 * Claude's `isLikelyInternalTransfer` flag is deliberately not consulted here
 * — it's advisory-only and used to highlight rows in the review UI, never to
 * auto-link (see lib/ai/extractTransactions.ts).
 */
export function findTransferMatches(candidates: TransferCandidate[]): TransferMatch[] {
  const usedIds = new Set<string>();
  const matches: TransferMatch[] = [];

  const outflows = candidates.filter((tx) => (tx.moneyOut ?? 0) > 0);
  const inflows = candidates.filter((tx) => (tx.moneyIn ?? 0) > 0);

  for (const outTx of outflows) {
    if (usedIds.has(outTx.id)) continue;

    let bestMatch: { inTx: TransferCandidate; score: number } | null = null;

    for (const inTx of inflows) {
      if (usedIds.has(inTx.id) || inTx.id === outTx.id) continue;
      if (inTx.bankAccountId === outTx.bankAccountId) continue;
      if (Math.abs((inTx.moneyIn ?? 0) - (outTx.moneyOut ?? 0)) > AMOUNT_TOLERANCE) continue;
      if (dayGapBetween(outTx.transactionDate, inTx.transactionDate) > MAX_DAY_GAP) continue;

      const score = Math.min(0.99, BASE_SCORE + patternBoost(outTx.description) + patternBoost(inTx.description));
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { inTx, score };
      }
    }

    if (bestMatch && bestMatch.score >= AUTO_LINK_THRESHOLD) {
      matches.push({
        fromTransactionId: outTx.id,
        toTransactionId: bestMatch.inTx.id,
        matchConfidence: bestMatch.score,
      });
      usedIds.add(outTx.id);
      usedIds.add(bestMatch.inTx.id);
    }
  }

  return matches;
}
