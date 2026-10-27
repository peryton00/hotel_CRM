import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MockDataService } from '../../../data-access/mock/mock-data.service';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ToastService } from '../../../core/services/toast.service';
import { Order } from '../../../core/models/order.model';
import { Invoice, SplitBill } from '../../../core/models/billing.model';
import { generateIdempotencyKey } from '../../../core/utils/idempotency.util';

@Component({
  selector: 'app-billing-queue',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, CurrencyInrPipe, StatusBadgeComponent],
  template: `
    <div class="billing-page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="heading-display">Billing & Invoices</h1>
          <p class="text-muted">
            Generate itemized GST dining bills, settle payments, and print guest receipts.
          </p>
        </div>

        <div class="billing-stats-row">
          <div class="b-stat">
            <span class="b-label">Total Settled</span>
            <span class="b-val">{{ totalSettled() | currencyInr }}</span>
          </div>
          <div class="b-stat">
            <span class="b-label">Unbilled Orders</span>
            <span class="b-val text-crimson">{{ unbilledOrders().length }} Orders</span>
          </div>
        </div>
      </div>

      <!-- Filter Toolbar -->
      <div class="toolbar-card">
        <div class="filter-tabs">
          <button
            class="filter-btn"
            [class.active]="selectedTab() === 'ALL'"
            (click)="selectedTab.set('ALL')"
          >
            All Orders ({{ orders().length }})
          </button>
          <button
            class="filter-btn"
            [class.active]="selectedTab() === 'UNPAID'"
            (click)="selectedTab.set('UNPAID')"
          >
            Awaiting Payment ({{ countPaymentStatus('UNPAID') }})
          </button>
          <button
            class="filter-btn"
            [class.active]="selectedTab() === 'PAID'"
            (click)="selectedTab.set('PAID')"
          >
            Settled Invoices ({{ countPaymentStatus('PAID') }})
          </button>
        </div>

        <div class="search-input-wrap">
          <i class="ph ph-magnifying-glass"></i>
          <input
            type="text"
            class="form-input"
            placeholder="Search by table, order #, or guest..."
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)"
          />
        </div>
      </div>

      <!-- Billing Orders Table -->
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Order & Table</th>
              <th>Guest Details</th>
              <th>Items Summary</th>
              <th>Subtotal</th>
              <th>Taxes (GST)</th>
              <th>Total Amount</th>
              <th>Payment Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (ord of filteredOrders(); track ord.id) {
              <tr>
                <td>
                  <div class="ord-tbl-cell">
                    @if (ord.orderType === 'TAKEAWAY') {
                      <span
                        class="table-tag takeaway-tag"
                        style="background: rgba(212, 175, 55, 0.15); border-color: rgba(212, 175, 55, 0.4); color: #8b6508;"
                        ><i class="ph ph-bag"></i> Takeaway ({{
                          ord.pickupReference || ord.orderNumber
                        }})</span
                      >
                    } @else {
                      <span class="table-tag">Table {{ ord.tableNumber }}</span>
                    }
                    <span class="order-id-text">{{ ord.orderNumber }}</span>
                    <span class="time-text">{{ ord.createdAt | date: 'shortTime' }}</span>
                  </div>
                </td>
                <td>
                  <div class="guest-cell">
                    <strong>{{ ord.customerName }}</strong>
                    <span class="phone-text">{{ ord.customerPhone }}</span>
                  </div>
                </td>
                <td>
                  <div class="items-cell">
                    {{ ord.items.length }} dishes
                    <span class="dishes-preview text-muted">
                      ({{ ord.items[0]?.name }}
                      @if (ord.items.length > 1) {
                        +{{ ord.items.length - 1 }} more
                      }
                      )
                    </span>
                    @if (ord.isSplit) {
                      <span class="split-pill"
                        ><i class="ph ph-split-horizontal"></i> Split ({{
                          getOrderSplitBills(ord.id).length
                        }}
                        Bills)</span
                      >
                    }
                  </div>
                </td>
                <td>{{ ord.subtotal | currencyInr }}</td>
                <td>
                  <span class="text-sm text-muted">{{ ord.taxAmount | currencyInr }}</span>
                </td>
                <td>
                  <span class="text-price" style="font-size: 1rem; color: var(--color-crimson);">
                    {{ ord.totalAmount | currencyInr }}
                  </span>
                </td>
                <td>
                  <app-status-badge [status]="ord.paymentStatus"></app-status-badge>
                </td>
                <td>
                  <div class="billing-actions">
                    <a
                      [routerLink]="['/admin/billing', ord.id]"
                      class="btn btn-secondary btn-sm"
                      title="Preview Bill"
                    >
                      <i class="ph ph-receipt"></i>
                      <span>Bill Preview</span>
                      @if (ord.printCount && ord.printCount > 0) {
                        <span
                          class="badge badge-subtle"
                          style="font-size: 0.65rem; padding: 2px 5px; margin-left: 4px; background: rgba(184, 134, 11, 0.15); color: #8b6508; border-radius: 4px;"
                        >
                          {{ ord.printCount }}x
                        </span>
                      }
                    </a>

                    @if (!ord.isSplit && ord.paymentStatus === 'UNPAID') {
                      <button
                        class="btn btn-secondary btn-sm"
                        (click)="openSplitModal(ord)"
                        title="Divide bill into multiple parts"
                      >
                        <i class="ph ph-split-horizontal"></i>
                        <span>Split Bill</span>
                      </button>
                      <button class="btn btn-primary btn-sm" (click)="openSettleModal(ord)">
                        <i class="ph ph-check"></i>
                        <span>Settle Bill</span>
                      </button>
                    }

                    @if (ord.paymentStatus === 'PAID' || ord.paymentStatus === 'PARTIALLY_PAID') {
                      <button
                        class="btn btn-secondary btn-sm"
                        (click)="openRefundModal(ord)"
                        title="Record Refund"
                      >
                        <i class="ph ph-arrow-counter-clockwise"></i>
                        <span>Refund</span>
                      </button>
                    }
                  </div>
                </td>
              </tr>

              <!-- Nested Split Bills Breakdown if Order is Split -->
              @if (ord.isSplit && getOrderSplitBills(ord.id).length > 0) {
                <tr class="split-bills-row">
                  <td colspan="8">
                    <div class="split-bills-container">
                      <div class="split-banner">
                        <i class="ph ph-split-horizontal"></i>
                        <span
                          >Split Bills for {{ ord.orderNumber }} ({{
                            getOrderSplitBills(ord.id).length
                          }}
                          Payable Bills)</span
                        >
                      </div>
                      <div class="split-table-wrap">
                        <table class="sub-data-table">
                          <thead>
                            <tr>
                              <th>Part</th>
                              <th>Split Mode</th>
                              <th>Item Breakdown</th>
                              <th>Subtotal</th>
                              <th>Taxes</th>
                              <th>Total Amount</th>
                              <th>Payment Status</th>
                              <th>Payment Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (split of getOrderSplitBills(ord.id); track split.id) {
                              <tr>
                                <td>
                                  <strong
                                    >Bill #{{ split.splitIndex }}/{{
                                      split.splitTotalCount
                                    }}</strong
                                  >
                                </td>
                                <td>
                                  <span class="badge-mode">{{ split.splitType }}</span>
                                </td>
                                <td>
                                  @if (split.allocatedItems && split.allocatedItems.length > 0) {
                                    <div class="alloc-items-summary">
                                      @for (it of split.allocatedItems; track it.orderItemId) {
                                        <span class="it-chip"
                                          >{{ it.name }} (x{{ it.quantity }})</span
                                        >
                                      }
                                    </div>
                                  } @else {
                                    <span class="text-xs text-muted">Equal share</span>
                                  }
                                </td>
                                <td>{{ split.subtotal | currencyInr }}</td>
                                <td>{{ split.taxAmount | currencyInr }}</td>
                                <td>
                                  <strong class="text-crimson">{{
                                    split.totalAmount | currencyInr
                                  }}</strong>
                                </td>
                                <td>
                                  <app-status-badge
                                    [status]="split.paymentStatus"
                                  ></app-status-badge>
                                </td>
                                <td>
                                  <div class="billing-actions">
                                    <a
                                      [routerLink]="['/admin/billing', ord.id]"
                                      [queryParams]="{ splitId: split.id }"
                                      class="btn btn-secondary btn-xs"
                                      title="Print Split Slip"
                                    >
                                      <i class="ph ph-receipt"></i>
                                      <span>Slip</span>
                                    </a>
                                    @if (split.paymentStatus === 'UNPAID') {
                                      <button
                                        class="btn btn-primary btn-xs"
                                        (click)="openSettleSplitModal(ord, split)"
                                      >
                                        <i class="ph ph-check"></i>
                                        <span>Settle Part #{{ split.splitIndex }}</span>
                                      </button>
                                    } @else if (split.paymentStatus === 'PAID') {
                                      <button
                                        class="btn btn-secondary btn-xs"
                                        (click)="openRefundSplitModal(ord, split)"
                                      >
                                        <i class="ph ph-arrow-counter-clockwise"></i>
                                        <span>Refund Part</span>
                                      </button>
                                    }
                                  </div>
                                </td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </td>
                </tr>
              }
            } @empty {
              <tr>
                <td
                  colspan="8"
                  class="text-center"
                  style="padding: 32px; color: var(--color-text-muted);"
                >
                  No orders found in current billing filter.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Cash / UPI Settlement Modal for Full Order -->
      @if (showSettleModal() && selectedOrderForSettlement(); as ord) {
        <div class="modal-overlay" (click)="onModalBackdropClick($event, 'settle')">
          <div class="modal-card settle-modal" role="dialog" aria-modal="true">
            <div class="modal-header">
              <div>
                <h3 class="heading-card">Settle Dining Bill</h3>
                <span class="text-xs text-muted"
                  >{{ ord.orderNumber }} • Table {{ ord.tableNumber }}</span
                >
              </div>
              <button class="close-btn" (click)="closeSettleModal()">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <div class="settle-summary-box">
                <div class="settle-row">
                  <span>Guest Name</span>
                  <strong>{{ ord.customerName }}</strong>
                </div>
                <div class="settle-row">
                  <span>Item Subtotal</span>
                  <span>{{ ord.subtotal | currencyInr }}</span>
                </div>
                @if (ord.discountAmount > 0) {
                  <div class="settle-row discount">
                    <span>Discount Privilege</span>
                    <span>-{{ ord.discountAmount | currencyInr }}</span>
                  </div>
                }
                <div class="settle-row">
                  <span>Taxes (CGST + SGST)</span>
                  <span>{{ ord.taxAmount | currencyInr }}</span>
                </div>
                <div class="settle-divider"></div>
                <div class="settle-row total-highlight">
                  <span>Net Payable Total</span>
                  <span class="amount-large">{{ ord.totalAmount | currencyInr }}</span>
                </div>
              </div>

              <div class="payment-selector-group">
                <label class="form-label">Payment Method Tendered *</label>
                <div class="method-options-grid">
                  <button
                    type="button"
                    class="method-tile"
                    [class.selected]="selectedPaymentMethod() === 'UPI'"
                    (click)="selectedPaymentMethod.set('UPI')"
                  >
                    <i class="ph ph-qr-code tile-icon"></i>
                    <div class="tile-info">
                      <span class="tile-title">UPI / QR Scan</span>
                      <span class="tile-sub">GPay, PhonePe, Paytm, BHIM</span>
                    </div>
                    @if (selectedPaymentMethod() === 'UPI') {
                      <i class="ph ph-check-circle tile-check"></i>
                    }
                  </button>

                  <button
                    type="button"
                    class="method-tile"
                    [class.selected]="selectedPaymentMethod() === 'CASH'"
                    (click)="selectedPaymentMethod.set('CASH')"
                  >
                    <i class="ph ph-money tile-icon"></i>
                    <div class="tile-info">
                      <span class="tile-title">Cash Settlement</span>
                      <span class="tile-sub">Physical Currency Tender</span>
                    </div>
                    @if (selectedPaymentMethod() === 'CASH') {
                      <i class="ph ph-check-circle tile-check"></i>
                    }
                  </button>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button
                class="btn btn-secondary"
                (click)="closeSettleModal()"
                [disabled]="isSettling()"
              >
                Cancel
              </button>
              <button
                class="btn btn-primary"
                (click)="confirmSettlement()"
                [disabled]="isSettling()"
              >
                @if (isSettling()) {
                  <span>Recording...</span>
                } @else {
                  <i class="ph ph-check"></i>
                  <span>Confirm {{ selectedPaymentMethod() }} Settlement</span>
                }
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Settle Split Bill Modal -->
      @if (showSettleSplitModal() && selectedSplitForSettlement(); as split) {
        <div class="modal-overlay" (click)="onModalBackdropClick($event, 'settle-split')">
          <div class="modal-card settle-modal" role="dialog" aria-modal="true">
            <div class="modal-header">
              <div>
                <h3 class="heading-card">Settle Split Bill #{{ split.splitIndex }}</h3>
                <span class="text-xs text-muted"
                  >{{ split.orderNumber }} • Table {{ split.tableNumber }}</span
                >
              </div>
              <button class="close-btn" (click)="closeSettleSplitModal()">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <div class="settle-summary-box">
                <div class="settle-row">
                  <span>Part Amount</span>
                  <strong>Part {{ split.splitIndex }} of {{ split.splitTotalCount }}</strong>
                </div>
                <div class="settle-row">
                  <span>Subtotal</span>
                  <span>{{ split.subtotal | currencyInr }}</span>
                </div>
                <div class="settle-row">
                  <span>Taxes (GST)</span>
                  <span>{{ split.taxAmount | currencyInr }}</span>
                </div>
                <div class="settle-divider"></div>
                <div class="settle-row total-highlight">
                  <span>Net Payable Amount</span>
                  <span class="amount-large">{{ split.totalAmount | currencyInr }}</span>
                </div>
              </div>

              <div class="payment-selector-group">
                <label class="form-label">Payment Method Tendered *</label>
                <div class="method-options-grid">
                  <button
                    type="button"
                    class="method-tile"
                    [class.selected]="selectedSplitPaymentMethod() === 'UPI'"
                    (click)="selectedSplitPaymentMethod.set('UPI')"
                  >
                    <i class="ph ph-qr-code tile-icon"></i>
                    <div class="tile-info">
                      <span class="tile-title">UPI / QR Scan</span>
                      <span class="tile-sub">Instant Digital Payment</span>
                    </div>
                    @if (selectedSplitPaymentMethod() === 'UPI') {
                      <i class="ph ph-check-circle tile-check"></i>
                    }
                  </button>

                  <button
                    type="button"
                    class="method-tile"
                    [class.selected]="selectedSplitPaymentMethod() === 'CASH'"
                    (click)="selectedSplitPaymentMethod.set('CASH')"
                  >
                    <i class="ph ph-money tile-icon"></i>
                    <div class="tile-info">
                      <span class="tile-title">Cash Settlement</span>
                      <span class="tile-sub">Physical Currency Tender</span>
                    </div>
                    @if (selectedSplitPaymentMethod() === 'CASH') {
                      <i class="ph ph-check-circle tile-check"></i>
                    }
                  </button>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button
                class="btn btn-secondary"
                (click)="closeSettleSplitModal()"
                [disabled]="isSettlingSplit()"
              >
                Cancel
              </button>
              <button
                class="btn btn-primary"
                (click)="confirmSplitSettlement()"
                [disabled]="isSettlingSplit()"
              >
                @if (isSettlingSplit()) {
                  <span>Recording...</span>
                } @else {
                  <i class="ph ph-check"></i>
                  <span>Confirm {{ selectedSplitPaymentMethod() }} Settlement</span>
                }
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Bill Splitting Modal -->
      @if (showSplitModal() && selectedOrderForSplit(); as ord) {
        <div class="modal-overlay" (click)="onModalBackdropClick($event, 'split')">
          <div
            class="modal-card split-modal"
            role="dialog"
            aria-modal="true"
            style="max-width: 680px;"
          >
            <div class="modal-header">
              <div>
                <h3 class="heading-card">Divide Bill into Multiple Bills</h3>
                <span class="text-xs text-muted"
                  >{{ ord.orderNumber }} • Table {{ ord.tableNumber }} • Total:
                  {{ ord.totalAmount | currencyInr }}</span
                >
              </div>
              <button class="close-btn" (click)="closeSplitModal()"><i class="ph ph-x"></i></button>
            </div>

            <div class="modal-body">
              <!-- Mode Tabs -->
              <div class="split-mode-tabs" style="display: flex; gap: 8px; margin-bottom: 16px;">
                <button
                  type="button"
                  class="btn"
                  [class.btn-primary]="splitMode() === 'EQUAL'"
                  [class.btn-secondary]="splitMode() !== 'EQUAL'"
                  (click)="splitMode.set('EQUAL')"
                >
                  <i class="ph ph-equals"></i>
                  <span>Equal Split</span>
                </button>
                <button
                  type="button"
                  class="btn"
                  [class.btn-primary]="splitMode() === 'ITEM_BASED'"
                  [class.btn-secondary]="splitMode() !== 'ITEM_BASED'"
                  (click)="splitMode.set('ITEM_BASED')"
                >
                  <i class="ph ph-list-numbers"></i>
                  <span>Item-Based Split</span>
                </button>
              </div>

              <!-- Number of Bills Selector -->
              <div class="form-group" style="margin-bottom: 16px;">
                <label class="form-label">Number of Split Bills</label>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    [disabled]="splitCount() <= 2"
                    (click)="changeSplitCount(splitCount() - 1)"
                  >
                    -
                  </button>
                  <strong style="font-size: 1.125rem;">{{ splitCount() }} Bills</strong>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    [disabled]="splitCount() >= (splitMode() === 'ITEM_BASED' ? 4 : 10)"
                    (click)="changeSplitCount(splitCount() + 1)"
                  >
                    +
                  </button>
                </div>
              </div>

              <!-- Mode 1: Equal Split Preview -->
              @if (splitMode() === 'EQUAL') {
                <div
                  class="preview-box"
                  style="background: var(--color-bone-light); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px;"
                >
                  <h4 style="font-size: 0.875rem; font-weight: 700; margin-bottom: 10px;">
                    Equal Split Portions Preview
                  </h4>
                  <div
                    style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px;"
                  >
                    @for (amount of equalSplitPreview(); track $index) {
                      <div
                        style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-xs); padding: 8px 10px;"
                      >
                        <span class="text-xs text-muted">Bill #{{ $index + 1 }}</span>
                        <div class="font-bold text-crimson">{{ amount | currencyInr }}</div>
                      </div>
                    }
                  </div>
                  <div
                    style="margin-top: 10px; font-size: 0.75rem; color: var(--color-text-muted);"
                  >
                    <i class="ph ph-check-circle" style="color: #16a34a;"></i>
                    Rounding cents deterministically distributed to reconcile 100% to ₹{{
                      ord.totalAmount
                    }}
                  </div>
                </div>
              }

              <!-- Mode 2: Item-based Split Allocation -->
              @if (splitMode() === 'ITEM_BASED') {
                <div
                  class="item-alloc-table-wrap"
                  style="border: 1px solid var(--color-border); border-radius: var(--radius-sm); margin-bottom: 16px; overflow-x: auto;"
                >
                  <table class="sub-data-table">
                    <thead>
                      <tr>
                        <th>Dish</th>
                        <th>Total Qty</th>
                        <th>Rate</th>
                        @for (idx of getSplitIndices(); track idx) {
                          <th>Bill #{{ idx + 1 }}</th>
                        }
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of ord.items; track item.id) {
                        <tr>
                          <td>
                            <strong>{{ item.name }}</strong>
                          </td>
                          <td>
                            <strong>{{ item.quantity }}</strong>
                          </td>
                          <td>{{ item.unitPrice | currencyInr }}</td>
                          @for (idx of getSplitIndices(); track idx) {
                            <td>
                              <input
                                type="number"
                                class="form-input"
                                style="width: 60px; padding: 4px 6px; text-align: center;"
                                min="0"
                                [max]="item.quantity"
                                [ngModel]="itemAllocations()[item.id]?.[idx] || 0"
                                (ngModelChange)="setItemAllocation(item.id, idx, +$event)"
                              />
                            </td>
                          }
                          <td>
                            @if (isItemFullyAllocated(item)) {
                              <span style="color: #16a34a; font-size: 0.75rem; font-weight: 700;">
                                <i class="ph ph-check"></i> Allocated
                              </span>
                            } @else {
                              <span style="color: #dc2626; font-size: 0.75rem; font-weight: 700;">
                                {{ getItemAllocatedTotal(item.id) }}/{{ item.quantity }}
                              </span>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }

              @if (splitError()) {
                <div class="alert-box error" style="margin-bottom: 16px;">{{ splitError() }}</div>
              }
            </div>

            <div class="modal-footer">
              <button
                class="btn btn-secondary"
                (click)="closeSplitModal()"
                [disabled]="isSubmittingSplit()"
              >
                Cancel
              </button>
              <button
                class="btn btn-primary"
                (click)="confirmSplit()"
                [disabled]="
                  isSubmittingSplit() ||
                  (splitMode() === 'ITEM_BASED' && !areAllItemsFullyAllocated())
                "
              >
                @if (isSubmittingSplit()) {
                  <span>Splitting...</span>
                } @else {
                  <i class="ph ph-split-horizontal"></i>
                  <span>Confirm {{ splitCount() }}-Way Split</span>
                }
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Refund Modal -->
      @if (showRefundModal()) {
        <div class="modal-overlay" (click)="onModalBackdropClick($event, 'refund')">
          <div class="modal-card settle-modal refund-modal" role="dialog" aria-modal="true">
            <div class="modal-header">
              <div class="refund-header-wrap">
                <div class="refund-icon-badge">
                  <i class="ph ph-arrow-counter-clockwise"></i>
                </div>
                <div>
                  <h3 class="heading-card">
                    Record Refund
                    @if (selectedSplitForRefund(); as split) {
                      (Split Bill #{{ split.splitIndex }})
                    }
                  </h3>
                  <span class="text-xs text-muted">
                    @if (selectedOrderForRefund(); as ord) {
                      {{ ord.orderNumber }} • Table {{ ord.tableNumber }}
                    }
                  </span>
                </div>
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
              <div class="settle-summary-box refund-summary-card">
                <div class="settle-row">
                  <span>Target Bill Total</span>
                  <strong>
                    @if (selectedSplitForRefund(); as split) {
                      {{ split.totalAmount | currencyInr }}
                    } @else if (selectedOrderForRefund(); as ord) {
                      {{ ord.totalAmount | currencyInr }}
                    }
                  </strong>
                </div>
                <div class="settle-divider"></div>
                <div class="settle-row total-highlight">
                  <span>Max Refundable Amount</span>
                  <span class="amount-large">{{ currentMaxRefundable() | currencyInr }}</span>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="bq-refund-amount">Refund Amount (₹) *</label>
                <div class="input-with-symbol">
                  <span class="currency-prefix">₹</span>
                  <input
                    id="bq-refund-amount"
                    type="number"
                    class="form-input"
                    [ngModel]="refundAmount()"
                    (ngModelChange)="refundAmount.set(+$event)"
                    [max]="currentMaxRefundable()"
                    min="1"
                    step="0.01"
                  />
                </div>
                <div class="quick-refund-actions">
                  <button
                    type="button"
                    class="refund-balance-chip"
                    (click)="refundAmount.set(currentMaxRefundable())"
                    title="Set to full refundable balance"
                  >
                    <i class="ph ph-arrows-clockwise"></i>
                    <span>Full Balance ({{ currentMaxRefundable() | currencyInr }})</span>
                  </button>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="bq-refund-reason">Refund Reason *</label>
                <input
                  id="bq-refund-reason"
                  type="text"
                  class="form-input"
                  [ngModel]="refundReason()"
                  (ngModelChange)="refundReason.set($event)"
                  placeholder="e.g. Overcharged / guest requested partial refund / item returned"
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
                  refundAmount() > currentMaxRefundable() ||
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
    </div>
  `,
  styles: [
    `
      .billing-page {
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

      .billing-stats-row {
        display: flex;
        gap: 16px;
      }

      .b-stat {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 10px 16px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .b-label {
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .b-val {
        font-size: 1.125rem;
        font-weight: 800;
      }

      .toolbar-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 14px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }

      .filter-tabs {
        display: flex;
        gap: 8px;
      }

      .filter-btn {
        padding: 8px 14px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        border-radius: var(--radius-sm);
        transition: all var(--transition-fast);

        &:hover {
          background: var(--color-bone-light);
        }
        &.active {
          background: var(--color-onyx);
          color: #ffffff;
        }
      }

      .search-input-wrap {
        position: relative;
        min-width: 240px;
        flex: 1;

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

      .ord-tbl-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .table-tag {
        font-size: 0.75rem;
        font-weight: 800;
        color: var(--color-crimson);
      }

      .order-id-text {
        font-weight: 700;
      }
      .time-text {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .guest-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .phone-text {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .items-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-weight: 600;
      }

      .dishes-preview {
        font-size: 0.75rem;
        font-weight: 400;
      }

      .billing-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .settle-modal {
        max-width: 480px;
        width: 100%;
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

      .payment-selector-group {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .method-options-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .method-tile {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        padding: 14px;
        border: 2px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        cursor: pointer;
        position: relative;
        transition: all var(--transition-fast);
        text-align: left;
        font-family: inherit;

        &:hover {
          border-color: var(--color-taupe);
          background: var(--color-bone-light);
        }

        &.selected {
          border-color: var(--color-crimson);
          background: #fef2f2;
        }
      }

      .tile-icon {
        font-size: 1.75rem;
        color: var(--color-onyx);
      }

      .tile-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .tile-title {
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--color-onyx);
      }

      .tile-sub {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
      }

      .tile-check {
        position: absolute;
        top: 10px;
        right: 10px;
        font-size: 1.125rem;
        color: var(--color-crimson);
      }

      .split-pill {
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-crimson);
        background: var(--color-danger-bg);
        border: 1px solid rgba(194, 24, 7, 0.25);
        padding: 2px 6px;
        border-radius: var(--radius-full);
        display: inline-flex;
        align-items: center;
        gap: 3px;
        margin-top: 2px;
        width: fit-content;
      }

      .split-bills-row {
        background: var(--color-bone-light);
      }

      .split-bills-container {
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .split-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--color-onyx);
      }

      .sub-data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8125rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);

        th,
        td {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid var(--color-border);
        }

        th {
          background: var(--color-bone);
          font-weight: 700;
          color: var(--color-text-secondary);
          font-size: 0.75rem;
        }
      }

      .badge-mode {
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: var(--radius-xs);
        background: var(--color-bone);
        border: 1px solid var(--color-border);
      }

      .alloc-items-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      .it-chip {
        font-size: 0.6875rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        padding: 1px 6px;
        border-radius: var(--radius-xs);
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

      .modal-header {
        padding: 16px 20px;
        border-bottom: 1px solid var(--color-border);
        display: flex;
        justify-content: space-between;
        align-items: center;

        .heading-card {
          margin: 0;
          font-size: 1.125rem;
          color: var(--color-onyx);
        }
      }

      .close-btn {
        width: 32px;
        height: 32px;
        border-radius: var(--radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-muted);
        cursor: pointer;
        font-size: 1.25rem;
        transition: all var(--transition-fast);

        &:hover {
          background: rgba(18, 18, 18, 0.06);
          color: var(--color-onyx);
        }
      }

      .modal-body {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .modal-footer {
        padding: 14px 20px;
        border-top: 1px solid var(--color-border);
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        background: var(--color-surface);
      }

      .refund-modal {
        max-width: 500px;
      }

      .refund-header-wrap {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .refund-icon-badge {
        width: 40px;
        height: 40px;
        border-radius: var(--radius-sm);
        background: var(--color-danger-bg);
        color: var(--color-danger);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.35rem;
        flex-shrink: 0;
      }

      .refund-summary-card {
        margin-bottom: 0;
        border-radius: var(--radius-md);
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
      }

      .input-with-symbol {
        position: relative;
        display: flex;
        align-items: center;

        .currency-prefix {
          position: absolute;
          left: 14px;
          font-weight: 700;
          font-size: 1rem;
          color: var(--color-text-muted);
          pointer-events: none;
        }

        .form-input {
          padding-left: 32px;
          font-weight: 700;
          font-size: 1.1rem;
          color: var(--color-onyx);
        }
      }

      .quick-refund-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }

      .refund-balance-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-full);
        cursor: pointer;
        transition: all var(--transition-fast);

        &:hover {
          border-color: var(--color-crimson);
          color: var(--color-crimson);
          background: var(--color-crimson-subtle);
          box-shadow: 0 1px 4px rgba(194, 24, 7, 0.12);
        }
      }
    `,
  ],
})
export class BillingQueueComponent {
  private mock = inject(MockDataService);
  private toastService = inject(ToastService);

