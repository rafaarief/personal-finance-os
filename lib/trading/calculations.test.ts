import { describe, it, expect } from "vitest";
import { calculateTrade, isWinningTrade, isLosingTrade } from "./calculations";

describe("calculateTrade", () => {
  it("computes a closed, profitable trade", () => {
    const result = calculateTrade({ buyPrice: 8500, sellPrice: 9000, quantity: 1000 });
    expect(result.priceReturnPct).toBeCloseTo(5.882352941, 6);
    expect(result.buyValue).toBe(8_500_000);
    expect(result.sellValue).toBe(9_000_000);
    expect(result.realizedPnl).toBe(500_000);
    expect(result.returnOnTradePct).toBeCloseTo(5.882352941, 6);
  });

  it("computes a closed, losing trade", () => {
    const result = calculateTrade({ buyPrice: 100, sellPrice: 90, quantity: 10 });
    expect(result.realizedPnl).toBe(-100);
    expect(result.returnOnTradePct).toBeCloseTo(-10, 6);
    expect(result.priceReturnPct).toBeCloseTo(-10, 6);
  });

  it("returns null for every derived field on an open trade (no sell price)", () => {
    const result = calculateTrade({ buyPrice: 8500, sellPrice: null, quantity: 1000 });
    expect(result.priceReturnPct).toBeNull();
    expect(result.sellValue).toBeNull();
    expect(result.realizedPnl).toBeNull();
    expect(result.returnOnTradePct).toBeNull();
    expect(result.buyValue).toBe(8_500_000); // buy value doesn't need a sell price
  });

  it("returns null for value/pnl fields when quantity is unknown", () => {
    const result = calculateTrade({ buyPrice: 8500, sellPrice: 9000, quantity: null });
    expect(result.buyValue).toBeNull();
    expect(result.sellValue).toBeNull();
    expect(result.realizedPnl).toBeNull();
    expect(result.returnOnTradePct).toBeNull();
    expect(result.priceReturnPct).toBeCloseTo(5.882352941, 6); // price return never needs quantity
  });

  it("never divides by zero buy price", () => {
    const result = calculateTrade({ buyPrice: 0, sellPrice: 10, quantity: 5 });
    expect(result.priceReturnPct).toBeNull();
    expect(result.returnOnTradePct).toBeNull();
  });
});

describe("isWinningTrade / isLosingTrade", () => {
  it("classifies positive, negative, flat, and unknown P&L correctly", () => {
    expect(isWinningTrade(100)).toBe(true);
    expect(isWinningTrade(-100)).toBe(false);
    expect(isWinningTrade(0)).toBe(false);
    expect(isWinningTrade(null)).toBe(false);

    expect(isLosingTrade(-100)).toBe(true);
    expect(isLosingTrade(100)).toBe(false);
    expect(isLosingTrade(0)).toBe(false);
    expect(isLosingTrade(null)).toBe(false);
  });
});
