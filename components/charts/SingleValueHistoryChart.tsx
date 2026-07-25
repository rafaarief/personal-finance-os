"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactMoney } from "@/lib/format/money";
import { formatShortDate } from "@/lib/format/date";

interface SingleValueHistoryChartProps {
  data: { snapshotDate: string; currentValue: number }[];
  label: string;
}

/** Small single-line history chart for an individual asset's edit modal — every prior recorded value, never fabricated between real snapshots. */
export function SingleValueHistoryChart({ data, label }: SingleValueHistoryChartProps) {
  if (data.length < 2) {
    return <p className="text-xs text-(--color-ink-muted)">Not enough history yet — this account only has one recorded value so far.</p>;
  }

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="singleValueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-seq-purple-500)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-seq-purple-500)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgb(11 11 11 / 7%)" vertical={false} />
          <XAxis
            dataKey="snapshotDate"
            tickFormatter={formatShortDate}
            tick={{ fill: "var(--color-ink-muted)", fontSize: 10 }}
            axisLine={{ stroke: "rgb(11 11 11 / 14%)" }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={30}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompactMoney(value)}
            tick={{ fill: "var(--color-ink-muted)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            labelFormatter={((date: any) => formatShortDate(String(date))) as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((value: any) => [formatCompactMoney(Number(value)), label]) as any}
            contentStyle={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border-hairline)",
              borderRadius: 12,
              color: "var(--color-ink-primary)",
              fontSize: 12,
            }}
            cursor={{ stroke: "var(--color-cat-purple)", strokeWidth: 1 }}
          />
          <Area type="monotone" dataKey="currentValue" stroke="var(--color-seq-purple-500)" strokeWidth={2} fill="url(#singleValueFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
