"use client";

import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactMoney } from "@/lib/format/money";
import { formatShortDate } from "@/lib/format/date";
import { CATEGORICAL_SLOTS } from "@/lib/finance/chartColors";

interface CapitalVsPortfolioChartProps {
  /** One point per real statement date. capitalContributed is null wherever cost basis isn't known for that date. */
  data: { snapshotDate: string; portfolioValue: number; capitalContributed: number | null }[];
}

const PORTFOLIO_COLOR = CATEGORICAL_SLOTS.purple;
const CAPITAL_COLOR = CATEGORICAL_SLOTS.coral;

export function CapitalVsPortfolioChart({ data }: CapitalVsPortfolioChartProps) {
  const hasCapitalData = data.some((point) => point.capitalContributed !== null);

  return (
    <div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              formatter={((value: any, name: any) => [value === null ? "Not provided" : formatCompactMoney(Number(value)), name]) as any}
              contentStyle={{
                background: "var(--color-surface-raised)",
                border: "1px solid var(--color-border-hairline)",
                borderRadius: 12,
                color: "var(--color-ink-primary)",
              }}
              cursor={{ stroke: "var(--color-cat-purple)", strokeWidth: 1 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 13, color: "var(--color-ink-secondary)" }}
              formatter={(value) => <span style={{ color: "var(--color-ink-secondary)" }}>{value}</span>}
            />
            <Line
              type="monotone"
              dataKey="portfolioValue"
              name="Portfolio Value"
              stroke={PORTFOLIO_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: PORTFOLIO_COLOR, strokeWidth: 0 }}
              connectNulls
            />
            {hasCapitalData ? (
              <Line
                type="monotone"
                dataKey="capitalContributed"
                name="Capital Contributed"
                stroke={CAPITAL_COLOR}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 3, fill: CAPITAL_COLOR, strokeWidth: 0 }}
                connectNulls={false}
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!hasCapitalData ? (
        <p className="mt-2 text-xs text-(--color-ink-muted)">
          Capital contribution history hasn&apos;t been recorded yet — showing portfolio value only.
        </p>
      ) : null}
    </div>
  );
}
