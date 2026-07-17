"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "@/lib/format/money";

interface AllocationDonutProps {
  data: { label: string; value: number; color: string }[];
}

export function AllocationDonut({ data }: AllocationDonutProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="95%"
              paddingAngle={2}
              stroke="var(--color-surface)"
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell key={entry.label} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={((value: any, _name: any, item: any) => [formatMoney(Number(value)), item.payload.label]) as any}
              contentStyle={{
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border-hairline)",
                borderRadius: 12,
                color: "var(--color-ink-primary)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend — always present for >=2 series, per dataviz skill */}
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {data.map((entry) => (
          <li key={entry.label} className="flex items-center gap-2 text-(--color-ink-secondary)">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
            {entry.label}
            <span className="tabular text-(--color-ink-muted)">
              {total > 0 ? `${((entry.value / total) * 100).toFixed(0)}%` : "0%"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
