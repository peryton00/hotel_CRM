import { Component, inject, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MockDataService } from '../../../data-access/mock/mock-data.service';
import { Customer } from '../../../core/models/customer.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, CurrencyInrPipe, StatusBadgeComponent],
  template: `
    @if (customer(); as cust) {
      <div class="customer-detail-page">
        <!-- Breadcrumb & Actions -->
        <div class="detail-header">
          <div class="header-left">
            <a routerLink="/admin/customers" class="back-link">
              <i class="ph ph-arrow-left"></i>
              <span>Back to Customers</span>
            </a>
            <div class="profile-title-row">
              <div class="profile-avatar">{{ cust.name.charAt(0) }}</div>
              <div>
                <h1 class="heading-display">{{ cust.name }}</h1>
                <div class="profile-sub">
                  <span>Guest since {{ cust.customerSince | date: 'mediumDate' }}</span>
                  <span class="dot">•</span>
                  <app-status-badge [status]="cust.status"></app-status-badge>
                  <span class="badge badge-gold">{{ cust.loyaltyTier }} Tier</span>
                </div>
              </div>
            </div>
          </div>

          <div class="header-actions">
            <button class="btn btn-secondary" (click)="openPointsModal()">
              <i class="ph ph-coins"></i>
              <span>Adjust Points</span>
            </button>
          </div>
        </div>

        <!-- 4-Stat Metric Row -->
        <div class="metrics-row">
          <div class="metric-card">
            <span class="m-label">Lifetime Spend</span>
            <span class="m-val">{{ cust.totalSpend | currencyInr }}</span>
          </div>
          <div class="metric-card">
            <span class="m-label">Total Visits</span>
            <span class="m-val">{{ cust.visitCount }} times</span>
          </div>
          <div class="metric-card">
            <span class="m-label">Average Order</span>
            <span class="m-val">{{ cust.avgOrderValue | currencyInr }}</span>
          </div>
          <div class="metric-card">
            <span class="m-label">Loyalty Balance</span>
            <span class="m-val text-gold">{{ cust.loyaltyPoints }} pts</span>
          </div>
        </div>

        <!-- Content Grid: Orders & Coupons -->
        <div class="content-grid">
          <!-- Past Dining Orders -->
          <div class="panel-box">
            <h2 class="heading-card">Dining Order History</h2>
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Date</th>
                    <th>Table</th>
                    <th>Items</th>
                    <th>Status</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  @for (ord of customerOrders(); track ord.id) {
                    <tr>
                      <td>
                        <a
                          [routerLink]="['/admin/orders', ord.id]"
                          class="text-crimson"
                          style="font-weight: 700;"
                        >
                          {{ ord.orderNumber }}
                        </a>
                      </td>
                      <td>{{ ord.createdAt | date: 'short' }}</td>
                      <td>Table {{ ord.tableNumber }}</td>
                      <td>{{ ord.items.length }} dishes</td>
                      <td><app-status-badge [status]="ord.status"></app-status-badge></td>
                      <td>
                        <strong>{{ ord.totalAmount | currencyInr }}</strong>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td
                        colspan="6"
                        class="text-center"
                        style="padding: 24px; color: var(--color-text-muted);"
                      >
                        No dining orders placed by this guest yet.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- Contact & Assigned Coupons -->
          <div class="side-col">
            <div class="panel-box">
              <h2 class="heading-card">Contact Information</h2>
              <div class="info-list">
                <div class="info-item">
                  <span class="info-label">Mobile Phone</span>
                  <span class="info-val">{{ cust.phone }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Email Address</span>
                  <span class="info-val">{{ cust.email || 'Not provided' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Last Dining Visit</span>
                  <span class="info-val">{{ cust.lastVisit | date: 'medium' }}</span>
                </div>
              </div>
            </div>

            <div class="panel-box">
              <h2 class="heading-card">Assigned Coupons & Offers</h2>
              <div class="coupon-chips">
                @for (coup of assignedCoupons(); track coup.id) {
                  <div class="coupon-chip">
                    <div class="chip-top">
                      <span class="chip-code">{{ coup.code }}</span>
                      <span class="chip-val">
                        {{
                          coup.discountType === 'PERCENTAGE'
                            ? coup.discountValue + '% OFF'
                            : '₹' + coup.discountValue + ' OFF'
                        }}
                      </span>
                    </div>
                    <div class="chip-desc">{{ coup.name }}</div>
                  </div>
                } @empty {
                  <p class="text-sm text-muted">No exclusive coupons assigned to this customer.</p>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Adjust Points Modal -->
        @if (showPointsModal) {
          <div class="modal-overlay" (click)="onBackdropClick($event)">
            <div class="modal-card" role="dialog" aria-modal="true">
              <div class="modal-header">
                <h3 class="heading-card">Adjust Loyalty Points for {{ cust.name }}</h3>
                <button class="close-btn" (click)="showPointsModal = false">
                  <i class="ph ph-x"></i>
                </button>
              </div>
              <div class="modal-body">
                <div class="form-group">
                  <label class="form-label">Points Adjustment (+ / -)</label>
                  <input
                    type="number"
                    class="form-input"
                    placeholder="e.g. 150 or -50"
                    [(ngModel)]="pointsDelta"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Reason / Description *</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. Anniversary courtesy dining bonus"
                    [(ngModel)]="pointsReason"
                  />
                </div>
              </div>
              <div class="modal-footer">
                <button class="btn btn-secondary" (click)="showPointsModal = false">Cancel</button>
                <button
                  class="btn btn-primary"
                  (click)="savePointsAdjustment()"
                  [disabled]="!pointsDelta || !pointsReason.trim()"
                >
                  Update Balance
                </button>
              </div>
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="empty-state-card">
        <h2 class="heading-card">Customer Not Found</h2>
        <p class="text-muted">The requested customer record does not exist in the mock dataset.</p>
        <a routerLink="/admin/customers" class="btn btn-secondary">Return to Customer Directory</a>
      </div>
    }
  `,
  styles: [
    `
      .customer-detail-page {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      .detail-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        flex-wrap: wrap;
        gap: 16px;
      }

      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        margin-bottom: 12px;
        &:hover {
          color: var(--color-crimson);
        }
      }

      .profile-title-row {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .profile-avatar {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--color-onyx);
        color: var(--color-gold);
        font-weight: 800;
        font-size: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .profile-sub {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        margin-top: 4px;
      }

      .dot {
        opacity: 0.5;
      }

      .metrics-row {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;

        @media (max-width: 900px) {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .metric-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .m-label {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted);
      }

      .m-val {
        font-size: 1.375rem;
        font-weight: 800;
        color: var(--color-text-primary);
      }

      .content-grid {
        display: grid;
        grid-template-columns: 3fr 2fr;
        gap: 24px;

        @media (max-width: 1024px) {
          grid-template-columns: 1fr;
        }
      }

      .panel-box {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .side-col {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .info-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .info-item {
        display: flex;
        justify-content: space-between;
        border-bottom: 1px solid var(--color-border-subtle);
        padding-bottom: 8px;
      }

      .info-label {
        font-size: 0.8125rem;
        color: var(--color-text-muted);
      }
      .info-val {
        font-size: 0.875rem;
        font-weight: 600;
      }

      .coupon-chips {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .coupon-chip {
        background: var(--color-gold-subtle);
        border: 1px solid rgba(212, 175, 55, 0.4);
        padding: 10px 14px;
        border-radius: var(--radius-sm);
      }

      .chip-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }

      .chip-code {
        font-weight: 800;
        color: #7d6514;
        font-size: 0.875rem;
      }

      .chip-val {
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-crimson);
      }

      .chip-desc {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
      }

      .empty-state-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 40px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      .modal-header,
      .modal-footer {
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--color-border);
      }

      .modal-footer {
        border-bottom: none;
        border-top: 1px solid var(--color-border);
        justify-content: flex-end;
        gap: 12px;
      }

      .modal-body {
        padding: 20px;
      }
      .close-btn {
        font-size: 1.25rem;
        color: var(--color-text-muted);
        &:hover {
          color: var(--color-onyx);
        }
      }
    `,
  ],
})
export class CustomerDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private mock = inject(MockDataService);
  private toastService = inject(ToastService);

  customerId = signal<string>('');

  customer = computed(() => {
    return this.mock.customers().find((c) => c.id === this.customerId()) || null;
  });

  customerOrders = computed(() => {
    const cust = this.customer();
    if (!cust) return [];
    return this.mock
      .orders()
      .filter((o) => o.customerId === cust.id || o.customerPhone === cust.phone);
  });

  assignedCoupons = computed(() => {
    const cust = this.customer();
    if (!cust) return [];
    return this.mock.coupons().filter((c) => cust.assignedCouponIds?.includes(c.id));
  });

  showPointsModal = false;
  pointsDelta = 100;
  pointsReason = '';

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.customerId.set(params.get('customerId') || '');
    });
  }

  openPointsModal(): void {
    this.pointsDelta = 100;
    this.pointsReason = '';
    this.showPointsModal = true;
  }

  savePointsAdjustment(): void {
    const cust = this.customer();
    if (!cust || !this.pointsDelta) return;

    const newPoints = Math.max(0, cust.loyaltyPoints + this.pointsDelta);
    const updatedCusts = this.mock
      .customers()
      .map((c) => (c.id === cust.id ? { ...c, loyaltyPoints: newPoints } : c));
    this.mock.customers.set(updatedCusts);
    this.mock.saveLocal('customers', updatedCusts);

    this.toastService.success(`Updated loyalty balance for ${cust.name}: ${newPoints} pts`);
    this.showPointsModal = false;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.showPointsModal = false;
    }
  }
}
