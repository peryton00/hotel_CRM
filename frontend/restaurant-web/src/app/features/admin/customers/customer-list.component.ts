import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MockDataService } from '../../../data-access/mock/mock-data.service';
import { Customer, CustomerStatus, LoyaltyTier } from '../../../core/models/customer.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, CurrencyInrPipe, StatusBadgeComponent],
  template: `
    <div class="customers-page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="heading-display">Customer Directory</h1>
          <p class="text-muted">
            Manage dining guest profiles, loyalty tiers, lifetime spend, and coupon privileges.
          </p>
        </div>

        <button class="btn btn-primary" (click)="openAddModal()">
          <i class="ph ph-user-plus"></i>
          <span>Add New Customer</span>
        </button>
      </div>

      <!-- Filters & Search Toolbar -->
      <div class="toolbar-card">
        <div class="search-input-wrap">
          <i class="ph ph-magnifying-glass"></i>
          <input
            type="text"
            class="form-input"
            placeholder="Search by customer name or phone number..."
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)"
          />
        </div>

        <div class="filters-row">
          <select
            class="form-select filter-select"
            [ngModel]="tierFilter()"
            (ngModelChange)="tierFilter.set($event)"
          >
            <option value="ALL">All Loyalty Tiers</option>
            <option value="PLATINUM">Platinum</option>
            <option value="GOLD">Gold</option>
            <option value="SILVER">Silver</option>
            <option value="BRONZE">Bronze</option>
          </select>

          <select
            class="form-select filter-select"
            [ngModel]="statusFilter()"
            (ngModelChange)="statusFilter.set($event)"
          >
            <option value="ALL">All Statuses</option>
            <option value="VIP">VIP</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>

          <select
            class="form-select filter-select"
            [ngModel]="sortBy()"
            (ngModelChange)="sortBy.set($event)"
          >
            <option value="spend">Highest Spend</option>
            <option value="visits">Most Visits</option>
            <option value="recent">Recent Visit</option>
          </select>
        </div>
      </div>

      <!-- Customers Table -->
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Customer Name</th>
              <th>Phone & Email</th>
              <th>Loyalty Tier</th>
              <th>Status</th>
              <th>Visits</th>
              <th>Lifetime Spend</th>
              <th>Last Dining</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (cust of filteredCustomers(); track cust.id) {
              <tr>
                <td>
                  <div class="cust-name-cell">
                    <div class="avatar-sm">{{ cust.name.charAt(0) }}</div>
                    <div>
                      <div class="name-text">{{ cust.name }}</div>
                      <div class="pts-text">{{ cust.loyaltyPoints }} pts</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="phone-text">{{ cust.phone }}</div>
                  <div class="email-text">{{ cust.email || '—' }}</div>
                </td>
                <td>
                  <span
                    class="badge"
                    [class.badge-gold]="
                      cust.loyaltyTier === 'PLATINUM' || cust.loyaltyTier === 'GOLD'
                    "
                    [class.badge-outline]="
                      cust.loyaltyTier === 'SILVER' || cust.loyaltyTier === 'BRONZE'
                    "
                  >
                    <i class="ph ph-crown" *ngIf="cust.loyaltyTier === 'PLATINUM'"></i>
                    {{ cust.loyaltyTier }}
                  </span>
                </td>
                <td>
                  <app-status-badge [status]="cust.status"></app-status-badge>
                </td>
                <td>
                  <strong>{{ cust.visitCount }}</strong>
                </td>
                <td>
                  <span class="text-price">{{ cust.totalSpend | currencyInr }}</span>
                </td>
                <td>
                  <span class="text-sm text-muted">{{ cust.lastVisit | date: 'mediumDate' }}</span>
                </td>
                <td>
                  <div class="actions-cell">
                    <a
                      [routerLink]="['/admin/customers', cust.id]"
                      class="btn btn-secondary btn-sm"
                      title="View Profile"
                    >
                      <i class="ph ph-eye"></i>
                    </a>
                    <button
                      class="btn btn-secondary btn-sm"
                      (click)="openAssignCouponModal(cust)"
                      title="Assign Coupon"
                    >
                      <i class="ph ph-ticket"></i>
                    </button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td
                  colspan="8"
                  class="text-center"
                  style="padding: 40px; color: var(--color-text-muted);"
                >
                  No customers found matching your criteria.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Add Customer Modal -->
      @if (showAddModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card">Add New Guest Profile</h3>
              <button class="close-btn" (click)="showAddModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">Full Name *</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="e.g. Vikram Malhotra"
                  [(ngModel)]="newCustName"
                />
              </div>
              <div class="form-group">
                <label class="form-label">Phone Number *</label>
                <input
                  type="tel"
                  class="form-input"
                  placeholder="+91 98765 00000"
                  [(ngModel)]="newCustPhone"
                />
              </div>
              <div class="form-group">
                <label class="form-label">Email Address (Optional)</label>
                <input
                  type="email"
                  class="form-input"
                  placeholder="guest@example.com"
                  [(ngModel)]="newCustEmail"
                />
              </div>
              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Initial Tier</label>
                  <select class="form-select" [(ngModel)]="newCustTier">
                    <option value="BRONZE">Bronze</option>
                    <option value="SILVER">Silver</option>
                    <option value="GOLD">Gold</option>
                    <option value="PLATINUM">Platinum</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Customer Status</label>
                  <select class="form-select" [(ngModel)]="newCustStatus">
                    <option value="ACTIVE">Active</option>
                    <option value="VIP">VIP</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showAddModal = false">Cancel</button>
              <button
                class="btn btn-primary"
                (click)="saveNewCustomer()"
                [disabled]="!newCustName.trim() || !newCustPhone.trim()"
              >
                Save Customer
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Assign Coupon Modal -->
      @if (selectedCustomerForCoupon) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card">Assign Coupon to {{ selectedCustomerForCoupon.name }}</h3>
              <button class="close-btn" (click)="selectedCustomerForCoupon = null">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              <p class="text-sm text-muted" style="margin-bottom: 16px;">
                Select a promo code offer to bind to this customer profile for exclusive digital
                dining redemption.
              </p>
              <div class="coupon-picker-list">
                @for (c of coupons(); track c.id) {
                  <label class="coupon-pick-label">
                    <input
                      type="radio"
                      name="assignCoupon"
                      [value]="c.id"
                      [(ngModel)]="selectedCouponToAssign"
                    />
                    <div class="coupon-pick-info">
                      <span class="code-tag">{{ c.code }}</span>
                      <span class="desc-text">{{ c.name }} • {{ c.description }}</span>
                    </div>
                  </label>
                }
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="selectedCustomerForCoupon = null">
                Cancel
              </button>
              <button
                class="btn btn-primary"
                (click)="confirmAssignCoupon()"
                [disabled]="!selectedCouponToAssign"
              >
                Assign Privilege
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .customers-page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        flex-wrap: wrap;
        gap: 16px;
      }

      .toolbar-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }

      .search-input-wrap {
        position: relative;
        flex: 1;
        min-width: 260px;

        i {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--color-text-muted);
          font-size: 1.1rem;
        }

        .form-input {
          padding-left: 38px;
        }
      }

      .filters-row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .filter-select {
        width: auto;
        min-width: 150px;
      }

      .cust-name-cell {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .avatar-sm {
        width: 34px;
        height: 34px;
        border-radius: 50%;
        background: var(--color-onyx);
        color: var(--color-gold);
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.875rem;
        flex-shrink: 0;
      }

      .name-text {
        font-weight: 700;
        color: var(--color-text-primary);
      }
      .pts-text {
        font-size: 0.75rem;
        color: var(--color-gold);
        font-weight: 600;
      }
      .phone-text {
        font-weight: 600;
      }
      .email-text {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .actions-cell {
        display: flex;
        gap: 6px;
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

      .form-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }

      .close-btn {
        font-size: 1.25rem;
        color: var(--color-text-muted);
        &:hover {
          color: var(--color-onyx);
        }
      }

      .coupon-picker-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .coupon-pick-label {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        cursor: pointer;
        &:hover {
          background: var(--color-surface-hover);
        }
      }

      .code-tag {
        font-family: var(--font-ui);
        font-weight: 800;
        background: var(--color-gold-subtle);
        border: 1px solid rgba(212, 175, 55, 0.4);
        color: #7d6514;
        padding: 2px 8px;
        border-radius: var(--radius-xs);
        font-size: 0.75rem;
      }

      .desc-text {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
      }
    `,
  ],
})
export class CustomerListComponent {
  private mock = inject(MockDataService);
  private toastService = inject(ToastService);

