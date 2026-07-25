"use client";

import { useRouter } from "next/navigation";
import { formatMonthLabel } from "@/lib/format/money";

interface MonthSelectorProps {
  month: string;
  months: string[];
}

export function MonthSelector({ month, months }: MonthSelectorProps) {
  const router = useRouter();
  // Safety net only — getAvailableTransactionMonths already includes the current month via its rolling window.
  const options = months.includes(month) ? months : [month, ...months];

  return (
    <div className="relative z-20">
      <select
        value={month}
        onChange={(event) => router.push(`/cashflow?month=${event.target.value}`)}
        className="relative z-20 rounded-full border border-(--color-border-hairline) bg-(--color-surface) px-4 py-2 text-sm font-medium text-(--color-ink-primary)"
      >
        {options.map((value) => (
          <option key={value} value={value}>
            {formatMonthLabel(value)}
          </option>
        ))}
      </select>
    </div>
  );
}
