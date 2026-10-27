import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MockDataService } from '../../../data-access/mock/mock-data.service';
import { Coupon, CouponAssignment, CouponRedemption } from '../../../core/models/coupon.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { ToastService } from '../../../core/services/toast.service';
import { maskPhone } from '../../../core/utils/phone.util';

type ViewTab = 'campaigns' | 'entitlements' | 'redemptions';

@Component({
  selector: 'app-coupon-management',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyInrPipe],
  template: `
    <div class="coupons-page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="heading-display">Promotions & Targeted Coupons</h1>
          <p class="text-muted">
            Configure master discount campaigns, assign targeted entitlements to verified VIP
            patrons, and review immutable redemption records.
          </p>
        </div>

        <div class="header-actions">
          <button class="btn btn-secondary" (click)="openAssignModal()">
            <i class="ph ph-user-plus"></i>
            <span>Assign to Patron</span>
          </button>
          <button class="btn btn-primary" (click)="openCreateModal()">
            <i class="ph ph-plus-circle"></i>
            <span>Create Campaign</span>
          </button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="view-tabs">
        <button
          class="tab-btn"
          [class.active]="activeTab === 'campaigns'"
          (click)="activeTab = 'campaigns'"
        >
          <i class="ph ph-tag"></i>
          <span>Campaign Definitions ({{ coupons().length }})</span>
        </button>

        <button
          class="tab-btn"
          [class.active]="activeTab === 'entitlements'"
          (click)="activeTab = 'entitlements'"
        >
          <i class="ph ph-identification-badge"></i>
          <span>Targeted Entitlements ({{ assignments().length }})</span>
        </button>

        <button
          class="tab-btn"
          [class.active]="activeTab === 'redemptions'"
          (click)="activeTab = 'redemptions'"
        >
          <i class="ph ph-clock-counter-clockwise"></i>
          <span>Redemption Audit Trail ({{ redemptions().length }})</span>
        </button>
      </div>

      <!-- TAB 1: CAMPAIGN DEFINITIONS -->
      @if (activeTab === 'campaigns') {
        <div class="coupons-grid">
          @for (coup of coupons(); track coup.id) {
            <div class="coupon-mgmt-card" [class.inactive-card]="!coup.isActive">
              <div class="card-head">
                <div class="code-tag-group">
                  <span class="coupon-code-pill">{{ coup.code }}</span>
                  @if (coup.isTargeted) {
                    <span class="badge-targeted"><i class="ph ph-lock-key"></i> VIP Targeted</span>
                  }
                </div>
                <button
                  class="status-toggle"
                  [class.active]="coup.isActive"
                  (click)="toggleActive(coup)"
                  [title]="coup.isActive ? 'Deactivate Coupon' : 'Activate Coupon'"
                >
                  <i
                    class="ph"
                    [class.ph-toggle-right]="coup.isActive"
                    [class.ph-toggle-left]="!coup.isActive"
                  ></i>
                  <span>{{ coup.isActive ? 'Active' : 'Inactive' }}</span>
                </button>
              </div>

              <div class="coupon-main">
                <h3 class="coupon-title">{{ coup.name }}</h3>
                <p class="coupon-desc">{{ coup.description }}</p>

                <div class="discount-banner">
                  <span class="discount-val">
                    {{
                      coup.discountType === 'PERCENTAGE'
                        ? coup.discountValue + '% OFF'
                        : (coup.discountValue | currencyInr) + ' FLAT OFF'
                    }}
                  </span>
                  @if (coup.maxDiscountAmount) {
                    <span class="cap-tag">Up to {{ coup.maxDiscountAmount | currencyInr }}</span>
                  }
                </div>
              </div>

              <div class="conditions-list">
                <div class="cond-item">
                  <i class="ph ph-shopping-bag"></i>
                  <span
                    >Min spend: <strong>{{ coup.minOrderValue | currencyInr }}</strong></span
                  >
                </div>
                <div class="cond-item">
                  <i class="ph ph-arrows-clockwise"></i>
                  <span
                    >Redeemed <strong>{{ coup.redemptionCount }}</strong> /
                    {{ coup.usageLimit }} global quota</span
                  >
                </div>
                <div class="cond-item">
                  <i class="ph ph-user-circle"></i>
                  <span
                    >Limit: <strong>{{ coup.perCustomerLimit }}</strong> per patron</span
                  >
                </div>
              </div>

              <div class="card-actions">
                <button
                  class="btn btn-secondary btn-sm assign-quick-btn"
                  (click)="openAssignModal(coup)"
                >
                  <i class="ph ph-user-plus"></i>
                  <span>Grant to Customer</span>
                </button>
              </div>
            </div>
          }
        </div>
      }

      <!-- TAB 2: TARGETED ENTITLEMENTS -->
      @if (activeTab === 'entitlements') {
        <div class="table-container">
          <div class="table-card">
            <div class="table-header-info">
              <h3 class="heading-card">Explicit Patron Entitlements</h3>
              <p class="text-xs text-muted">
                Targeted coupon privileges explicitly tied to verified customer UUIDs.
              </p>
            </div>

            <table class="data-table">
              <thead>
                <tr>
                  <th>Patron</th>
                  <th>Coupon</th>
                  <th>Quota Used</th>
                  <th>Valid Until</th>
                  <th>Status</th>
                  <th>Assigned By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (asgn of assignments(); track asgn.id) {
                  <tr>
                    <td>
                      <div class="patron-cell">
                        <span class="p-name">{{ asgn.customerName || 'Verified Patron' }}</span>
                        <span class="p-phone">{{ maskPhone(asgn.customerPhoneE164) }}</span>
                      </div>
                    </td>
                    <td>
                      <span class="coupon-code-pill small">{{ asgn.couponCode }}</span>
                    </td>
                    <td>
                      <span
                        class="quota-badge"
                        [class.exhausted]="asgn.redemptionsUsed >= asgn.maxRedemptions"
                      >
                        {{ asgn.redemptionsUsed }} / {{ asgn.maxRedemptions }} used
                      </span>
                    </td>
                    <td class="text-xs text-muted">
                      {{ asgn.validUntil | date: 'mediumDate' }}
                    </td>
                    <td>
                      <span class="status-badge" [class]="asgn.status.toLowerCase()">
                        {{ asgn.status }}
                      </span>
                    </td>
                    <td class="text-xs text-muted">
                      {{ asgn.assignedBy }}
                    </td>
                    <td>
                      @if (asgn.status === 'ACTIVE') {
                        <button
                          class="btn-revoke"
                          (click)="revokeAssignment(asgn.id)"
                          title="Revoke this privilege"
                        >
                          Revoke
                        </button>
                      } @else {
                        <span class="text-xs text-muted">—</span>
                      }
                    </td>
                  </tr>
                }
                @if (assignments().length === 0) {
                  <tr>
                    <td colspan="7" class="text-center py-4 text-muted">
                      No targeted customer entitlements recorded yet. Click "Assign to Patron" to
                      grant privileges.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- TAB 3: REDEMPTION AUDIT TRAIL -->
      @if (activeTab === 'redemptions') {
        <div class="table-container">
          <div class="table-card">
            <div class="table-header-info">
              <h3 class="heading-card">Immutable Redemption Audit Log</h3>
              <p class="text-xs text-muted">
                Cryptographically tracked coupon redemptions tied to orders and idempotency tokens.
              </p>
            </div>

            <table class="data-table">
              <thead>
                <tr>
                  <th>Redemption ID</th>
                  <th>Coupon Code</th>
                  <th>Order Reference</th>
                  <th>Discount Applied</th>
                  <th>Idempotency Token</th>
                  <th>Redeemed Timestamp</th>
                </tr>
              </thead>
              <tbody>
                @for (red of redemptions(); track red.id) {
                  <tr>
                    <td class="font-mono text-xs">{{ red.id }}</td>
                    <td>
                      <span class="coupon-code-pill small">{{ red.couponCode }}</span>
                    </td>
                    <td class="font-bold">{{ red.orderId }}</td>
                    <td class="font-bold text-success">
                      {{ red.discountAmountApplied | currencyInr }}
                    </td>
                    <td class="font-mono text-xs text-muted" [title]="red.idempotencyKey">
                      {{ red.idempotencyKey.slice(0, 18) }}...
                    </td>
                    <td class="text-xs text-muted">{{ red.redeemedAt | date: 'medium' }}</td>
                  </tr>
                }
                @if (redemptions().length === 0) {
                  <tr>
                    <td colspan="6" class="text-center py-4 text-muted">
                      No coupon redemptions recorded yet. Redemptions will appear here when
                      customers complete checkout.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- Create Coupon Modal -->
      @if (showCreateModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card">Create Master Promotional Campaign</h3>
              <button class="close-btn" (click)="showCreateModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Coupon Code (Uppercase) *</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. FESTIVE25"
                    [(ngModel)]="couponForm.code"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Campaign Name *</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. Royal Diwali Courtesy"
                    [(ngModel)]="couponForm.name"
                  />
                </div>
              </div>

              <div class="form-row-3">
                <div class="form-group">
                  <label class="form-label">Discount Type</label>
                  <select class="form-select" [(ngModel)]="couponForm.discountType">
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed Amount (₹)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Discount Value *</label>
                  <input
                    type="number"
                    class="form-input"
                    min="1"
                    [(ngModel)]="couponForm.discountValue"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Min Order Spend (₹) *</label>
                  <input
                    type="number"
                    class="form-input"
                    min="0"
                    [(ngModel)]="couponForm.minOrderValue"
                  />
                </div>
              </div>

              <div class="form-row-2">
                <div class="form-group" *ngIf="couponForm.discountType === 'PERCENTAGE'">
                  <label class="form-label">Max Discount Cap (₹ Optional)</label>
                  <input
                    type="number"
                    class="form-input"
                    placeholder="e.g. 500"
                    [(ngModel)]="couponForm.maxDiscountAmount"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Global Usage Limit</label>
                  <input
                    type="number"
                    class="form-input"
                    min="1"
                    [(ngModel)]="couponForm.usageLimit"
                  />
                </div>
              </div>

              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="couponForm.isTargeted" />
                  <span
                    ><strong>Targeted VIP Coupon:</strong> Requires explicit administrator
                    entitlement assignment before patron can redeem.</span
                  >
                </label>
              </div>

              <div class="form-group">
                <label class="form-label">Description / Dining Terms</label>
                <textarea
                  class="form-textarea"
                  rows="2"
                  placeholder="Describe eligibility conditions..."
                  [(ngModel)]="couponForm.description"
                ></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showCreateModal = false">Cancel</button>
              <button class="btn btn-primary" (click)="saveCoupon()">Publish Campaign</button>
            </div>
          </div>
        </div>
      }

      <!-- Assign Coupon Modal -->
      @if (showAssignModal) {
        <div class="modal-overlay" (click)="onAssignBackdropClick($event)">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card">Grant Targeted Entitlement</h3>
              <button class="close-btn" (click)="showAssignModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">Select Promotion Campaign *</label>
                <select class="form-select" [(ngModel)]="assignForm.couponId">
                  @for (c of coupons(); track c.id) {
                    <option [value]="c.id">{{ c.code }} — {{ c.name }}</option>
                  }
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Select Verified Patron *</label>
                <select class="form-select" [(ngModel)]="assignForm.customerId">
                  @for (cust of customers(); track cust.id) {
                    <option [value]="cust.id">
                      {{ cust.name }} ({{ maskPhone(cust.phone) }}) — {{ cust.loyaltyTier }} Member
                    </option>
                  }
                </select>
              </div>

              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Max Redemptions Allowed</label>
                  <input
                    type="number"
                    class="form-input"
                    min="1"
                    max="10"
                    [(ngModel)]="assignForm.maxRedemptions"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Assigned By (Staff Role)</label>
                  <input type="text" class="form-input" [(ngModel)]="assignForm.assignedBy" />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Internal Notes / Privilege Reason</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="e.g. Platinum Anniversary Courtesy"
                  [(ngModel)]="assignForm.notes"
                />
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showAssignModal = false">Cancel</button>
              <button class="btn btn-primary" (click)="saveAssignment()">Grant Entitlement</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .coupons-page {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        flex-wrap: wrap;
      }
      .header-actions {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .view-tabs {
        display: flex;
        gap: 8px;
        border-bottom: 1px solid var(--color-border);
        padding-bottom: 8px;
      }

      .tab-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border-radius: var(--radius-sm);
        border: 1px solid transparent;
        background: none;
        font-weight: 600;
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all var(--transition-fast);

        &:hover {
          background: var(--color-bone-light);
          color: var(--color-text-primary);
        }

        &.active {
          background: var(--color-onyx);
          color: var(--color-gold);
          border-color: var(--color-onyx);
        }
      }

      .coupons-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 20px;
      }

      .coupon-mgmt-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        transition: all var(--transition-fast);
        box-shadow: var(--shadow-xs);

        &:hover {
          border-color: var(--color-taupe);
          box-shadow: var(--shadow-sm);
        }
        &.inactive-card {
          opacity: 0.65;
          background: var(--color-bone-light);
        }
      }

      .card-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
      }
      .code-tag-group {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .coupon-code-pill {
        font-family: var(--font-mono, monospace);
        font-weight: 800;
        font-size: 0.875rem;
        letter-spacing: 0.05em;
        background: var(--color-onyx);
        color: var(--color-gold);
        padding: 4px 10px;
        border-radius: var(--radius-xs);

        &.small {
          font-size: 0.75rem;
          padding: 2px 8px;
        }
      }

      .badge-targeted {
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-crimson);
        background: rgba(194, 24, 7, 0.08);
        border: 1px solid rgba(194, 24, 7, 0.2);
        padding: 2px 6px;
        border-radius: var(--radius-xs);
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .status-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: none;
        border: none;
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
        color: var(--color-text-muted);

        &.active {
          color: var(--color-success);
        }
        i {
          font-size: 1.25rem;
        }
      }

      .coupon-main {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .coupon-title {
        font-size: 1.05rem;
        font-weight: 700;
      }
      .coupon-desc {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        line-height: 1.45;
      }

      .discount-banner {
        background: var(--color-bone);
        border-left: 3px solid var(--color-crimson);
        padding: 8px 12px;
        border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .discount-val {
        font-weight: 800;
        color: var(--color-crimson);
        font-size: 0.9375rem;
      }
      .cap-tag {
        font-size: 0.75rem;
        color: var(--color-taupe);
        font-weight: 600;
      }

      .conditions-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 10px;
        border-top: 1px solid var(--color-border);
      }

      .cond-item {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.75rem;
        color: var(--color-text-secondary);
        i {
          color: var(--color-taupe);
        }
      }

      .card-actions {
        padding-top: 10px;
        border-top: 1px dashed var(--color-border);
        display: flex;
        justify-content: flex-end;
      }

      .assign-quick-btn {
        width: 100%;
        justify-content: center;
        font-size: 0.8125rem;
      }

      /* Table Styles */
      .table-container {
        width: 100%;
      }
      .table-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        overflow: hidden;
        box-shadow: var(--shadow-xs);
      }

      .table-header-info {
        padding: 16px 20px;
        border-bottom: 1px solid var(--color-border);
      }

      .data-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
        font-size: 0.875rem;

        th {
          background: var(--color-bone-light);
          padding: 10px 16px;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--color-text-secondary);
          border-bottom: 1px solid var(--color-border);
        }

        td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--color-border-subtle, #eee);
          vertical-align: middle;
        }
      }

      .patron-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .p-name {
        font-weight: 700;
      }
      .p-phone {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        font-family: monospace;
      }

      .quota-badge {
        font-size: 0.75rem;
        font-weight: 700;
        background: var(--color-bone);
        padding: 2px 8px;
        border-radius: var(--radius-xs);

        &.exhausted {
          background: rgba(194, 24, 7, 0.1);
          color: var(--color-crimson);
        }
      }

      .status-badge {
        font-size: 0.6875rem;
        font-weight: 800;
        padding: 2px 8px;
        border-radius: var(--radius-full);
        text-transform: uppercase;

        &.active {
          background: var(--color-success-bg, #e6f4ea);
          color: var(--color-success);
        }
        &.exhausted {
          background: var(--color-warning-bg, #fef7e0);
          color: var(--color-warning);
        }
        &.revoked,
        &.expired {
          background: var(--color-danger-bg, #fce8e6);
          color: var(--color-danger);
        }
      }

      .btn-revoke {
        background: none;
        border: 1px solid var(--color-border);
        color: var(--color-danger);
        font-size: 0.75rem;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: var(--radius-xs);
        cursor: pointer;

        &:hover {
          background: rgba(194, 24, 7, 0.08);
          border-color: var(--color-crimson);
        }
      }

      .checkbox-label {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        font-size: 0.8125rem;
        line-height: 1.4;
        cursor: pointer;
        input {
          margin-top: 2px;
        }
      }

      /* Modal Form Rows */
      .form-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .form-row-3 {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 12px;
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
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .close-btn {
        font-size: 1.25rem;
        color: var(--color-text-muted);
        background: none;
        border: none;
        cursor: pointer;
        &:hover {
          color: var(--color-onyx);
        }
      }
    `,
  ],
})
export class CouponManagementComponent {
  private mock = inject(MockDataService);
  private toastService = inject(ToastService);

