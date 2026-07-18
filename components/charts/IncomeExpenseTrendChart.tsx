"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactMoney, formatMonthLabel } from "@/lib/format/money";

interface IncomeExpenseTrendChartProps {
  data: { month: string; income: number; expense: number }[];
}

export function IncomeExpenseTrendChart({ data }: IncomeExpenseTrendChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgb(11 11 11 / 7%)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthLabel}
            tick={{ fill: "var(--color-ink-muted)", fontSize: 12 }}
            axisLine={{ stroke: "rgb(11 11 11 / 14%)" }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompactMoney(value)}
            tick={{ fill: "var(--color-ink-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip
            labelFormatter={((month: any) => formatMonthLabel(String(month))) as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((value: any, name: any) => [formatCompactMoney(Number(value)), name]) as any}
            contentStyle={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border-hairline)",
              borderRadius: 12,
              color: "var(--color-ink-primary)",
            }}
          />
          <Legend wrapperStyle={{ color: "var(--color-ink-secondary)", fontSize: 13 }} />
          <Line
            type="monotone"
            dataKey="income"
            name="Income"
            stroke="var(--color-delta-positive)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="expense"
            name="Expense"
            stroke="var(--color-delta-negative)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