  customers = this.mock.customers;
  coupons = this.mock.coupons;

  searchQuery = signal<string>('');
  tierFilter = signal<string>('ALL');
  statusFilter = signal<string>('ALL');
  sortBy = signal<string>('spend');

  showAddModal = false;
  newCustName = '';
  newCustPhone = '';
  newCustEmail = '';
  newCustTier: LoyaltyTier = 'BRONZE';
  newCustStatus: CustomerStatus = 'ACTIVE';

  selectedCustomerForCoupon: Customer | null = null;
  selectedCouponToAssign = '';

  filteredCustomers = computed(() => {
    let list = this.customers();
    const q = this.searchQuery().toLowerCase().trim();

    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.replace(/[^0-9]/g, '').includes(q.replace(/[^0-9]/g, '')),
      );
    }

    if (this.tierFilter() !== 'ALL') {
      list = list.filter((c) => c.loyaltyTier === this.tierFilter());
    }

    if (this.statusFilter() !== 'ALL') {
      list = list.filter((c) => c.status === this.statusFilter());
    }

    const sort = this.sortBy();
    return [...list].sort((a, b) => {
      if (sort === 'spend') return b.totalSpend - a.totalSpend;
      if (sort === 'visits') return b.visitCount - a.visitCount;
      if (sort === 'recent')
        return new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime();
      return 0;
    });
  });

  openAddModal(): void {
    this.newCustName = '';
    this.newCustPhone = '';
    this.newCustEmail = '';
    this.newCustTier = 'BRONZE';
    this.newCustStatus = 'ACTIVE';
    this.showAddModal = true;
  }

  saveNewCustomer(): void {
    if (!this.newCustName.trim() || !this.newCustPhone.trim()) return;

    const newCustomer: Customer = {
      id: `cust-${Date.now().toString().slice(-4)}`,
      name: this.newCustName.trim(),
      phone: this.newCustPhone.trim(),
      email: this.newCustEmail.trim() || undefined,
      customerSince: new Date().toISOString(),
      visitCount: 1,
      lastVisit: new Date().toISOString(),
      totalSpend: 0,
      avgOrderValue: 0,
      status: this.newCustStatus,
      loyaltyTier: this.newCustTier,
      loyaltyPoints: 100,
      assignedCouponIds: ['coup-002'],
    };

    const updated = [newCustomer, ...this.mock.customers()];
    this.mock.customers.set(updated);
    this.mock.saveLocal('customers', updated);

    this.toastService.success(`Added guest profile for ${newCustomer.name}`);
    this.showAddModal = false;
  }

  openAssignCouponModal(cust: Customer): void {
    this.selectedCustomerForCoupon = cust;
    this.selectedCouponToAssign = this.coupons()[0]?.id || '';
  }

  confirmAssignCoupon(): void {
    if (!this.selectedCustomerForCoupon || !this.selectedCouponToAssign) return;

    const coup = this.coupons().find((c) => c.id === this.selectedCouponToAssign);
    if (!coup) return;

    // Update coupon assignments
    const updatedCoupons = this.mock.coupons().map((c) => {
      if (c.id === this.selectedCouponToAssign) {
        const assigned = c.assignedCustomerIds || [];
        if (!assigned.includes(this.selectedCustomerForCoupon!.id)) {
          return { ...c, assignedCustomerIds: [...assigned, this.selectedCustomerForCoupon!.id] };
        }
      }
      return c;
    });
    this.mock.coupons.set(updatedCoupons);
    this.mock.saveLocal('coupons', updatedCoupons);

    // Update customer assignedCouponIds
    const updatedCusts = this.mock.customers().map((cust) => {
      if (cust.id === this.selectedCustomerForCoupon!.id) {
        const ids = cust.assignedCouponIds || [];
        if (!ids.includes(this.selectedCouponToAssign)) {
          return { ...cust, assignedCouponIds: [...ids, this.selectedCouponToAssign] };
        }
      }
      return cust;
    });
    this.mock.customers.set(updatedCusts);
    this.mock.saveLocal('customers', updatedCusts);

    this.toastService.success(`Assigned ${coup.code} to ${this.selectedCustomerForCoupon.name}`);
    this.selectedCustomerForCoupon = null;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.showAddModal = false;
      this.selectedCustomerForCoupon = null;
    }
  }
}
