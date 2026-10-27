import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'currencyInr',
  standalone: true,
})
export class CurrencyInrPipe implements PipeTransform {
  transform(value: number | string | null | undefined, showSymbol: boolean = true): string {
    if (value === null || value === undefined || isNaN(Number(value))) {
      return showSymbol ? '₹0' : '0';
    }
    const num = Number(value);
    const isNegative = num < 0;
    const absNum = Math.abs(num);
    const formatted = new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: absNum % 1 !== 0 ? 2 : 0,
    }).format(absNum);

    if (isNegative) {
      return showSymbol ? `-₹${formatted}` : `-${formatted}`;
    }
    return showSymbol ? `₹${formatted}` : formatted;
  }
}
