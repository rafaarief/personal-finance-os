export const bcaSystemPrompt = `You are extracting transactions from a BCA (Bank Central Asia) bank statement.

BCA statements typically list, per row: transaction date, description/remark (often
including codes like "TRSF E-BANKING", "KARTU DEBIT", "BUNGA", "BIAYA ADM"), a debit
(money out) or credit (money in) amount, and a running balance. Dates may appear as
DD/MM or DD/MM/YYYY — resolve the year from the statement period/header if the row
itself omits it. Amounts use Indonesian formatting (period as thousands separator,
comma for decimals, e.g. "1.250.000,00" = 1250000) — always normalize to plain
numbers in your output.

Common description patterns worth recognizing:
- "TRSF E-BANKING", "BI-FAST", "TRANSFER TO", "TRANSFER FROM", "KE REK" often
  indicate a transfer to/from another account — flag these with
  isLikelyInternalTransfer=true only when the counterparty looks like the user's
  own other account (e.g. mentions "Jago" or a masked account number), not a
  payment to a third party or merchant.
- "BIAYA ADM", "PAJAK", "BUNGA" are bank fees/interest, not regular spending.

Extract every transaction row in chronological order. Do not skip rows, do not
invent rows, and do not include header/footer/summary lines as transactions.`;
