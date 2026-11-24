import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { SkeletonLoaderComponent } from '../../../shared/components/loading/skeleton-loader.component';
import { LoadingButtonDirective } from '../../../shared/components/loading/loading-button.directive';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ToastService } from '../../../core/services/toast.service';
import { Order, OrderItem, PaymentStatus } from '../../../core/models/order.model';
import { Invoice, SplitBill } from '../../../core/models/billing.model';
import { generateIdempotencyKey } from '../../../core/utils/idempotency.util';
import {
  openWhatsAppBill,
  buildWhatsAppBillMessage,
  getWhatsAppWebUrl,
  getWhatsAppAppUrl,
  launchExternalUrl,
} from '../../../core/utils/whatsapp-bill.util';
import { WhatsAppBridgeService } from '../../../core/services/whatsapp-bridge.service';
import { AdminAuthService } from '../../../core/services/admin-auth.service';

@Component({
  selector: 'app-billing-queue',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    CurrencyInrPipe,
    StatusBadgeComponent,
    SkeletonLoaderComponent,
    LoadingButtonDirective,
    EmptyStateComponent,
  ],
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
        <div class="toolbar-top-row">
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

        <div class="toolbar-controls-row">
          <div class="date-filter-group" role="group" aria-label="Filter by completion date">
            <span class="control-label"><i class="ph ph-calendar-blank"></i> Completion Date:</span>
            <button
              type="button"
              class="date-pill-btn"
              [class.active]="dateFilter() === 'ALL'"
              (click)="dateFilter.set('ALL')"
            >
              All Time
            </button>
            <button
              type="button"
              class="date-pill-btn"
              [class.active]="dateFilter() === 'TODAY'"
              (click)="dateFilter.set('TODAY')"
            >
              Today
            </button>
            <button
              type="button"
              class="date-pill-btn"
              [class.active]="dateFilter() === 'YESTERDAY'"
              (click)="dateFilter.set('YESTERDAY')"
            >
              Yesterday
            </button>
            <button
              type="button"
              class="date-pill-btn"
              [class.active]="dateFilter() === 'THIS_WEEK'"
              (click)="dateFilter.set('THIS_WEEK')"
            >
              This Week
            </button>
          </div>

          <div class="sort-selector-wrap">
            <span class="control-label"><i class="ph ph-sort-descending"></i> Sort:</span>
            <div class="select-box-wrap">
              <select
                class="sort-select"
                [ngModel]="sortOption()"
                (ngModelChange)="sortOption.set($event)"
                aria-label="Sort orders"
              >
                <option value="COMPLETION_DESC">Completion: Newest First</option>
                <option value="COMPLETION_ASC">Completion: Oldest First</option>
                <option value="CREATED_DESC">Created: Newest First</option>
                <option value="AMOUNT_DESC">Total Amount: High to Low</option>
              </select>
              <i class="ph ph-caret-down select-caret"></i>
            </div>
          </div>
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
            @if (isLoading()) {
              <tr>
                <td colspan="8" style="padding: 0;">
                  <app-skeleton variant="billing-row" [count]="5" />
                </td>
              </tr>
            } @else {
              @for (ord of filteredOrders(); track ord.id) {
                <tr class="clickable-order-row" (click)="onOrderRowClick(ord, $event)" title="Click row to open bill preview">
                  <td>
                    <div class="ord-tbl-cell">
                      @if (ord.orderType === 'TAKEAWAY') {
                        <span class="table-tag takeaway-tag">
                          <i class="ph ph-bag"></i> Takeaway ({{
                            ord.pickupReference || ord.orderNumber
                          }})
                        </span>
                      } @else {
                        <span
                          class="table-tag"
                          [class.consolidated-tag]="ord.isSessionConsolidated"
                        >
                          Table {{ ord.tableNumber }}
                          @if (ord.isSessionConsolidated) {
                            <span class="rounds-chip">{{ ord.sessionRoundsCount }} Rounds</span>
                          }
                        </span>
                      }
                      <span class="order-id-text">
                        {{ ord.orderNumber }}
                        @if (ord.printCount && ord.printCount > 0) {
                          <span class="badge badge-subtle print-count-badge" title="Printed {{ ord.printCount }} times">
                            {{ ord.printCount }}x
                          </span>
                        }
                      </span>
                      @if (isOrderCompletedOrSettled(ord)) {
                        <div class="timing-badge-wrap" [title]="'Completion / Settlement: ' + (getOrderCompletionDate(ord) | date: 'medium')">
                          <span class="time-text completion-badge">
                            <i class="ph ph-check-circle"></i>
                            <span>{{ getOrderCompletionDate(ord) | date: 'd MMM, h:mm a' }}</span>
                          </span>
                          <span class="created-subtime text-xs text-muted">Created {{ ord.createdAt | date: 'shortTime' }}</span>
                        </div>
                      } @else {
                        <div class="timing-badge-wrap">
                          <span class="time-text active-time">
                            <i class="ph ph-clock"></i>
                            <span>Active • {{ ord.createdAt | date: 'd MMM, h:mm a' }}</span>
                          </span>
                        </div>
                      }
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
                      @if (ord.isSessionConsolidated) {
                        <span class="session-items-badge">
                          <i class="ph ph-receipt"></i> {{ ord.sessionRoundsCount }} Rounds •
                          {{ ord.items.length }} dishes
                        </span>
                      } @else {
                        {{ ord.items.length }} dishes
                      }
                      <span class="dishes-preview text-muted">
                        ({{ ord.items[0]?.name }}
                        @if (ord.items.length > 1) {
                          +{{ ord.items.length - 1 }} more
                        }
                        )
                      </span>
                      @if (ord.isSplit || getOrderSplitBills(ord.id).length > 0) {
                        <!-- DC-1: single toggle pill only here, removed duplicate from actions -->
                        <span class="split-info-chip">
                          <i class="ph ph-split-horizontal"></i>
                          {{ getOrderSplitBills(ord.id).length }} Split Bills
                        </span>
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
                    @if (ord.status === 'CANCELLED') {
                      <span
                        class="badge badge-cancelled"
                        style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; background: rgba(239, 68, 68, 0.12); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.25);"
                      >
                        <i class="ph ph-x-circle"></i> CANCELLED
                      </span>
                    } @else {
                      <app-status-badge [status]="getOrderPaymentStatus(ord)"></app-status-badge>
                    }
                  </td>
                  <td>
                    <div class="billing-actions">
                      @if (ord.paymentStatus === 'PAID') {
                        <button
                          type="button"
                          class="btn btn-whatsapp btn-sm btn-whatsapp-icon-only"
                          (click)="openWhatsAppForOrder(ord)"
                          title="Send Bill via WhatsApp"
                          aria-label="Send Bill via WhatsApp"
                        >
                          <i class="ph ph-whatsapp-logo"></i>
                        </button>
                      }

                      <!-- DC-1: split toggle only in items cell; removed duplicate here -->
                      @if (ord.isSplit || getOrderSplitBills(ord.id).length > 0) {
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm split-parts-toggle-btn"
                          [class.btn-active-toggle]="isSplitBillsExpanded(ord.id)"
                          (click)="toggleSplitBills(ord.id)"
                          [title]="isSplitBillsExpanded(ord.id) ? 'Hide split bills breakdown' : 'Show split bills breakdown'"
                        >
                          <i class="ph" [class.ph-caret-down]="!isSplitBillsExpanded(ord.id)" [class.ph-caret-up]="isSplitBillsExpanded(ord.id)"></i>
                          <span>{{ isSplitBillsExpanded(ord.id) ? 'Hide Splits' : 'Split Bills (' + getOrderSplitBills(ord.id).length + ')' }}</span>
                        </button>
                      }

                      @if (
                        ord.paymentStatus !== 'PAID' && ord.status !== 'CANCELLED'
                      ) {
                        <!-- DC-2: Split Bill option only if not already split -->
                        @if (!ord.isSplit && getOrderSplitBills(ord.id).length === 0) {
                          <button
                            class="btn btn-secondary btn-sm"
                            (click)="openSplitModal(ord)"
                            title="Divide bill into multiple parts"
                          >
                            <i class="ph ph-split-horizontal"></i>
                            <span>Split Bill</span>
                          </button>
                        }
                        <!-- DC-2: Settle Bill hidden when order is already split (backend rejects with 409) -->
                        @if (!ord.isSplit && getOrderSplitBills(ord.id).length === 0) {
                          <button class="btn btn-primary btn-sm" (click)="openSettleModal(ord)">
                            <i class="ph ph-check"></i>
                            <span>Settle Bill</span>
                          </button>
                        }
                      }

                      <!-- DC-8: Refund only on fully PAID, not PARTIALLY_PAID -->
                      @if (ord.paymentStatus === 'PAID') {
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
                @if ((ord.isSplit || getOrderSplitBills(ord.id).length > 0) && isSplitBillsExpanded(ord.id)) {
                  <tr class="split-bills-row">
                    <td colspan="8">
                      <div class="split-bills-container">
                        <div class="split-banner">
                          <div class="split-banner-left">
                            <i class="ph ph-split-horizontal"></i>
                            <span
                              >Split Bills for {{ ord.orderNumber }} ({{
                                getOrderSplitBills(ord.id).length
                              }}
                              Payable Bills)</span
                            >
                          </div>
                          <button
                            type="button"
                            class="btn-close-split"
                            (click)="toggleSplitBills(ord.id)"
                            title="Collapse split bills view"
                          >
                            <i class="ph ph-caret-up"></i>
                            <span>Hide</span>
                          </button>
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
                                <th>Receipt</th>
                              </tr>
                            </thead>
                            <tbody>
                              @for (split of getOrderSplitBills(ord.id); track split.id) {
                                <tr
                                  class="split-item-row"
                                  (click)="onSplitRowClick(ord, split, $event)"
                                  style="cursor: pointer;"
                                  title="Click to preview split bill slip"
                                >
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
                                      @if (split.paymentStatus === 'PAID') {
                                        <a
                                          [routerLink]="['/admin/billing', ord.id]"
                                          [queryParams]="{ splitId: split.id }"
                                          class="btn btn-secondary btn-xs"
                                          title="Print Split Slip"
                                        >
                                          <i class="ph ph-receipt"></i>
                                          <span>Slip</span>
                                        </a>
                                        <button
                                          type="button"
                                          class="btn btn-whatsapp btn-xs btn-whatsapp-icon-only"
                                          (click)="openWhatsAppForSplit(ord, split)"
                                          title="Send Split Bill via WhatsApp"
                                          aria-label="Send Split Bill via WhatsApp"
                                        >
                                          <i class="ph ph-whatsapp-logo"></i>
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
                  <td colspan="8" style="padding: 0;">
                    <app-empty-state
                      icon="ph-receipt"
                      title="No Orders in Billing Queue"
                      message="No dining orders currently match the selected payment or order filter."
                      [bordered]="false"
                    />
                  </td>
                </tr>
              }
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
                <h3 class="heading-card">
                  {{
                    selectedSessionOrders().length > 1
                      ? 'Settle Consolidated Table Bill'
                      : 'Settle Dining Bill'
                  }}
                </h3>
                <span class="text-xs text-muted">
                  @if (selectedSessionOrders().length > 1) {
                    Table {{ ord.tableNumber }} • {{ selectedSessionOrders().length }} Dining Rounds
                    Consolidated
                  } @else {
                    {{ ord.orderNumber }} • Table {{ ord.tableNumber }}
                  }
                </span>
              </div>
              <button class="close-btn" (click)="closeSettleModal()">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <!-- When multi-round session, render distinct Apple-styled round breakdown cards -->
              @if (selectedSessionOrders().length > 1) {
                <div class="session-rounds-banner">
                  <div class="rounds-badge-pill">
                    <i class="ph ph-receipt"></i>
                    <span
                      >CONSOLIDATED SESSION • {{ selectedSessionOrders().length }} ORDER
                      ROUNDS</span
                    >
                  </div>
                  <span class="text-xs text-muted"
                    >All orders for Table {{ ord.tableNumber }} combined into 1 bill</span
                  >
                </div>

                <div class="rounds-container">
                  @for (rnd of selectedSessionOrders(); track rnd.id; let idx = $index) {
                    <div class="round-breakdown-card">
                      <div class="round-card-header">
                        <div class="round-title-wrap">
                          <span class="round-number-tag">Order {{ idx + 1 }}</span>
                          <span class="round-ref-id">{{ rnd.orderNumber }}</span>
                          <span class="round-time">{{ rnd.createdAt | date: 'shortTime' }}</span>
                        </div>
                        <span class="round-subtotal-badge">{{ rnd.subtotal | currencyInr }}</span>
                      </div>
                      <div class="round-items-list">
                        @for (it of rnd.items; track it.id || it.name) {
                          <div class="round-item-row">
                            <span class="item-name">{{ it.quantity }}× {{ it.name }}</span>
                            <span class="item-price">{{
                              (it.unitPrice || 0) * it.quantity | currencyInr
                            }}</span>
                          </div>
                        }
                      </div>
                    </div>
                  }
                </div>
              }

              <div class="settle-summary-box">
                <div class="settle-row">
                  <span>Guest Name</span>
                  <strong>{{ ord.customerName }}</strong>
                </div>
                @if (selectedSessionOrders().length > 1) {
                  <div class="settle-row">
                    <span>Dining Rounds Included</span>
                    <span class="font-bold text-onyx"
                      >{{ selectedSessionOrders().length }} Orders</span
                    >
                  </div>
                }

                <!-- Itemized dishes breakdown -->
                <div class="settle-items-section">
                  <div class="settle-items-header">
                    <span>Ordered Dishes</span>
                    <span class="text-xs text-muted">{{ getSettlementItems(ord).length }} items</span>
                  </div>
                  <div class="settle-items-list">
                    @for (item of getSettlementItems(ord); track $index) {
                      <div class="settle-item-row">
                        <div class="settle-item-left">
                          <span class="item-qty-pill">{{ item.quantity }}x</span>
                          <div class="item-text-group">
                            <span class="item-name-text">{{ item.name }}</span>
                            @if (item.notes || item.specialInstructions) {
                              <span class="item-instruction-text">{{ item.notes || item.specialInstructions }}</span>
                            }
                          </div>
                        </div>
                        <span class="item-total-price">{{ (item.itemTotal || (item.unitPrice * item.quantity)) | currencyInr }}</span>
                      </div>
                    }
                  </div>
                </div>

                <div class="settle-divider"></div>

                <div class="settle-row">
                  <span>Item Subtotal</span>
                  <span class="font-semibold">{{ getSettlementSubtotal(ord) | currencyInr }}</span>
                </div>
                @if (settleDiscountMode() === 'COUPON' && getEffectiveDiscount(ord) > 0) {
                  <div class="settle-row discount">
                    <span>Coupon Discount ({{ selectedCouponCode() }})</span>
                    <span class="text-success font-semibold"
                      >-{{ getEffectiveDiscount(ord) | currencyInr }}</span
                    >
                  </div>
                }
                <div class="settle-row">
                  <span>Taxes (CGST + SGST)</span>
                  <span>{{ getSettlementTax(ord) | currencyInr }}</span>
                </div>
                @if (settleDiscountMode() === 'CUSTOM' && getEffectiveDiscount(ord) > 0) {
                  <div class="settle-row discount">
                    <span>Admin Discount / Round-off</span>
                    <span class="text-success font-semibold"
                      >-{{ getEffectiveDiscount(ord) | currencyInr }}</span
                    >
                  </div>
                }
                <div class="settle-divider"></div>
                <div class="settle-row total-highlight">
                  <span>Net Payable</span>
                  <span class="amount-large">{{ getSettlementTotal(ord) | currencyInr }}</span>
                </div>
              </div>

              <!-- Counter Discount & Coupons Block -->
              <div class="settle-discount-card">
                <div class="discount-header-row">
                  <span class="discount-title"> <i class="ph ph-tag"></i> Discount & Offers </span>
                  <div class="discount-segmented-control">
                    <button
                      type="button"
                      class="seg-btn"
                      [class.active]="settleDiscountMode() === 'CUSTOM'"
                      (click)="settleDiscountMode.set('CUSTOM')"
                    >
                      <i class="ph ph-currency-inr"></i> Flat ₹ Off
                    </button>
                    <button
                      type="button"
                      class="seg-btn"
                      [class.active]="settleDiscountMode() === 'COUPON'"
                      (click)="settleDiscountMode.set('COUPON')"
                    >
                      <i class="ph ph-ticket"></i> Coupon
                    </button>
                  </div>
                </div>

                @if (settleDiscountMode() === 'CUSTOM') {
                  <div class="custom-disc-pane">
                    <div class="inr-input-wrapper">
                      <span class="inr-prefix">₹</span>
                      <input
                        type="number"
                        min="0"
                        [max]="ord.subtotal"
                        class="inr-input"
                        placeholder="Enter rupees off..."
                        [value]="customDiscountRupees() || ''"
                        (input)="onCustomDiscountChange($event, ord.subtotal + ord.taxAmount)"
                      />
                      @if (customDiscountRupees() > 0) {
                        <button
                          type="button"
                          class="btn-disc-clear"
                          (click)="clearDiscount()"
                          title="Clear discount"
                        >
                          <i class="ph ph-x"></i> Clear
                        </button>
                      }
                    </div>
                    <div class="quick-disc-chips">
                      <button
                        type="button"
                        class="disc-chip"
                        [class.chip-active]="customDiscountRupees() === 20"
                        (click)="applyQuickRupees(20, ord.subtotal + ord.taxAmount)"
                      >
                        -₹20
                      </button>
                      <button
                        type="button"
                        class="disc-chip"
                        [class.chip-active]="customDiscountRupees() === 50"
                        (click)="applyQuickRupees(50, ord.subtotal + ord.taxAmount)"
                      >
                        -₹50
                      </button>
                      <button
                        type="button"
                        class="disc-chip"
                        [class.chip-active]="customDiscountRupees() === 100"
                        (click)="applyQuickRupees(100, ord.subtotal + ord.taxAmount)"
                      >
                        -₹100
                      </button>
                      <button
                        type="button"
                        class="disc-chip chip-round"
                        (click)="applyRoundOffDiscount(ord)"
                        title="Round total down to nearest ₹10"
                      >
                        Round Off
                      </button>
                    </div>
                  </div>
                }

                @if (settleDiscountMode() === 'COUPON') {
                  <div class="coupon-disc-pane">
                    <div class="coupon-select-wrapper">
                      <select
                        class="coupon-select"
                        [ngModel]="selectedCouponCode()"
                        (ngModelChange)="onSelectCoupon($event, ord.subtotal)"
                      >
                        <option value="">-- Select Active Coupon --</option>
                        @for (c of activeCoupons(); track c.id) {
                          <option [value]="c.code">
                            {{ c.code }} ({{
                              c.discountType === 'PERCENTAGE'
                                ? c.discountValue + '% OFF'
                                : '₹' + c.discountValue + ' OFF'
                            }}{{ c.minOrderValue ? ', min ₹' + c.minOrderValue : '' }})
                          </option>
                        }
                      </select>
                      <i class="ph ph-caret-down coupon-caret"></i>
                    </div>
                    @if (selectedCouponCode()) {
                      <div class="applied-coupon-badge">
                        <i class="ph ph-seal-check"></i>
                        <span
                          >Coupon <strong>{{ selectedCouponCode() }}</strong> applied: -{{
                            getEffectiveDiscount(ord) | currencyInr
                          }}</span
                        >
                        <button type="button" class="btn-disc-clear-pill" (click)="clearDiscount()">
                          <i class="ph ph-x"></i>
                        </button>
                      </div>
                    }
                  </div>
                }
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

                  <button
                    type="button"
                    class="method-tile"
                    [class.selected]="selectedPaymentMethod() === 'CARD'"
                    (click)="selectedPaymentMethod.set('CARD')"
                  >
                    <i class="ph ph-credit-card tile-icon"></i>
                    <div class="tile-info">
                      <span class="tile-title">Card / POS</span>
                      <span class="tile-sub">Swipe / Tap Terminal</span>
                    </div>
                    @if (selectedPaymentMethod() === 'CARD') {
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
                [appLoadingButton]="isSettling()"
                loadingText="Recording..."
                (click)="confirmSettlement()"
                [disabled]="isSettling()"
              >
                <i class="ph ph-check"></i>
                <span>Confirm {{ selectedPaymentMethod() }} Settlement</span>
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
                  <span>Net Payable</span>
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

      <!-- WhatsApp Delivery Modal (Apple Fluid Design) -->
      @if (showWhatsAppModal() && whatsAppOrder(); as ord) {
        <div class="modal-overlay" (click)="onModalBackdropClick($event, 'whatsapp')">
          <div class="modal-card settle-modal whatsapp-dialog-card" role="dialog" aria-modal="true">
            <!-- Modal Header -->
            <div class="modal-header whatsapp-apple-header">
              <div class="whatsapp-header-wrap">
                <div class="whatsapp-icon-badge">
                  <i class="ph-fill ph-whatsapp-logo"></i>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="heading-card">Send Bill via WhatsApp</h3>
                    <span class="badge-gateway-chip" [class.is-connected]="whatsAppBridge.connectionStatus() === 'CONNECTED'">
                      <span class="dot-indicator"></span>
                      {{ whatsAppBridge.connectionStatus() === 'CONNECTED' ? 'DIRECT GATEWAY' : 'WEB FALLBACK' }}
                    </span>
                  </div>
                  <span class="text-xs text-muted">
                    {{ ord.orderNumber }} • Table {{ ord.tableNumber || 'Dine-In' }}
                    @if (whatsAppSplit(); as split) {
                      (Split Bill #{{ split.splitIndex }}/{{ split.splitTotalCount }})
                    }
                  </span>
                </div>
              </div>
              <button class="close-btn" (click)="closeWhatsAppModal()" aria-label="Close dialog">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <!-- Modal Body -->
            <div class="modal-body whatsapp-apple-body">
              <!-- Customer WhatsApp Phone Number (Admin Gated) -->
              <div class="form-group">
                <div class="label-cluster-between">
                  <label class="form-label font-bold" for="bq-wa-phone">
                    <i class="ph ph-phone text-whatsapp"></i> Customer WhatsApp Number
                  </label>
                  @if (authService.isAdmin()) {
                    <span class="admin-verified-pill" title="Administrator access permitted to change recipient">
                      <i class="ph ph-shield-check"></i> Admin Editable
                    </span>
                  } @else {
                    <span class="admin-locked-pill" title="Only Admin can modify customer phone number">
                      <i class="ph ph-lock-key"></i> Admin Protected
                    </span>
                  }
                </div>
                
                <div class="input-with-icon">
                  <i class="ph ph-phone"></i>
                  <input
                    id="bq-wa-phone"
                    type="tel"
                    class="form-input"
                    [class.input-locked]="!authService.isAdmin()"
                    [readonly]="!authService.isAdmin()"
                    placeholder="e.g. 9876543210 or +91 98765 43210"
                    [value]="whatsAppPhone()"
                    (input)="whatsAppPhone.set($any($event.target).value)"
                    (keyup.enter)="sendWhatsAppBill()"
                  />
                  @if (!authService.isAdmin()) {
                    <i class="ph ph-lock-key lock-status-icon" title="Only Admins can modify phone number"></i>
                  }
                </div>
                <span class="hint-text">
                  @if (authService.isAdmin()) {
                    Enter 10-digit customer mobile number. Country code defaults to +91 (India).
                  } @else {
                    Recipient phone is locked to registered customer. Contact Admin to modify.
                  }
                </span>
              </div>

              <!-- Message Composer (Editable) -->
              <div class="form-group">
                <div class="label-cluster-between">
                  <label class="form-label font-bold">
                    <i class="ph ph-pencil-simple-line text-whatsapp"></i> Message Text (Editable)
                  </label>
                  <span class="char-counter-text">
                    {{ whatsAppMessagePreview().length }} characters
                  </span>
                </div>
                <textarea
                  class="form-input whatsapp-composer-box"
                  rows="7"
                  [ngModel]="whatsAppMessagePreview()"
                  (ngModelChange)="whatsAppCustomMessage.set($event)"
                  placeholder="Enter message to send..."
                ></textarea>
              </div>
            </div>

            <!-- Modal Footer: Single Primary Action & Secondary Utils -->
            <div class="modal-footer whatsapp-apple-footer">
              <button type="button" class="btn btn-secondary btn-apple-cancel" (click)="closeWhatsAppModal()">
                Cancel
              </button>

              <div class="footer-actions-group">
                <button
                  type="button"
                  class="btn btn-secondary btn-apple-copy"
                  (click)="copyBillToClipboard()"
                  title="Copy formatted bill text to clipboard"
                >
                  <i class="ph ph-copy"></i>
                  <span>Copy Text</span>
                </button>

                <!-- Single Embedded WhatsApp Send Button -->
                <button
                  type="button"
                  class="btn btn-whatsapp-direct"
                  (click)="sendWhatsAppBill()"
                  [disabled]="isDispatchingWhatsApp() || !whatsAppPhone().trim()"
                  title="Send bill directly via embedded WhatsApp"
                >
                  @if (isDispatchingWhatsApp()) {
                    <i class="ph ph-spinner ph-spin"></i>
                    <span>Sending in background...</span>
                  } @else {
                    <i class="ph-bold ph-paper-plane-tilt"></i>
                    <span>Send Bill via WhatsApp</span>
                  }
                </button>
              </div>
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
        padding: 16px 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .toolbar-top-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        width: 100%;
      }

      .toolbar-controls-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        padding-top: 12px;
        border-top: 1px solid var(--color-border);
        width: 100%;
      }

      .date-filter-group {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;

        .control-label {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--color-text-muted);
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-right: 2px;
        }
      }

      .date-pill-btn {
        padding: 6px 13px;
        font-size: 0.78125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        background: var(--color-bone-light, rgba(0, 0, 0, 0.04));
        border: 1px solid var(--color-border);
        border-radius: 9999px;
        cursor: pointer;
        transition: all 0.16s ease;

        &:hover {
          background: var(--color-bone-medium, rgba(0, 0, 0, 0.08));
          color: var(--color-text-primary);
        }

        &.active {
          background: var(--color-crimson, #c2410c);
          color: #ffffff;
          border-color: var(--color-crimson, #c2410c);
          box-shadow: 0 2px 6px rgba(194, 65, 12, 0.25);
        }
      }

      .sort-selector-wrap {
        display: flex;
        align-items: center;
        gap: 8px;

        .control-label {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--color-text-muted);
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }

        .select-box-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;

          .sort-select {
            appearance: none;
            -webkit-appearance: none;
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-sm, 8px);
            padding: 6px 32px 6px 12px;
            font-size: 0.8125rem;
            font-weight: 600;
            color: var(--color-text-primary);
            cursor: pointer;
            transition: all 0.15s ease;
            outline: none;

            &:focus {
              border-color: var(--color-primary);
              box-shadow: 0 0 0 2px rgba(194, 65, 12, 0.12);
            }
          }

          .select-caret {
            position: absolute;
            right: 10px;
            pointer-events: none;
            font-size: 0.75rem;
            color: var(--color-text-muted);
          }
        }
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
        display: flex;
        align-items: center;

        i {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--color-text-muted);
          font-size: 1.125rem;
          pointer-events: none;
        }

        .form-input {
          padding-left: 42px;
          padding-right: 16px;
          height: 44px;
          border-radius: var(--radius-md, 10px);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          font-size: 0.875rem;
          color: var(--color-text-primary);
          transition: all var(--transition-fast, 0.15s ease);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);

          &:focus {
            border-color: var(--color-primary);
            box-shadow: 0 0 0 3px rgba(194, 65, 12, 0.12);
            outline: none;
          }

          &::placeholder {
            color: var(--color-text-muted);
          }
        }
      }

      .clickable-order-row {
        cursor: pointer;
        transition: background-color var(--transition-fast, 0.15s ease);

        &:hover {
          background-color: var(--color-bone-light, rgba(0, 0, 0, 0.025)) !important;
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

        &.takeaway-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: rgba(212, 175, 55, 0.15);
          border: 1px solid rgba(212, 175, 55, 0.4);
          color: #7d6514;
          padding: 2px 7px;
          border-radius: var(--radius-xs);
          font-weight: 700;
        }
      }

      .print-count-badge {
        font-size: 0.65rem;
        padding: 2px 5px;
        margin-left: 4px;
        background: rgba(184, 134, 11, 0.15);
        color: #7d6514;
        border-radius: 4px;
      }

      .order-id-text {
        font-weight: 700;
      }
      .time-text {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .timing-badge-wrap {
        display: flex;
        flex-direction: column;
        gap: 3px;
        margin-top: 3px;
      }

      .completion-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.75rem;
        font-weight: 700;
        color: #059669;
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.25);
        padding: 2px 7px;
        border-radius: 6px;
        width: fit-content;

        i {
          font-size: 0.85rem;
        }
      }

      .created-subtime {
        font-size: 0.7rem;
        color: var(--color-text-muted);
        padding-left: 2px;
      }

      .active-time {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.75rem;
        font-weight: 600;
        color: #d97706;
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.25);
        padding: 2px 7px;
        border-radius: 6px;
        width: fit-content;

        i {
          font-size: 0.85rem;
        }
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
        margin-bottom: 14px;
      }

      .settle-items-section {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-sm, 6px);
        padding: 8px 10px;
        margin: 2px 0 4px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .settle-items-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted, #94a3b8);
        padding-bottom: 4px;
        border-bottom: 1px solid var(--color-border, #f1f5f9);
      }

      .settle-items-list {
        max-height: 160px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding-right: 2px;
      }

      .settle-item-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        font-size: 0.8125rem;
        padding: 2px 0;
      }

      .settle-item-left {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        flex: 1;
        min-width: 0;
      }

      .item-qty-pill {
        font-size: 0.7rem;
        font-weight: 700;
        background: rgba(99, 102, 241, 0.1);
        color: var(--color-primary, #6366f1);
        padding: 1px 5px;
        border-radius: 4px;
        flex-shrink: 0;
        margin-top: 1px;
      }

      .item-text-group {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .item-name-text {
        font-weight: 600;
        color: var(--color-onyx, #1e293b);
        line-height: 1.25;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .item-instruction-text {
        font-size: 0.6875rem;
        color: var(--color-text-muted, #64748b);
        line-height: 1.2;
        margin-top: 1px;
        font-style: italic;
      }

      .item-total-price {
        font-weight: 600;
        color: var(--color-text-primary, #0f172a);
        font-family: 'SF Mono', Consolas, monospace;
        font-size: 0.8125rem;
        flex-shrink: 0;
        margin-left: 8px;
      }

      .settle-discount-card {
        margin-bottom: 18px;
        padding: 12px 14px;
        background: var(--color-bone-light, #f8fafc);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-sm, 8px);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .discount-header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .discount-title {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--color-onyx, #1e293b);
        display: inline-flex;
        align-items: center;
        gap: 6px;

        i {
          color: var(--color-primary, #6366f1);
          font-size: 0.95rem;
        }
      }

      .discount-segmented-control {
        display: inline-flex;
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 6px;
        padding: 2px;
        gap: 2px;
      }

      .seg-btn {
        background: transparent;
        border: none;
        padding: 3px 9px;
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--color-text-secondary, #64748b);
        border-radius: 4px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: all var(--transition-fast, 0.15s ease);

        &:hover {
          color: var(--color-text-primary, #1e293b);
        }

        &.active {
          background: var(--color-primary, #6366f1);
          color: #ffffff;
        }
      }

      .custom-disc-pane {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .inr-input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
      }

      .inr-prefix {
        position: absolute;
        left: 10px;
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--color-text-muted, #94a3b8);
        pointer-events: none;
      }

      .inr-input {
        width: 100%;
        padding: 6px 12px 6px 26px;
        font-size: 0.825rem;
        font-weight: 600;
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 6px;
        background: var(--color-surface, #ffffff);
        color: var(--color-text-primary, #1e293b);
        outline: none;
        transition: all var(--transition-fast, 0.15s ease);

        &:focus {
          border-color: var(--color-primary, #6366f1);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12);
        }
      }

      .btn-disc-clear {
        position: absolute;
        right: 8px;
        background: transparent;
        border: none;
        color: var(--color-text-muted, #94a3b8);
        font-size: 0.72rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 2px 4px;

        &:hover {
          color: var(--color-danger, #ef4444);
        }
      }

      .quick-disc-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .disc-chip {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 5px;
        padding: 3px 8px;
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--color-text-secondary, #475569);
        cursor: pointer;
        transition: all var(--transition-fast, 0.15s ease);

        &:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
          color: var(--color-text-primary, #1e293b);
        }

        &.chip-active {
          background: #eff6ff;
          border-color: #3b82f6;
          color: #1d4ed8;
          font-weight: 700;
        }

        &.chip-round {
          color: #047857;
          border-color: #a7f3d0;
          background: #ecfdf5;

          &:hover {
            background: #d1fae5;
          }
        }
      }

      .coupon-disc-pane {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .coupon-select-wrapper {
        position: relative;
        display: flex;
        align-items: center;
      }

      .coupon-select {
        width: 100%;
        appearance: none;
        -webkit-appearance: none;
        padding: 6px 26px 6px 10px;
        font-size: 0.78rem;
        font-weight: 500;
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 6px;
        background: var(--color-surface, #ffffff);
        color: var(--color-text-primary, #1e293b);
        outline: none;
        cursor: pointer;
        transition: all var(--transition-fast, 0.15s ease);

        &:focus {
          border-color: var(--color-primary, #6366f1);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12);
        }
      }

      .coupon-caret {
        position: absolute;
        right: 9px;
        font-size: 0.72rem;
        color: var(--color-text-muted, #94a3b8);
        pointer-events: none;
      }

      .applied-coupon-badge {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        border-radius: 6px;
        padding: 5px 8px;
        font-size: 0.72rem;
        color: #065f46;

        i {
          font-size: 0.85rem;
          color: #059669;
        }
      }

      .btn-disc-clear-pill {
        background: transparent;
        border: none;
        color: #065f46;
        cursor: pointer;
        padding: 2px 4px;
        display: inline-flex;
        align-items: center;

        &:hover {
          color: #ef4444;
        }
      }

      .consolidated-tag {
        background: #fdf2f8 !important;
        color: #be185d !important;
        border: 1px solid #fbcfe8 !important;
      }

      .rounds-chip {
        display: inline-flex;
        align-items: center;
        background: #be185d;
        color: #ffffff;
        font-size: 0.625rem;
        font-weight: 800;
        padding: 1px 5px;
        border-radius: 9999px;
        margin-left: 4px;
        letter-spacing: 0.02em;
      }

      .session-items-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-weight: 700;
        color: var(--color-onyx);
      }

      .session-rounds-banner {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px 12px;
        background: #fdf2f8;
        border: 1px solid #fbcfe8;
        border-radius: 8px;

        .rounds-badge-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 800;
          color: #be185d;
          letter-spacing: 0.03em;
        }
      }

      .rounds-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 220px;
        overflow-y: auto;
        padding-right: 2px;
      }

      .round-breakdown-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 8px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;

        .round-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px dashed var(--color-border, #e2e8f0);
          padding-bottom: 6px;
        }

        .round-title-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .round-number-tag {
          font-size: 0.6875rem;
          font-weight: 800;
          background: #f1f5f9;
          color: #334155;
          padding: 1px 6px;
          border-radius: 4px;
        }

        .round-ref-id {
          font-size: 0.75rem;
          font-family: monospace;
          font-weight: 600;
          color: #0f172a;
        }

        .round-time {
          font-size: 0.6875rem;
          color: #64748b;
        }

        .round-subtotal-badge {
          font-size: 0.8125rem;
          font-weight: 700;
          color: #be185d;
          font-family: 'SF Mono', Consolas, monospace;
        }

        .round-items-list {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .round-item-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: #475569;

          .item-name {
            font-weight: 500;
          }

          .item-price {
            font-weight: 600;
            color: #0f172a;
            font-family: 'SF Mono', Consolas, monospace;
          }
        }
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
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;

        @media (max-width: 600px) {
          grid-template-columns: 1fr;
        }
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

      .split-pill-toggle-btn {
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-crimson);
        background: var(--color-danger-bg);
        border: 1px solid rgba(194, 24, 7, 0.25);
        padding: 3px 8px;
        border-radius: var(--radius-full);
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin-top: 4px;
        width: fit-content;
        cursor: pointer;
        transition: all var(--transition-fast, 0.15s ease);

        &:hover {
          background: rgba(220, 38, 38, 0.16);
          border-color: rgba(220, 38, 38, 0.4);
          transform: translateY(-1px);
        }

        &:active {
          transform: scale(0.97);
        }

        &.expanded {
          background: var(--color-crimson);
          color: #ffffff;
          border-color: var(--color-crimson);
          box-shadow: 0 2px 6px rgba(220, 38, 38, 0.25);
        }
      }

      /* DC-1: static chip replaces the pill toggle in items cell */
      .split-info-chip {
        font-size: 0.6875rem;
        font-weight: 700;
        color: #b45309;
        background: rgba(180, 83, 9, 0.08);
        border: 1px solid rgba(180, 83, 9, 0.2);
        padding: 2px 7px;
        border-radius: var(--radius-full);
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-top: 4px;
        width: fit-content;
      }

      .split-parts-toggle-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-weight: 600;
        transition: all var(--transition-fast, 0.15s ease);

        &.btn-active-toggle {
          background: var(--color-crimson);
          color: #ffffff;
          border-color: var(--color-crimson);
          box-shadow: 0 2px 6px rgba(220, 38, 38, 0.2);
        }
      }

      .split-bills-row {
        background: var(--color-bone-light);
        border-bottom: 2px solid var(--color-border);
      }

      .split-bills-container {
        padding: 14px 18px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        animation: splitExpandIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes splitExpandIn {
        from {
          opacity: 0;
          transform: translateY(-6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .split-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--color-onyx);

        .split-banner-left {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-close-split {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          font-size: 0.75rem;
          font-weight: 600;
          border-radius: var(--radius-xs, 6px);
          border: 1px solid var(--color-border);
          background: var(--color-surface, #ffffff);
          color: var(--color-text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast, 0.15s ease);

          &:hover {
            background: var(--color-bone-light);
            color: var(--color-crimson);
            border-color: var(--color-crimson);
          }
        }
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

      .btn-whatsapp {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #25d366;
        color: #ffffff;
        font-weight: 500;
        border: none;
        cursor: pointer;
        transition: background 0.15s ease, transform 0.1s ease;

        &:hover {
          background: #20ba5a;
          color: #ffffff;
        }

        &:active {
          transform: scale(0.95);
        }

        i {
          font-size: 1.15rem;
        }

        &.btn-xs {
          padding: 0 6px;
          height: 26px;
          min-width: 26px;
          border-radius: var(--radius-xs, 4px);

          i {
            font-size: 0.95rem;
          }
        }

        &.btn-sm {
          padding: 0 10px;
          height: 32px;
          min-width: 34px;
          border-radius: var(--radius-sm, 6px);
        }
      }

      .whatsapp-dialog-card {
        max-width: 540px;
        border-radius: 20px;
        overflow: hidden;
      }

      .whatsapp-apple-header {
        border-bottom: 1px solid var(--color-border);
        padding-bottom: 12px;
      }

      .whatsapp-header-wrap {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .whatsapp-icon-badge {
        width: 42px;
        height: 42px;
        border-radius: 12px;
        background: rgba(37, 211, 102, 0.12);
        color: #25d366;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
      }

      .badge-gateway-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.65rem;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.15);
        color: var(--color-text-secondary);
        border: 1px solid rgba(148, 163, 184, 0.25);

        .dot-indicator {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #94a3b8;
        }

        &.is-connected {
          background: rgba(34, 197, 94, 0.12);
          color: #16a34a;
          border-color: rgba(34, 197, 94, 0.25);

          .dot-indicator {
            background: #22c55e;
            box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
          }
        }
      }

      .whatsapp-apple-body {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding-top: 14px;
      }

      .label-cluster-between {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
      }

      .text-whatsapp {
        color: #25d366;
      }

      .admin-verified-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(16, 185, 129, 0.12);
        color: #059669;
        border: 1px solid rgba(16, 185, 129, 0.25);
      }

      .admin-locked-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(245, 158, 11, 0.12);
        color: #b45309;
        border: 1px solid rgba(245, 158, 11, 0.25);
      }

      .input-locked {
        background: rgba(0, 0, 0, 0.04) !important;
        cursor: not-allowed;
        color: var(--color-text-secondary);
      }

      .lock-status-icon {
        position: absolute;
        right: 12px;
        color: var(--color-text-muted);
        font-size: 1rem;
      }

      .char-counter-text {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
        font-family: var(--font-mono, monospace);
      }

      .whatsapp-composer-box {
        font-family: var(--font-mono, monospace);
        font-size: 0.75rem;
        line-height: 1.5;
        resize: vertical;
        min-height: 140px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        padding: 10px 12px;
        transition: border-color 0.15s ease;

        &:focus {
          border-color: #25d366;
          box-shadow: 0 0 0 3px rgba(37, 211, 102, 0.15);
        }
      }

      .whatsapp-apple-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 14px;
        border-top: 1px solid var(--color-border);

        .footer-actions-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn-apple-cancel {
          border-radius: 10px;
          font-weight: 600;
        }

        .btn-apple-copy {
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-weight: 600;
        }

        .btn-whatsapp-direct {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #25d366;
          color: #ffffff;
          font-weight: 700;
          font-size: 0.8125rem;
          padding: 9px 18px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(37, 211, 102, 0.3);
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s ease, opacity 0.15s ease;

          &:hover:not(:disabled) {
            background: #20ba5a;
            box-shadow: 0 4px 14px rgba(37, 211, 102, 0.4);
          }

          &:active:not(:disabled) {
            transform: scale(0.97);
          }

          &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        }
      }
    `,
  ],
})
export class BillingQueueComponent {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);
  private router = inject(Router);
  readonly whatsAppBridge = inject(WhatsAppBridgeService);
  readonly authService = inject(AdminAuthService);

  readonly isLoading = computed(
    () =>
      this.dataService.isOrdersLoading() ||
      !this.dataService.ordersLoaded() ||
      this.dataService.isTablesLoading() ||
      !this.dataService.tablesLoaded(),
  );

  orders = this.mock.orders;
  selectedTab = signal<string>('ALL');
  searchQuery = signal<string>('');
  dateFilter = signal<'ALL' | 'TODAY' | 'YESTERDAY' | 'THIS_WEEK'>('ALL');
  sortOption = signal<'COMPLETION_DESC' | 'COMPLETION_ASC' | 'CREATED_DESC' | 'AMOUNT_DESC'>('COMPLETION_DESC');

  get cgstRate(): number {
    return this.dataService.restaurant()?.taxSettings?.cgstRate ?? 2.5;
  }

  get sgstRate(): number {
    return this.dataService.restaurant()?.taxSettings?.sgstRate ?? 2.5;
  }

  // Settle Full Order State
  showSettleModal = signal<boolean>(false);
  selectedOrderForSettlement = signal<Order | null>(null);
  selectedPaymentMethod = signal<'CASH' | 'UPI' | 'CARD'>('UPI');
  isSettling = signal<boolean>(false);

  // Settlement Discount & Offers state
  settleDiscountMode = signal<'CUSTOM' | 'COUPON'>('CUSTOM');
  customDiscountRupees = signal<number>(0);
  selectedCouponCode = signal<string>('');
  activeCoupons = computed(() =>
    this.mock.coupons ? this.mock.coupons().filter((c) => c.isActive) : [],
  );

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

  // Split Bills Row Expansion State (collapsed by default)
  expandedSplitOrders = signal<Set<string>>(new Set());

  toggleSplitBills(orderId: string): void {
    this.expandedSplitOrders.update((set) => {
      const next = new Set(set);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }

  isSplitBillsExpanded(orderId: string): boolean {
    return this.expandedSplitOrders().has(orderId);
  }

  onOrderRowClick(ord: Order, event: MouseEvent): void {
    const target = event.target as HTMLElement;
    // Do not trigger row navigation if user clicked an inner interactive button/link/input/toggle
    if (target.closest('button, a, input, select, textarea, .btn, .split-pill-toggle-btn')) {
      return;
    }
    this.router.navigate(['/admin/billing', ord.id]);
  }

  // Refund State
  showRefundModal = signal<boolean>(false);
  selectedOrderForRefund = signal<Order | null>(null);
  selectedSplitForRefund = signal<SplitBill | null>(null);
  refundAmount = signal<number>(0);
  refundReason = signal<string>('');
  refundError = signal<string>('');
  isSubmittingRefund = signal<boolean>(false);

  // WhatsApp Delivery State
  showWhatsAppModal = signal<boolean>(false);
  whatsAppOrder = signal<Order | null>(null);
  whatsAppSplit = signal<SplitBill | null>(null);
  whatsAppPhone = signal<string>('');
  whatsAppCustomMessage = signal<string>('');
  isDispatchingWhatsApp = signal<boolean>(false);

  whatsAppMessagePreview = computed(() => {
    // If user edited message, return customized text
    if (this.whatsAppCustomMessage()) {
      return this.whatsAppCustomMessage();
    }
    const ord = this.whatsAppOrder();
    if (!ord) return '';
    const split = this.whatsAppSplit();
    const restName = this.dataService.restaurant()?.name || 'GuruKripa Dhaba';
    return buildWhatsAppBillMessage(
      restName,
      ord,
      split
        ? {
            splitIndex: split.splitIndex,
            splitTotalCount: split.splitTotalCount,
            totalAmount: split.totalAmount,
            paymentStatus: split.paymentStatus,
            paymentMethod: split.paymentMethod,
          }
        : null,
    );
  });

  whatsAppWebUrl = computed(() => {
    const ord = this.whatsAppOrder();
    if (!ord) return '';
    const split = this.whatsAppSplit();
    const restName = this.dataService.restaurant()?.name || 'GuruKripa Dhaba';
    return getWhatsAppWebUrl(
      this.whatsAppPhone(),
      restName,
      ord,
      split
        ? {
            splitIndex: split.splitIndex,
            splitTotalCount: split.splitTotalCount,
            totalAmount: split.totalAmount,
            paymentStatus: split.paymentStatus,
            paymentMethod: split.paymentMethod,
          }
        : null,
    );
  });

  whatsAppAppUrl = computed(() => {
    const ord = this.whatsAppOrder();
    if (!ord) return '';
    const split = this.whatsAppSplit();
    const restName = this.dataService.restaurant()?.name || 'GuruKripa Dhaba';
    return getWhatsAppAppUrl(
      this.whatsAppPhone(),
      restName,
      ord,
      split
        ? {
            splitIndex: split.splitIndex,
            splitTotalCount: split.splitTotalCount,
            totalAmount: split.totalAmount,
            paymentStatus: split.paymentStatus,
            paymentMethod: split.paymentMethod,
          }
        : null,
    );
  });

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
    return this.orders().filter((o) => o.paymentStatus === 'UNPAID' && o.status !== 'CANCELLED');
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
    if (status === 'UNPAID') {
      return this.orders().filter((o) => o.paymentStatus === 'UNPAID' && o.status !== 'CANCELLED')
        .length;
    }
    return this.orders().filter((o) => o.paymentStatus === status).length;
  }

  getOrderSplitBills(orderId: string): SplitBill[] {
    const parent = this.orders().find((o) => o.id === orderId);
    const splits = this.mock.splitBills().filter((b) => b.orderId === orderId);
    if (parent?.paymentStatus === 'PAID') {
      return splits.map((s) =>
        s.paymentStatus === 'PAID'
          ? s
          : {
              ...s,
              paymentStatus: 'PAID' as PaymentStatus,
              paymentMethod: s.paymentMethod || parent.paymentMethod,
            },
      );
    }
    return splits;
  }

  getOrderPaymentStatus(ord: Order): PaymentStatus {
    if (ord.paymentStatus === 'PAID') return 'PAID';
    const splits = this.mock.splitBills().filter((b) => b.orderId === ord.id);
    if (splits.length > 0) {
      const paidCount = splits.filter((s) => s.paymentStatus === 'PAID').length;
      if (paidCount === splits.length) return 'PAID';
      if (paidCount > 0) return 'PARTIALLY_PAID';
      return 'UNPAID';
    }
    return ord.paymentStatus;
  }

  onSplitRowClick(ord: Order, split: SplitBill, event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, .billing-actions')) {
      return;
    }
    this.router.navigate(['/admin/billing', ord.id], { queryParams: { splitId: split.id } });
  }

  getSplitIndices(): number[] {
    const count = this.splitCount();
    const arr: number[] = [];
    for (let i = 0; i < count; i++) arr.push(i);
    return arr;
  }

  selectedSessionOrders = signal<Order[]>([]);

  getSessionOrders(ord: Order | null): Order[] {
    if (!ord) return [];
    if (ord.orderType === 'TAKEAWAY' || (!ord.tableId && !ord.tableNumber)) {
      return [ord];
    }
    const siblings = this.orders().filter((o) => {
      if (o.id === ord.id || o.status === 'CANCELLED' || o.orderType === 'TAKEAWAY') {
        return false;
      }
      // Must have same paymentStatus (don't mix unpaid with paid)
      if (o.paymentStatus !== ord.paymentStatus) return false;

      // 1. Strict seatingSessionId check if both have one
      if (ord.seatingSessionId && o.seatingSessionId) {
        return o.seatingSessionId === ord.seatingSessionId;
      }

      // 2. Exact table match (must match tableId if both present)
      if (ord.tableId && o.tableId && ord.tableId !== o.tableId) {
        return false;
      }
      const sameTable =
        (ord.tableId && o.tableId === ord.tableId) ||
        (ord.tableNumber &&
          o.tableNumber &&
          ord.tableNumber.trim().toLowerCase() === o.tableNumber.trim().toLowerCase());
      if (!sameTable) return false;

      // 3. Time guard: Never mix orders created > 3 hours apart
      const timeDiff = Math.abs(
        new Date(ord.createdAt).getTime() - new Date(o.createdAt).getTime(),
      );
      return timeDiff <= 3 * 60 * 60 * 1000;
    });
    return [ord, ...siblings].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  consolidateOrdersForBilling(ordersList: Order[]): Order[] {
    const tableMap = new Map<string, Order[]>();
    const nonTableOrders: Order[] = [];

    for (const ord of ordersList) {
      if (ord.orderType !== 'TAKEAWAY' && (ord.tableId || ord.tableNumber)) {
        let key = '';
        if (ord.seatingSessionId) {
          // Group by seating session — multiple rounds share one bill
          key = `sess_${ord.seatingSessionId}`;
        } else if (ord.paymentStatus === 'PAID') {
          // PAID orders with no session ID are independent bills — never re-group them
          // ponytail: using ord.id as the key so each settled order is its own bucket
          key = `paid_${ord.id}`;
        } else {
          key = `tbl_active_${ord.tableId || ord.tableNumber}`;
        }
        if (!tableMap.has(key)) {
          tableMap.set(key, []);
        }
        tableMap.get(key)!.push(ord);
      } else {
        nonTableOrders.push(ord);
      }
    }

    const consolidatedList: Order[] = [...nonTableOrders];

    for (const [, ordersGroup] of tableMap.entries()) {
      if (ordersGroup.length === 1) {
        consolidatedList.push(ordersGroup[0]);
      } else {
        const sorted = [...ordersGroup].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        const primary = sorted[0];
        const combinedSubtotal =
          Math.round(sorted.reduce((sum, r) => sum + (r.subtotal || 0), 0) * 100) / 100;
        const combinedTax =
          Math.round(sorted.reduce((sum, r) => sum + (r.taxAmount || 0), 0) * 100) / 100;
        const combinedTotal = Math.round((combinedSubtotal + combinedTax) * 100) / 100;
        const allItems = sorted.flatMap((r) => r.items);
        const allPaid = sorted.every((r) => r.paymentStatus === 'PAID');
        const latestSettledAt = sorted
          .map((r) => r.settledAt)
          .filter((s): s is string => Boolean(s))
          .sort()
          .pop();

        consolidatedList.push({
          ...primary,
          paymentStatus: allPaid ? 'PAID' : primary.paymentStatus,
          items: allItems,
          subtotal: combinedSubtotal,
          taxAmount: combinedTax,
          totalAmount: combinedTotal,
          isSessionConsolidated: true,
          sessionRoundsCount: sorted.length,
          sessionRounds: sorted,
          settledAt: latestSettledAt || primary.settledAt,
        });
      }
    }

    return consolidatedList;
  }

  getOrderCompletionTimestamp(ord: Order): number {
    if (ord.settledAt) {
      const t = new Date(ord.settledAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }

    if (ord.sessionRounds && ord.sessionRounds.length > 0) {
      let latestTime = 0;
      for (const round of ord.sessionRounds) {
        if (round.settledAt) {
          const t = new Date(round.settledAt).getTime();
          if (!isNaN(t) && t > latestTime) latestTime = t;
        }
        if (round.timeline && Array.isArray(round.timeline)) {
          for (const ev of round.timeline) {
            if (['COMPLETED', 'PAID', 'SERVED'].includes(ev.status?.toUpperCase())) {
              const t = new Date(ev.timestamp).getTime();
              if (!isNaN(t) && t > latestTime) latestTime = t;
            }
          }
        }
        if (round.paymentStatus === 'PAID' && round.updatedAt) {
          const t = new Date(round.updatedAt).getTime();
          if (!isNaN(t) && t > latestTime) latestTime = t;
        }
      }
      if (latestTime > 0) return latestTime;
    }

    if (ord.timeline && Array.isArray(ord.timeline)) {
      for (let i = ord.timeline.length - 1; i >= 0; i--) {
        const ev = ord.timeline[i];
        if (['COMPLETED', 'PAID', 'SERVED'].includes(ev.status?.toUpperCase())) {
          const t = new Date(ev.timestamp).getTime();
          if (!isNaN(t) && t > 0) return t;
        }
      }
    }

    if ((ord.paymentStatus === 'PAID' || ord.status === 'COMPLETED') && ord.updatedAt) {
      const t = new Date(ord.updatedAt).getTime();
      if (!isNaN(t) && t > 0) return t;
    }

    const created = new Date(ord.createdAt).getTime();
    return !isNaN(created) ? created : 0;
  }

  getOrderCompletionDate(ord: Order): Date {
    return new Date(this.getOrderCompletionTimestamp(ord));
  }

  isOrderCompletedOrSettled(ord: Order): boolean {
    return ord.paymentStatus === 'PAID' || ord.status === 'COMPLETED' || Boolean(ord.settledAt);
  }

  isSameCalendarDay(d1: Date, d2: Date): boolean {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  filteredOrders = computed(() => {
    let list = this.orders();
    if (this.selectedTab() === 'UNPAID') {
      list = list.filter((o) => o.paymentStatus === 'UNPAID' && o.status !== 'CANCELLED');
    } else if (this.selectedTab() === 'PAID') {
      list = list.filter((o) => o.paymentStatus === 'PAID');
    }

    const consolidated = this.consolidateOrdersForBilling(list);
    list = consolidated;

    // Filter by Completion/Event Date
    const filter = this.dateFilter();
    if (filter !== 'ALL') {
      const now = new Date();
      list = list.filter((o) => {
        const orderTime = this.getOrderCompletionTimestamp(o);
        const orderDate = new Date(orderTime);
        if (filter === 'TODAY') {
          return this.isSameCalendarDay(orderDate, now);
        }
        if (filter === 'YESTERDAY') {
          const yesterday = new Date();
          yesterday.setDate(now.getDate() - 1);
          return this.isSameCalendarDay(orderDate, yesterday);
        }
        if (filter === 'THIS_WEEK') {
          const weekAgo = new Date();
          weekAgo.setDate(now.getDate() - 7);
          weekAgo.setHours(0, 0, 0, 0);
          return orderTime >= weekAgo.getTime();
        }
        return true;
      });
    }

    const q = this.searchQuery().toLowerCase().trim();
    if (q) {
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          (o.pickupReference && o.pickupReference.toLowerCase().includes(q)) ||
          (o.tableNumber && o.tableNumber.toLowerCase().includes(q)) ||
          o.customerName.toLowerCase().includes(q) ||
          (o.sessionRounds && o.sessionRounds.some((r) => r.orderNumber.toLowerCase().includes(q))),
      );
    }

    // Sort bills: Default COMPLETION_DESC (newest completion time & date at top)
    const sort = this.sortOption();
    list = [...list].sort((a, b) => {
      if (sort === 'COMPLETION_DESC') {
        const diff = this.getOrderCompletionTimestamp(b) - this.getOrderCompletionTimestamp(a);
        return diff !== 0 ? diff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sort === 'COMPLETION_ASC') {
        const diff = this.getOrderCompletionTimestamp(a) - this.getOrderCompletionTimestamp(b);
        return diff !== 0 ? diff : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sort === 'CREATED_DESC') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sort === 'AMOUNT_DESC') {
        return (b.totalAmount || 0) - (a.totalAmount || 0);
      }
      return 0;
    });

    return list;
  });

  // --- Full Order Settlement Actions ---
  openSettleModal(order: Order): void {
    if (order.status === 'CANCELLED') {
      this.toastService.warning(`Order ${order.orderNumber} is cancelled and cannot be settled.`);
      return;
    }
    if (order.paymentStatus === 'PAID') {
      this.toastService.warning(`Order ${order.orderNumber} is already settled.`);
      return;
    }
    const rounds = this.getSessionOrders(order);
    this.selectedSessionOrders.set(rounds);
    this.selectedOrderForSettlement.set(order);
    this.selectedPaymentMethod.set(
      order.paymentMethod === 'CARD' ? 'CARD' : order.paymentMethod === 'UPI' ? 'UPI' : 'CASH',
    );
    this.customDiscountRupees.set(order.discountAmount || 0);
    this.selectedCouponCode.set(order.appliedCouponCode || '');
    this.settleDiscountMode.set(order.appliedCouponCode ? 'COUPON' : 'CUSTOM');
    this.isSettling.set(false);
    this.showSettleModal.set(true);
  }

  getSettlementItems(ord: Order | null): OrderItem[] {
    if (!ord) return [];
    const rounds = this.selectedSessionOrders();
    if (rounds.length > 1) {
      return rounds.flatMap((r) => r.items || []);
    }
    return ord.items || [];
  }

  getSettlementSubtotal(ord: Order | null): number {
    if (!ord) return 0;
    const rounds = this.selectedSessionOrders();
    if (rounds.length > 0) {
      return Math.round(rounds.reduce((sum, r) => sum + (r.subtotal || 0), 0) * 100) / 100;
    }
    return ord.subtotal || 0;
  }

  getSettlementTax(ord: Order | null): number {
    if (!ord) return 0;
    const subtotal = this.getSettlementSubtotal(ord);
    const taxRate = (this.cgstRate || 2.5) + (this.sgstRate || 2.5);
    if (this.settleDiscountMode() === 'COUPON') {
      const couponDisc = this.getEffectiveDiscount(ord);
      const taxable = Math.max(0, subtotal - couponDisc);
      return Math.round(taxable * (taxRate / 100) * 100) / 100;
    } else {
      return Math.round(subtotal * (taxRate / 100) * 100) / 100;
    }
  }

  getEffectiveDiscount(ord: Order | null): number {
    if (!ord) return 0;
    const subtotal = this.getSettlementSubtotal(ord);
    const taxRate = (this.cgstRate || 2.5) + (this.sgstRate || 2.5);
    if (this.settleDiscountMode() === 'CUSTOM') {
      const tax = Math.round(subtotal * (taxRate / 100) * 100) / 100;
      const grossTotal = Math.round((subtotal + tax) * 100) / 100;
      const disc = Math.max(0, this.customDiscountRupees() || 0);
      return Math.min(grossTotal, Math.round(disc * 100) / 100);
    } else {
      const code = this.selectedCouponCode();
      if (!code) return 0;
      const coup = this.activeCoupons().find((c) => c.code.toUpperCase() === code.toUpperCase());
      if (!coup) return 0;
      if (coup.minOrderValue && subtotal < coup.minOrderValue) return 0;

      let disc = 0;
      if (coup.discountType === 'PERCENTAGE') {
        // Coupon discount applies to total BEFORE taxes
        disc = (subtotal * coup.discountValue) / 100;
        if (coup.maxDiscountAmount && disc > coup.maxDiscountAmount) {
          disc = coup.maxDiscountAmount;
        }
      } else {
        disc = coup.discountValue;
      }
      return Math.min(subtotal, Math.round(disc * 100) / 100);
    }
  }

  getSettlementTotal(ord: Order | null): number {
    if (!ord) return 0;
    const subtotal = this.getSettlementSubtotal(ord);
    const tax = this.getSettlementTax(ord);
    if (this.settleDiscountMode() === 'COUPON') {
      const couponDisc = this.getEffectiveDiscount(ord);
      const taxable = Math.max(0, subtotal - couponDisc);
      // Chargeable amount never shows pointed/decimal value: rounded to whole integer
      return Math.round(Math.max(0, taxable + tax));
    } else {
      const grossTotal = subtotal + tax;
      const adminDisc = this.getEffectiveDiscount(ord);
      // Chargeable amount never shows pointed/decimal value: rounded to whole integer
      return Math.round(Math.max(0, grossTotal - adminDisc));
    }
  }

  onCustomDiscountChange(event: Event, maxLimit: number): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (isNaN(val) || val < 0) {
      this.customDiscountRupees.set(0);
    } else {
      this.customDiscountRupees.set(Math.min(maxLimit, Math.round(val)));
    }
    this.selectedCouponCode.set('');
  }

  applyQuickRupees(amount: number, maxLimit: number): void {
    this.settleDiscountMode.set('CUSTOM');
    this.customDiscountRupees.set(Math.min(maxLimit, amount));
    this.selectedCouponCode.set('');
  }

  applyRoundOffDiscount(ord: Order): void {
    this.settleDiscountMode.set('CUSTOM');
    const subtotal = this.getSettlementSubtotal(ord);
    const taxRate = (this.cgstRate || 2.5) + (this.sgstRate || 2.5);
    const tax = Math.round(subtotal * (taxRate / 100) * 100) / 100;
    const grossTotal = Math.round((subtotal + tax) * 100) / 100;
    const roundedDown = Math.floor(grossTotal / 10) * 10;
    const neededOff = Math.max(0, Math.round((grossTotal - roundedDown) * 100) / 100);
    this.customDiscountRupees.set(neededOff);
    this.selectedCouponCode.set('');
  }

  onSelectCoupon(code: string, subtotal: number): void {
    this.selectedCouponCode.set(code);
    if (code) {
      this.customDiscountRupees.set(0);
    }
  }

  clearDiscount(): void {
    this.customDiscountRupees.set(0);
    this.selectedCouponCode.set('');
  }

  closeSettleModal(): void {
    this.showSettleModal.set(false);
    this.selectedOrderForSettlement.set(null);
    this.selectedSessionOrders.set([]);
    this.isSettling.set(false);
  }

  confirmSettlement(): void {
    const ord = this.selectedOrderForSettlement();
    if (!ord || this.isSettling()) return;

    this.isSettling.set(true);
    const method = this.selectedPaymentMethod();
    const finalDiscount = this.getEffectiveDiscount(ord);
    const appliedCode = this.settleDiscountMode() === 'COUPON' ? this.selectedCouponCode() : '';

    const res = this.mock.settleOrder({
      orderId: ord.id,
      paymentMethod: method,
      discountAmount: finalDiscount,
      appliedCouponCode: appliedCode,
    });

    this.isSettling.set(false);
    if (res.success) {
      if (ord.tableId || ord.tableNumber) {
        this.mock.recalculateTableStatus(ord.tableId || ord.tableNumber!);
      }
      const roundsCount = this.selectedSessionOrders().length;
      const msg =
        roundsCount > 1
          ? `Table ${ord.tableNumber || ''} (${roundsCount} orders) successfully settled via ${method}`
          : `Order ${ord.orderNumber} successfully settled via ${method}`;
      this.toastService.success(msg);
      this.closeSettleModal();
      this.router.navigate(['/admin/billing', ord.id], { queryParams: { preview: 'thermal' } });
    } else {
      this.toastService.warning(res.error || 'Failed to settle order');
      this.closeSettleModal();
    }
  }

  // --- Split Bill Settle Actions ---
  openSettleSplitModal(order: Order, split: SplitBill): void {
    if (order.status === 'CANCELLED') {
      this.toastService.warning('Cannot settle a cancelled order.');
      return;
    }
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
      this.router.navigate(['/admin/billing', ord.id], { queryParams: { splitId: split.id, preview: 'thermal' } });
    } else {
      this.toastService.error(res.error || 'Failed to settle split bill');
    }
  }

  // --- Bill Splitting Actions ---
  openSplitModal(order: Order): void {
    if (order.status === 'CANCELLED') {
      this.toastService.warning(`Order ${order.orderNumber} is cancelled and cannot be split.`);
      return;
    }
    if (order.paymentStatus === 'PAID') {
      this.toastService.warning('Cannot split an already settled bill.');
      return;
    }
    if (order.isSplit || this.getOrderSplitBills(order.id).length > 0) {
      this.toastService.warning('This order has already been split. Please settle the existing split bills.');
      return;
    }
    if (order.paymentStatus === 'PARTIALLY_PAID') {
      this.toastService.warning('Cannot split an order that has already been partially settled.');
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
        this.expandedSplitOrders.update((set) => new Set(set).add(ord.id));
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
        this.expandedSplitOrders.update((set) => new Set(set).add(ord.id));
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

  // --- WhatsApp Bill Delivery Actions ---
  openWhatsAppForOrder(order: Order): void {
    this.whatsAppOrder.set(order);
    this.whatsAppSplit.set(null);
    this.whatsAppPhone.set(order.customerPhone || '');
    const restName = this.dataService.restaurant()?.name || 'GuruKripa Dhaba';
    this.whatsAppCustomMessage.set(buildWhatsAppBillMessage(restName, order, null));
    this.showWhatsAppModal.set(true);
    this.whatsAppBridge.startStatusPoller();
  }

  openWhatsAppForSplit(order: Order, split: SplitBill): void {
    this.whatsAppOrder.set(order);
    this.whatsAppSplit.set(split);
    this.whatsAppPhone.set(order.customerPhone || '');
    const restName = this.dataService.restaurant()?.name || 'GuruKripa Dhaba';
    this.whatsAppCustomMessage.set(
      buildWhatsAppBillMessage(restName, order, {
        splitIndex: split.splitIndex,
        splitTotalCount: split.splitTotalCount,
        totalAmount: split.totalAmount,
        paymentStatus: split.paymentStatus,
        paymentMethod: split.paymentMethod,
      }),
    );
    this.showWhatsAppModal.set(true);
    this.whatsAppBridge.startStatusPoller();
  }

  closeWhatsAppModal(): void {
    this.showWhatsAppModal.set(false);
    this.whatsAppOrder.set(null);
    this.whatsAppSplit.set(null);
    this.whatsAppPhone.set('');
    this.whatsAppCustomMessage.set('');
    this.isDispatchingWhatsApp.set(false);
  }

  copyBillToClipboard(): void {
    const text = this.whatsAppMessagePreview();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => this.toastService.success('Bill receipt copied to clipboard!'),
        () => this.toastService.info('Please select and copy text manually from preview box.'),
      );
    } else {
      this.toastService.info('Please select and copy text manually from preview box.');
    }
  }

  onWhatsAppLinkClicked(url?: string): void {
    if (url) {
      launchExternalUrl(url);
    }
    this.toastService.success('WhatsApp opened with customer bill message!');
    setTimeout(() => this.closeWhatsAppModal(), 400);
  }

  sendWhatsAppBill(): void {
    const ord = this.whatsAppOrder();
    if (!ord) return;
    const phone = this.whatsAppPhone().trim();
    if (!phone) {
      this.toastService.warning('Please enter customer WhatsApp phone number.');
      return;
    }

    const split = this.whatsAppSplit();
    const splitArg = split
      ? {
          splitIndex: split.splitIndex,
          splitTotalCount: split.splitTotalCount,
          totalAmount: split.totalAmount,
          paymentStatus: split.paymentStatus,
          paymentMethod: split.paymentMethod,
        }
      : null;

    const restName = this.dataService.restaurant()?.name || 'GuruKripa Dhaba';
    const message = this.whatsAppMessagePreview();

    this.isDispatchingWhatsApp.set(true);

    // If Baileys background bridge is connected, send 1-click silent dispatch
    if (this.whatsAppBridge.connectionStatus() === 'CONNECTED') {
      this.toastService.info('Dispatching WhatsApp message in background...');
      this.whatsAppBridge.sendBill(phone, restName, ord, splitArg, message).subscribe({
        next: (res) => {
          this.isDispatchingWhatsApp.set(false);
          if (res.success) {
            this.toastService.success('WhatsApp bill delivered directly to customer!');
            this.closeWhatsAppModal();
          } else {
            this.toastService.warning(res.error || 'Direct dispatch failed, opening WhatsApp Web fallback...');
            launchExternalUrl(`https://web.whatsapp.com/send?phone=${phone.replace(/\D/g, '')}&text=${encodeURIComponent(message)}`);
            this.closeWhatsAppModal();
          }
        },
        error: () => {
          this.isDispatchingWhatsApp.set(false);
          launchExternalUrl(`https://web.whatsapp.com/send?phone=${phone.replace(/\D/g, '')}&text=${encodeURIComponent(message)}`);
          this.closeWhatsAppModal();
        },
      });
      return;
    }

    // Fallback if bridge is not connected: open WhatsApp Web
    this.isDispatchingWhatsApp.set(false);
    const cleanDigits = phone.replace(/\D/g, '');
    if (cleanDigits.length >= 10) {
      launchExternalUrl(`https://web.whatsapp.com/send?phone=${cleanDigits}&text=${encodeURIComponent(message)}`);
      this.toastService.success('WhatsApp opened with customer bill!');
      this.closeWhatsAppModal();
    } else {
      this.toastService.error('Invalid phone number format. Please provide at least 10 digits.');
    }
  }

  onModalBackdropClick(event: MouseEvent, type: string): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      if (type === 'settle') this.closeSettleModal();
      if (type === 'settle-split') this.closeSettleSplitModal();
      if (type === 'split') this.closeSplitModal();
      if (type === 'refund') this.closeRefundModal();
      if (type === 'whatsapp') this.closeWhatsAppModal();
    }
  }
}
