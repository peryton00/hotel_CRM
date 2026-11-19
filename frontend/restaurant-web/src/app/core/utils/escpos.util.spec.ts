import { describe, it, expect } from 'vitest';
import {
  EscPosBuilder,
  buildEscPosReceipt,
  buildEscPosTestReceipt,
  ESCPOS_COMMANDS,
} from './escpos.util';
import { Order } from '../models/order.model';
import { Restaurant } from '../models/restaurant.model';

describe('ESC/POS Thermal Receipt Printing Utility', () => {
  it('initializes EscPosBuilder with 80mm (48 columns) by default', () => {
    const builder = new EscPosBuilder('80mm');
    builder.textLine('Test Line');
    const bytes = builder.build();

    expect(bytes.length).toBeGreaterThan(0);
    // Begins with ESC @ (INIT: 0x1B, 0x40)
    expect(bytes[0]).toBe(ESCPOS_COMMANDS.INIT[0]);
    expect(bytes[1]).toBe(ESCPOS_COMMANDS.INIT[1]);
  });

  it('correctly builds 58mm (32 columns) byte buffer', () => {
    const builder = new EscPosBuilder('58mm');
    builder.tableHeader();
    builder.tableItem('Paneer Tikka', 2, 250, 500);
    builder.cut();
    const bytes = builder.build();

    expect(bytes.length).toBeGreaterThan(0);
    // Checks cut sequence at the end
    const last4 = Array.from(bytes.slice(-4));
    expect(last4).toEqual(ESCPOS_COMMANDS.FEED_AND_CUT);
  });

  it('builds a complete tax invoice with GST breakdown and paper cut', () => {
    const restaurant: Partial<Restaurant> = {
      name: 'GuruKripa Dhaba',
      taxSettings: {
        enableGst: true,
        cgstRate: 2.5,
        sgstRate: 2.5,
        serviceChargeRate: 0,
        gstNumber: '29AAAAA0000A1Z5',
      },
      contact: { phone: '+91 98765 43210', email: 'contact@dhaba.com', website: '' },
      address: { street: 'MG Road', city: 'Bengaluru', state: 'Karnataka', zip: '560001' },
    };

    const order = {
      id: 'ord-1234-abcd',
      orderNumber: 'ORD-101',
      orderType: 'DINE_IN',
      tableNumber: 'T-05',
      customerName: 'Aditya Sharma',
      customerPhone: '+91 98765 43210',
      items: [
        {
          id: 'item-1',
          menuItemId: 'mi-1',
          name: 'Butter Chicken',
          quantity: 2,
          unitPrice: 400,
          itemTotal: 800,
          notes: '',
        },
      ],
      subtotal: 800,
      totalAmount: 840,
      paymentStatus: 'PAID',
      paymentMethod: 'UPI',
      taxBreakdown: {
        cgstRate: 2.5,
        cgstAmount: 20,
        sgstRate: 2.5,
        sgstAmount: 20,
      },
      status: 'COMPLETED',
      createdAt: '2026-11-16T12:00:00Z',
      printCount: 1,
    } as unknown as Order;

    const rawBytes = buildEscPosReceipt(restaurant, order, null, {
      paperWidth: '80mm',
      autoCut: true,
      openCashDrawer: true,
    });

    expect(rawBytes.length).toBeGreaterThan(100);
    const text = new TextDecoder('ascii').decode(rawBytes);

    expect(text).toContain('GuruKripa Dhaba');
    expect(text).toContain('TAX INVOICE');
    expect(text).toContain('ORD-101');
    expect(text).toContain('Table T-05');
    expect(text).toContain('Butter Chicken');
    expect(text).toContain('NET TOTAL');
    expect(text).toContain('Rs. 840.00');
    expect(text).toContain('PAID (UPI)');
  });

  it('includes DUPLICATE marker when printCount > 1', () => {
    const restaurant: Partial<Restaurant> = { name: 'Test Bistro' };
    const order = {
      id: 'ord-dup',
      orderNumber: 'ORD-DUP-01',
      orderType: 'DINE_IN',
      items: [],
      totalAmount: 200,
      paymentStatus: 'PAID',
      status: 'COMPLETED',
      createdAt: '2026-11-16T12:00:00Z',
      printCount: 2,
    } as unknown as Order;

    const rawBytes = buildEscPosReceipt(restaurant, order);
    const text = new TextDecoder('ascii').decode(rawBytes);

    expect(text).toContain('DUPLICATE COPY #2 (REPRINT)');
  });

  it('builds an ESC/POS hardware test receipt', () => {
    const testBytes = buildEscPosTestReceipt('My Thermal Printer', '80mm');
    expect(testBytes.length).toBeGreaterThan(50);
    const text = new TextDecoder('ascii').decode(testBytes);
    expect(text).toContain('Thermal Printer Test Receipt');
    expect(text).toContain('PRINTER TEST PASSED');
  });
});
