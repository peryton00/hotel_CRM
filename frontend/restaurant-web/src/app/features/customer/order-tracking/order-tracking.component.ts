import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { Order, OrderStatus } from '../../../core/models/order.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-order-tracking',
  standalone: true,
  imports: [CommonModule, RouterModule, CurrencyInrPipe, StatusBadgeComponent],
  template: `
    @if (order(); as ord) {
      <div class="tracking-page">
        <!-- Header -->
        <div class="tracking-header">
          @if (ord.orderType === 'TAKEAWAY' || !ord.tableNumber) {
            <a routerLink="/menu/gurukripa-dhaba" class="back-link">
              <i class="ph ph-arrow-left"></i>
              <span>Return to Menu</span>
            </a>
          } @else {
            <a
              [routerLink]="[
                '/menu/gurukripa-dhaba/table',
                'tbl-' + ord.tableNumber.toLowerCase().replace('t-', ''),
              ]"
              class="back-link"
            >
              <i class="ph ph-arrow-left"></i>
              <span>Return to Menu</span>
            </a>
          }
          <h1 class="heading-section">Kitchen Dispatch Live Timeline</h1>
          <p class="text-sm text-muted">
            @if (ord.orderType === 'TAKEAWAY') {
              Takeaway ({{ ord.pickupReference || ord.orderNumber }}) • {{ ord.orderNumber }}
            } @else {
              Table {{ ord.tableNumber }} • {{ ord.orderNumber }}
            }
          </p>
        </div>

        <!-- Order Status Progress Card -->
        <div class="status-timeline-card">
          <div class="status-header">
            <div class="current-status-group">
              <span class="live-dot"></span>
              <span class="status-name">{{ currentStatusText() }}</span>
            </div>
            <app-status-badge [status]="ord.status"></app-status-badge>
          </div>

          <!-- 5-Stage Stepper -->
          <div class="stepper-track">
            @for (step of steps; track step.status; let idx = $index) {
              <div
                class="step-node"
                [class.completed]="isStepCompleted(step.status)"
                [class.current]="ord.status === step.status"
              >
                <div class="node-icon-circle">
                  @if (isStepCompleted(step.status)) {
                    <i class="ph ph-check"></i>
                  } @else {
                    <i class="ph" [class]="step.icon"></i>
                  }
                </div>
                <div class="node-label">{{ step.label }}</div>
                <div class="node-sub">{{ step.description }}</div>
              </div>
            }
          </div>

          @if (ord.status === 'CANCELLED') {
            <div class="cancelled-notice">
              <i class="ph ph-x-circle"></i>
              <span
                >This order has been cancelled by floor staff. Please speak with your captain.</span
              >
            </div>
          }
        </div>

        <!-- Bill & Dish Details -->
        <div class="tracking-summary-card">
          <h3 class="heading-card" style="margin-bottom: 12px;">Dishes in this Order</h3>
          <div class="dishes-list">
            @for (item of ord.items; track item.id) {
              <div class="dish-item-row">
                <div class="d-left">
                  <span class="d-qty">{{ item.quantity }}×</span>
                  <span class="d-name">{{ item.name }}</span>
                  @if (item.selectedPortion) {
                    <span class="text-xs text-muted">({{ item.selectedPortion.label }})</span>
                  }
                </div>
                <span class="d-price">{{ item.itemTotal | currencyInr }}</span>
              </div>
            }
          </div>

          <div class="order-total-bar">
            <span>Payable Total:</span>
            <span class="total-bold">{{ ord.totalAmount | currencyInr }}</span>
          </div>
        </div>

        <!-- Feedback Callout (Available Once Served) -->
        @if (ord.status === 'SERVED' || ord.status === 'COMPLETED') {
          <div class="feedback-cta-card">
            <div class="fb-left">
              <i class="ph ph-star text-gold"></i>
              <div>
                <strong>How was your dining experience?</strong>
                <p class="text-xs text-muted">
                  Help our Master Chefs maintain the highest royal standards.
                </p>
              </div>
            </div>
            <a
              [routerLink]="['/menu/gurukripa-dhaba/feedback', ord.id]"
              class="btn btn-gold btn-sm"
            >
              Rate Dishes
            </a>
          </div>
        }
      </div>
    } @else {
      <div class="empty-state-panel">
        <h2 class="heading-card">Order Not Found</h2>
        <a routerLink="/menu/gurukripa-dhaba" class="btn btn-secondary">Return to Menu</a>
      </div>
    }
  `,
  styles: [
    `
      .tracking-page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .tracking-header {
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

      .status-timeline-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 24px;
        box-shadow: var(--shadow-xs);
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      .status-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .current-status-group {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .live-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--color-crimson);
        animation: pulseLive 1.5s infinite;
      }

      @keyframes pulseLive {
        0% {
          box-shadow: 0 0 0 0 rgba(194, 24, 7, 0.7);
        }
        70% {
          box-shadow: 0 0 0 10px rgba(194, 24, 7, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(194, 24, 7, 0);
        }
      }

      .status-name {
        font-size: 1.125rem;
        font-weight: 800;
        color: var(--color-text-primary);
      }

      .stepper-track {
        display: flex;
        justify-content: space-between;
        position: relative;

        &::before {
          content: '';
          position: absolute;
          top: 20px;
          left: 30px;
          right: 30px;
          height: 3px;
          background: var(--color-border);
          z-index: 1;
        }
      }

      .step-node {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        width: 18%;
      }

      .node-icon-circle {
        width: 42px;
        height: 42px;
        border-radius: 50%;
        background: var(--color-bone);
        border: 2px solid var(--color-border);
        color: var(--color-text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        margin-bottom: 8px;
        transition: all var(--transition-fast);
      }

      .node-label {
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--color-text-secondary);
      }

      .node-sub {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
        margin-top: 2px;
        line-height: 1.3;

        @media (max-width: 600px) {
          display: none;
        }
      }

      .step-node.completed .node-icon-circle {
        background: var(--color-success);
        border-color: var(--color-success);
        color: #ffffff;
      }

      .step-node.completed .node-label {
        color: var(--color-success);
      }

      .step-node.current .node-icon-circle {
        background: var(--color-crimson);
        border-color: var(--color-crimson);
        color: #ffffff;
        box-shadow: 0 0 0 4px rgba(194, 24, 7, 0.2);
      }

      .step-node.current .node-label {
        color: var(--color-crimson);
      }

      .cancelled-notice {
        background: var(--color-danger-bg);
        border: 1px solid rgba(169, 28, 18, 0.3);
        border-radius: var(--radius-sm);
        padding: 12px 16px;
        color: var(--color-danger);
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 0.875rem;
        font-weight: 600;
      }

      .tracking-summary-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-shadow: var(--shadow-xs);
      }

      .dishes-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 0.875rem;
      }
      .dish-item-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .d-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .d-qty {
        font-weight: 700;
        color: var(--color-crimson);
      }
      .d-name {
        font-weight: 600;
      }
      .d-price {
        font-weight: 600;
      }

      .order-total-bar {
        margin-top: 8px;
        padding-top: 10px;
        border-top: 1px solid var(--color-border);
        display: flex;
        justify-content: space-between;
        font-size: 0.9375rem;
        font-weight: 700;
      }

      .total-bold {
        color: var(--color-crimson);
        font-size: 1.05rem;
      }

      .feedback-cta-card {
        background: var(--color-gold-subtle);
        border: 1px solid rgba(212, 175, 55, 0.5);
        border-radius: var(--radius-md);
        padding: 16px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }

      .fb-left {
        display: flex;
        align-items: center;
        gap: 12px;
        i {
          font-size: 1.5rem;
        }
      }
    `,
  ],
})
export class OrderTrackingComponent implements OnInit {
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

