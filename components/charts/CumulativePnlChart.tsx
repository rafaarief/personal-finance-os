"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatCompactMoney } from "@/lib/format/money";
import { formatShortDate } from "@/lib/format/date";
import { CATEGORICAL_SLOTS } from "@/lib/finance/chartColors";

interface CumulativePnlChartProps {
  data: { date: string; cumulativePnl: number }[];
  currency: "IDR" | "USD";
}

/** One currency's realized P&L only — never mixes IDR and USD into a single line. */
export function CumulativePnlChart({ data, currency }: CumulativePnlChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-(--color-ink-muted)">No closed {currency} trades yet.</p>;
  }

  const last = data[data.length - 1].cumulativePnl;
  const lineColor = last >= 0 ? CATEGORICAL_SLOTS.teal : CATEGORICAL_SLOTS.coral;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`cumulativePnlFill-${currency}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgb(11 11 11 / 7%)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            tick={{ fill: "var(--color-ink-muted)", fontSize: 12 }}
            axisLine={{ stroke: "rgb(11 11 11 / 14%)" }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompactMoney(value, currency)}
            tick={{ fill: "var(--color-ink-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            labelFormatter={((date: any) => formatShortDate(String(date))) as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((value: any) => [formatMoney(Number(value), currency), "Cumulative P&L"]) as any}
            contentStyle={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border-hairline)",
              borderRadius: 12,
              color: "var(--color-ink-primary)",
            }}
            cursor={{ stroke: lineColor, strokeWidth: 1 }}
          />
          <Area type="monotone" dataKey="cumulativePnl" stroke={lineColor} strokeWidth={2} fill={`url(#cumulativePnlFill-${currency})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
