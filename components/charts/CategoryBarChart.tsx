"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactMoney, formatMoney } from "@/lib/format/money";

interface CategoryBarChartProps {
  data: { label: string; value: number; color: string }[];
}

export function CategoryBarChart({ data }: CategoryBarChartProps) {
  return (
    <div style={{ height: Math.max(180, data.length * 40) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }} barCategoryGap={10}>
          <XAxis type="number" hide tickFormatter={(value: number) => formatCompactMoney(value)} />
          <YAxis
            type="category"
            dataKey="label"
            width={160}
            tick={{ fill: "var(--color-ink-secondary)", fontSize: 13 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={((value: any) => [formatMoney(Number(value)), "Total"]) as any}
            contentStyle={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border-hairline)",
              borderRadius: 12,
              color: "var(--color-ink-primary)",
            }}
            cursor={{ fill: "rgb(255 255 255 / 4%)" }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