  steps = [
    {
      status: 'PENDING',
      label: 'Received',
      description: 'Transmitted to chef queue',
      icon: 'ph-receipt',
    },
    {
      status: 'ACCEPTED',
      label: 'Accepted',
      description: 'Confirmed by kitchen',
      icon: 'ph-check',
    },
    {
      status: 'PREPARING',
      label: 'Preparing',
      description: 'Woodfire & dum cooking',
      icon: 'ph-cooking-pot',
    },
    {
      status: 'READY',
      label: 'Ready',
      description: 'Plated for dispatch',
      icon: 'ph-bell-ringing',
    },
    {
      status: 'SERVED',
      label: 'Served',
      description: 'At your dining table',
      icon: 'ph-hand-waving',
    },
  ];

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.orderId.set(params.get('orderId') || '');
    });
  }

  isStepCompleted(stepStatus: string): boolean {
    const ord = this.order();
    if (!ord) return false;

    const sequence = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'];
    const currentIdx = sequence.indexOf(ord.status);
    const stepIdx = sequence.indexOf(stepStatus);

    return currentIdx > stepIdx;
  }

  currentStatusText(): string {
    const ord = this.order();
    if (!ord) return 'Order Received';
    switch (ord.status) {
      case 'PENDING':
        return 'Order Placed & Queued';
      case 'ACCEPTED':
        return 'Accepted by Captain';
      case 'PREPARING':
        return 'Cooking in Royal Kitchen';
      case 'READY':
        return 'Dishes Plated & Heading to Table';
      case 'SERVED':
        return 'Served at Your Table';
      case 'COMPLETED':
        return 'Dining Completed';
      case 'CANCELLED':
        return 'Order Cancelled';
      default:
        return ord.status;
    }
  }
}
