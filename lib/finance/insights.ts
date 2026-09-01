import {
  getNetWorthSummary,
  getSnapshotChange,
  getNetWorthHistoryExact,
  getCashflowSummary,
  getMonthlyIncomeExpense,
  getCapitalMarketSummary,
  getWealthSummaryAsOf,
} from "./aggregates";
import { ALLOCATION_TARGETS, EMERGENCY_FUND_TARGET_MONTHS } from "./targets";
import { currentMonthString, previousMonthString } from "@/lib/format/date";
import { formatMonthLabel } from "@/lib/format/money";

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

export type HealthStatus = "excellent" | "good" | "attention";

export interface FinancialSignals {
  netWorth: number;
  latestSnapshotDate: string | null;
  previousSnapshotDate: string | null;
  snapshotChangeAmount: number | null;
  snapshotChangePct: number | null;
  netWorthIsAllTimeHigh: boolean;
  liquidAssets: number;
  liquidityRatio: number | null;
  nonLiquidAssets: number;
  cashPosition: number;
  cashAllocationPct: number | null;
  investmentValue: number;
  investmentAllocationPct: number | null;
  businessValue: number;
  businessAllocationPct: number | null;
  otherValue: number;
  otherAllocationPct: number | null;
  receivableValue: number;
  receivableAllocationPct: number | null;
  vehicleValue: number;
  vehicleAllocationPct: number | null;
  emergencyFundMonths: number | null;
  currentMonth: string;
  currentMonthIncome: number;
  currentMonthExpense: number;
  expenseMoMChangePct: number | null;
  investmentGainPct: number | null;
  healthStatus: HealthStatus;
  /** "Aug 2026" — the calendar month each *MoMChange{Pct,Amount} below is measured against. Null if there's no data far enough back to compare. */
  previousMonthLabel: string | null;
  liquidAssetsMoMChangePct: number | null;
  liquidAssetsMoMChangeAmount: number | null;
  nonLiquidAssetsMoMChangePct: number | null;
  nonLiquidAssetsMoMChangeAmount: number | null;
  cashMoMChangePct: number | null;
  cashMoMChangeAmount: number | null;
  investmentMoMChangePct: number | null;
  investmentMoMChangeAmount: number | null;
  businessMoMChangePct: number | null;
  businessMoMChangeAmount: number | null;
  otherAssetsMoMChangePct: number | null;
  otherAssetsMoMChangeAmount: number | null;
}

export interface Highlight {
  status: "good" | "warning" | "critical";
  text: string;
}

/**
 * Deterministic — every number here comes straight from the existing
 * aggregate queries, never from the AI. Headline figures (net worth,
 * allocations) use each asset class's own freshest current value: Cash stays
 * "as of the latest bank statement" (an account with no reported balance for
 * that statement correctly drops out instead of blending in a stale value),
 * while Capital Market and Business reflect each account's own latest edit —
 * see getNetWorthSummary.
 */
