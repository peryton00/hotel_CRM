import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MockDataService } from '../../../data-access/mock/mock-data.service';
import { CartService } from '../../../core/services/cart.service';
import { ToastService } from '../../../core/services/toast.service';
import { Coupon } from '../../../core/models/coupon.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { normalizeToE164, maskPhone } from '../../../core/utils/phone.util';

@Component({
  selector: 'app-customer-coupons',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, CurrencyInrPipe],
  template: `
    <div class="customer-coupons-page">
      <div class="coupons-header">
        <a [routerLink]="['/menu/gurukripa-dhaba/cart']" class="back-link">
          <i class="ph ph-arrow-left"></i>
          <span>Back to Tray</span>
        </a>
        <h1 class="heading-section">Promotional Offers & Coupons</h1>
        <p class="text-sm text-muted">
          Enjoy handcrafted culinary savings on your dining table order.
        </p>
      </div>

      <!-- Phone Number VIP Lookup (Demo Simulation) -->
      <div class="vip-lookup-card">
        <div class="lookup-label">
          <i class="ph ph-crown text-gold"></i>
          <span>Check VIP Patron Privileges & Targeted Entitlements</span>
        </div>
        <p class="text-xs text-muted">
          All coupon eligibility and discounts are verified authoritatively on the server.
          @if (maskedPhone()) {
            Linked Phone: <strong>{{ maskedPhone() }}</strong>
          }
        </p>

        <div class="lookup-input-row">
          <input
            type="tel"
            class="form-input"
            placeholder="e.g. 98765 43210"
            [(ngModel)]="guestPhone"
            (ngModelChange)="onPhoneChange()"
          />
          <button class="btn btn-secondary btn-sm" (click)="checkPersonalizedOffers()">
            Verify Patron
          </button>
        </div>
      </div>

      <!-- Coupons List -->
      <div class="coupons-list">
        @for (coup of availableCoupons(); track coup.id) {
          <div class="customer-coupon-card" [class.applied]="isCouponApplied(coup)">
            <div class="coupon-left">
              <div class="code-badge-row">
                <span class="code-badge">{{ coup.code }}</span>
                @if (coup.isTargeted) {
                  <span class="targeted-pill"><i class="ph ph-lock-key"></i> Targeted VIP</span>
                }
              </div>
              <h3 class="c-title">{{ coup.name }}</h3>
              <p class="c-desc">{{ coup.description }}</p>

              <div class="c-terms">
                <span>Min spend: {{ coup.minOrderValue | currencyInr }}</span>
                @if (coup.maxDiscountAmount) {
                  <span>• Max discount: {{ coup.maxDiscountAmount | currencyInr }}</span>
                }
              </div>
            </div>

            <div class="coupon-right">
              @if (isCouponApplied(coup)) {
                <span class="applied-badge"><i class="ph ph-check"></i> Applied</span>
                <button class="remove-btn" (click)="removeCoupon()">Remove</button>
              } @else {
                <button class="btn btn-primary btn-sm" (click)="applyCoupon(coup)">Apply</button>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .customer-coupons-page {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .coupons-header {
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

      .vip-lookup-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .lookup-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
        font-size: 0.875rem;
      }

      .lookup-input-row {
        display: flex;
        gap: 10px;
        margin-top: 4px;
      }

      .coupons-list {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .customer-coupon-card {
        background: var(--color-surface);
        border: 1px dashed var(--color-border);
        border-radius: var(--radius-md);
        padding: 18px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        box-shadow: var(--shadow-xs);
        transition: all var(--transition-fast);

        &.applied {
          border-color: var(--color-success);
          background: var(--color-success-bg);
        }
      }

      .coupon-left {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .code-badge {
        font-weight: 800;
        color: #7d6514;
        background: var(--color-gold-subtle);
        border: 1px solid rgba(212, 175, 55, 0.4);
        padding: 2px 8px;
        border-radius: var(--radius-xs);
        font-size: 0.75rem;
        align-self: flex-start;
        margin-bottom: 2px;
      }

      .c-title {
        font-size: 1rem;
        font-weight: 700;
      }

      .c-desc {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        line-height: 1.4;
      }

      .c-terms {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
        margin-top: 4px;
      }

      .coupon-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
      }

      .code-badge-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 2px;
      }

      .targeted-pill {
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-crimson);
        background: rgba(194, 24, 7, 0.08);
        border: 1px solid rgba(194, 24, 7, 0.2);
        border-radius: var(--radius-xs);
        padding: 2px 6px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .applied-badge {
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-success);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .remove-btn {
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-danger);
      }
    `,
  ],
})
export class CustomerCouponsComponent {
  private mock = inject(MockDataService);
  private cartService = inject(CartService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  guestPhone = localStorage.getItem('royal_spice_customer_phone') || '9876543210';
  maskedPhone = signal<string>('');
  availableCoupons = this.mock.coupons;

  constructor() {
    this.updateMaskedPhone();
  }

  onPhoneChange(): void {
    this.updateMaskedPhone();
  }

  private updateMaskedPhone(): void {
    if (this.guestPhone.trim()) {
      this.maskedPhone.set(maskPhone(this.guestPhone));
    } else {
      this.maskedPhone.set('');
    }
  }

  isCouponApplied(coupon: Coupon): boolean {
    return this.cartService.appliedCoupon()?.id === coupon.id;
  }

  applyCoupon(coupon: Coupon): void {
    const subtotal = this.cartService.subtotal();
    const cleanPhone = this.guestPhone ? normalizeToE164(this.guestPhone) : '';
    const matchedCustomer = this.mock
      .customers()
      .find(
        (c) => c.phoneE164 === cleanPhone || (c.phone && normalizeToE164(c.phone) === cleanPhone),
      );

    // Call server simulation contract (never compute discount in browser)
    const serverVerdict = this.mock.simulateServerCouponValidation({
      couponCode: coupon.code,
      cartSubtotal: subtotal,
      customerId: matchedCustomer?.id,
      customerPhoneE164: cleanPhone,
    });

    if (!serverVerdict.isValid) {
      this.toastService.warning(
        serverVerdict.rejectionReason || 'Server rejected coupon application',
      );
      return;
    }

    this.cartService.applyCoupon(coupon, serverVerdict.authorizedDiscountAmount);
    this.toastService.success(
      `Server verified ${coupon.code}! Authorized discount: ₹${serverVerdict.authorizedDiscountAmount}`,
    );
    this.router.navigate(['/menu/gurukripa-dhaba/cart']);
  }

  removeCoupon(): void {
    this.cartService.removeCoupon();
    this.toastService.info('Coupon removed');
  }

  checkPersonalizedOffers(): void {
    const clean = normalizeToE164(this.guestPhone);
    if (!clean) return;

    localStorage.setItem('royal_spice_customer_phone', clean);
    this.updateMaskedPhone();

    const cust = this.mock
      .customers()
      .find((c) => c.phoneE164 === clean || (c.phone && normalizeToE164(c.phone) === clean));

    if (cust) {
      const activeAssignments = this.mock
        .couponAssignments()
        .filter((a) => a.customerId === cust.id && a.status === 'ACTIVE');
      this.toastService.success(
        `Welcome ${cust.name}! Found ${activeAssignments.length} targeted VIP coupon entitlements.`,
      );
    } else {
      this.toastService.info('Standard dining promotions are available below.');
    }
  }
}
