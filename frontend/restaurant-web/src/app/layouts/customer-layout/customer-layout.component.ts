import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../core/services/cart.service';
import { RestaurantDataService } from '../../data-access/services/restaurant-data.service';
import { ToastService } from '../../core/services/toast.service';
import { CurrencyInrPipe } from '../../shared/pipes/currency-inr.pipe';
import { ToastContainerComponent } from '../../shared/components/toast-container/toast-container.component';
import { maskPhone, normalizeToE164 } from '../../core/utils/phone.util';

@Component({
  selector: 'app-customer-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, CurrencyInrPipe, ToastContainerComponent],
  template: `
    <div class="customer-shell">
      <!-- Minimalist Luxury Food Header -->
      <header class="customer-header">
        <div class="header-inner">
          <a [routerLink]="['/menu/gurukripa-dhaba']" class="brand-unit">
            <span class="brand-crest"><i class="ph ph-crown"></i></span>
            <div class="brand-names">
              <span class="restaurant-title">{{ restaurant()?.name || 'GuruKripa Dhaba' }}</span>
              <span class="restaurant-sub">{{
                restaurant()?.tagline || 'Fine Dining & Bistro'
              }}</span>
            </div>
          </a>

          <div class="header-right">
            @if (cartService.tableContext(); as tbl) {
              <div class="table-pill">
                <i class="ph ph-fork-knife"></i>
                <span>Table {{ tbl.tableNumber }}</span>
              </div>
            } @else {
              <div class="table-pill vacant">
                <i class="ph ph-qr-code"></i>
                <span>QR Table Dining</span>
              </div>
            }

            <button
              class="orders-icon-btn"
              (click)="openOrdersDrawer()"
              title="View My Previous Orders"
            >
              <i class="ph ph-clock-counter-clockwise"></i>
              <span>My Orders</span>
              @if (customerOrders().length > 0) {
                <span class="badge-count">{{ customerOrders().length }}</span>
              }
            </button>

            <a
              [routerLink]="['/menu/gurukripa-dhaba/cart']"
              class="cart-icon-btn"
              aria-label="View Cart"
            >
              <i class="ph ph-shopping-bag"></i>
              @if (cartService.itemCount() > 0) {
                <span class="badge-count">{{ cartService.itemCount() }}</span>
              }
            </a>
          </div>
        </div>
      </header>

      <!-- Customer Viewport Content -->
      <main class="customer-content">
        <router-outlet></router-outlet>
      </main>

      <!-- Sticky Floating Mobile Cart Tray -->
      @if (cartService.itemCount() > 0) {
        <aside class="sticky-cart-tray">
          <div class="tray-inner">
            <div class="tray-summary">
              <span class="items-count"
                >{{ cartService.itemCount() }}
                {{ cartService.itemCount() === 1 ? 'item' : 'items' }}</span
              >
              <span class="bullet-dot">•</span>
              <span class="total-price">{{ cartService.finalTotal() | currencyInr }}</span>
            </div>

            <a [routerLink]="['/menu/gurukripa-dhaba/cart']" class="view-tray-btn">
              <span>View Tray</span>
              <i class="ph ph-arrow-right"></i>
            </a>
          </div>
        </aside>
      }

      <footer class="customer-footer">
        <p class="footer-note">
          {{ restaurant()?.name || 'GuruKripa Dhaba' }} • 100% Authentic Awadhi & Mughlai Cuisine
        </p>
        <p class="footer-sub">All prices in Indian Rupees (INR) • GST applicable at 5%</p>
      </footer>

      <!-- Customer Orders & History Drawer -->
      @if (isOrdersDrawerOpen) {
        <div class="modal-overlay drawer-overlay" (click)="onDrawerBackdropClick($event)">
          <div class="orders-drawer-card" role="dialog" aria-modal="true">
            <div class="drawer-header">
              <div class="drawer-title-group">
                <div class="drawer-crest"><i class="ph ph-clock-counter-clockwise"></i></div>
                <div>
                  <h2 class="drawer-title">My Dining Orders</h2>
                  <p class="drawer-sub">Previous & live orders linked to your phone</p>
                </div>
              </div>
              <button class="drawer-close-btn" (click)="isOrdersDrawerOpen = false">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <!-- Linked Phone Number Header -->
            <div class="phone-bar">
              <div class="phone-info">
                <i class="ph ph-phone"></i>
                <span class="phone-lbl">Customer Mobile:</span>
                @if (!isEditingPhone) {
                  <span class="phone-num">{{ maskPhone(customerPhone()) }}</span>
                }
              </div>

              @if (!isEditingPhone) {
                <button class="btn-change-phone" (click)="isEditingPhone = true">Change</button>
              } @else {
                <div class="phone-edit-wrap">
                  <input
                    type="tel"
                    class="form-input phone-quick-input"
                    maxlength="10"
                    [(ngModel)]="inputPhone"
                    placeholder="10-digit phone"
                  />
                  <button class="btn btn-primary btn-sm" (click)="savePhone()">Link</button>
                  <button class="btn btn-secondary btn-sm" (click)="isEditingPhone = false">
                    Cancel
                  </button>
                </div>
              }
            </div>

            <div class="drawer-body">
              @if (customerOrders().length === 0) {
                <div class="empty-orders-view">
                  <div class="empty-icon-circle"><i class="ph ph-receipt"></i></div>
                  <h3 class="empty-title">No Orders Linked</h3>
                  <p class="empty-desc">
                    No previous orders found for mobile +91 {{ customerPhone() }}. Enter your
                    10-digit mobile number above or during checkout to view your orders here.
                  </p>
                </div>
              } @else {
                <div class="orders-scroll-list">
                  @for (order of customerOrders(); track order.id) {
                    <div
                      class="history-order-card"
                      [class.live-card]="
                        ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'].includes(order.status)
                      "
                    >
                      <div class="card-top-row">
                        <div class="order-id-group">
                          <span class="order-tag">{{ order.orderNumber }}</span>
                          <span class="order-table">Table {{ order.tableNumber }}</span>
                        </div>
                        <span class="status-pill" [class]="order.status.toLowerCase()">
                          {{ order.status }}
                        </span>
                      </div>

                      <div class="order-time-stamp">
                        <i class="ph ph-calendar-blank"></i>
                        <span>{{ order.createdAt | date: 'medium' }}</span>
                      </div>

                      <div class="order-items-snippet">
                        @for (item of order.items; track item.id) {
                          <div class="snippet-line">
                            <span class="s-qty">{{ item.quantity }}x</span>
                            <span class="s-name">{{ item.name }}</span>
                            <span class="s-price">{{ item.itemTotal | currencyInr }}</span>
                          </div>
                        }
                      </div>

                      <div class="card-total-row">
                        <span class="tot-label">Bill Total</span>
                        <strong class="tot-val">{{ order.totalAmount | currencyInr }}</strong>
                      </div>

                      <div class="card-actions-row">
                        @if (['PENDING', 'ACCEPTED', 'PREPARING', 'READY'].includes(order.status)) {
                          <a
                            [routerLink]="['/menu/gurukripa-dhaba/order', order.id, 'tracking']"
                            class="btn btn-primary btn-sm track-btn"
                            (click)="isOrdersDrawerOpen = false"
                          >
                            <i class="ph ph-timer"></i>
                            <span>Track Live</span>
                          </a>
                        }
                        <a
                          [routerLink]="['/menu/gurukripa-dhaba/order', order.id]"
                          class="btn btn-secondary btn-sm bill-btn"
                          (click)="isOrdersDrawerOpen = false"
                        >
                          <i class="ph ph-receipt"></i>
                          <span>View Bill</span>
                        </a>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      }

      <!-- Global Toast Alerts -->
      <app-toast-container></app-toast-container>
    </div>
  `,
  styles: [
    `
      .customer-shell {
        min-height: 100vh;
        background: var(--color-background);
        display: flex;
        flex-direction: column;
        position: relative;
        padding-bottom: 80px;
      }

      .customer-header {
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
        position: sticky;
        top: 0;
        z-index: 100;
        box-shadow: var(--shadow-xs);
      }

      .header-inner {
        max-width: 900px;
        margin: 0 auto;
        padding: 12px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .brand-unit {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .brand-crest {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: var(--color-onyx);
        color: var(--color-gold);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
      }

      .brand-names {
        display: flex;
        flex-direction: column;
      }

      .restaurant-title {
        font-family: var(--font-display);
        font-size: 1.125rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--color-text-primary);
      }

      .restaurant-sub {
        font-size: 0.6875rem;
        letter-spacing: 0.05em;
        color: var(--color-text-muted);
        text-transform: uppercase;
      }

      .header-right {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .table-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        padding: 5px 12px;
        border-radius: var(--radius-full);
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--color-crimson);

        i {
          font-size: 0.95rem;
        }

        &.vacant {
          color: var(--color-text-secondary);
        }
      }

      .cart-icon-btn {
        position: relative;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        color: var(--color-onyx);

        &:hover {
          background: var(--color-bone-dark);
        }
      }

      .badge-count {
        position: absolute;
        top: -3px;
        right: -3px;
        background: var(--color-crimson);
        color: #ffffff;
        font-size: 0.6875rem;
        font-weight: 700;
        width: 19px;
        height: 19px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #ffffff;
      }

      .customer-content {
        max-width: 900px;
        width: 100%;
        margin: 0 auto;
        flex: 1;
        padding: 20px;

        @media (max-width: 600px) {
          padding: 14px;
        }
      }

      .sticky-cart-tray {
        position: fixed;
        bottom: 16px;
        left: 16px;
        right: 16px;
        max-width: 868px;
        margin: 0 auto;
        z-index: 1000;
        animation: floatUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .tray-inner {
        background: var(--color-crimson);
        color: #ffffff;
        border-radius: var(--radius-md);
        padding: 14px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 8px 24px rgba(194, 24, 7, 0.35);
      }

      .tray-summary {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.9375rem;
      }

      .items-count {
        font-weight: 500;
      }

      .bullet-dot {
        opacity: 0.6;
      }

      .total-price {
        font-weight: 800;
        font-size: 1.05rem;
      }

      .view-tray-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #ffffff;
        color: var(--color-crimson);
        font-weight: 700;
        padding: 8px 16px;
        border-radius: var(--radius-sm);
        font-size: 0.875rem;
        transition: background var(--transition-fast);

        &:hover {
          background: var(--color-bone);
        }
      }

      .customer-footer {
        text-align: center;
        padding: 32px 16px 24px;
        border-top: 1px solid var(--color-border);
        color: var(--color-text-muted);
        font-size: 0.8125rem;
        line-height: 1.5;
      }

      .footer-sub {
        font-size: 0.75rem;
        color: var(--color-taupe);
        margin-top: 4px;
      }

      @keyframes floatUp {
        from {
          opacity: 0;
          transform: translateY(24px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .orders-icon-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-full);
        color: var(--color-text-primary);
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
        position: relative;
        transition: all var(--transition-fast);

        &:hover {
          background: var(--color-bone-light);
          border-color: var(--color-onyx);
        }

        i {
          font-size: 1rem;
          color: var(--color-crimson);
        }

        span {
          display: inline-block;
          @media (max-width: 480px) {
            display: none;
          }
        }
      }

      .drawer-overlay {
        background: rgba(18, 18, 18, 0.65);
        backdrop-filter: blur(4px);
        z-index: 1000;
        display: flex;
        justify-content: flex-end;
        align-items: stretch;
        padding: 0;
      }

      .orders-drawer-card {
        width: 100%;
        max-width: 440px;
        height: 100%;
        background: var(--color-surface);
        box-shadow: -8px 0 24px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        animation: drawerSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes drawerSlideIn {
        from {
          transform: translateX(100%);
        }
        to {
          transform: translateX(0);
        }
      }

      .drawer-header {
        padding: 20px;
        border-bottom: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .drawer-title-group {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .drawer-crest {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--color-onyx);
        color: var(--color-gold);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
      }

      .drawer-title {
        font-family: var(--font-display);
        font-size: 1.15rem;
        font-weight: 700;
        color: var(--color-text-primary);
        margin: 0;
      }

      .drawer-sub {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        margin: 2px 0 0;
      }

      .drawer-close-btn {
        font-size: 1.25rem;
        color: var(--color-text-muted);
        background: none;
        cursor: pointer;
        &:hover {
          color: var(--color-onyx);
        }
      }

      .phone-bar {
        background: var(--color-bone-light);
        border-bottom: 1px solid var(--color-border);
        padding: 10px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      .phone-info {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        i {
          color: var(--color-crimson);
        }
      }

      .phone-lbl {
        color: var(--color-text-muted);
        font-size: 0.75rem;
      }

      .phone-num {
        font-weight: 700;
        color: var(--color-text-primary);
      }

      .btn-change-phone {
        background: none;
        border: none;
        color: var(--color-crimson);
        font-weight: 700;
        font-size: 0.75rem;
        cursor: pointer;
        text-decoration: underline;
      }

      .phone-edit-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .phone-quick-input {
        padding: 4px 8px;
        font-size: 0.8125rem;
        width: 130px;
      }

      .drawer-body {
        flex: 1;
        overflow-y: auto;
        padding: 16px 20px;
      }

      .empty-orders-view {
        text-align: center;
        padding: 40px 16px;
      }

      .empty-icon-circle {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--color-bone-light);
        color: var(--color-taupe);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.75rem;
        margin: 0 auto 12px;
      }

      .empty-title {
        font-size: 1.05rem;
        font-weight: 700;
        margin-bottom: 6px;
      }

      .empty-desc {
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        line-height: 1.45;
      }

      .orders-scroll-list {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .history-order-card {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 14px;
        background: var(--color-surface);
        display: flex;
        flex-direction: column;
        gap: 10px;
        transition: border-color var(--transition-fast);

        &.live-card {
          border-color: var(--color-crimson);
          box-shadow: 0 4px 12px rgba(194, 24, 7, 0.08);
        }
      }

      .card-top-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .order-id-group {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .order-tag {
        font-weight: 800;
        font-size: 0.875rem;
      }

      .order-table {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        background: var(--color-bone);
        padding: 2px 8px;
        border-radius: var(--radius-xs);
      }

      .status-pill {
        font-size: 0.6875rem;
        font-weight: 800;
        padding: 2px 8px;
        border-radius: var(--radius-full);
        text-transform: uppercase;
        letter-spacing: 0.05em;

        &.pending,
        &.accepted {
          background: var(--color-warning-bg);
          color: var(--color-warning);
        }
        &.preparing {
          background: rgba(194, 24, 7, 0.1);
          color: var(--color-crimson);
        }
        &.ready,
        &.served,
        &.completed {
          background: var(--color-success-bg);
          color: var(--color-success);
        }
        &.cancelled {
          background: var(--color-danger-bg);
          color: var(--color-danger);
        }
      }

      .order-time-stamp {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .order-items-snippet {
        background: var(--color-bone-light);
        border-radius: var(--radius-xs);
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 0.8125rem;
      }

      .snippet-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .s-qty {
        font-weight: 700;
        color: var(--color-crimson);
        font-size: 0.75rem;
      }
      .s-name {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .s-price {
        font-weight: 600;
        font-size: 0.75rem;
      }

      .card-total-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 6px;
        border-top: 1px dashed var(--color-border);
        font-size: 0.875rem;
      }

      .tot-label {
        color: var(--color-text-muted);
      }
      .tot-val {
        font-weight: 800;
        color: var(--color-crimson);
      }

      .card-actions-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 2px;
      }

      .track-btn,
      .bill-btn {
        flex: 1;
        justify-content: center;
        font-size: 0.8125rem;
      }
    `,
  ],
})
export class CustomerLayoutComponent {
  cartService = inject(CartService);
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);

  restaurant = this.mock.restaurant;
  isOrdersDrawerOpen = false;
  isEditingPhone = false;
  inputPhone = '';

  customerPhone = signal<string>(localStorage.getItem('customer_phone') || '');

  customerOrders = computed(() => {
    const raw = this.customerPhone().replace(/[^0-9]/g, '');
    if (!raw || raw.length < 5) return [];

    return this.mock.orders().filter((o) => {
      const orderPhone = (o.customerPhone || '').replace(/[^0-9]/g, '');
      return orderPhone.endsWith(raw) || raw.endsWith(orderPhone);
    });
  });

  openOrdersDrawer(): void {
    const saved = localStorage.getItem('royal_spice_customer_phone');
    if (saved) {
      this.customerPhone.set(saved);
    }
    this.inputPhone = this.customerPhone();
    this.isEditingPhone = false;
    this.isOrdersDrawerOpen = true;
  }

  maskPhone = maskPhone;

  savePhone(): void {
    const clean = this.inputPhone.trim().replace(/[^0-9]/g, '');
    if (clean.length < 10) {
      this.toastService.warning('Please enter a valid 10-digit mobile number');
      return;
    }
    const e164 = normalizeToE164(clean);
    this.customerPhone.set(e164);
    localStorage.setItem('royal_spice_customer_phone', e164);
    this.isEditingPhone = false;
    this.toastService.success(`Linked mobile ${maskPhone(e164)} to order history`);
  }

  onDrawerBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('drawer-overlay')) {
      this.isOrdersDrawerOpen = false;
    }
  }
}
