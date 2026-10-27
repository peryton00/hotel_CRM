import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CartService } from '../../../core/services/cart.service';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';

@Component({
  selector: 'app-cart-view',
  standalone: true,
  imports: [CommonModule, RouterModule, CurrencyInrPipe],
  template: `
    <div class="cart-view-page">
      <!-- Back Navigation Header -->
      <div class="cart-header">
        @if (cartService.tableContext(); as ctx) {
          <a [routerLink]="['/menu/gurukripa-dhaba/table', ctx.token]" class="back-link">
            <i class="ph ph-arrow-left"></i>
            <span>Add More Dishes</span>
          </a>
        } @else {
          <a [routerLink]="['/menu/gurukripa-dhaba']" class="back-link">
            <i class="ph ph-arrow-left"></i>
            <span>Back to Menu</span>
          </a>
        }
        <h1 class="heading-section">Your Dining Tray</h1>
      </div>

      @if (cartService.items().length > 0) {
        <div class="cart-layout-grid">
          <!-- Left: Items Tray -->
          <div class="tray-items-col">
            @if (cartService.tableContext(); as ctx) {
              <div class="table-notice-card">
                <i class="ph ph-fork-knife text-crimson"></i>
                <span
                  >Dining order for <strong>Table {{ ctx.tableNumber }}</strong></span
                >
              </div>
            } @else {
              <div class="table-notice-card" style="border-color: var(--color-crimson);">
                <i class="ph ph-warning-circle text-crimson"></i>
                <span class="text-crimson"
                  >No table QR scanned. Please scan your table QR code to place order.</span
                >
              </div>
            }

            <div class="tray-card">
              <div class="tray-items-list">
                @for (item of cartService.items(); track item.id) {
                  <div class="tray-item-row">
                    <div class="item-info">
                      <h3 class="item-name">{{ item.name }}</h3>
                      @if (item.selectedPortion) {
                        <span class="custom-pill">Portion: {{ item.selectedPortion.label }}</span>
                      }
                      @if (item.selectedVariants && item.selectedVariants.length > 0) {
                        <div class="custom-tags">
                          @for (v of item.selectedVariants; track v.optionName) {
                            <span class="custom-pill">{{ v.optionName }}</span>
                          }
                        </div>
                      }
                      @if (item.selectedAddons && item.selectedAddons.length > 0) {
                        <div class="custom-tags">
                          @for (a of item.selectedAddons; track a.name) {
                            <span class="custom-pill">+ {{ a.name }}</span>
                          }
                        </div>
                      }
                      @if (item.specialInstructions) {
                        <span class="inst-pill"
                          ><i class="ph ph-note"></i> {{ item.specialInstructions }}</span
                        >
                      }
                      <span class="unit-rate">{{ item.unitPrice | currencyInr }} each</span>
                    </div>

                    <div class="item-stepper-price">
                      <div class="qty-stepper">
                        <button class="step-btn" (click)="cartService.updateQuantity(item.id, -1)">
                          <i class="ph ph-minus"></i>
                        </button>
                        <span class="qty-num">{{ item.quantity }}</span>
                        <button class="step-btn" (click)="cartService.updateQuantity(item.id, 1)">
                          <i class="ph ph-plus"></i>
                        </button>
                      </div>

                      <span class="line-total">{{ item.itemTotal | currencyInr }}</span>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Coupon Offer Row -->
            <div class="coupon-section-card">
              @if (cartService.appliedCoupon(); as coup) {
                <div class="applied-coupon-row">
                  <div class="coupon-applied-info">
                    <span class="code-badge">{{ coup.code }}</span>
                    <span class="saved-text"
                      >You saved {{ cartService.discountAmount() | currencyInr }}</span
                    >
                  </div>
                  <button class="remove-coupon-btn" (click)="cartService.removeCoupon()">
                    Remove
                  </button>
                </div>
              } @else {
                <a [routerLink]="['/menu/gurukripa-dhaba/coupons']" class="promo-link-row">
                  <div class="promo-left">
                    <i class="ph ph-ticket text-gold"></i>
                    <span>Apply Dining Coupons & Offers</span>
                  </div>
                  <i class="ph ph-caret-right chevron"></i>
                </a>
              }
            </div>
          </div>

          <!-- Right: Bill Details & Checkout CTA -->
          <div class="bill-summary-col">
            <div class="bill-card">
              <h2 class="heading-card">Bill Summary</h2>

              <div class="bill-line">
                <span>Item Subtotal</span>
                <span>{{ cartService.subtotal() | currencyInr }}</span>
              </div>

              @if (cartService.discountAmount() > 0) {
                <div class="bill-line discount">
                  <span>Coupon Discount</span>
                  <span>-{{ cartService.discountAmount() | currencyInr }}</span>
                </div>
              }

              <div class="bill-line">
                <span>CGST (2.5%)</span>
                <span>{{ cartService.cgst() | currencyInr }}</span>
              </div>

              <div class="bill-line">
                <span>SGST (2.5%)</span>
                <span>{{ cartService.sgst() | currencyInr }}</span>
              </div>

              <div class="bill-divider"></div>

              <div class="bill-line grand-total">
                <span>To Pay</span>
                <span class="grand-price">{{ cartService.finalTotal() | currencyInr }}</span>
              </div>

              @if (cartService.tableContext()) {
                <a
                  [routerLink]="['/menu/gurukripa-dhaba/checkout']"
                  class="btn btn-primary checkout-btn"
                >
                  <span>Proceed to Checkout</span>
                  <i class="ph ph-arrow-right"></i>
                </a>
              } @else {
                <button
                  class="btn btn-primary checkout-btn"
                  disabled
                  style="opacity: 0.6; cursor: not-allowed;"
                  title="Scan Table QR to place order"
                >
                  <span>Scan Table QR to Order</span>
                </button>
              }

              <p class="terms-note">
                Taxes calculated in Indian Rupees (INR) • Orders sent straight to Chef Station
              </p>
            </div>
          </div>
        </div>
      } @else {
        <div class="empty-tray-card">
          <div class="tray-icon-box"><i class="ph ph-shopping-bag"></i></div>
          <h2 class="heading-card">Your Dining Tray is Empty</h2>
          <p class="text-muted">
            You haven't added any culinary dishes yet. Explore our royal menu and add your
            favourites!
          </p>
          @if (cartService.tableContext(); as ctx) {
            <a [routerLink]="['/menu/gurukripa-dhaba/table', ctx.token]" class="btn btn-primary">
              Browse Royal Menu
            </a>
          } @else {
            <a [routerLink]="['/menu/gurukripa-dhaba']" class="btn btn-primary">
              Browse Royal Menu
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .cart-view-page {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .cart-header {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        &:hover {
          color: var(--color-crimson);
        }
      }

      .cart-layout-grid {
        display: grid;
        grid-template-columns: 3fr 2fr;
        gap: 20px;

        @media (max-width: 820px) {
          grid-template-columns: 1fr;
        }
      }

      .tray-items-col {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .table-notice-card {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 0.875rem;
      }

      .tray-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 18px;
        box-shadow: var(--shadow-xs);
      }

      .tray-items-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .tray-item-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 14px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--color-border-subtle);

        &:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
      }

      .item-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .item-name {
        font-size: 0.9375rem;
        font-weight: 700;
        color: var(--color-text-primary);
      }

      .custom-tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .custom-pill {
        font-size: 0.6875rem;
        background: var(--color-bone);
        border: 1px solid var(--color-border);
        padding: 2px 6px;
        border-radius: var(--radius-xs);
        color: var(--color-text-secondary);
      }

      .inst-pill {
        font-size: 0.6875rem;
        color: var(--color-crimson);
        font-style: italic;
      }

      .unit-rate {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        margin-top: 2px;
      }

      .item-stepper-price {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
      }

      .qty-stepper {
        display: flex;
        align-items: center;
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        overflow: hidden;
      }

      .step-btn {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.8125rem;
        color: var(--color-onyx);
        &:hover {
          background: var(--color-bone-dark);
        }
      }

      .qty-num {
        width: 24px;
        text-align: center;
        font-weight: 700;
        font-size: 0.8125rem;
      }

      .line-total {
        font-size: 0.9375rem;
        font-weight: 800;
        color: var(--color-onyx);
      }

      .coupon-section-card {
        background: var(--color-surface);
        border: 1px dashed var(--color-border);
        border-radius: var(--radius-md);
        padding: 14px 18px;
      }

      .promo-link-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: var(--color-text-primary);
        font-weight: 600;
        font-size: 0.875rem;
      }

      .promo-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .applied-coupon-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .coupon-applied-info {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .code-badge {
        background: var(--color-gold-subtle);
        border: 1px solid rgba(212, 175, 55, 0.5);
        color: #7d6514;
        font-weight: 800;
        padding: 3px 8px;
        border-radius: var(--radius-xs);
        font-size: 0.75rem;
      }

      .saved-text {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-success);
      }

      .remove-coupon-btn {
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-danger);
      }

      .bill-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-shadow: var(--shadow-xs);
      }

      .bill-line {
        display: flex;
        justify-content: space-between;
        font-size: 0.875rem;
        color: var(--color-text-secondary);

        &.discount {
          color: var(--color-success);
          font-weight: 600;
        }
        &.grand-total {
          font-size: 1.125rem;
          font-weight: 800;
          color: var(--color-text-primary);
        }
      }

      .grand-price {
        color: var(--color-crimson);
      }

      .bill-divider {
        height: 1px;
        background: var(--color-border);
        margin: 4px 0;
      }

      .checkout-btn {
        margin-top: 8px;
        padding: 14px;
        font-size: 1rem;
        gap: 10px;
      }

      .terms-note {
        font-size: 0.6875rem;
        color: var(--color-taupe);
        text-align: center;
        line-height: 1.35;
        margin-top: 4px;
      }

      .empty-tray-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 48px 24px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        max-width: 480px;
        margin: 40px auto;
      }

      .tray-icon-box {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: var(--color-bone);
        color: var(--color-taupe);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
      }
    `,
  ],
})
export class CartViewComponent {
  cartService = inject(CartService);
}
