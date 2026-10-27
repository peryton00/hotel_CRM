import { Component, inject, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import {
  Order,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  OrderItem,
} from '../../../core/models/order.model';
import { MenuItem } from '../../../core/models/menu.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ToastService } from '../../../core/services/toast.service';
import { generateIdempotencyKey } from '../../../core/utils/idempotency.util';
import { AdminAuthService } from '../../../core/services/admin-auth.service';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, CurrencyInrPipe, StatusBadgeComponent],
  template: `
    @if (order(); as ord) {
      <div class="order-detail-page">
        <!-- Header -->
        <div class="detail-header">
          <div class="header-left">
            <a routerLink="/admin/orders" class="back-link">
              <i class="ph ph-arrow-left"></i>
              <span>Back to Live Orders</span>
            </a>
            <div class="title-row">
              <h1 class="heading-display">{{ ord.orderNumber }}</h1>
              @if (ord.orderType === 'TAKEAWAY') {
                <span
                  class="tbl-pill takeaway-pill"
                  style="background: rgba(212, 175, 55, 0.15); border-color: rgba(212, 175, 55, 0.4); color: #8b6508;"
                  ><i class="ph ph-bag"></i> Takeaway ({{
                    ord.pickupReference || ord.orderNumber
                  }})</span
                >
              } @else {
                <span class="tbl-pill">Table {{ ord.tableNumber }}</span>
              }
              <app-status-badge [status]="ord.status"></app-status-badge>
              <app-status-badge [status]="ord.paymentStatus"></app-status-badge>
            </div>
            <p class="text-sm text-muted">
              Created at {{ ord.createdAt | date: 'medium' }}
              @if (ord.printCount && ord.printCount > 0) {
                •
                <span class="print-meta-pill"
                  ><i class="ph ph-printer"></i> Printed {{ ord.printCount }} time{{
                    ord.printCount > 1 ? 's' : ''
                  }}</span
                >
              }
            </p>
          </div>

          <div class="header-actions">
            @if (ord.status !== 'CANCELLED') {
              <button
                class="btn btn-secondary btn-edit-order"
                [class.paid-locked]="ord.paymentStatus === 'PAID'"
                (click)="openEditOrderModal()"
                [title]="
                  ord.paymentStatus === 'PAID'
                    ? 'Order is PAID — Admin Password required to edit'
                    : 'Edit order items, add further dishes or adjust quantities'
                "
              >
                <i
                  class="ph"
                  [class.ph-lock-key]="ord.paymentStatus === 'PAID'"
                  [class.ph-pencil-simple-line]="ord.paymentStatus !== 'PAID'"
                ></i>
                <span>{{
                  ord.paymentStatus === 'PAID' ? 'Edit Order (Admin)' : 'Edit Order'
                }}</span>
              </button>
            }

            @if (ord.status !== 'COMPLETED' && ord.status !== 'CANCELLED') {
              @if (ord.orderType !== 'TAKEAWAY' && (ord.tableId || ord.tableNumber)) {
                <button
                  class="btn btn-secondary"
                  (click)="openTransferModal()"
                  title="Transfer active order to another table"
                >
                  <i class="ph ph-arrows-left-right"></i>
                  <span>Transfer Table</span>
                </button>
              }

              <button
                class="btn btn-secondary btn-cancel-head"
                (click)="openCancelModal()"
                [title]="
                  ord.orderType === 'TAKEAWAY'
                    ? 'Cancel takeaway order'
                    : 'Cancel order and release table'
                "
              >
                <i class="ph ph-x-circle text-crimson"></i>
                <span>Cancel</span>
              </button>
            }
            @if (ord.paymentStatus === 'PAID' || ord.paymentStatus === 'PARTIALLY_PAID') {
              <button
                class="btn btn-secondary"
                (click)="openRefundModal()"
                title="Record refund for settled transaction"
              >
                <i class="ph ph-arrow-counter-clockwise"></i>
                <span>Record Refund</span>
              </button>
            }
            @if (!ord.printCount || ord.printCount === 0) {
              <button
                class="btn btn-secondary"
                (click)="printOrderReceipt()"
                title="Print bill receipt (Original - Copy #1)"
              >
                <i class="ph ph-printer"></i>
                <span>Print</span>
              </button>
            } @else {
              <button
                class="btn btn-secondary btn-reprint"
                (click)="openReprintReceiptModal()"
                [title]="
                  'Invoice already printed ' +
                  ord.printCount +
                  ' time(s) — Admin Password required to reprint'
                "
              >
                <i class="ph ph-lock-key"></i>
                <span>Reprint (Copy #{{ ord.printCount + 1 }})</span>
              </button>
            }
            <a [routerLink]="['/admin/billing', ord.id]" class="btn btn-primary">
              <i class="ph ph-receipt"></i>
              <span>Invoice & Billing Preview</span>
            </a>
          </div>
        </div>

        <!-- Main Layout Grid -->
        <div class="detail-grid">
          <!-- Left: Itemized Dishes & Customizations -->
          <div class="left-panel">
            <div class="panel-box">
              <div class="panel-header-row">
                <h2 class="heading-card">Itemized Order Bill</h2>
                @if (ord.status !== 'CANCELLED') {
                  <button
                    class="btn btn-secondary btn-xs"
                    [class.paid-locked]="ord.paymentStatus === 'PAID'"
                    (click)="openEditOrderModal()"
                    [title]="
                      ord.paymentStatus === 'PAID'
                        ? 'Order is PAID — Admin Password required to adjust'
                        : 'Add further dishes or adjust quantities'
                    "
                  >
                    <i
                      class="ph"
                      [class.ph-lock-key]="ord.paymentStatus === 'PAID'"
                      [class.ph-plus-circle]="ord.paymentStatus !== 'PAID'"
                    ></i>
                    <span>{{
                      ord.paymentStatus === 'PAID' ? 'Add Dishes (Admin)' : 'Add Dishes / Adjust'
                    }}</span>
                  </button>
                }
              </div>
              <div class="table-container">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Dish Description</th>
                      <th>Qty</th>
                      <th>Unit Rate</th>
                      <th>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of ord.items; track item.id) {
                      <tr>
                        <td>
                          <div class="item-desc-cell">
                            <strong>{{ item.name }}</strong>
                            @if (item.selectedPortion) {
                              <span class="portion-tag"
                                >Portion: {{ item.selectedPortion.label }}</span
                              >
                            }
                            @if (item.selectedVariants && item.selectedVariants.length > 0) {
                              <div class="variant-tags">
                                @for (v of item.selectedVariants; track v.optionName) {
                                  <span class="v-tag">{{ v.groupName }}: {{ v.optionName }}</span>
                                }
                              </div>
                            }
                            @if (item.selectedAddons && item.selectedAddons.length > 0) {
                              <div class="addon-tags">
                                @for (a of item.selectedAddons; track a.name) {
                                  <span class="a-tag">+ {{ a.name }}</span>
                                }
                              </div>
                            }
                            @if (item.specialInstructions) {
                              <div class="inst-tag">
                                <i class="ph ph-note"></i> Note: {{ item.specialInstructions }}
                              </div>
                            }
                          </div>
                        </td>
                        <td>
                          <strong>{{ item.quantity }}</strong>
                        </td>
                        <td>{{ item.unitPrice | currencyInr }}</td>
                        <td>
                          <span class="text-price">{{ item.itemTotal | currencyInr }}</span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <!-- Calculation Summary -->
              <div class="order-summary-box">
                <div class="sum-row">
                  <span>Gross Subtotal</span>
                  <span>{{ ord.subtotal | currencyInr }}</span>
                </div>
                @if (ord.discountAmount > 0) {
                  <div class="sum-row discount">
                    <span>Applied Coupon ({{ ord.appliedCouponCode }})</span>
                    <span>-{{ ord.discountAmount | currencyInr }}</span>
                  </div>
                }
                <div class="sum-row">
                  <span>CGST (2.5%)</span>
                  <span>{{ ord.cgstAmount | currencyInr }}</span>
                </div>
                <div class="sum-row">
                  <span>SGST (2.5%)</span>
                  <span>{{ ord.sgstAmount | currencyInr }}</span>
                </div>
                <div class="sum-row total">
                  <span>Final Total</span>
                  <span class="total-amount">{{ ord.totalAmount | currencyInr }}</span>
                </div>
                @if (ord.totalRefunded && ord.totalRefunded > 0) {
                  <div class="sum-row discount" style="font-weight: 700;">
                    <span>Completed Refund</span>
                    <span>-{{ ord.totalRefunded | currencyInr }}</span>
                  </div>
                  <div class="sum-row" style="font-weight: 800; color: var(--color-onyx);">
                    <span>Net Paid Amount</span>
                    <span>{{ ord.totalAmount - ord.totalRefunded | currencyInr }}</span>
                  </div>
                }
              </div>
            </div>
          </div>

          <!-- Right: Status Operations, Payment & Timeline -->
          <div class="right-panel">
            <!-- Operational Status Controls (Interactive Selectors instead of Dropdowns) -->
            <div class="panel-box">
              <h2 class="heading-card">Order Status Action</h2>

              <!-- 1. Dispatch Status Chips -->
              <div class="selector-group">
                <div class="selector-header">
                  <label class="form-label">Dispatch Status</label>
                  <span class="selector-curr-status"
                    >Active: <strong>{{ ord.status }}</strong></span
                  >
                </div>
                <div class="status-option-grid">
                  @for (st of statusOptions; track st.value) {
                    <button
                      type="button"
                      class="status-chip"
                      [class.active]="ord.status === st.value"
                      [class.chip-pending]="st.value === 'PENDING'"
                      [class.chip-accepted]="st.value === 'ACCEPTED'"
                      [class.chip-preparing]="st.value === 'PREPARING'"
                      [class.chip-ready]="st.value === 'READY'"
                      [class.chip-served]="st.value === 'SERVED'"
                      [class.chip-completed]="st.value === 'COMPLETED'"
                      [class.chip-cancelled]="st.value === 'CANCELLED'"
                      (click)="onStatusChipClick(st.value)"
                    >
                      <i [class]="st.icon"></i>
                      <span>{{ st.label }}</span>
                    </button>
                  }
                </div>
              </div>

              <!-- 2. Payment Settlement Status Selector -->
              <div class="selector-group">
                <div class="selector-header">
                  <label class="form-label">Payment Settlement</label>
                  <span class="selector-curr-status"
                    >Status: <strong>{{ ord.paymentStatus }}</strong></span
                  >
                </div>
                <div class="pill-option-row">
                  @for (ps of paymentStatusOptions; track ps.value) {
                    <button
                      type="button"
                      class="pill-choice-btn"
                      [class.active]="ord.paymentStatus === ps.value"
                      (click)="updatePaymentStatus(ps.value)"
                    >
                      <i [class]="ps.icon"></i>
                      <span>{{ ps.label }}</span>
                    </button>
                  }
                </div>
              </div>

              <!-- 3. Payment Method Tender Selector -->
              <div class="selector-group">
                <label class="form-label">Tender Method</label>
                <div class="tender-option-row">
                  @for (pm of paymentMethodOptions; track pm.value) {
                    <button
                      type="button"
                      class="tender-choice-btn"
                      [class.active]="(ord.paymentMethod || 'UPI') === pm.value"
                      (click)="updatePaymentMethod(pm.value)"
                    >
                      <i [class]="pm.icon"></i>
                      <span>{{ pm.label }}</span>
                    </button>
                  }
                </div>
              </div>
            </div>

            <!-- Guest & Table Info -->
            <div class="panel-box">
              <div class="panel-header-row">
                <h2 class="heading-card">Dine-In Guest Details</h2>
                @if (ord.status !== 'COMPLETED' && ord.status !== 'CANCELLED') {
                  <button
                    class="btn btn-secondary btn-xs"
                    (click)="openTransferModal()"
                    title="Transfer Table"
                  >
                    <i class="ph ph-arrows-left-right"></i>
                    <span>Transfer Table</span>
                  </button>
                }
              </div>
              <div class="info-list">
                <div class="info-row">
                  <span class="info-label"><i class="ph ph-user"></i> Customer Name</span>
                  <span class="info-val">{{ ord.customerName }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label"><i class="ph ph-phone"></i> Phone Number</span>
                  <div class="info-val-wrap">
                    <span class="info-val">{{ ord.customerPhone }}</span>
                    @if (ord.customerPhone) {
                      <a [href]="'tel:' + ord.customerPhone" class="tel-link" title="Call Guest">
                        <i class="ph ph-phone-call"></i>
                      </a>
                    }
                  </div>
                </div>
                <div class="info-row">
                  <span class="info-label"
                    ><i
                      class="ph"
                      [class.ph-bag]="ord.orderType === 'TAKEAWAY'"
                      [class.ph-table]="ord.orderType !== 'TAKEAWAY'"
                    ></i>
                    {{ ord.orderType === 'TAKEAWAY' ? 'Order Type' : 'Assigned Table' }}</span
                  >
                  <span class="info-val font-bold text-crimson">{{
                    ord.orderType === 'TAKEAWAY'
                      ? 'Takeaway / Counter (' + (ord.pickupReference || ord.orderNumber) + ')'
                      : 'Table ' + ord.tableNumber
                  }}</span>
                </div>
              </div>
            </div>

            <!-- Refund Audit Trail -->
            @if (orderRefunds().length > 0) {
              <div class="panel-box">
                <h2 class="heading-card">Recorded Refunds ({{ orderRefunds().length }})</h2>
                <div class="refunds-stream">
                  @for (ref of orderRefunds(); track ref.id) {
                    <div class="refund-card-item">
                      <div class="ref-top">
                        <strong class="text-crimson">-{{ ref.refundAmount | currencyInr }}</strong>
                        <span class="text-xs text-muted">{{ ref.createdAt | date: 'short' }}</span>
                      </div>
                      <div class="ref-reason">{{ ref.reason }}</div>
                      <div class="text-xs text-muted">
                        Recorded by {{ ref.staffName || 'Staff' }} • Method:
                        {{ ref.originalPaymentMethod || 'UPI' }}
                      </div>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Order Timeline -->
            <div class="panel-box">
              <h2 class="heading-card">Timeline Audit Log</h2>
              <div class="timeline-stream">
                @for (evt of ord.timeline; track evt.timestamp) {
                  <div class="timeline-step">
                    <div class="step-dot"></div>
                    <div class="step-content">
                      <div class="step-status">{{ evt.status }}</div>
                      <div class="step-time">{{ evt.timestamp | date: 'shortTime' }}</div>
                      @if (evt.note) {
                        <div class="step-note">{{ evt.note }}</div>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Table Transfer Modal -->
        @if (showTransferModal()) {
          <div class="modal-overlay" (click)="onBackdropClick($event, 'transfer')">
            <div
              class="modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="transfer-modal-title"
            >
              <div class="modal-header">
                <div>
                  <h3 id="transfer-modal-title" class="heading-card">Transfer Active Order</h3>
                  <span class="text-xs text-muted"
                    >{{ ord.orderNumber }} • Currently at Table {{ ord.tableNumber }}</span
                  >
                </div>
                <button
                  class="close-btn"
                  (click)="closeTransferModal()"
                  aria-label="Close transfer dialog"
                >
                  <i class="ph ph-x"></i>
                </button>
              </div>

              <div class="modal-body">
                <div class="settle-summary-box">
                  <div class="settle-row">
                    <span>Source Table</span>
                    <strong class="text-crimson">Table {{ ord.tableNumber }}</strong>
                  </div>
                  <div class="settle-row">
                    <span>Guest</span>
                    <strong>{{ ord.customerName }}</strong>
                  </div>
                  <div class="settle-row">
                    <span>Active Bill Total</span>
                    <span>{{ ord.totalAmount | currencyInr }} ({{ ord.items.length }} dishes)</span>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label" for="dest-tbl-select">Select Destination Table *</label>
                  <select
                    id="dest-tbl-select"
                    class="form-select"
                    [ngModel]="selectedDestTableId()"
                    (ngModelChange)="selectedDestTableId.set($event)"
                  >
                    <option value="" disabled>-- Select Destination Table --</option>
                    @for (tbl of eligibleDestTables(); track tbl.id) {
                      <option [value]="tbl.id">
                        Table {{ tbl.number }} ({{ tbl.section }} • Capacity: {{ tbl.capacity }} •
                        {{ tbl.status }})
                      </option>
                    }
                  </select>
                  <span class="text-xs text-muted"
                    >Only available, clean tables with ordering enabled are listed.</span
                  >
                </div>

                @if (transferError()) {
                  <div class="alert-box error">{{ transferError() }}</div>
                }
              </div>

              <div class="modal-footer">
                <button
                  class="btn btn-secondary"
                  (click)="closeTransferModal()"
                  [disabled]="isSubmittingTransfer()"
                >
                  Cancel
                </button>
                <button
                  class="btn btn-primary"
                  (click)="confirmTransfer()"
                  [disabled]="!selectedDestTableId() || isSubmittingTransfer()"
                >
                  @if (isSubmittingTransfer()) {
                    <span>Transferring...</span>
                  } @else {
                    <i class="ph ph-arrows-left-right"></i>
                    <span>Confirm Transfer to Selected Table</span>
                  }
                </button>
              </div>
            </div>
          </div>
        }

        <!-- Refund Modal -->
        @if (showRefundModal()) {
          <div class="modal-overlay" (click)="onBackdropClick($event, 'refund')">
            <div
              class="modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="refund-modal-title"
            >
              <div class="modal-header">
                <div>
                  <h3 id="refund-modal-title" class="heading-card">Record Transaction Refund</h3>
                  <span class="text-xs text-muted"
                    >{{ ord.orderNumber }} • Table {{ ord.tableNumber }}</span
                  >
                </div>
                <button
                  class="close-btn"
                  (click)="closeRefundModal()"
                  aria-label="Close refund dialog"
                >
                  <i class="ph ph-x"></i>
                </button>
              </div>

              <div class="modal-body">
                <div class="settle-summary-box">
                  <div class="settle-row">
                    <span>Paid Bill Amount</span>
                    <strong>{{ ord.totalAmount | currencyInr }}</strong>
                  </div>
                  @if (ord.totalRefunded && ord.totalRefunded > 0) {
                    <div class="settle-row discount">
                      <span>Previously Refunded</span>
                      <span>-{{ ord.totalRefunded | currencyInr }}</span>
                    </div>
                  }
                  <div class="settle-divider"></div>
                  <div class="settle-row total-highlight">
                    <span>Remaining Refundable Balance</span>
                    <span class="amount-large">{{ remainingRefundable() | currencyInr }}</span>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label" for="ref-amount-input">Refund Amount (₹) *</label>
                  <input
                    id="ref-amount-input"
                    type="number"
                    class="form-input"
                    [ngModel]="refundAmount()"
                    (ngModelChange)="refundAmount.set(+$event)"
                    [max]="remainingRefundable()"
                    min="1"
                    step="0.01"
                    placeholder="Enter refund amount"
                  />
                  <div class="quick-refund-actions" style="margin-top: 6px;">
                    <button
                      type="button"
                      class="btn btn-secondary btn-xs"
                      (click)="refundAmount.set(remainingRefundable())"
                    >
                      Full Remaining Balance ({{ remainingRefundable() | currencyInr }})
                    </button>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label" for="ref-reason-input">Reason for Refund *</label>
                  <input
                    id="ref-reason-input"
                    type="text"
                    class="form-input"
                    [ngModel]="refundReason()"
                    (ngModelChange)="refundReason.set($event)"
                    placeholder="e.g. Dish quality issue / incorrect bill calculation / guest cancellation"
                  />
                </div>

                @if (refundError()) {
                  <div class="alert-box error">{{ refundError() }}</div>
                }
              </div>

              <div class="modal-footer">
                <button
                  class="btn btn-secondary"
                  (click)="closeRefundModal()"
                  [disabled]="isSubmittingRefund()"
                >
                  Cancel
                </button>
                <button
                  class="btn btn-danger"
                  (click)="confirmRefund()"
                  [disabled]="
                    refundAmount() <= 0 ||
                    refundAmount() > remainingRefundable() ||
                    !refundReason().trim() ||
                    isSubmittingRefund()
                  "
                >
                  @if (isSubmittingRefund()) {
                    <span>Recording...</span>
                  } @else {
                    <i class="ph ph-arrow-counter-clockwise"></i>
                    <span>Confirm ₹{{ refundAmount() }} Refund</span>
                  }
                </button>
              </div>
            </div>
          </div>
        }

        <!-- Admin Password Authorization Modal for Paid Orders -->
        @if (showAdminPasswordModal()) {
          <div class="modal-overlay" (click)="onBackdropClick($event, 'admin-password')">
            <div
              class="modal-card auth-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-auth-dialog-title-detail"
            >
              <div class="modal-header">
                <div class="auth-modal-title-wrap">
                  <div class="auth-icon-badge">
                    <i class="ph ph-shield-lock"></i>
                  </div>
                  <div>
                    <h3 id="admin-auth-dialog-title-detail" class="heading-card">
                      Admin Password Required
                    </h3>
                    <span class="text-xs text-muted">
                      {{
                        isReprintFlow()
                          ? 'Supervisor authorization to reprint Tax Invoice'
                          : 'Supervisor authorization for settled order ' + ord.orderNumber
                      }}
                    </span>
                  </div>
                </div>
                <button
                  class="close-btn"
                  (click)="cancelAdminPasswordModal()"
                  aria-label="Close dialog"
                >
                  <i class="ph ph-x"></i>
                </button>
              </div>

              <div class="modal-body auth-dialog-body">
                <div class="auth-warning-box">
                  <i class="ph ph-warning-circle"></i>
                  @if (isReprintFlow()) {
                    <p>
                      Invoice for <strong>{{ ord.orderNumber }}</strong> has already been printed
                      <strong
                        >{{ ord.printCount }} time{{ (ord.printCount || 0) > 1 ? 's' : '' }}</strong
                      >. Reprinting duplicate bills requires supervisor authorization to prevent
                      billing discrepancies.
                    </p>
                  } @else {
                    <p>
                      Order <strong>{{ ord.orderNumber }}</strong> (Table {{ ord.tableNumber }}) has
                      already been <span class="paid-tag">PAID & SETTLED</span>. Modifying items,
                      quantities, or prices alters financial invoices and sales records.
                    </p>
                  }
                </div>

                <div class="form-group">
                  <label class="form-label" for="adminDetailPassword"
                    >Enter Admin Password / Staff PIN</label
                  >
                  <div class="input-with-icon">
                    <i class="ph ph-lock-key"></i>
                    <input
                      id="adminDetailPassword"
                      type="password"
                      class="form-input"
                      placeholder="Enter admin password or PIN..."
                      [value]="adminPasswordInput()"
                      (input)="adminPasswordInput.set($any($event.target).value)"
                      (keyup.enter)="verifyAdminPasswordForEdit()"
                      autocomplete="current-password"
                      autofocus
                    />
                  </div>
                  <span class="hint-text"
                    >Staff/Manager PIN: <strong>1234</strong> or password
                    <strong>admin</strong></span
                  >
                </div>

                @if (adminPasswordError()) {
                  <div class="auth-error-banner">
                    <i class="ph ph-warning-circle"></i>
                    <span>{{ adminPasswordError() }}</span>
                  </div>
                }
              </div>

              <div class="modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  (click)="cancelAdminPasswordModal()"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  [disabled]="!adminPasswordInput().trim()"
                  (click)="verifyAdminPasswordForEdit()"
                >
                  <i
                    class="ph"
                    [class.ph-printer]="isReprintFlow()"
                    [class.ph-lock-key-open]="!isReprintFlow()"
                  ></i>
                  <span>{{
                    isReprintFlow() ? 'Authorize & Print Reprint' : 'Authorize & Edit'
                  }}</span>
                </button>
              </div>
            </div>
          </div>
        }

        <!-- Edit Order Modal -->
        @if (showEditModal()) {
          <div class="modal-overlay" (click)="onBackdropClick($event, 'edit')">
            <div
              class="modal-card edit-order-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-order-title"
            >
              <div class="modal-header">
                <div>
                  <h3 id="edit-order-title" class="heading-card">
                    Edit Order {{ ord.orderNumber }}
                  </h3>
                  <span class="text-xs text-muted">
                    Table {{ ord.tableNumber }} • Adjust dish items, quantities, or customer details
                  </span>
                </div>
                <button
                  class="close-btn"
                  (click)="closeEditOrderModal()"
                  aria-label="Close edit order dialog"
                >
                  <i class="ph ph-x"></i>
                </button>
              </div>

              @if (isManagerOverrideActive() || ord.paymentStatus === 'PAID') {
                <div class="admin-override-badge-banner">
                  <i class="ph ph-shield-warning"></i>
                  <div>
                    <strong>Admin Override Active (Settled Order)</strong>
                    <span
                      >Modifying dishes on a settled order will alter bill totals and write to the
                      audit timeline.</span
                    >
                  </div>
                </div>
              }

              <div class="modal-body edit-order-workspace">
                <!-- Left: Catalog Dish Picker -->
                <div class="edit-catalog-col">
                  <div class="box-title">Add Dishes From Catalog</div>
                  <div class="catalog-search-wrap">
                    <i class="ph ph-magnifying-glass"></i>
                    <input
                      type="text"
                      class="form-input"
                      placeholder="Search menu catalog..."
                      [ngModel]="editDishSearch()"
                      (ngModelChange)="editDishSearch.set($event)"
                    />
                  </div>

                  <div class="catalog-items-grid">
                    @for (dish of filteredMenuItems(); track dish.id) {
                      <div class="catalog-dish-tile">
                        <div class="tile-details">
                          <span class="dish-title">{{ dish.name }}</span>
                          <span class="dish-cat-price"
                            >{{ dish.dietary }} • {{ dish.price | currencyInr }}</span
                          >
                        </div>
                        <button
                          type="button"
                          class="btn btn-secondary btn-xs add-dish-btn"
                          (click)="addDishToEdit(dish)"
                          title="Add to order"
                        >
                          <i class="ph ph-plus"></i> Add
                        </button>
                      </div>
                    } @empty {
                      <div class="empty-catalog-note">No matching dishes in catalog</div>
                    }
                  </div>
                </div>

                <!-- Right: Active Items in Order Draft -->
                <div class="edit-draft-col">
                  <!-- Guest fields -->
                  <div class="guest-edit-grid">
                    <div class="form-group">
                      <label class="form-label">Customer Name</label>
                      <input
                        type="text"
                        class="form-input"
                        [ngModel]="editCustomerName()"
                        (ngModelChange)="editCustomerName.set($event)"
                        placeholder="Guest name"
                      />
                    </div>
                    <div class="form-group">
                      <label class="form-label">Phone Number</label>
                      <input
                        type="text"
                        class="form-input"
                        [ngModel]="editCustomerPhone()"
                        (ngModelChange)="editCustomerPhone.set($event)"
                        placeholder="+91..."
                      />
                    </div>
                  </div>

                  <!-- Itemized Draft List -->
                  <div class="draft-items-box">
                    <div class="box-title">Order Dishes ({{ editItems().length }})</div>
                    <div class="draft-items-list">
                      @for (it of editItems(); track it.id; let idx = $index) {
                        <div class="draft-item-row">
                          <div class="draft-item-info">
                            <span class="d-name">{{ it.name }}</span>
                            <span class="d-sub">{{ it.unitPrice | currencyInr }} each</span>
                          </div>
                          <div class="draft-qty-controls">
                            <button
                              type="button"
                              class="qty-btn"
                              (click)="decrementEditItem(idx)"
                              title="Decrease quantity"
                            >
                              -
                            </button>
                            <span class="qty-num">{{ it.quantity }}</span>
                            <button
                              type="button"
                              class="qty-btn"
                              (click)="incrementEditItem(idx)"
                              title="Increase quantity"
                            >
                              +
                            </button>
                          </div>
                          <span class="draft-item-total">{{ it.itemTotal | currencyInr }}</span>
                          <button
                            type="button"
                            class="trash-btn"
                            (click)="removeEditItem(idx)"
                            title="Remove Dish"
                          >
                            <i class="ph ph-trash"></i>
                          </button>
                        </div>
                      } @empty {
                        <div class="empty-items-notice">
                          Order must contain at least one dish. Pick from catalog on the left.
                        </div>
                      }
                    </div>
                  </div>

                  <!-- Financial Calculations Preview -->
                  <div class="draft-totals-strip">
                    <div class="dt-row">
                      <span>Subtotal</span>
                      <span>{{ editSubtotal() | currencyInr }}</span>
                    </div>
                    <div class="dt-row">
                      <span>GST (5%)</span>
                      <span>{{ editTax() | currencyInr }}</span>
                    </div>
                    @if (ord.discountAmount > 0) {
                      <div class="dt-row discount">
                        <span>Discount</span>
                        <span>-{{ ord.discountAmount | currencyInr }}</span>
                      </div>
                    }
                    <div class="dt-row total">
                      <span>New Total</span>
                      <span class="text-crimson font-bold">{{ editTotal() | currencyInr }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="modal-footer">
                <button
                  class="btn btn-secondary"
                  (click)="closeEditOrderModal()"
                  [disabled]="isSavingEdit()"
                >
                  Cancel
                </button>
                <button
                  class="btn btn-primary"
                  (click)="confirmSaveEdit()"
                  [disabled]="editItems().length === 0 || isSavingEdit()"
                >
                  @if (isSavingEdit()) {
                    <span>Saving Changes...</span>
                  } @else {
                    <i class="ph ph-check"></i>
                    <span>Save Order Changes</span>
                  }
                </button>
              </div>
            </div>
          </div>
        }

        <!-- Cancel Order Confirmation Modal -->
        @if (showCancelModal()) {
          <div class="modal-overlay" (click)="onBackdropClick($event, 'cancel')">
            <div
              class="modal-card cancel-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-modal-title"
            >
              <div class="modal-header">
                <div class="cancel-header-group">
                  <div class="cancel-icon-circle">
                    <i class="ph ph-x-circle"></i>
                  </div>
                  <div>
                    <h3 id="cancel-modal-title" class="heading-card">Cancel Order</h3>
                    <span class="text-xs text-muted"
                      >{{ ord.orderNumber }} •
                      {{
                        ord.orderType === 'TAKEAWAY'
                          ? 'Takeaway (' + (ord.pickupReference || ord.orderNumber) + ')'
                          : 'Table ' + ord.tableNumber
                      }}</span
                    >
                  </div>
                </div>
                <button class="close-btn" (click)="closeCancelModal()" aria-label="Close dialog">
                  <i class="ph ph-x"></i>
                </button>
              </div>

              <div class="modal-body">
                <div class="cancel-warning-box">
                  <i class="ph ph-warning-circle"></i>
                  <div>
                    <strong>Cancellation Repercussions</strong>
                    <p>
                      {{
                        ord.orderType === 'TAKEAWAY'
                          ? 'Cancelling this order will release any reserved kitchen ingredients back to stock.'
                          : 'Cancelling this order will release Table ' +
                            ord.tableNumber +
                            ' to AVAILABLE and restock any reserved kitchen ingredients.'
                      }}
                    </p>
                  </div>
                </div>

                <div class="cancel-order-chip">
                  <span
                    ><strong>{{ ord.customerName }}</strong></span
                  >
                  <span>•</span>
                  <span>{{ ord.items.length }} dishes</span>
                  <span>•</span>
                  <span class="text-crimson font-bold">{{ ord.totalAmount | currencyInr }}</span>
                </div>

                <div class="form-group">
                  <label class="form-label">Select Cancellation Reason *</label>
                  <div class="reason-pills">
                    @for (r of commonCancelReasons; track r) {
                      <button
                        type="button"
                        class="reason-pill"
                        [class.active]="cancellationReason() === r"
                        (click)="cancellationReason.set(r)"
                      >
                        {{ r }}
                      </button>
                    }
                  </div>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="Or enter custom cancellation note..."
                    [ngModel]="cancellationReason()"
                    (ngModelChange)="cancellationReason.set($event)"
                  />
                </div>

                @if (cancelError()) {
                  <div class="alert-box error">{{ cancelError() }}</div>
                }
              </div>

              <div class="modal-footer">
                <button
                  class="btn btn-secondary"
                  (click)="closeCancelModal()"
                  [disabled]="isCancelling()"
                >
                  Keep Order Active
                </button>
                <button
                  class="btn btn-danger"
                  (click)="confirmCancelOrder()"
                  [disabled]="!cancellationReason().trim() || isCancelling()"
                >
                  @if (isCancelling()) {
                    <span>Cancelling Order...</span>
                  } @else {
                    <i class="ph ph-x-circle"></i>
                    <span>Confirm Order Cancellation</span>
                  }
                </button>
              </div>
            </div>
          </div>
        }
      </div>
    } @else {
      <div class="empty-state-panel">
        <h2 class="heading-card">Order Not Found</h2>
        <p class="text-muted">The requested order does not exist or has been archived.</p>
        <a routerLink="/admin/orders" class="btn btn-secondary">Return to Orders Queue</a>
      </div>
    }
  `,
  styles: [
    `
      .order-detail-page {
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
        margin-bottom: 10px;
        &:hover {
          color: var(--color-crimson);
        }
      }

      .title-row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 4px;
      }

      .tbl-pill {
        font-size: 0.875rem;
        font-weight: 800;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        padding: 4px 12px;
        border-radius: var(--radius-full);
        color: var(--color-crimson);
      }

      .detail-grid {
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
        padding: 22px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-bottom: 20px;
      }

      .item-desc-cell {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .portion-tag {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .variant-tags,
      .addon-tags {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .v-tag,
      .a-tag {
        font-size: 0.6875rem;
        background: var(--color-bone);
        border: 1px solid var(--color-border);
        padding: 2px 6px;
        border-radius: var(--radius-xs);
        color: var(--color-text-secondary);
      }

      .inst-tag {
        font-size: 0.75rem;
        color: var(--color-crimson);
        font-style: italic;
      }

      .order-summary-box {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--color-border);
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-self: flex-end;
        width: 100%;
        max-width: 320px;
      }

      .sum-row {
        display: flex;
        justify-content: space-between;
        font-size: 0.875rem;
        color: var(--color-text-secondary);

        &.discount {
          color: var(--color-success);
          font-weight: 600;
        }
        &.total {
          margin-top: 6px;
          padding-top: 8px;
          border-top: 1px solid var(--color-border);
          font-weight: 800;
          font-size: 1.125rem;
          color: var(--color-text-primary);
        }
      }

      .total-amount {
        color: var(--color-crimson);
      }

      .payment-action-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .info-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        border-bottom: 1px solid var(--color-border-subtle);
        padding-bottom: 6px;
        font-size: 0.875rem;
      }

      .info-label {
        color: var(--color-text-muted);
        font-size: 0.8125rem;
      }
      .info-val {
        font-weight: 600;
      }
      .font-bold {
        font-weight: 700;
      }

      .timeline-stream {
        display: flex;
        flex-direction: column;
        gap: 16px;
        position: relative;
        padding-left: 20px;
        border-left: 2px solid var(--color-border);
      }

      .timeline-step {
        position: relative;
      }

      .step-dot {
        position: absolute;
        left: -26px;
        top: 4px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--color-crimson);
        border: 2px solid var(--color-surface);
      }

      .step-status {
        font-weight: 700;
        font-size: 0.875rem;
      }

      .step-time {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .step-note {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        margin-top: 2px;
      }

      .settle-summary-box {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 20px;
      }

      .settle-row {
        display: flex;
        justify-content: space-between;
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        &.discount {
          color: var(--color-crimson);
        }
        &.total-highlight {
          font-weight: 800;
          color: var(--color-onyx);
          font-size: 1rem;
          padding-top: 4px;
        }
      }

      .amount-large {
        font-size: 1.25rem;
        color: var(--color-crimson);
        font-weight: 800;
      }

      .settle-divider {
        border-bottom: 1px dashed var(--color-border);
        margin: 4px 0;
      }

      .alert-box {
        padding: 10px 14px;
        border-radius: var(--radius-sm);
        font-size: 0.8125rem;
        margin-top: 12px;
        &.error {
          background: var(--color-danger-bg);
          color: var(--color-danger);
          border: 1px solid rgba(169, 28, 18, 0.25);
        }
      }

      .quick-refund-actions {
        display: flex;
        gap: 8px;
      }

      .refunds-stream {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .refund-card-item {
        background: var(--color-bone);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .ref-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .ref-reason {
        font-size: 0.8125rem;
        color: var(--color-onyx);
        font-weight: 500;
      }

      .panel-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }

      .btn-cancel-head {
        border-color: rgba(194, 24, 7, 0.3);
        color: var(--color-crimson);
        &:hover {
          background: #fee2e2;
          border-color: var(--color-crimson);
        }
      }

      /* Option Selectors replacing Dropdowns */
      .selector-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;

        &:last-child {
          margin-bottom: 0;
        }
      }

      .selector-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }

      .selector-curr-status {
        font-size: 0.75rem;
        color: var(--color-text-muted);

        strong {
          color: var(--color-onyx);
        }
      }

      .status-option-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
        gap: 6px;
      }

      .status-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 7px 10px;
        border-radius: var(--radius-xs);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text-secondary);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: all var(--transition-fast);
        white-space: nowrap;

        i {
          font-size: 0.875rem;
        }

        &:hover {
          background: var(--color-bone-light);
          color: var(--color-onyx);
          border-color: var(--color-taupe);
        }

        &.active {
          font-weight: 700;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);

          &.chip-pending {
            background: #fffbeb;
            border-color: #d97706;
            color: #b45309;
          }
          &.chip-accepted {
            background: #eff6ff;
            border-color: #3b82f6;
            color: #1d4ed8;
          }
          &.chip-preparing {
            background: #faf5ff;
            border-color: #a855f7;
            color: #7e22ce;
          }
          &.chip-ready {
            background: #fff7ed;
            border-color: #f97316;
            color: #c2410c;
          }
          &.chip-served {
            background: #f0fdf4;
            border-color: #22c55e;
            color: #15803d;
          }
          &.chip-completed {
            background: #f0fdf4;
            border-color: #16a34a;
            color: #166534;
          }
          &.chip-cancelled {
            background: #fef2f2;
            border-color: var(--color-crimson);
            color: var(--color-crimson);
          }
        }
      }

      .pill-option-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
        gap: 6px;
      }

      .pill-choice-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 6px 8px;
        border-radius: var(--radius-xs);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text-secondary);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: all var(--transition-fast);
        white-space: nowrap;

        i {
          font-size: 0.85rem;
        }

        &:hover {
          background: var(--color-bone-light);
          color: var(--color-onyx);
        }

        &.active {
          background: var(--color-onyx);
          color: #ffffff;
          border-color: var(--color-onyx);
          font-weight: 700;
        }
      }

      .tender-option-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
      }

      .tender-choice-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 7px 10px;
        border-radius: var(--radius-xs);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text-secondary);
        font-size: 0.78125rem;
        font-weight: 600;
        cursor: pointer;
        transition: all var(--transition-fast);

        i {
          font-size: 1rem;
        }

        &:hover {
          background: var(--color-bone-light);
          color: var(--color-onyx);
        }

        &.active {
          background: rgba(139, 29, 36, 0.08);
          border-color: var(--color-crimson);
          color: var(--color-crimson);
          font-weight: 700;
        }
      }

      .info-val-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .tel-link {
        color: var(--color-crimson);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
        &:hover {
          opacity: 0.8;
        }
      }

      /* Edit Order Modal */
      .edit-order-modal {
        max-width: 960px;
        width: 100%;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
      }

      .edit-order-workspace {
        display: grid;
        grid-template-columns: 1.1fr 1fr;
        gap: 20px;
        overflow-y: auto;
        padding: 18px 22px;
        max-height: calc(90vh - 140px);

        @media (max-width: 768px) {
          grid-template-columns: 1fr;
        }
      }

      .edit-catalog-col {
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 14px;
        max-height: 520px;
      }

      .box-title {
        font-size: 0.8125rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-text-muted);
      }

      .catalog-search-wrap {
        position: relative;
        i {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--color-text-muted);
        }
        .form-input {
          padding-left: 32px;
        }
      }

      .catalog-items-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
        overflow-y: auto;
        padding-right: 4px;
      }

      .catalog-dish-tile {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 10px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-xs);

        .tile-details {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .dish-title {
          font-weight: 600;
          font-size: 0.8125rem;
          color: var(--color-onyx);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .dish-cat-price {
          font-size: 0.72rem;
          color: var(--color-text-muted);
        }
      }

      .empty-catalog-note {
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        text-align: center;
        padding: 20px;
        font-style: italic;
      }

      .edit-draft-col {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .guest-edit-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .draft-items-box {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 12px;
        background: var(--color-surface);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .draft-items-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 220px;
        overflow-y: auto;
      }

      .draft-item-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 8px;
        background: var(--color-bone-light);
        border-radius: var(--radius-xs);
      }

      .draft-item-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        .d-name {
          font-weight: 600;
          font-size: 0.8125rem;
          color: var(--color-onyx);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .d-sub {
          font-size: 0.7rem;
          color: var(--color-text-muted);
        }
      }

      .draft-qty-controls {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .qty-btn {
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        border-radius: 3px;
        font-weight: 700;
        cursor: pointer;
        &:hover {
          background: var(--color-border-subtle);
        }
      }

      .qty-num {
        font-weight: 700;
        font-size: 0.8125rem;
        min-width: 14px;
        text-align: center;
      }

      .draft-item-total {
        font-weight: 700;
        font-size: 0.8125rem;
        min-width: 60px;
        text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .trash-btn {
        background: transparent;
        border: none;
        color: var(--color-text-muted);
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        &:hover {
          color: var(--color-crimson);
        }
      }

      .draft-totals-strip {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;

        .dt-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.8125rem;
          color: var(--color-text-secondary);

          &.discount {
            color: var(--color-success);
            font-weight: 600;
          }
          &.total {
            margin-top: 4px;
            padding-top: 6px;
            border-top: 1px dashed var(--color-border);
            font-weight: 800;
            font-size: 0.9375rem;
            color: var(--color-onyx);
          }
        }
      }

      /* Cancel Modal */
      .cancel-modal {
        max-width: 480px;
        width: 100%;

        .cancel-header-group {
          display: flex;
          align-items: center;
          gap: 12px;

          .cancel-icon-circle {
            width: 36px;
            height: 36px;
            border-radius: var(--radius-full);
            background: var(--color-danger-bg);
            color: var(--color-danger);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            flex-shrink: 0;
          }
        }

        .cancel-warning-box {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px;
          background: var(--color-danger-bg);
          border: 1px solid rgba(194, 24, 7, 0.25);
          border-radius: var(--radius-sm);
          color: var(--color-danger);
          margin-bottom: 14px;

          i {
            font-size: 1.25rem;
            flex-shrink: 0;
            margin-top: 2px;
          }

          strong {
            font-size: 0.8125rem;
            display: block;
            margin-bottom: 2px;
          }

          p {
            margin: 0;
            color: var(--color-text-secondary);
          }
        }

        .cancel-order-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: var(--color-bone-light);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          font-size: 0.8125rem;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .reason-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 8px;
        }

        .reason-pill {
          padding: 4px 10px;
          font-size: 0.75rem;
          font-weight: 600;
          border-radius: var(--radius-full);
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          color: var(--color-text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);

          &:hover {
            border-color: var(--color-crimson);
            color: var(--color-crimson);
          }

          &.active {
            background: var(--color-danger-bg);
            border-color: var(--color-crimson);
            color: var(--color-crimson);
            font-weight: 700;
          }
        }

        .auth-modal-card {
          max-width: 440px;
          width: 100%;

          .auth-modal-title-wrap {
            display: flex;
            align-items: center;
            gap: 12px;

            .auth-icon-badge {
              width: 36px;
              height: 36px;
              border-radius: var(--radius-full);
              background: rgba(184, 134, 11, 0.15);
              color: #b8860b;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1.25rem;
              flex-shrink: 0;
            }
          }

          .auth-dialog-body {
            display: flex;
            flex-direction: column;
            gap: 14px;
          }

          .auth-warning-box {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 12px;
            background: rgba(184, 134, 11, 0.08);
            border: 1px solid rgba(184, 134, 11, 0.25);
            border-radius: var(--radius-sm);
            font-size: 0.8125rem;
            color: var(--color-onyx);

            i {
              font-size: 1.25rem;
              color: #b8860b;
              flex-shrink: 0;
              margin-top: 1px;
            }

            p {
              margin: 0;
              line-height: 1.4;
            }

            .paid-tag {
              background: var(--color-success);
              color: #fff;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 0.7rem;
              font-weight: 700;
            }
          }

          .input-with-icon {
            position: relative;
            display: flex;
            align-items: center;

            i {
              position: absolute;
              left: 12px;
              font-size: 1rem;
              color: var(--color-text-muted);
              pointer-events: none;
            }

            .form-input {
              padding-left: 36px;
              width: 100%;
            }
          }

          .auth-error-banner {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: var(--color-danger-bg);
            border: 1px solid rgba(194, 24, 7, 0.25);
            border-radius: var(--radius-sm);
            color: var(--color-crimson);
            font-size: 0.8125rem;
            font-weight: 500;
          }
        }

        .admin-override-badge-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          margin: 0 16px 12px 16px;
          background: rgba(184, 134, 11, 0.09);
          border: 1px solid rgba(184, 134, 11, 0.3);
          border-radius: var(--radius-sm);
          font-size: 0.8125rem;
          color: var(--color-onyx);

          i {
            font-size: 1.25rem;
            color: #b8860b;
            flex-shrink: 0;
          }

          strong {
            display: block;
            font-size: 0.8125rem;
            color: #8b6508;
          }

          span {
            color: var(--color-text-secondary);
            font-size: 0.75rem;
          }
        }

        .btn-edit-order.paid-locked,
        .btn-xs.paid-locked,
        .btn-reprint {
          border-color: rgba(184, 134, 11, 0.35);
          color: #8b6508;
          background: rgba(184, 134, 11, 0.06);

          &:hover {
            background: rgba(184, 134, 11, 0.14);
            border-color: #b8860b;
          }
        }

        .print-meta-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #8b6508;
          font-weight: 600;
        }
      }
    `,
  ],
})
export class OrderDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);
  private adminAuth = inject(AdminAuthService);

  orderId = signal<string>('');

  order = computed(() => {
    return (
      this.mock.orders().find((o) => o.id === this.orderId() || o.orderNumber === this.orderId()) ||
      null
    );
  });

  // Option configurations for interactive chips
  readonly statusOptions: { value: OrderStatus; label: string; icon: string }[] = [
    { value: 'PENDING', label: 'Pending', icon: 'ph ph-hourglass-simple' },
    { value: 'ACCEPTED', label: 'Accepted', icon: 'ph ph-check' },
    { value: 'PREPARING', label: 'Preparing', icon: 'ph ph-cooking-pot' },
    { value: 'READY', label: 'Ready', icon: 'ph ph-bell-ringing' },
    { value: 'SERVED', label: 'Served', icon: 'ph ph-hand-waving' },
    { value: 'COMPLETED', label: 'Completed', icon: 'ph ph-check-circle' },
    { value: 'CANCELLED', label: 'Cancelled', icon: 'ph ph-x-circle' },
  ];

  readonly paymentStatusOptions: { value: PaymentStatus; label: string; icon: string }[] = [
    { value: 'UNPAID', label: 'Unpaid', icon: 'ph ph-clock' },
    { value: 'PARTIALLY_PAID', label: 'Partial', icon: 'ph ph-pie' },
    { value: 'PAID', label: 'Paid in Full', icon: 'ph ph-check-circle' },
    { value: 'REFUNDED', label: 'Refunded', icon: 'ph ph-arrow-counter-clockwise' },
  ];

  readonly paymentMethodOptions: { value: PaymentMethod; label: string; icon: string }[] = [
    { value: 'UPI', label: 'UPI / QR', icon: 'ph ph-qr-code' },
    { value: 'CARD', label: 'Card', icon: 'ph ph-credit-card' },
    { value: 'CASH', label: 'Cash', icon: 'ph ph-money' },
  ];

  // Table Transfer State
  showTransferModal = signal<boolean>(false);
  selectedDestTableId = signal<string>('');
  transferError = signal<string>('');
  isSubmittingTransfer = signal<boolean>(false);

  // Refund State
  showRefundModal = signal<boolean>(false);
  refundAmount = signal<number>(0);
  refundReason = signal<string>('');
  refundError = signal<string>('');
  isSubmittingRefund = signal<boolean>(false);

  // Admin Password Override for Paid Orders
  showAdminPasswordModal = signal<boolean>(false);
  adminPasswordInput = signal<string>('');
  adminPasswordError = signal<string>('');
  isManagerOverrideActive = signal<boolean>(false);
  isReprintFlow = signal<boolean>(false);

  // Edit Order State
  showEditModal = signal<boolean>(false);
  editCustomerName = signal<string>('');
  editCustomerPhone = signal<string>('');
  editItems = signal<OrderItem[]>([]);
  editDishSearch = signal<string>('');
  isSavingEdit = signal<boolean>(false);

  // Cancel Order State
  showCancelModal = signal<boolean>(false);
  cancellationReason = signal<string>('Customer Cancelled');
  cancelError = signal<string>('');
  isCancelling = signal<boolean>(false);
  readonly commonCancelReasons: string[] = [
    'Customer Cancelled',
    'Guest Walked Out',
    'Ordered in Error',
    'Kitchen Shortage',
    'Duplicate Order Entry',
  ];

  orderRefunds = computed(() => {
    const ord = this.order();
    if (!ord) return [];
    return this.mock.refunds().filter((r) => r.orderId === ord.id);
  });

  remainingRefundable = computed(() => {
    const ord = this.order();
    if (!ord) return 0;
    return this.mock.getRemainingRefundableAmount(ord.id);
  });

  eligibleDestTables = computed(() => {
    const ord = this.order();
    if (!ord) return [];
    return this.mock
      .tables()
      .filter(
        (t) =>
          t.id !== ord.tableId &&
          t.number !== ord.tableNumber &&
          t.orderingEnabled !== false &&
          t.status !== 'DIRTY' &&
          t.status !== 'OCCUPIED',
      );
  });

  filteredMenuItems = computed(() => {
    const q = this.editDishSearch().toLowerCase().trim();
    const items = this.mock.menuItems();
    if (!q) return items.slice(0, 8);
    return items.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.dietary.toLowerCase().includes(q),
    );
  });

  editSubtotal = computed(() => {
    return this.editItems().reduce((acc, it) => acc + it.itemTotal, 0);
  });

  editTax = computed(() => {
    return Math.round(this.editSubtotal() * 0.05 * 100) / 100;
  });

  editTotal = computed(() => {
    const ord = this.order();
    const discount = ord?.discountAmount || 0;
    return Math.max(0, this.editSubtotal() + this.editTax() - discount);
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.orderId.set(params.get('orderId') || '');
    });
  }

  onStatusChipClick(status: OrderStatus): void {
    if (status === 'CANCELLED') {
      this.openCancelModal();
    } else {
      this.updateStatus(status);
    }
  }

  updateStatus(status: OrderStatus): void {
    const ord = this.order();
    if (!ord) return;

    const res = this.mock.updateOrderStatusAtomic(ord.id, status, {
      note: `Updated to ${status}`,
    });

    if (!res.success) {
      this.toastService.error(res.error || `Could not update order status to ${status}`);
      return;
    }

    this.toastService.success(`Order status updated to ${status}`);
  }

  updatePaymentStatus(status: PaymentStatus): void {
    const ord = this.order();
    if (!ord) return;

    if (ord.isSplit) {
      this.toastService.warning(
        'This order is split into individual bills. Please settle via its split bills.',
      );
      return;
    }

    const updated = this.mock
      .orders()
      .map((o) =>
        o.id === ord.id ? { ...o, paymentStatus: status, updatedAt: new Date().toISOString() } : o,
      );
    this.mock.orders.set(updated);
    this.mock.saveLocal('orders', updated);
    this.toastService.success(`Payment status marked as ${status}`);
  }

  updatePaymentMethod(method: PaymentMethod): void {
    const ord = this.order();
    if (!ord) return;

    const updated = this.mock
      .orders()
      .map((o) =>
        o.id === ord.id ? { ...o, paymentMethod: method, updatedAt: new Date().toISOString() } : o,
      );
    this.mock.orders.set(updated);
    this.mock.saveLocal('orders', updated);
    this.toastService.info(`Payment method updated to ${method}`);
  }

  printOrderReceipt(): void {
    const ord = this.order();
    if (!ord) return;
    const res = this.mock.recordOrderPrint(ord.id, false, 'Floor Staff');
    if (res.success) {
      this.toastService.success(`Bill receipt printed (Original - Copy #1).`);
      window.print();
    }
  }

  openReprintReceiptModal(): void {
    this.isReprintFlow.set(true);
    this.adminPasswordInput.set('');
    this.adminPasswordError.set('');
    this.showAdminPasswordModal.set(true);
  }

  // --- Edit Order Modal Actions ---
  openEditOrderModal(): void {
    const ord = this.order();
    if (!ord) return;
    if (ord.status === 'CANCELLED') {
      this.toastService.warning('Cancelled orders cannot be modified.');
      return;
    }

    this.isReprintFlow.set(false);
    if (ord.paymentStatus === 'PAID') {
      this.adminPasswordInput.set('');
      this.adminPasswordError.set('');
      this.showAdminPasswordModal.set(true);
      return;
    }

    this.startEditingOrder(false);
  }

  verifyAdminPasswordForEdit(): void {
    const input = this.adminPasswordInput();
    if (!this.adminAuth.verifyAdminPassword(input)) {
      this.adminPasswordError.set(
        this.isReprintFlow()
          ? 'Incorrect admin password. Authorization required to reprint invoice.'
          : 'Incorrect admin password. Authorization required to modify paid orders.',
      );
      return;
    }

    const ord = this.order();
    this.showAdminPasswordModal.set(false);
    this.adminPasswordInput.set('');
    this.adminPasswordError.set('');

    if (this.isReprintFlow()) {
      this.isReprintFlow.set(false);
      if (ord) {
        const res = this.mock.recordOrderPrint(ord.id, true, 'Admin Override');
        if (res.success) {
          this.toastService.info(
            `Admin authorization verified. Printing reprint (Copy #${res.printCount}).`,
          );
          window.print();
        }
      }
    } else {
      this.toastService.info('Admin authorization verified. Post-payment editing unlocked.');
      this.startEditingOrder(true);
    }
  }

  cancelAdminPasswordModal(): void {
    this.showAdminPasswordModal.set(false);
    this.adminPasswordInput.set('');
    this.adminPasswordError.set('');
    this.isReprintFlow.set(false);
  }

  startEditingOrder(isManagerOverride = false): void {
    const ord = this.order();
    if (!ord) return;
    this.isManagerOverrideActive.set(isManagerOverride);
    this.editCustomerName.set(ord.customerName);
    this.editCustomerPhone.set(ord.customerPhone);
    this.editItems.set(ord.items.map((i) => ({ ...i })));
    this.editDishSearch.set('');
    this.showEditModal.set(true);
  }

  closeEditOrderModal(): void {
    this.showEditModal.set(false);
    this.editItems.set([]);
    this.editDishSearch.set('');
    this.isSavingEdit.set(false);
    this.isManagerOverrideActive.set(false);
  }

  addDishToEdit(menuItem: MenuItem): void {
    const current = this.editItems();
    const existingIndex = current.findIndex(
      (i) =>
        i.menuItemId === menuItem.id &&
        !i.selectedPortion &&
        (!i.selectedVariants || i.selectedVariants.length === 0),
    );

    if (existingIndex > -1) {
      const updated = [...current];
      const item = { ...updated[existingIndex] };
      item.quantity += 1;
      item.itemTotal = item.quantity * item.unitPrice;
      updated[existingIndex] = item;
      this.editItems.set(updated);
    } else {
      const newItem: OrderItem = {
        id: `item-${Date.now().toString().slice(-4)}-${Math.floor(Math.random() * 1000)}`,
        menuItemId: menuItem.id,
        name: menuItem.name,
        unitPrice: menuItem.price,
        quantity: 1,
        itemTotal: menuItem.price,
        selectedVariants: [],
        selectedAddons: [],
      };
      this.editItems.set([...current, newItem]);
    }
    this.toastService.info(`Added ${menuItem.name} to order`);
  }

  incrementEditItem(index: number): void {
    const updated = [...this.editItems()];
    const item = { ...updated[index] };
    item.quantity += 1;
    item.itemTotal = item.quantity * item.unitPrice;
    updated[index] = item;
    this.editItems.set(updated);
  }

  decrementEditItem(index: number): void {
    const updated = [...this.editItems()];
    const item = { ...updated[index] };
    if (item.quantity > 1) {
      item.quantity -= 1;
      item.itemTotal = item.quantity * item.unitPrice;
      updated[index] = item;
      this.editItems.set(updated);
    } else {
      this.removeEditItem(index);
    }
  }

  removeEditItem(index: number): void {
    const updated = this.editItems().filter((_, i) => i !== index);
    this.editItems.set(updated);
  }

  confirmSaveEdit(): void {
    const ord = this.order();
    if (!ord || this.isSavingEdit()) return;

    if (this.editItems().length === 0) {
      this.toastService.error('An order must contain at least one dish.');
      return;
    }

    this.isSavingEdit.set(true);

    const sub = this.editSubtotal();
    const tax = this.editTax();
    const halfTax = Math.round((tax / 2) * 100) / 100;
    const tot = this.editTotal();

    const isOverride = this.isManagerOverrideActive() || ord.paymentStatus === 'PAID';
    const noteText = isOverride
      ? `Order modified with Admin Override after settlement (New Total: ₹${tot})`
      : `Order modified by Staff: Items updated (New Total: ₹${tot})`;

    const updatedTimeline = [
      ...ord.timeline,
      {
        status: ord.status,
        timestamp: new Date().toISOString(),
        note: noteText,
      },
    ];

    const updatedOrders = this.mock.orders().map((o) => {
      if (o.id === ord.id) {
        return {
          ...o,
          customerName: this.editCustomerName().trim() || o.customerName,
          customerPhone: this.editCustomerPhone().trim() || o.customerPhone,
          items: [...this.editItems()],
          subtotal: sub,
          taxAmount: tax,
          cgstAmount: halfTax,
          sgstAmount: halfTax,
          totalAmount: tot,
          updatedAt: new Date().toISOString(),
          timeline: updatedTimeline,
        };
      }
      return o;
    });

    this.mock.orders.set(updatedOrders);
    this.mock.saveLocal('orders', updatedOrders);

    this.isSavingEdit.set(false);
    this.showEditModal.set(false);
    this.isManagerOverrideActive.set(false);
    this.toastService.success(`Order ${ord.orderNumber} successfully updated.`);
  }

  // --- Cancel Order Actions ---
  openCancelModal(): void {
    const ord = this.order();
    if (!ord) return;
    if (ord.status === 'COMPLETED' || ord.status === 'CANCELLED') {
      this.toastService.warning('This order cannot be cancelled.');
      return;
    }
    this.cancellationReason.set('Customer Cancelled');
    this.cancelError.set('');
    this.isCancelling.set(false);
    this.showCancelModal.set(true);
  }

  closeCancelModal(): void {
    this.showCancelModal.set(false);
    this.cancellationReason.set('');
    this.cancelError.set('');
    this.isCancelling.set(false);
  }

  confirmCancelOrder(): void {
    const ord = this.order();
    if (!ord || this.isCancelling()) return;

    const reason = this.cancellationReason().trim();
    if (!reason) {
      this.cancelError.set('Please provide a reason for cancelling this order.');
      return;
    }

    this.isCancelling.set(true);
    this.cancelError.set('');

    const res = this.mock.updateOrderStatusAtomic(ord.id, 'CANCELLED', {
      note: `Cancelled: ${reason}`,
      staffName: 'Staff',
    });

    this.isCancelling.set(false);
    if (res.success) {
      this.toastService.success(
        `Order ${ord.orderNumber} has been cancelled. Inventory and table released.`,
      );
      this.closeCancelModal();
    } else {
      this.cancelError.set(res.error || 'Failed to cancel order.');
    }
  }

  // --- Table Transfer Actions ---
  openTransferModal(): void {
    const ord = this.order();
    if (!ord) return;
    if (ord.status === 'COMPLETED' || ord.status === 'CANCELLED') {
      this.toastService.warning('Only active orders can be transferred.');
      return;
    }
    if (ord.orderType === 'TAKEAWAY') {
      this.toastService.warning('Table transfers are only available for dine-in orders.');
      return;
    }
    this.selectedDestTableId.set('');
    this.transferError.set('');
    this.showTransferModal.set(true);
  }

  closeTransferModal(): void {
    this.showTransferModal.set(false);
    this.selectedDestTableId.set('');
    this.transferError.set('');
    this.isSubmittingTransfer.set(false);
  }

  confirmTransfer(): void {
    const ord = this.order();
    const destId = this.selectedDestTableId();
    if (!ord || !destId || this.isSubmittingTransfer()) return;

    this.isSubmittingTransfer.set(true);
    this.transferError.set('');

    const res = this.mock.transferTable({
      orderId: ord.id,
      destinationTableId: destId,
      staffName: 'Staff',
    });

    this.isSubmittingTransfer.set(false);

    if (res.success && res.transfer) {
      this.toastService.success(
        `Order ${ord.orderNumber} successfully transferred from Table ${res.transfer.sourceTableNumber} to Table ${res.transfer.destinationTableNumber}`,
      );
      this.closeTransferModal();
    } else {
      this.transferError.set(res.error || 'Failed to transfer table');
    }
  }

  // --- Refund Actions ---
  openRefundModal(): void {
    const ord = this.order();
    if (!ord) return;
    const remaining = this.remainingRefundable();
    if (remaining <= 0) {
      this.toastService.warning('This order has already been fully refunded.');
      return;
    }
    this.refundAmount.set(remaining);
    this.refundReason.set('');
    this.refundError.set('');
    this.showRefundModal.set(true);
  }

  closeRefundModal(): void {
    this.showRefundModal.set(false);
    this.refundAmount.set(0);
    this.refundReason.set('');
    this.refundError.set('');
    this.isSubmittingRefund.set(false);
  }

  confirmRefund(): void {
    const ord = this.order();
    if (!ord || this.isSubmittingRefund()) return;

    const amt = this.refundAmount();
    const reason = this.refundReason().trim();

    if (amt <= 0 || amt > this.remainingRefundable()) {
      this.refundError.set('Please enter a valid refund amount within the remaining balance.');
      return;
    }
    if (!reason) {
      this.refundError.set('Please provide a reason for the refund.');
      return;
    }

    this.isSubmittingRefund.set(true);
    this.refundError.set('');

    const res = this.mock.recordRefund({
      orderId: ord.id,
      refundAmount: amt,
      reason,
      staffName: 'Staff',
      idempotencyKey: generateIdempotencyKey('refund', ord.customerPhone),
    });

    this.isSubmittingRefund.set(false);

    if (res.success && res.refund) {
      this.toastService.success(`Refund of ₹${res.refund.refundAmount} recorded successfully.`);
      this.closeRefundModal();
    } else {
      this.refundError.set(res.error || 'Failed to record refund');
    }
  }

  onBackdropClick(
    event: MouseEvent,
    type: 'transfer' | 'refund' | 'edit' | 'cancel' | 'admin-password',
  ): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      if (type === 'transfer') this.closeTransferModal();
      if (type === 'refund') this.closeRefundModal();
      if (type === 'edit') this.closeEditOrderModal();
      if (type === 'cancel') this.closeCancelModal();
      if (type === 'admin-password') this.cancelAdminPasswordModal();
    }
  }
}
