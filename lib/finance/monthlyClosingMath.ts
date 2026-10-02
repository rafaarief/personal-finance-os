export interface ClosingIncome { source: string; amount: number }

export function calculateMonthlyClosing(incomeItems: ClosingIncome[], openingNetWorth: number, closingNetWorth: number) {
  const income = incomeItems.reduce((sum, item) => sum + item.amount, 0);
  const saving = closingNetWorth - openingNetWorth;
  return { income, saving, expense: income - saving };
}