  activeTab: ViewTab = 'campaigns';

  coupons = this.mock.coupons;
  assignments = this.mock.couponAssignments;
  redemptions = this.mock.couponRedemptions;
  customers = this.mock.customers;

  showCreateModal = false;
  couponForm: Partial<Coupon> = {};

  showAssignModal = false;
  assignForm = {
    couponId: '',
    customerId: '',
    maxRedemptions: 1,
    assignedBy: 'Ranveer B. (General Manager)',
    notes: '',
  };

  maskPhone = maskPhone;

  toggleActive(coupon: Coupon): void {
    const updated = this.mock
      .coupons()
      .map((c) => (c.id === coupon.id ? { ...c, isActive: !c.isActive } : c));
    this.mock.coupons.set(updated);
    this.mock.saveLocal('coupons', updated);
    this.toastService.info(
      `Coupon ${coupon.code} is now ${!coupon.isActive ? 'Active' : 'Inactive'}`,
    );
  }

  openCreateModal(): void {
    this.couponForm = {
      code: '',
      name: '',
      description: '',
      discountType: 'PERCENTAGE',
      discountValue: 15,
      minOrderValue: 800,
      maxDiscountAmount: 300,
      usageLimit: 500,
      perCustomerLimit: 1,
      isTargeted: false,
      isActive: true,
    };
    this.showCreateModal = true;
  }

