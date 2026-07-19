"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactMoney } from "@/lib/format/money";
import { formatShortDate } from "@/lib/format/date";

interface NetWorthAreaChartProps {
  /** One point per real, irregular statement date — never assume evenly-spaced months. */
  data: { snapshotDate: string; netWorth: number }[];
}

export function NetWorthAreaChart({ data }: NetWorthAreaChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-seq-purple-500)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-seq-purple-500)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgb(11 11 11 / 7%)" vertical={false} />
          <XAxis
            dataKey="snapshotDate"
            tickFormatter={formatShortDate}
            tick={{ fill: "var(--color-ink-muted)", fontSize: 12 }}
            axisLine={{ stroke: "rgb(11 11 11 / 14%)" }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompactMoney(value)}
            tick={{ fill: "var(--color-ink-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip
            labelFormatter={((date: any) => formatShortDate(String(date))) as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((value: any) => [formatCompactMoney(Number(value)), "Net worth"]) as any}
            contentStyle={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border-hairline)",
              borderRadius: 12,
              color: "var(--color-ink-primary)",
            }}
            cursor={{ stroke: "var(--color-cat-purple)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="netWorth"
            stroke="var(--color-seq-purple-500)"
            strokeWidth={2}
            fill="url(#netWorthFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
