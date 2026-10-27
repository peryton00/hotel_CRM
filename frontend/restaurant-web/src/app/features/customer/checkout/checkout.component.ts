import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../../core/services/cart.service';
import { MockDataService } from '../../../data-access/mock/mock-data.service';
import { ToastService } from '../../../core/services/toast.service';
import { Order, OrderStatus } from '../../../core/models/order.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { normalizeToE164 } from '../../../core/utils/phone.util';
import { generateIdempotencyKey } from '../../../core/utils/idempotency.util';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, CurrencyInrPipe],
  template: `
    <div class="checkout-page">
      <div class="checkout-header">
        <a [routerLink]="['/menu/gurukripa-dhaba/cart']" class="back-link">
          <i class="ph ph-arrow-left"></i>
          <span>Back to Tray</span>
        </a>
        <h1 class="heading-section">Confirm Dine-In Order</h1>
      </div>

      <div class="checkout-grid">
        <!-- Guest Details Form -->
        <div class="left-col">
          <div class="panel-card">
            <div class="panel-top">
              <span class="step-num">1</span>
              <div>
                <h3 class="panel-title">Guest Contact Details</h3>
                <p class="text-xs text-muted">
                  Required for digital bill delivery and table service communication.
                </p>
              </div>
            </div>

            <div class="form-body">
              <div class="form-group">
                <label class="form-label" for="guestName">Full Name *</label>
                <input
                  id="guestName"
                  type="text"
                  class="form-input"
                  placeholder="e.g. Aditya Sharma"
                  [(ngModel)]="guestName"
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="guestPhone">Mobile Number (10 Digits) *</label>
                <div class="phone-input-wrap">
                  <span class="phone-prefix">+91</span>
                  <input
                    id="guestPhone"
                    type="tel"
                    class="form-input phone-input"
                    placeholder="98765 43210"
                    [(ngModel)]="guestPhone"
                    maxlength="10"
                  />
                </div>
              </div>

              <div class="demo-otp-box">
                <div class="otp-header">
                  <i class="ph ph-shield-check"></i>
                  <span>Simulated OTP Verification (Prototype Demo)</span>
                </div>
                <p class="text-xs text-muted">
                  For this prototype, enter <strong>1234</strong> or leave as verified to simulate
                  instant customer phone authentication.
                </p>
                <div class="otp-input-row">
                  <input
                    type="text"
                    class="form-input otp-field"
                    placeholder="1234"
                    [(ngModel)]="demoOtp"
                    maxlength="4"
                  />
                  <span class="verified-tag"><i class="ph ph-check-circle"></i> Demo Verified</span>
                </div>
              </div>
            </div>
          </div>

          <div class="panel-card">
            <div class="panel-top">
              <span class="step-num">2</span>
              <div>
                <h3 class="panel-title">Dining Location</h3>
                <p class="text-xs text-muted">Table confirmed via scanned QR code token.</p>
              </div>
            </div>

            <div class="table-verified-box">
              <i class="ph ph-check-circle text-success"></i>
              <div>
                <strong>Table {{ cartService.tableContext()?.tableNumber || '07' }}</strong>
                <div class="text-xs text-muted">Section: Terrace Garden • Dine-in Service</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Order Summary & Confirmation CTA -->
        <div class="right-col">
          <div class="panel-card">
            <h3 class="panel-title" style="margin-bottom: 12px;">Order Summary</h3>

            <div class="order-items-scroll">
              @for (item of cartService.items(); track item.id) {
                <div class="item-summary-line">
                  <div class="i-left">
                    <span class="i-qty">{{ item.quantity }}×</span>
                    <span class="i-name">{{ item.name }}</span>
                    @if (item.selectedPortion) {
                      <span class="i-portion">({{ item.selectedPortion.label }})</span>
                    }
                  </div>
                  <span class="i-price">{{ item.itemTotal | currencyInr }}</span>
                </div>
              }
            </div>

            <div class="calc-box">
              <div class="calc-row">
                <span>Subtotal</span>
                <span>{{ cartService.subtotal() | currencyInr }}</span>
              </div>
              @if (cartService.discountAmount() > 0) {
                <div class="calc-row discount">
                  <span>Coupon Discount ({{ cartService.appliedCoupon()?.code }})</span>
                  <span>-{{ cartService.discountAmount() | currencyInr }}</span>
                </div>
              }
              <div class="calc-row">
                <span>CGST (2.5%)</span>
                <span>{{ cartService.cgst() | currencyInr }}</span>
              </div>
              <div class="calc-row">
                <span>SGST (2.5%)</span>
                <span>{{ cartService.sgst() | currencyInr }}</span>
              </div>
              <div class="divider"></div>
              <div class="calc-row grand">
                <span>Total Amount</span>
                <span class="grand-price">{{ cartService.finalTotal() | currencyInr }}</span>
              </div>
            </div>

            <button
              class="btn btn-primary place-order-btn"
              [disabled]="!isFormValid() || isSubmitting"
              (click)="submitOrder()"
            >
              @if (isSubmitting) {
                <span>Sending to Kitchen...</span>
              } @else {
                <span>Place Dine-In Order</span>
                <i class="ph ph-arrow-right"></i>
              }
            </button>

            <p class="sub-disclaimer">
              Pay after dining via UPI, Card, or Cash when the bill is presented at your table.
            </p>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .checkout-page {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .checkout-header {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        margin-bottom: 6px;
        &:hover {
          color: var(--color-crimson);
        }
      }

      .checkout-grid {
        display: grid;
        grid-template-columns: 3fr 2fr;
        gap: 20px;
        @media (max-width: 820px) {
          grid-template-columns: 1fr;
        }
      }

      .left-col,
      .right-col {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .panel-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        box-shadow: var(--shadow-xs);
      }

      .panel-top {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .step-num {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--color-onyx);
        color: var(--color-gold);
        font-weight: 800;
        font-size: 0.875rem;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .panel-title {
        font-size: 1rem;
        font-weight: 700;
      }
      .form-body {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .phone-input-wrap {
        display: flex;
        align-items: center;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        overflow: hidden;
      }

      .phone-prefix {
        background: var(--color-bone);
        padding: 10px 14px;
        font-weight: 600;
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        border-right: 1px solid var(--color-border);
      }

      .phone-input {
        border: none;
        box-shadow: none;
        border-radius: 0;
      }

      .demo-otp-box {
        background: var(--color-bone-light);
        border: 1px dashed var(--color-border);
        border-radius: var(--radius-sm);
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .otp-header {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--color-info);
      }

      .otp-input-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .otp-field {
        width: 90px;
        text-align: center;
        letter-spacing: 0.3em;
        font-weight: 800;
      }

      .verified-tag {
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-success);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .table-verified-box {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-sm);
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 0.875rem;
        i {
          font-size: 1.5rem;
        }
      }

      .order-items-scroll {
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-height: 180px;
        overflow-y: auto;
        border-bottom: 1px solid var(--color-border-subtle);
        padding-bottom: 10px;
      }

      .item-summary-line {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.8125rem;
      }

      .i-left {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
      }
      .i-qty {
        font-weight: 700;
        color: var(--color-crimson);
      }
      .i-name {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .i-portion {
        color: var(--color-text-muted);
        font-size: 0.75rem;
      }
      .i-price {
        font-weight: 600;
        font-size: 0.8125rem;
      }

      .calc-box {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 0.8125rem;
        margin-top: 6px;
      }
      .calc-row {
        display: flex;
        justify-content: space-between;
        color: var(--color-text-secondary);

        &.discount {
          color: var(--color-success);
          font-weight: 600;
        }
        &.grand {
          font-size: 1.125rem;
          font-weight: 800;
          color: var(--color-text-primary);
          margin-top: 6px;
        }
      }

      .grand-price {
        color: var(--color-crimson);
      }
      .divider {
        height: 1px;
        background: var(--color-border);
        margin: 4px 0;
      }

      .place-order-btn {
        width: 100%;
        padding: 14px;
        font-size: 1rem;
        gap: 10px;
        margin-top: 6px;
      }

      .sub-disclaimer {
        font-size: 0.6875rem;
        color: var(--color-taupe);
        text-align: center;
        line-height: 1.35;
      }
    `,
  ],
})
export class CheckoutComponent {
  cartService = inject(CartService);
  private mock = inject(MockDataService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  guestName = localStorage.getItem('royal_spice_customer_name') || 'Aditya Sharma';
  guestPhone = localStorage.getItem('royal_spice_customer_phone') || '9876543210';
  demoOtp = '1234';
  isSubmitting = false;

  isFormValid(): boolean {
    const tableCtx = this.cartService.tableContext();
    if (!tableCtx) return false;
    const table = this.mock
      .tables()
      .find(
        (t) =>
          (t.id === tableCtx.tableId || t.number === tableCtx.tableNumber) &&
          (t.qrToken === tableCtx.token || t.id === tableCtx.token),
      );
    if (!table || table.orderingEnabled === false || table.status === 'DIRTY') return false;

    return (
      this.guestName.trim().length >= 2 &&
      this.guestPhone.trim().length >= 10 &&
      this.cartService.items().length > 0
    );
  }

  submitOrder(): void {
    if (!this.isFormValid() || this.isSubmitting) return;

    const tableCtx = this.cartService.tableContext();
    if (!tableCtx) {
      this.toastService.warning('A valid table QR session is required to place an order.');
      return;
    }

    const table = this.mock
      .tables()
      .find(
        (t) =>
          (t.id === tableCtx.tableId || t.number === tableCtx.tableNumber) &&
          (t.qrToken === tableCtx.token || t.id === tableCtx.token),
      );
    if (!table || table.orderingEnabled === false || table.status === 'DIRTY') {
      this.toastService.warning('Ordering is currently unavailable or disabled for this table.');
      return;
    }

    const normalizedPhone = normalizeToE164(this.guestPhone);

    // Persist phone & name for auto-linking previous orders
    localStorage.setItem('royal_spice_customer_phone', normalizedPhone);
    localStorage.setItem('royal_spice_customer_name', this.guestName.trim());

    this.isSubmitting = true;
    const randomNum = Math.floor(100 + Math.random() * 900);
    const orderId = `ord-${Date.now().toString().slice(-4)}`;

    // Resolve or find customer UUID
    const matchedCustomer = this.mock
      .customers()
      .find(
        (c) =>
          c.phoneE164 === normalizedPhone ||
          (c.phone && normalizeToE164(c.phone) === normalizedPhone),
      );

    const idempotencyKey = generateIdempotencyKey('order', matchedCustomer?.id);

    const newOrder: Order = {
      id: orderId,
      orderNumber: `#ORD-${randomNum}`,
      orderType: 'DINE_IN',
      idempotencyKey,
      restaurantId: 'rest-001',
      restaurantSlug: 'gurukripa-dhaba',
      tableId: tableCtx.tableId,
      tableNumber: tableCtx.tableNumber,
      customerId: matchedCustomer?.id,
      customerName: this.guestName.trim(),
      customerPhone: `+91 ${this.guestPhone.trim()}`,
      customerPhoneE164: normalizedPhone,
      items: [...this.cartService.items()],
      subtotal: this.cartService.subtotal(),
      discountAmount: this.cartService.discountAmount(),
      appliedCouponCode: this.cartService.appliedCoupon()?.code,
      taxAmount: this.cartService.totalTax(),
      cgstAmount: this.cartService.cgst(),
      sgstAmount: this.cartService.sgst(),
      totalAmount: this.cartService.finalTotal(),
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeline: [
        {
          status: 'RECEIVED',
          timestamp: new Date().toISOString(),
          note: `Dine-in order placed at Table ${tableCtx.tableNumber}`,
        },
      ],
    };

    // Execute atomic idempotent order submission simulation
    const result = this.mock.simulateIdempotentOrderSubmission({
      idempotencyKey,
      order: newOrder,
      appliedCouponCode: this.cartService.appliedCoupon()?.code,
    });

    if (!result.success) {
      this.isSubmitting = false;
      this.toastService.warning(result.error || 'Failed to place order');
      return;
    }

    // Update Table status to OCCUPIED
    const updatedTables = this.mock
      .tables()
      .map((t) =>
        t.id === tableCtx.tableId || t.number === tableCtx.tableNumber
          ? { ...t, status: 'OCCUPIED' as const }
          : t,
      );
    this.mock.tables.set(updatedTables);
    this.mock.saveLocal('tables', updatedTables);

    // Clear cart tray
    this.cartService.clearCart();
    this.isSubmitting = false;

    this.toastService.success(`Order ${result.order.orderNumber} dispatched to kitchen!`);
    this.router.navigate(['/menu/gurukripa-dhaba/order', result.order.id]);
  }
}