  saveCoupon(): void {
    if (!this.couponForm.code?.trim() || !this.couponForm.discountValue) return;

    const newCoupon: Coupon = {
      id: `coup-${Date.now().toString().slice(-4)}`,
      code: this.couponForm.code.trim().toUpperCase(),
      name: this.couponForm.name?.trim() || 'Dining Discount',
      description: this.couponForm.description || '',
      discountType: this.couponForm.discountType || 'PERCENTAGE',
      discountValue: Number(this.couponForm.discountValue),
      minOrderValue: Number(this.couponForm.minOrderValue) || 0,
      maxDiscountAmount: this.couponForm.maxDiscountAmount
        ? Number(this.couponForm.maxDiscountAmount)
        : undefined,
      validFrom: new Date().toISOString(),
      validUntil: '2026-12-31T23:59:59Z',
      usageLimit: Number(this.couponForm.usageLimit) || 500,
      perCustomerLimit: Number(this.couponForm.perCustomerLimit) || 1,
      redemptionCount: 0,
      isTargeted: !!this.couponForm.isTargeted,
      isActive: true,
    };

    const updated = [...this.mock.coupons(), newCoupon];
    this.mock.coupons.set(updated);
    this.mock.saveLocal('coupons', updated);

    this.toastService.success(`Created coupon campaign ${newCoupon.code}`);
    this.showCreateModal = false;
  }

