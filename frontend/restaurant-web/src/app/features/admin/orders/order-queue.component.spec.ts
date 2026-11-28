import { describe, expect, it } from 'vitest';
import { Order } from '../../../core/models/order.model';
import { OrderQueueComponent } from './order-queue.component';

describe('multi-round settlement', () => {
  const queue = OrderQueueComponent.prototype;
  const round = (id: string, minute: number, amount: number): Order => ({
    id,
    orderNumber: id,
    restaurantSlug: 'test',
    customerName: '',
    customerPhone: '',
    discountAmount: 0,
    taxAmount: 0,
    cgstAmount: 0,
    sgstAmount: 0,
    updatedAt: new Date(minute * 60000).toISOString(),
    timeline: [],
    seatingSessionId: 'same-visit',
    createdAt: new Date(minute * 60000).toISOString(),
    subtotal: amount,
    totalAmount: amount,
    items: [],
    status: 'ACCEPTED',
    paymentStatus: 'UNPAID',
  });

  it('keeps a missed balance and a later visit separately payable after a split', () => {
    const paid = {
      ...round('first', 1, 861),
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      isSplit: true,
      settledAt: new Date(5 * 60000).toISOString(),
    } as Order;
    const second = round('second', 2, 63);
    const third = round('third', 6, 294);
    const groups = queue.groupOrdersIntoSessions([third, paid, second]);
    expect(groups.find((group) => group.primaryOrder.id === third.id)?.grandTotal).toBe(294);
    expect(groups.find((group) => group.primaryOrder.id === second.id)?.grandTotal).toBe(63);
    expect(groups).toHaveLength(3);
  });

  it('groups open rounds and previews the same paise allocation as the order ledger', () => {
    const rounds = [round('first', 1, 10), round('second', 2, 10)];
    expect(queue.groupOrdersIntoSessions(rounds)).toHaveLength(1);
    const amounts = [0, 1, 2].map((i) =>
      queue.getEqualSplitPartAmount.call(
        {
          splitCount: () => 3,
          getEffectiveDiscount: () => 0,
          selectedCouponCode: () => '',
        } as unknown as OrderQueueComponent,
        { ...rounds[0], sessionRounds: rounds },
        i,
      ),
    );
    expect(amounts).toEqual([6.68, 6.66, 6.66]);
  });
});
