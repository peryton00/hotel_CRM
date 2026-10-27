import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';

@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [CommonModule, RouterModule, CurrencyInrPipe],
  template: `
    @if (order(); as ord) {
      <div class="confirmation-page">
        <div class="confirmation-card">
          <div class="success-crest">
            <i class="ph ph-check"></i>
          </div>

          <h1 class="heading-section congrats-title">Order Received by Chef Station</h1>
          <p class="congrats-sub">
            @if (ord.orderType === 'TAKEAWAY') {
              Your takeaway dishes are being prepared fresh for pickup
              <strong>({{ ord.pickupReference || ord.orderNumber }})</strong>.
            } @else {
              Your dishes are being prepared fresh for <strong>Table {{ ord.tableNumber }}</strong
              >.
            }
          </p>

          <div class="order-ref-badge">
            <span class="ref-label">Order Number:</span>
            <span class="ref-code">{{ ord.orderNumber }}</span>
          </div>

          <div class="prep-estimate-box">
            <i class="ph ph-clock text-crimson"></i>
            <div>
              <div class="prep-title">Estimated Wait: 20 – 25 Mins</div>
              <div class="prep-sub">Slow-cooked on authentic copper handis & charcoal tandoor.</div>
            </div>
          </div>

          <div class="order-recap-box">
            <h3 class="recap-title">Dishes in Preparation:</h3>
            <div class="recap-list">
              @for (item of ord.items; track item.id) {
                <div class="recap-item">
                  <div class="item-line-left">
                    <span class="qty">{{ item.quantity }}×</span>
                    <span>{{ item.name }}</span>
                    @if (item.selectedPortion) {
                      <span class="portion text-muted">({{ item.selectedPortion.label }})</span>
                    }
                  </div>
                  <span>{{ item.itemTotal | currencyInr }}</span>
                </div>
              }
            </div>
            <div class="recap-total">
              <span>Total Payable</span>
              <span class="recap-price">{{ ord.totalAmount | currencyInr }}</span>
            </div>
          </div>

          <div class="actions-stack">
            <a
              [routerLink]="['/menu/gurukripa-dhaba/order', ord.id, 'tracking']"
              class="btn btn-primary track-btn"
            >
              <i class="ph ph-activity"></i>
              <span>Track Live Preparation Status</span>
            </a>

            @if (ord.orderType === 'TAKEAWAY' || !ord.tableNumber) {
              <a routerLink="/menu/gurukripa-dhaba" class="btn btn-secondary">
                <i class="ph ph-fork-knife"></i>
                <span>Order Additional Dishes</span>
              </a>
            } @else {
              <a
                [routerLink]="[
                  '/menu/gurukripa-dhaba/table',
                  'tbl-' + ord.tableNumber.toLowerCase().replace('t-', ''),
                ]"
                class="btn btn-secondary"
              >
                <i class="ph ph-fork-knife"></i>
                <span>Order Additional Dishes</span>
              </a>
            }
          </div>
        </div>
      </div>
    } @else {
      <div class="empty-state-panel">
        <h2 class="heading-card">Order Record Not Found</h2>
        <a routerLink="/menu/gurukripa-dhaba" class="btn btn-secondary">Return Home</a>
      </div>
    }
  `,
  styles: [
    `
      .confirmation-page {
        display: flex;
        justify-content: center;
        padding: 12px 0 32px;
      }

      .confirmation-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: 32px 24px;
        max-width: 520px;
        width: 100%;
        text-align: center;
        box-shadow: var(--shadow-md);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      .success-crest {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: var(--color-success-bg);
        color: var(--color-success);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
        margin-bottom: 4px;
      }

      .congrats-title {
        font-size: 1.375rem;
        font-weight: 700;
        color: var(--color-text-primary);
      }
      .congrats-sub {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        line-height: 1.45;
      }

      .order-ref-badge {
        background: var(--color-bone);
        padding: 8px 18px;
        border-radius: var(--radius-full);
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.875rem;
      }

      .ref-label {
        color: var(--color-text-muted);
      }
      .ref-code {
        font-weight: 800;
        color: var(--color-crimson);
      }

      .prep-estimate-box {
        background: var(--color-crimson-subtle);
        border: 1px solid rgba(194, 24, 7, 0.2);
        border-radius: var(--radius-sm);
        padding: 14px 18px;
        display: flex;
        align-items: center;
        gap: 12px;
        text-align: left;
        width: 100%;
        i {
          font-size: 1.5rem;
          flex-shrink: 0;
        }
      }

      .prep-title {
        font-weight: 700;
        font-size: 0.875rem;
        color: var(--color-crimson);
      }
      .prep-sub {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
      }

      .order-recap-box {
        width: 100%;
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-sm);
        padding: 16px;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .recap-title {
        font-size: 0.8125rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--color-text-muted);
      }
      .recap-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 0.8125rem;
      }
      .recap-item {
        display: flex;
        justify-content: space-between;
      }
      .item-line-left {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .qty {
        font-weight: 700;
        color: var(--color-crimson);
      }
      .portion {
        font-size: 0.75rem;
      }

      .recap-total {
        display: flex;
        justify-content: space-between;
        border-top: 1px solid var(--color-border);
        padding-top: 8px;
        font-weight: 800;
        font-size: 0.9375rem;
      }

      .recap-price {
        color: var(--color-crimson);
      }

      .actions-stack {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 6px;
      }

      .track-btn {
        padding: 12px;
        font-size: 0.9375rem;
        gap: 8px;
      }
    `,
  ],
})
export class OrderConfirmationComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;

  orderId = signal<string>('');

  order = computed(() => {
    return (
      this.mock.orders().find((o) => o.id === this.orderId() || o.orderNumber === this.orderId()) ||
      null
    );
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.orderId.set(params.get('orderId') || '');
    });
  }
}
