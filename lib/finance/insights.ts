import {
  getWealthSummaryAsOf,
  getSnapshotChange,
  getNetWorthHistoryExact,
  getCashflowSummary,
  getMonthlyIncomeExpense,
  getInvestmentSummary,
} from "./aggregates";
import { ALLOCATION_TARGETS, EMERGENCY_FUND_TARGET_MONTHS } from "./targets";
import { currentMonthString, previousMonthString } from "@/lib/format/date";

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
}

export interface Highlight {
  status: "good" | "warning" | "critical";
  text: string;
}

/**
 * Deterministic — every number here comes straight from the existing
 * aggregate queries, never from the AI. Headline figures (net worth,
 * allocations) are computed "as of" the latest snapshot date specifically,
 * not from assets' free-floating current_value, so an account with no
 * reported balance for that statement correctly drops out of the totals
 * instead of silently blending in a stale value from a different date.
 */
export async function computeFinancialSignals(): Promise<FinancialSignals> {
  const month = currentMonthString();
  const previousMonth = previousMonthString(month);

  const snapshotChange = await getSnapshotChange();
  const latestDate = snapshotChange?.latestDate ?? null;

  const [wealth, history, cashflow, monthlyTrend, investment] = await Promise.all([
    latestDate ? getWealthSummaryAsOf(latestDate) : null,
    getNetWorthHistoryExact(),
    getCashflowSummary(month),
    getMonthlyIncomeExpense(13),
    getInvestmentSummary(),
  ]);

  const netWorth = wealth?.netWorth ?? 0;

  const historicalMax = history.reduce((max, point) => Math.max(max, point.netWorth), 0);
  const netWorthIsAllTimeHigh = netWorth >= historicalMax;

  const liquidityRatio = wealth && netWorth > 0 ? wealth.liquidAssets / netWorth : null;
  const cashAllocationPct = wealth && netWorth > 0 ? wealth.cashPosition / netWorth : null;
  const investmentAllocationPct = wealth && netWorth > 0 ? wealth.investmentValue / netWorth : null;
  const businessAllocationPct = wealth && netWorth > 0 ? wealth.businessValue / netWorth : null;
  const otherAllocationPct = wealth && netWorth > 0 ? wealth.otherValue / netWorth : null;
  const receivableAllocationPct = wealth && netWorth > 0 ? wealth.receivableValue / netWorth : null;
  const vehicleAllocationPct = wealth && netWorth > 0 ? wealth.vehicleValue / netWorth : null;

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

  return {
    netWorth,
    latestSnapshotDate: latestDate,
    previousSnapshotDate: snapshotChange?.previousDate ?? null,
    snapshotChangeAmount: snapshotChange?.changeAmount ?? null,
    snapshotChangePct: snapshotChange?.changePct ?? null,
    netWorthIsAllTimeHigh,
    liquidAssets: wealth?.liquidAssets ?? 0,
    liquidityRatio,
    nonLiquidAssets: wealth?.nonLiquidAssets ?? 0,
    cashPosition: wealth?.cashPosition ?? 0,
    cashAllocationPct,
    investmentValue: wealth?.investmentValue ?? 0,
    investmentAllocationPct,
    businessValue: wealth?.businessValue ?? 0,
    businessAllocationPct,
    otherValue: wealth?.otherValue ?? 0,
    otherAllocationPct,
    receivableValue: wealth?.receivableValue ?? 0,
    receivableAllocationPct,
    vehicleValue: wealth?.vehicleValue ?? 0,
    vehicleAllocationPct,
    emergencyFundMonths,
    currentMonth: month,
    currentMonthIncome: currentMonthRow.income,
    currentMonthExpense: currentMonthRow.expense,
    expenseMoMChangePct,
    investmentGainPct: investment.roi,
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