  openAssignModal(coupon?: Coupon): void {
    const firstCoupon = coupon || this.coupons()[0];
    const firstCust = this.customers()[0];

    this.assignForm = {
      couponId: firstCoupon ? firstCoupon.id : '',
      customerId: firstCust ? firstCust.id : '',
      maxRedemptions: 1,
      assignedBy: 'Ranveer B. (General Manager)',
      notes: '',
    };
    this.showAssignModal = true;
  }

  saveAssignment(): void {
    if (!this.assignForm.couponId || !this.assignForm.customerId) {
      this.toastService.warning('Please select both a coupon and a customer');
      return;
    }

    try {
      const assignment = this.mock.assignCouponToCustomer(
        this.assignForm.couponId,
        this.assignForm.customerId,
        this.assignForm.assignedBy,
        Number(this.assignForm.maxRedemptions) || 1,
        this.assignForm.notes,
      );
      this.toastService.success(`Assigned ${assignment.couponCode} to ${assignment.customerName}`);
      this.showAssignModal = false;
      this.activeTab = 'entitlements';
    } catch (e: any) {
      this.toastService.warning(e.message || 'Assignment failed');
    }
  }

  revokeAssignment(assignmentId: string): void {
    this.mock.revokeCouponAssignment(assignmentId);
    this.toastService.info('Entitlement revoked');
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.showCreateModal = false;
    }
  }

  onAssignBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.showAssignModal = false;
    }
  }
}