export async function computeFinancialSignals(): Promise<FinancialSignals> {
  const month = currentMonthString();
  const previousMonth = previousMonthString(month);

  const snapshotChange = await getSnapshotChange();
  const latestDate = snapshotChange?.latestDate ?? null;

  // The MoM comparison tracks the calendar month before the latest snapshot's
  // own month (e.g. latest = 1 Sep -> compare against 1 Aug), the same
  // month-boundary convention getNetWorthHistoryExact uses for the chart —
  // not "30 days ago" or the literal previous snapshot, which can land on an
  // irregular mid-month statement date.
  const latestSnapshotMonth = latestDate ? latestDate.slice(0, 7) : null;
  const priorSnapshotMonth = latestSnapshotMonth ? previousMonthString(latestSnapshotMonth) : null;

  const [wealth, history, cashflow, monthlyTrend, capitalMarket, priorMonthWealth] = await Promise.all([
    getNetWorthSummary(),
    getNetWorthHistoryExact(),
    getCashflowSummary(month),
    getMonthlyIncomeExpense(13),
    getCapitalMarketSummary(),
    priorSnapshotMonth ? getWealthSummaryAsOf(`${priorSnapshotMonth}-01`) : Promise.resolve(null),
  ]);

  const netWorth = wealth.netWorth;

  const historicalMax = history.reduce((max, point) => Math.max(max, point.netWorth), 0);
  const netWorthIsAllTimeHigh = netWorth >= historicalMax;

  const liquidityRatio = netWorth > 0 ? wealth.liquidAssets / netWorth : null;
  const cashAllocationPct = netWorth > 0 ? wealth.cashPosition / netWorth : null;
  const investmentAllocationPct = netWorth > 0 ? wealth.capitalMarketValue / netWorth : null;
  const businessAllocationPct = netWorth > 0 ? wealth.businessValue / netWorth : null;
  const otherAllocationPct = netWorth > 0 ? wealth.otherAssetsValue / netWorth : null;
  const receivableAllocationPct = netWorth > 0 ? wealth.receivableValue / netWorth : null;
  const vehicleAllocationPct = netWorth > 0 ? wealth.vehicleValue / netWorth : null;

  const currentMonthRow = monthlyTrend.find((row) => row.month === month) ?? { income: 0, expense: 0 };
  const previousMonthRow = monthlyTrend.find((row) => row.month === previousMonth);
  const expenseMoMChangePct =
    previousMonthRow && previousMonthRow.expense > 0
      ? (currentMonthRow.expense - previousMonthRow.expense) / previousMonthRow.expense
      : null;

  const emergencyFundMonths = cashflow.emergencyFundRatio;
  const savingRate = cashflow.savingRate ?? 0;

  let healthStatus: HealthStatus = "good";
  if ((emergencyFundMonths !== null && emergencyFundMonths < 3) || savingRate < 0) {
    healthStatus = "attention";
  } else if (
    emergencyFundMonths !== null &&
    emergencyFundMonths >= EMERGENCY_FUND_TARGET_MONTHS &&
    (liquidityRatio ?? 0) >= 0.5 &&
    savingRate >= 0.2
  ) {
    healthStatus = "excellent";
  }

  const otherOnlyValue = wealth.otherAssetsValue - wealth.receivableValue - wealth.vehicleValue;

  const otherAssetsTotal = otherOnlyValue + wealth.receivableValue + wealth.vehicleValue;
  const priorOtherAssetsTotal = priorMonthWealth
    ? priorMonthWealth.otherValue + priorMonthWealth.receivableValue + priorMonthWealth.vehicleValue
    : null;

  const previousMonthLabel = priorSnapshotMonth ? formatMonthLabel(priorSnapshotMonth) : null;
  const liquidAssetsMoMChangePct = priorMonthWealth ? pctChange(wealth.liquidAssets, priorMonthWealth.liquidAssets) : null;
  const liquidAssetsMoMChangeAmount = priorMonthWealth ? wealth.liquidAssets - priorMonthWealth.liquidAssets : null;
  const nonLiquidAssetsMoMChangePct = priorMonthWealth
    ? pctChange(wealth.nonLiquidAssets, priorMonthWealth.nonLiquidAssets)
    : null;
  const nonLiquidAssetsMoMChangeAmount = priorMonthWealth
    ? wealth.nonLiquidAssets - priorMonthWealth.nonLiquidAssets
    : null;
  const cashMoMChangePct = priorMonthWealth ? pctChange(wealth.cashPosition, priorMonthWealth.cashPosition) : null;
  const cashMoMChangeAmount = priorMonthWealth ? wealth.cashPosition - priorMonthWealth.cashPosition : null;
  const investmentMoMChangePct = priorMonthWealth
    ? pctChange(wealth.capitalMarketValue, priorMonthWealth.investmentValue)
    : null;
  const investmentMoMChangeAmount = priorMonthWealth
    ? wealth.capitalMarketValue - priorMonthWealth.investmentValue
    : null;
  const businessMoMChangePct = priorMonthWealth ? pctChange(wealth.businessValue, priorMonthWealth.businessValue) : null;
  const businessMoMChangeAmount = priorMonthWealth ? wealth.businessValue - priorMonthWealth.businessValue : null;
  const otherAssetsMoMChangePct = priorOtherAssetsTotal !== null ? pctChange(otherAssetsTotal, priorOtherAssetsTotal) : null;
  const otherAssetsMoMChangeAmount = priorOtherAssetsTotal !== null ? otherAssetsTotal - priorOtherAssetsTotal : null;

  return {
    netWorth,
    latestSnapshotDate: latestDate,
    previousSnapshotDate: snapshotChange?.previousDate ?? null,
    snapshotChangeAmount: snapshotChange?.changeAmount ?? null,
    snapshotChangePct: snapshotChange?.changePct ?? null,
    netWorthIsAllTimeHigh,
    liquidAssets: wealth.liquidAssets,
    liquidityRatio,
    nonLiquidAssets: wealth.nonLiquidAssets,
    cashPosition: wealth.cashPosition,
    cashAllocationPct,
    investmentValue: wealth.capitalMarketValue,
    investmentAllocationPct,
    businessValue: wealth.businessValue,
    businessAllocationPct,
    otherValue: otherOnlyValue,
    otherAllocationPct,
    receivableValue: wealth.receivableValue,
    receivableAllocationPct,
    vehicleValue: wealth.vehicleValue,
    vehicleAllocationPct,
    emergencyFundMonths,
    currentMonth: month,
    currentMonthIncome: currentMonthRow.income,
    currentMonthExpense: currentMonthRow.expense,
    expenseMoMChangePct,
    investmentGainPct: capitalMarket.returnPct !== null ? capitalMarket.returnPct / 100 : null,
    previousMonthLabel,
    liquidAssetsMoMChangePct,
    liquidAssetsMoMChangeAmount,
    nonLiquidAssetsMoMChangePct,
    nonLiquidAssetsMoMChangeAmount,
    cashMoMChangePct,
    cashMoMChangeAmount,
    investmentMoMChangePct,
    investmentMoMChangeAmount,
    businessMoMChangePct,
    businessMoMChangeAmount,
    otherAssetsMoMChangePct,
    otherAssetsMoMChangeAmount,
    healthStatus,
  };
}

