import { describe, it, expect, vi } from 'vitest';
import {
  buildWhatsAppBillMessage,
  openWhatsAppBill,
  getWhatsAppWebUrl,
  getWhatsAppAppUrl,
  getWhatsAppPhoneDigits,
} from './whatsapp-bill.util';
import { Order } from '../models/order.model';

describe('whatsapp-bill.util', () => {
  const dummyOrder: Order = {
    id: 'ord-12345678-abcd',
    orderNumber: 'ORD-98765432',
    restaurantSlug: 'gurukripa-bistro',
    tableNumber: '5',
    customerName: 'Rahul Verma',
    customerPhone: '+91 98765 43210',
    orderType: 'DINE_IN',
    status: 'COMPLETED',
    paymentStatus: 'PAID',
    paymentMethod: 'UPI',
    subtotal: 500,
    discountAmount: 50,
    cgstAmount: 11.25,
    sgstAmount: 11.25,
    taxAmount: 22.5,
    totalAmount: 472.5,
    items: [
      {
        id: 'item-1',
        menuItemId: 'menu-1',
        name: 'Dal Makhani',
        quantity: 2,
        unitPrice: 200,
        itemTotal: 400,
        selectedVariants: [],
        selectedAddons: [],
      },
      {
        id: 'item-2',
        menuItemId: 'menu-2',
        name: 'Butter Naan',
        quantity: 2,
        unitPrice: 50,
        itemTotal: 100,
        selectedVariants: [],
        selectedAddons: [],
      },
    ],
    createdAt: '2026-11-15T20:30:00.000Z',
    updatedAt: '2026-11-15T21:00:00.000Z',
    timeline: [],
  };

  describe('buildWhatsAppBillMessage', () => {
    it('formats a cordial greeting with restaurant name and guest name', () => {
      const msg = buildWhatsAppBillMessage('GuruKripa Bistro', dummyOrder);
      expect(msg).toContain('*Namaste Rahul Verma!* 🙏');
      expect(msg).toContain('*GuruKripa Bistro*');
      expect(msg).toContain('🧾 *DIGITAL TAX INVOICE*');
      expect(msg).toContain('*Order Ref:* ORD-98765432');
      expect(msg).toContain('*Service:* Table 5');
    });

    it('itemizes dishes and specifies subtotal, discount, CGST, SGST, Net Total and payment status in clean structured layout', () => {
      const msg = buildWhatsAppBillMessage('GuruKripa Bistro', dummyOrder);
      expect(msg).toContain('• Dal Makhani x 2 = ₹400.00');
      expect(msg).toContain('• Butter Naan x 2 = ₹100.00');
      expect(msg).toContain('*Subtotal:* ₹500.00');
      expect(msg).toContain('*Discount:* -₹50.00');
      expect(msg).toContain('*CGST (2.5%):* ₹11.25');
      expect(msg).toContain('*SGST (2.5%):* ₹11.25');
      expect(msg).toContain('*Net Total:* *₹472.50*');
      expect(msg).toContain('*Payment Status:* *PAID (UPI)*');
      expect(msg).toContain('✨ *Thank you for dining with GuruKripa Bistro!*');
    });

    it('formats coupon discount code when appliedCouponCode is present', () => {
      const couponOrder: Order = {
        ...dummyOrder,
        appliedCouponCode: 'WELCOME50',
      };
      const msg = buildWhatsAppBillMessage('GuruKripa Bistro', couponOrder);
      expect(msg).toContain('*Discount (WELCOME50):* -₹50.00');
      expect(msg).toContain('*CGST (2.5%):* ₹11.25');
      expect(msg).toContain('*SGST (2.5%):* ₹11.25');
    });

    it('formats integer net total as whole rupees without decimal trailing zeros', () => {
      const wholeRupeeOrder: Order = {
        ...dummyOrder,
        totalAmount: 850,
      };
      const msg = buildWhatsAppBillMessage('Gurukripa Dhaba', wholeRupeeOrder);
      expect(msg).toContain('*Net Total:* *₹850*');
    });

    it('supports split bills properly', () => {
      const split = {
        splitIndex: 1,
        splitTotalCount: 2,
        totalAmount: 236.25,
        paymentStatus: 'PAID',
        paymentMethod: 'CASH',
      };
      const msg = buildWhatsAppBillMessage('GuruKripa Bistro', dummyOrder, split);
      expect(msg).toContain('(Split Bill #1/2)');
      expect(msg).toContain('*Net Total:* *₹236.25*');
      expect(msg).toContain('*Payment Status:* *PAID (CASH)*');
    });

    it('handles walk-in guests with default fallback greeting', () => {
      const walkInOrder: Order = {
        ...dummyOrder,
        customerName: 'Walk-in Guest',
      };
      const msg = buildWhatsAppBillMessage('Test Restro', walkInOrder);
      expect(msg).toContain('*Namaste Valued Guest!* 🙏');
    });
  });

  describe('getWhatsAppWebUrl and getWhatsAppAppUrl', () => {
    it('constructs direct web.whatsapp.com and api.whatsapp.com URLs', () => {
      const webUrl = getWhatsAppWebUrl('9876543210', 'GuruKripa Bistro', dummyOrder);
      expect(webUrl).toContain('https://web.whatsapp.com/send?phone=919876543210&text=');
      expect(webUrl).toContain(encodeURIComponent('*Namaste Rahul Verma!* 🙏'));

      const appUrl = getWhatsAppAppUrl('9876543210', 'GuruKripa Bistro', dummyOrder);
      expect(appUrl).toContain('https://api.whatsapp.com/send?phone=919876543210&text=');
    });

    it('returns empty string if phone is fewer than 10 digits', () => {
      expect(getWhatsAppWebUrl('12345', 'GuruKripa Bistro', dummyOrder)).toBe('');
      expect(getWhatsAppAppUrl('12345', 'GuruKripa Bistro', dummyOrder)).toBe('');
    });
  });

  describe('openWhatsAppBill', () => {
    it('creates an anchor and triggers click for valid phone numbers', () => {
      const clickSpy = vi.fn();
      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        const el = origCreateElement(tagName);
        if (tagName.toLowerCase() === 'a') {
          el.click = clickSpy;
        }
        return el;
      });

      const success = openWhatsAppBill('9876543210', 'GuruKripa Bistro', dummyOrder, null, true);
      expect(success).toBe(true);
      expect(clickSpy).toHaveBeenCalledTimes(1);

      vi.restoreAllMocks();
    });

    it('rejects numbers with fewer than 10 digits', () => {
      const success = openWhatsAppBill('12345', 'GuruKripa Bistro', dummyOrder);
      expect(success).toBe(false);
    });
  });
});
