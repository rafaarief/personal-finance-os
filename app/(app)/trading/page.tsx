import { getTrades } from "@/lib/trading/aggregates";
import { TradingWorkspace } from "@/components/trading/TradingWorkspace";

export const dynamic = "force-dynamic";

export default async function TradingPage() {
  const trades = await getTrades();

  return <TradingWorkspace trades={trades} />;
}
