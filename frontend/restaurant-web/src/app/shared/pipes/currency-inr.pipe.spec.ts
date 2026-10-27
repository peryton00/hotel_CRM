import { describe, it, expect } from 'vitest';
import { CurrencyInrPipe } from './currency-inr.pipe';

describe('CurrencyInrPipe', () => {
  const pipe = new CurrencyInrPipe();

  it('formats zero correctly with symbol', () => {
    expect(pipe.transform(0)).toBe('₹0');
  });

  it('formats integer values in INR Indian grouping format', () => {
    expect(pipe.transform(495)).toBe('₹495');
    expect(pipe.transform(24500)).toBe('₹24,500');
    expect(pipe.transform(148520)).toBe('₹1,48,520');
  });

  it('formats decimal amounts with 2 fractional digits', () => {
    expect(pipe.transform(1958.25)).toBe('₹1,958.25');
  });

  it('omits currency symbol when showSymbol is false', () => {
    expect(pipe.transform(625, false)).toBe('625');
  });

  it('handles null, undefined, and NaN gracefully', () => {
    expect(pipe.transform(null)).toBe('₹0');
    expect(pipe.transform(undefined)).toBe('₹0');
    expect(pipe.transform('invalid')).toBe('₹0');
  });
});
