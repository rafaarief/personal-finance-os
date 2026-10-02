import { describe, expect, it } from 'vitest';
import { calculateMonthlyClosing } from './monthlyClosingMath';
describe('monthly close from net worth', () => {
  it('reconciles September income, corrected saving and inferred expense', () => {
    expect(calculateMonthlyClosing([
      {source:'BoothyCall',amount:63767122},{source:'TENS',amount:6875340},
      {source:'Project Nabil',amount:2000000},{source:'PWC',amount:3000000},
    ],1181496671,1215476240)).toEqual({income:75642462,saving:33979569,expense:41662893});
  });
  it('preserves a loss instead of clamping saving to zero', () => {
    expect(calculateMonthlyClosing([{source:'Income',amount:100}],1000,950))
      .toEqual({income:100,saving:-50,expense:150});
  });
  it('does not hide negative inferred expenditure when valuation gains exceed income', () => {
    expect(calculateMonthlyClosing([],100,150)).toEqual({income:0,saving:50,expense:-50});
  });
});