  orders = this.mock.orders;
  selectedTab = signal<string>('ALL');
  searchQuery = signal<string>('');

  // Settle Full Order State
  showSettleModal = signal<boolean>(false);
  selectedOrderForSettlement = signal<Order | null>(null);
  selectedPaymentMethod = signal<'CASH' | 'UPI'>('UPI');
  isSettling = signal<boolean>(false);

  // Settle Split Bill State
  showSettleSplitModal = signal<boolean>(false);
  selectedSplitForSettlement = signal<SplitBill | null>(null);
  parentOrderForSplit = signal<Order | null>(null);
  selectedSplitPaymentMethod = signal<'CASH' | 'UPI'>('UPI');
  isSettlingSplit = signal<boolean>(false);

  // Bill Splitting State
  showSplitModal = signal<boolean>(false);
  selectedOrderForSplit = signal<Order | null>(null);
  splitMode = signal<'EQUAL' | 'ITEM_BASED'>('EQUAL');
  splitCount = signal<number>(2);
  itemAllocations = signal<Record<string, number[]>>({});
  splitError = signal<string>('');
  isSubmittingSplit = signal<boolean>(false);

  // Refund State
  showRefundModal = signal<boolean>(false);
  selectedOrderForRefund = signal<Order | null>(null);
  selectedSplitForRefund = signal<SplitBill | null>(null);
  refundAmount = signal<number>(0);
  refundReason = signal<string>('');
  refundError = signal<string>('');
  isSubmittingRefund = signal<boolean>(false);