/** Template-based, no AI — instant and always reliable for the "Today's Highlights" list. */
export function computeHighlights(signals: FinancialSignals): Highlight[] {
  const highlights: Highlight[] = [];

  if (signals.netWorthIsAllTimeHigh) {
    highlights.push({ status: "good", text: "Net worth reached an all-time high" });
  }

  if (signals.cashAllocationPct !== null) {
    if (signals.cashAllocationPct < ALLOCATION_TARGETS.cashMin) {
      highlights.push({
        status: "warning",
        text: `Cash allocation (${(signals.cashAllocationPct * 100).toFixed(0)}%) is below your ${(ALLOCATION_TARGETS.cashMin * 100).toFixed(0)}% target`,
      });
    }
  }

  if (signals.investmentGainPct !== null && signals.investmentGainPct > 0) {
    highlights.push({ status: "good", text: `Investments are up ${(signals.investmentGainPct * 100).toFixed(0)}% unrealized` });
  } else if (signals.investmentGainPct !== null && signals.investmentGainPct < 0) {
    highlights.push({ status: "warning", text: `Investments are down ${Math.abs(signals.investmentGainPct * 100).toFixed(0)}% unrealized` });
  }

  if (signals.expenseMoMChangePct !== null) {
    if (signals.expenseMoMChangePct > 0.15) {
      highlights.push({
        status: "critical",
        text: `Monthly expenses increased ${(signals.expenseMoMChangePct * 100).toFixed(0)}% vs last month`,
      });
    } else if (signals.expenseMoMChangePct < -0.1) {
      highlights.push({
        status: "good",
        text: `Monthly expenses dropped ${Math.abs(signals.expenseMoMChangePct * 100).toFixed(0)}% vs last month`,
      });
    }
  }

  if (signals.businessAllocationPct !== null && signals.businessAllocationPct > ALLOCATION_TARGETS.businessMax) {
    highlights.push({
      status: "warning",
      text: `Business exposure (${(signals.businessAllocationPct * 100).toFixed(0)}%) exceeds your ${(ALLOCATION_TARGETS.businessMax * 100).toFixed(0)}% target`,
    });
  }

  if (signals.emergencyFundMonths !== null && signals.emergencyFundMonths < 3) {
    highlights.push({
      status: "critical",
      text: `Emergency fund covers only ${signals.emergencyFundMonths.toFixed(1)} months — below the 3-month safety floor`,
    });
  }

  if (highlights.length === 0) {
    highlights.push({ status: "good", text: "No notable changes this period — steady as it goes" });
  }

  return highlights;
}
