"use client";

import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactMoney } from "@/lib/format/money";
import { formatShortDate } from "@/lib/format/date";
import { CATEGORICAL_SLOTS } from "@/lib/finance/chartColors";

interface ValuationHistoryChartProps {
  /** One point per recorded snapshot date. capitalContributed is null wherever capital isn't known as of that date. */
  data: { snapshotDate: string; currentValue: number; capitalContributed: number | null }[];
  capitalLabel: string;
  currentValueLabel: string;
  /** Cash has no capital/cost-basis concept at all — set false to skip the "not recorded yet" note that otherwise implies one is expected. */
  showCapitalNote?: boolean;
}

const CURRENT_VALUE_COLOR = CATEGORICAL_SLOTS.purple;
const CAPITAL_COLOR = CATEGORICAL_SLOTS.coral;

export function ValuationHistoryChart({ data, capitalLabel, currentValueLabel, showCapitalNote = true }: ValuationHistoryChartProps) {
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
              dataKey="currentValue"
              name={currentValueLabel}
              stroke={CURRENT_VALUE_COLOR}
              strokeWidth={2}
              dot={{ r: 3, fill: CURRENT_VALUE_COLOR, strokeWidth: 0 }}
              connectNulls
            />
            {hasCapitalData ? (
              <Line
                type="monotone"
                dataKey="capitalContributed"
                name={capitalLabel}
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
      {!hasCapitalData && showCapitalNote ? (
        <p className="mt-2 text-xs text-(--color-ink-muted)">
          {capitalLabel} history hasn&apos;t been recorded yet — showing {currentValueLabel.toLowerCase()} only.
        </p>
      ) : null}
    </div>
  );
}