  totalSettled = computed(() => {
    let sum = 0;
    for (const ord of this.orders()) {
      if (ord.isSplit) {
        const paidSplits = this.mock
          .splitBills()
          .filter((b) => b.orderId === ord.id && b.paymentStatus === 'PAID');
        sum += paidSplits.reduce((acc, curr) => acc + curr.totalAmount, 0);
      } else if (ord.paymentStatus === 'PAID') {
        sum += ord.totalAmount;
      }
    }
    return Math.round(sum * 100) / 100;
  });

  unbilledOrders = computed(() => {
    return this.orders().filter((o) => o.paymentStatus === 'UNPAID');
  });

  equalSplitPreview = computed(() => {
    const ord = this.selectedOrderForSplit();
    if (!ord) return [];
    const n = this.splitCount();
    const subCents = Math.round(ord.subtotal * 100);
    const discCents = Math.round(ord.discountAmount * 100);
    const cgstCents = Math.round(ord.cgstAmount * 100);
    const sgstCents = Math.round(ord.sgstAmount * 100);

    const baseSub = Math.floor(subCents / n);
    const remSub = subCents % n;
    const baseDisc = Math.floor(discCents / n);
    const remDisc = discCents % n;
    const baseCgst = Math.floor(cgstCents / n);
    const remCgst = cgstCents % n;
    const baseSgst = Math.floor(sgstCents / n);
    const remSgst = sgstCents % n;

    const list: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = baseSub + (i < remSub ? 1 : 0);
      const d = baseDisc + (i < remDisc ? 1 : 0);
      const c = baseCgst + (i < remCgst ? 1 : 0);
      const g = baseSgst + (i < remSgst ? 1 : 0);
      list.push((s - d + c + g) / 100);
    }
    return list;
  });

  currentMaxRefundable = computed(() => {
    const split = this.selectedSplitForRefund();
    const ord = this.selectedOrderForRefund();
    if (split) {
      return this.mock.getRemainingRefundableAmount(split.orderId, split.id);
    }
    if (ord) {
      return this.mock.getRemainingRefundableAmount(ord.id);
    }
    return 0;
  });

  countPaymentStatus(status: string): number {
    return this.orders().filter((o) => o.paymentStatus === status).length;
  }

  getOrderSplitBills(orderId: string): SplitBill[] {
    return this.mock.splitBills().filter((b) => b.orderId === orderId);
  }

  getSplitIndices(): number[] {
    const count = this.splitCount();
    const arr: number[] = [];
    for (let i = 0; i < count; i++) arr.push(i);
    return arr;
  }

  filteredOrders = computed(() => {
    let list = this.orders();
    if (this.selectedTab() === 'UNPAID') {
      list = list.filter((o) => o.paymentStatus === 'UNPAID');
    } else if (this.selectedTab() === 'PAID') {
      list = list.filter((o) => o.paymentStatus === 'PAID');
    }

    const q = this.searchQuery().toLowerCase().trim();
    if (q) {
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          (o.pickupReference && o.pickupReference.toLowerCase().includes(q)) ||
          (o.tableNumber && o.tableNumber.toLowerCase().includes(q)) ||
          o.customerName.toLowerCase().includes(q),
      );
    }

    return list;
  });

  // --- Full Order Settlement Actions ---
  openSettleModal(order: Order): void {
    if (order.paymentStatus === 'PAID') {
      this.toastService.warning(`Order ${order.orderNumber} is already settled.`);
      return;
    }
    this.selectedOrderForSettlement.set(order);
    this.selectedPaymentMethod.set('UPI');
    this.showSettleModal.set(true);
  }

  closeSettleModal(): void {
    this.showSettleModal.set(false);
    this.selectedOrderForSettlement.set(null);
    this.isSettling.set(false);
  }

  confirmSettlement(): void {
    const ord = this.selectedOrderForSettlement();
    if (!ord || this.isSettling()) return;

    this.isSettling.set(true);
    const method = this.selectedPaymentMethod();

    const res = this.mock.settleOrder({
      orderId: ord.id,
      paymentMethod: method,
    });

    this.isSettling.set(false);
    if (res.success) {
      this.toastService.success(`Order ${ord.orderNumber} successfully settled via ${method}`);
      this.closeSettleModal();
    } else {
      this.toastService.warning(res.error || 'Failed to settle order');
      this.closeSettleModal();
    }
  }

  // --- Split Bill Settle Actions ---
  openSettleSplitModal(order: Order, split: SplitBill): void {
    if (split.paymentStatus === 'PAID') {
      this.toastService.warning(`Split bill #${split.splitIndex} is already settled.`);
      return;
    }
    this.parentOrderForSplit.set(order);
    this.selectedSplitForSettlement.set(split);
    this.selectedSplitPaymentMethod.set('UPI');
    this.showSettleSplitModal.set(true);
  }

  closeSettleSplitModal(): void {
    this.showSettleSplitModal.set(false);
    this.selectedSplitForSettlement.set(null);
    this.parentOrderForSplit.set(null);
    this.isSettlingSplit.set(false);
  }

  confirmSplitSettlement(): void {
    const split = this.selectedSplitForSettlement();
    const ord = this.parentOrderForSplit();
    if (!split || !ord || this.isSettlingSplit()) return;

    this.isSettlingSplit.set(true);
    const method = this.selectedSplitPaymentMethod();
    const res = this.mock.settleSplitBill({
      orderId: ord.id,
      splitBillId: split.id,
      paymentMethod: method,
    });
    this.isSettlingSplit.set(false);

    if (res.success) {
      this.toastService.success(
        `Split Bill #${split.splitIndex} (₹${split.totalAmount}) settled via ${method}.`,
      );
      this.closeSettleSplitModal();
    } else {
      this.toastService.error(res.error || 'Failed to settle split bill');
    }
  }

  // --- Bill Splitting Actions ---
  openSplitModal(order: Order): void {
    if (order.paymentStatus === 'PAID') {
      this.toastService.warning('Cannot split an already settled bill.');
      return;
    }
    if (order.isSplit) {
      this.toastService.warning('This order has already been split.');
      return;
    }
    this.selectedOrderForSplit.set(order);
    this.splitMode.set('EQUAL');
    this.splitCount.set(2);
    this.splitError.set('');
    this.initItemAllocations(order, 2);
    this.showSplitModal.set(true);
  }

  closeSplitModal(): void {
    this.showSplitModal.set(false);
    this.selectedOrderForSplit.set(null);
    this.splitError.set('');
    this.isSubmittingSplit.set(false);
  }

  initItemAllocations(order: Order, count: number): void {
    const map: Record<string, number[]> = {};
    for (const item of order.items) {
      const arr = new Array(count).fill(0);
      arr[0] = item.quantity; // Default allocate all to Split 1
      map[item.id] = arr;
    }
    this.itemAllocations.set(map);
  }

  changeSplitCount(newCount: number): void {
    if (newCount < 2 || newCount > 10) return;
    this.splitCount.set(newCount);
    const ord = this.selectedOrderForSplit();
    if (ord) {
      this.initItemAllocations(ord, newCount);
    }
  }

  setItemAllocation(itemId: string, splitIdx: number, val: number): void {
    const allocs = { ...this.itemAllocations() };
    const current = [...(allocs[itemId] || [])];
    current[splitIdx] = Math.max(0, isNaN(val) ? 0 : val);
    allocs[itemId] = current;
    this.itemAllocations.set(allocs);
  }

  getItemAllocatedTotal(itemId: string): number {
    const arr = this.itemAllocations()[itemId] || [];
    return arr.reduce((sum, n) => sum + (n || 0), 0);
  }

  isItemFullyAllocated(item: { id: string; quantity: number }): boolean {
    return this.getItemAllocatedTotal(item.id) === item.quantity;
  }

  areAllItemsFullyAllocated(): boolean {
    const ord = this.selectedOrderForSplit();
    if (!ord) return false;
    return ord.items.every((it) => this.isItemFullyAllocated(it));
  }

  confirmSplit(): void {
    const ord = this.selectedOrderForSplit();
    if (!ord || this.isSubmittingSplit()) return;

    this.isSubmittingSplit.set(true);
    this.splitError.set('');

    if (this.splitMode() === 'EQUAL') {
      const res = this.mock.splitOrderEqual({
        orderId: ord.id,
        splitCount: this.splitCount(),
      });
      this.isSubmittingSplit.set(false);
      if (res.success) {
        this.toastService.success(
          `Order ${ord.orderNumber} successfully split into ${this.splitCount()} equal bills.`,
        );
        this.closeSplitModal();
      } else {
        this.splitError.set(res.error || 'Failed to split bill');
      }
    } else {
      if (!this.areAllItemsFullyAllocated()) {
        this.splitError.set(
          'All dish quantities must be completely allocated across the split bills.',
        );
        this.isSubmittingSplit.set(false);
        return;
      }

      const n = this.splitCount();
      const allocs = this.itemAllocations();
      const splitsPayload: { allocatedItems: { orderItemId: string; quantity: number }[] }[] = [];

      for (let i = 0; i < n; i++) {
        const itemsForThisSplit: { orderItemId: string; quantity: number }[] = [];
        for (const item of ord.items) {
          const qty = allocs[item.id]?.[i] || 0;
          if (qty > 0) {
            itemsForThisSplit.push({ orderItemId: item.id, quantity: qty });
          }
        }
        splitsPayload.push({ allocatedItems: itemsForThisSplit });
      }

      const res = this.mock.splitOrderItemBased({
        orderId: ord.id,
        splits: splitsPayload,
      });
      this.isSubmittingSplit.set(false);
      if (res.success) {
        this.toastService.success(
          `Order ${ord.orderNumber} successfully split into ${n} item-based bills.`,
        );
        this.closeSplitModal();
      } else {
        this.splitError.set(res.error || 'Failed to split bill');
      }
    }
  }

  // --- Refund Actions ---
  openRefundModal(order: Order): void {
    const remaining = this.mock.getRemainingRefundableAmount(order.id);
    if (remaining <= 0) {
      this.toastService.warning(`Order ${order.orderNumber} has no refundable balance.`);
      return;
    }
    this.selectedOrderForRefund.set(order);
    this.selectedSplitForRefund.set(null);
    this.refundAmount.set(remaining);
    this.refundReason.set('');
    this.refundError.set('');
    this.showRefundModal.set(true);
  }

  openRefundSplitModal(order: Order, split: SplitBill): void {
    const remaining = this.mock.getRemainingRefundableAmount(order.id, split.id);
    if (remaining <= 0) {
      this.toastService.warning(`Split bill #${split.splitIndex} has no refundable balance.`);
      return;
    }
    this.selectedOrderForRefund.set(order);
    this.selectedSplitForRefund.set(split);
    this.refundAmount.set(remaining);
    this.refundReason.set('');
    this.refundError.set('');
    this.showRefundModal.set(true);
  }

  closeRefundModal(): void {
    this.showRefundModal.set(false);
    this.selectedOrderForRefund.set(null);
    this.selectedSplitForRefund.set(null);
    this.refundAmount.set(0);
    this.refundReason.set('');
    this.refundError.set('');
    this.isSubmittingRefund.set(false);
  }

  confirmRefund(): void {
    const ord = this.selectedOrderForRefund();
    if (!ord || this.isSubmittingRefund()) return;

    const split = this.selectedSplitForRefund();
    const amt = this.refundAmount();
    const reason = this.refundReason().trim();

    const max = this.mock.getRemainingRefundableAmount(ord.id, split?.id);
    if (amt <= 0 || amt > max) {
      this.refundError.set(`Refund amount must be between ₹1 and ₹${max}`);
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
      splitBillId: split?.id,
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

  onModalBackdropClick(event: MouseEvent, type: string): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      if (type === 'settle') this.closeSettleModal();
      if (type === 'settle-split') this.closeSettleSplitModal();
      if (type === 'split') this.closeSplitModal();
      if (type === 'refund') this.closeRefundModal();
    }
  }
}
