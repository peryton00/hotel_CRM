import { Component, inject, signal, computed, effect, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { Order, OrderStatus, OrderItem } from '../../../core/models/order.model';
import { MenuItem } from '../../../core/models/menu.model';
import { MenuStockStatus } from '../../../core/models/inventory.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { DietaryBadgeComponent } from '../../../shared/components/dietary-badge/dietary-badge.component';
import { SkeletonLoaderComponent } from '../../../shared/components/loading/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ToastService } from '../../../core/services/toast.service';
import { SplitBill } from '../../../core/models/billing.model';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { SoundService } from '../../../core/services/sound.service';
import {
  openWhatsAppBill,
  buildWhatsAppBillMessage,
  getWhatsAppWebUrl,
  getWhatsAppAppUrl,
  launchExternalUrl,
} from '../../../core/utils/whatsapp-bill.util';
import { WhatsAppBridgeService } from '../../../core/services/whatsapp-bridge.service';

export interface OrderSessionGroup {
  sessionId: string;
  primaryOrder: Order;
  latestOrder: Order;
  orders: Order[];
  isMultiRound: boolean;
  orderCount: number;
  tableNumber?: string;
  tableId?: string;
  orderType: 'DINE_IN' | 'TAKEAWAY';
  pickupReference?: string;
  customerName: string;
  customerPhone?: string;
  serverStaffId?: string;
  createdAt: string;
  latestCreatedAt: string;
  grandSubtotal: number;
  grandTax: number;
  grandDiscount: number;
  grandTotal: number;
  effectiveStatus: OrderStatus;
  isAllCompleted: boolean;
  isAllPaid: boolean;
  isSplit?: boolean;
  splitCount?: number;
  printCount?: number;
  paymentMethod?: string;
}

@Component({
  selector: 'app-order-queue',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    CurrencyInrPipe,
    StatusBadgeComponent,
    DietaryBadgeComponent,
    SkeletonLoaderComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="orders-page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="heading-display">Order Queue</h1>
          <p class="text-muted">
            Real-time orders across dining tables, takeaway, and kitchen line.
          </p>
        </div>

        <div class="header-right-actions">
          <button
            type="button"
            class="sound-toggle-btn"
            [class.muted]="soundService.isMuted()"
            (click)="soundService.toggleMute()"
            [title]="
              !soundService.isMuted()
                ? 'Audio alerts active (click to mute)'
                : 'Audio alerts muted (click to enable)'
            "
          >
            <i
              class="ph"
              [class.ph-speaker-high]="!soundService.isMuted()"
              [class.ph-speaker-simple-slash]="soundService.isMuted()"
            ></i>
          </button>
          <button class="btn btn-primary" (click)="openManualOrderModal()">
            <i class="ph ph-plus-circle"></i>
            <span>New Order</span>
          </button>
          <div
            class="live-counter-badge"
            [class.offline]="!network.isOnline()"
            [attr.title]="streamTooltip()"
          >
            <span class="pulse-indicator" [class.offline]="!network.isOnline()"></span>
            <span>{{ streamStatusText() }}</span>
          </div>
        </div>
      </div>

      <!-- Status Tabs & Filter Toolbar -->
      <div class="toolbar-card">
        <div class="status-tabs">
          <button
            class="status-tab tab-active-orders"
            [class.active]="selectedStatus() === 'ACTIVE'"
            (click)="selectedStatus.set('ACTIVE')"
            type="button"
          >
            <span class="tab-live-dot" *ngIf="activeOrdersCount() > 0"></span>
            <i class="ph ph-lightning tab-icon" *ngIf="activeOrdersCount() === 0"></i>
            <span class="tab-label">Active Orders</span>
            <span class="tab-count-badge" [class.has-count]="activeOrdersCount() > 0">
              {{ activeOrdersCount() }}
            </span>
          </button>

          <span class="tab-divider" aria-hidden="true"></span>

          <button
            class="status-tab"
            [class.active]="selectedStatus() === 'COMPLETED'"
            (click)="selectedStatus.set('COMPLETED')"
            type="button"
          >
            <i class="ph ph-check-circle tab-icon status-completed"></i>
            <span class="tab-label">Completed</span>
            <span class="tab-count-badge" [class.has-count]="countByStatus('COMPLETED') > 0">
              {{ countByStatus('COMPLETED') }}
            </span>
          </button>
        </div>

        <div class="search-wrap">
          <i class="ph ph-magnifying-glass search-icon"></i>
          <input
            type="text"
            class="form-input search-input"
            placeholder="Search #, guest, or table..."
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)"
          />
          @if (searchQuery()) {
            <button
              type="button"
              class="search-clear-btn"
              (click)="searchQuery.set('')"
              title="Clear search"
              aria-label="Clear search"
            >
              <i class="ph ph-x"></i>
            </button>
          }
        </div>
      </div>

      <!-- Orders Board (Responsive Cards / Table View) -->
      <div class="orders-grid">
        @if (isLoading()) {
          <app-skeleton variant="order-card" [count]="6" />
        } @else {
          @for (session of filteredOrderSessions(); track session.sessionId) {
            @if (session.isAllCompleted) {
              <!-- Completed Order Parent Container (Consolidated Session) -->
              <div
                class="order-board-card completed-board-card session-completed-card"
                [class.new-order-flash]="isSessionNew(session)"
                [class.card-selected]="isSessionSelected(session)"
                (click)="openOrderSidePanel(session.primaryOrder)"
                title="Click to view full order bill & details in side panel"
              >
                <!-- Row 1: (customer name) -------------------------------- (status) -->
                <div class="completed-row-1">
                  <div class="cust-info">
                    <span class="cust-name-main" [title]="session.customerName">
                      {{ session.customerName }}
                    </span>
                    @if (session.customerPhone) {
                      <span class="cust-phone-inline"> · {{ session.customerPhone }} </span>
                    }
                  </div>
                  <div class="card-status-badges">
                    @if (session.isMultiRound) {
                      <span class="session-rounds-chip" title="Multi-round dining session">
                        <i class="ph ph-stack"></i> {{ session.orders.length }} Rounds
                      </span>
                    }
                    @if (session.isSplit && session.splitCount) {
                      <span class="split-indicator-pill" title="Split Bill Active">
                        <i class="ph ph-users"></i> {{ session.splitCount }}P Split
                      </span>
                    }
                    <app-status-badge status="COMPLETED"></app-status-badge>
                  </div>
                </div>

                <!-- Row 2: (table number) ---------------------------------- (time) -->
                <div class="completed-row-2">
                  <div class="table-info">
                    @if (session.orderType === 'TAKEAWAY') {
                      <span class="tbl-badge takeaway-badge">
                        <i class="ph ph-bag"></i> Takeaway ({{
                          session.pickupReference || session.primaryOrder.orderNumber
                        }})
                      </span>
                    } @else {
                      <span
                        class="tbl-badge completed-tbl-badge"
                        [title]="'Table ' + (session.tableNumber || 'Unassigned')"
                      >
                        <i class="ph ph-table"></i> Table {{ session.tableNumber || 'Unassigned' }}
                      </span>
                    }
                  </div>
                  <span class="ord-time">
                    <i class="ph ph-clock"></i> {{ session.createdAt | date: 'shortTime' }}
                  </span>
                </div>

                <!-- Row 3: (order id) -------------------------------------- (who served) -->
                <div class="completed-row-3">
                  <span class="completed-ord-num" title="Order ID">
                    <i class="ph ph-receipt"></i> {{ session.primaryOrder.orderNumber }}
                  </span>
                  <div class="completed-server-cell">
                    <span class="server-caption">Served by:</span>
                    <span
                      class="server-name-text"
                      [title]="
                        'Serving Staff: ' +
                        (getServerStaffName(session.serverStaffId) || 'Unassigned')
                      "
                    >
                      {{ getServerStaffName(session.serverStaffId) || 'Unassigned' }}
                    </span>
                    <button
                      type="button"
                      class="btn-unlock-server-xs"
                      (click)="
                        $event.stopPropagation(); promptChangeCompletedServer(session.primaryOrder)
                      "
                      title="Change serving staff for paid order (Admin Password required)"
                    >
                      <i class="ph ph-pencil-simple"></i>
                    </button>
                  </div>
                </div>

                <!-- Row 4: (payment method) ------- (printed receipt) ------- (Invoice) -->
                <div class="completed-row-4">
                  <span class="meta-pill pill-paid">
                    <i class="ph ph-check-circle"></i> Paid ({{ session.paymentMethod || 'PAID' }})
                  </span>
                  <span class="meta-pill pill-printed">
                    <i class="ph ph-printer"></i> Printed ({{ session.printCount || 1 }}x)
                  </span>
                  <button
                    type="button"
                    (click)="$event.stopPropagation(); handlePrintInvoice(session.primaryOrder)"
                    class="btn-invoice-action"
                    [disabled]="isNavigatingToInvoice() === session.primaryOrder.id"
                    [title]="
                      session.printCount && session.printCount > 0
                        ? 'Tax Invoice printed ' +
                          session.printCount +
                          ' time(s) — Reprint requires Admin authorization'
                        : 'Print Tax Invoice'
                    "
                  >
                    @if (isNavigatingToInvoice() === session.primaryOrder.id) {
                      <i class="ph ph-spinner ph-spin"></i>
                      <span>Opening...</span>
                    } @else {
                      <i class="ph ph-file-text"></i>
                      <span>Invoice</span>
                    }
                  </button>
                  <button
                    type="button"
                    class="btn-invoice-action btn-wa-action"
                    (click)="$event.stopPropagation(); openWhatsAppModal(session.primaryOrder)"
                    title="Send Digital Bill via WhatsApp"
                  >
                    <i class="ph ph-whatsapp-logo"></i>
                    <span>WhatsApp</span>
                  </button>
                </div>

                <!-- Row 5 (Inset Box): Arrived Orders in this Session -->
                <div class="completed-items-inset-box">
                  @if (session.isMultiRound) {
                    @for (rnd of session.orders; track rnd.id; let idx = $index) {
                      <div class="completed-round-section">
                        <div class="completed-round-bar">
                          <span class="completed-round-title"
                            >Round {{ idx + 1 }} ({{ rnd.orderNumber }})</span
                          >
                          <span class="completed-round-total">{{
                            rnd.totalAmount | currencyInr
                          }}</span>
                        </div>
                        <div class="items-summary-list">
                          @for (item of rnd.items; track item.id) {
                            <div class="item-line">
                              <div class="item-info-group">
                                <span class="qty-pill">{{ item.quantity }}×</span>
                                <span class="dish-name" [title]="item.name">{{ item.name }}</span>
                                @if (item.selectedPortion) {
                                  <span class="portion-label">{{
                                    item.selectedPortion.label
                                  }}</span>
                                }
                              </div>
                              <span class="line-cost">{{ item.itemTotal | currencyInr }}</span>
                            </div>
                          }
                        </div>
                      </div>
                    }
                  } @else {
                    <div class="items-summary-list">
                      @for (item of session.primaryOrder.items; track item.id) {
                        <div class="item-line">
                          <div class="item-info-group">
                            <span class="qty-pill">{{ item.quantity }}×</span>
                            <span class="dish-name" [title]="item.name">{{ item.name }}</span>
                            @if (item.selectedPortion) {
                              <span class="portion-label">{{ item.selectedPortion.label }}</span>
                            }
                          </div>
                          <span class="line-cost">{{ item.itemTotal | currencyInr }}</span>
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- Row 6: Grand Total -->
                <div class="completed-total-strip">
                  <div class="sub-meta-left">
                    @if (session.grandDiscount > 0) {
                      <span class="discount-pill">
                        <i class="ph ph-tag"></i> -{{ session.grandDiscount | currencyInr }}
                      </span>
                    }
                    @if (session.isSplit && session.splitCount) {
                      <span class="split-pill">
                        <i class="ph ph-users"></i> {{ session.splitCount }} ways
                      </span>
                    }
                  </div>
                  <div class="total-amount-box">
                    <span class="total-label-compact">Grand Total:</span>
                    <span class="payable-val-highlight">{{
                      session.grandTotal | currencyInr
                    }}</span>
                  </div>
                </div>
              </div>
            } @else {
              <!-- Active Orders Parent Container (Apple Fluid Design) -->
              <div
                class="order-board-card session-parent-card"
                [class.pending-highlight]="session.effectiveStatus === 'PENDING'"
                [class.new-order-flash]="isSessionNew(session)"
                [class.card-selected]="isSessionSelected(session)"
                (click)="openOrderSidePanel(session.primaryOrder)"
                title="Click to view full session details in side panel"
              >
                <!-- Apple Card Top Accent Strip -->
                <div class="apple-card-accent"></div>

                <!-- 1. Header: Table Allotment Pill + Order ID + Time + Status Badge -->
                <div class="card-top apple-card-top">
                  <div class="header-left-cluster">
                    @if (session.orderType === 'TAKEAWAY') {
                      <div class="apple-table-pill takeaway-pill">
                        <i class="ph ph-bag"></i>
                        <span>Takeaway</span>
                      </div>
                    } @else {
                      <button
                        type="button"
                        class="apple-table-pill reallot-clickable"
                        [disabled]="session.isAllPaid"
                        (click)="handleTableBadgeClick($event, session.primaryOrder)"
                        [title]="
                          session.isAllPaid
                            ? 'Table ' + (session.tableNumber || 'Unassigned')
                            : 'Click to reallot table'
                        "
                      >
                        <i class="ph ph-table"></i>
                        <span>{{
                          session.tableNumber ? 'Table ' + session.tableNumber : 'Allot Table'
                        }}</span>
                        @if (!session.isAllPaid) {
                          <i class="ph ph-caret-down text-micro"></i>
                        }
                      </button>
                    }
                    <span class="ord-num apple-ord-num">{{
                      session.primaryOrder.orderNumber
                    }}</span>
                    @if (session.isMultiRound) {
                      <span class="session-rounds-chip" title="Multi-round dining session">
                        <i class="ph ph-stack"></i> {{ session.orders.length }}R
                      </span>
                    }
                  </div>

                  <div class="header-right-cluster">
                    <span class="ord-time apple-ord-time">
                      <i class="ph ph-clock"></i> {{ session.createdAt | date: 'shortTime' }}
                    </span>
                    @if (session.isSplit && session.splitCount) {
                      <span class="split-indicator-pill" title="Split Bill Active">
                        <i class="ph ph-users"></i> {{ session.splitCount }}P
                      </span>
                    }
                    <app-status-badge [status]="session.effectiveStatus"></app-status-badge>
                  </div>
                </div>

                <!-- 2. Guest & Server Info Strip (Apple Recessed Surface) -->
                <div class="guest-server-recessed">
                  <div class="guest-compact-meta">
                    <div class="guest-avatar-disc">
                      {{ (session.customerName || 'G').charAt(0).toUpperCase() }}
                    </div>
                    <div class="guest-text-col truncate">
                      <span class="cust-name-clean truncate" [title]="session.customerName">{{
                        session.customerName || 'Walk-in Guest'
                      }}</span>
                      @if (session.customerPhone) {
                        <span class="phone-sub-clean">
                          <i class="ph ph-phone"></i> {{ session.customerPhone }}
                        </span>
                      }
                    </div>
                  </div>

                  <div class="server-inline-picker" [class.server-bar-locked]="session.isAllPaid">
                    @if (session.isAllPaid) {
                      <div class="server-completed-pill" title="Serving Staff">
                        <i class="ph ph-lock-key"></i>
                        <span class="truncate">{{
                          getServerStaffName(session.serverStaffId) || 'Staff'
                        }}</span>
                        <button
                          type="button"
                          class="btn-unlock-inline"
                          (click)="
                            $event.stopPropagation();
                            promptChangeCompletedServer(session.primaryOrder)
                          "
                          title="Change serving staff"
                        >
                          <i class="ph ph-pencil-simple"></i>
                        </button>
                      </div>
                    } @else {
                      <div class="server-select-pill">
                        <i class="ph ph-user-check"></i>
                        <select
                          class="server-select-clean"
                          [class.is-unassigned]="!session.serverStaffId"
                          [ngModel]="session.serverStaffId || ''"
                          (ngModelChange)="onAssignOrderServer(session.primaryOrder, $event)"
                          (click)="$event.stopPropagation()"
                          title="Assign staff handling this dining session"
                        >
                          <option value="">Server...</option>
                          @for (s of staffMembers(); track s.id) {
                            <option [value]="s.id">{{ s.name }} ({{ s.role }})</option>
                          }
                          @if (session.serverStaffId && !isStaffInList(session.serverStaffId)) {
                            <option [value]="session.serverStaffId">
                              {{ session.serverStaffId }}
                            </option>
                          }
                        </select>
                        <i class="ph ph-caret-down pill-caret"></i>
                      </div>
                    }
                  </div>
                </div>

                <!-- 3. Arrived Order Items Stream (Editorial Receipt Style) -->
                <div class="session-receipt-stream">
                  <div class="receipt-stream-header">
                    <span class="receipt-stream-title">
                      <i class="ph ph-receipt"></i>
                      Ordered Items ({{ session.orders.length }}
                      {{ session.orders.length === 1 ? 'Round' : 'Rounds' }})
                    </span>
                    <span class="receipt-stream-subtotal">
                      {{ session.grandSubtotal | currencyInr }}
                    </span>
                  </div>

                  <div class="receipt-rounds-body">
                    @for (roundOrd of session.orders; track roundOrd.id; let roundIdx = $index) {
                      <div
                        class="receipt-round-segment"
                        [class.round-pending-soft]="roundOrd.status === 'PENDING'"
                      >
                        <!-- Round Mini Meta Bar (only if multi-round) -->
                        @if (session.isMultiRound) {
                          <div class="round-mini-bar">
                            <div class="round-mini-left">
                              <span class="round-mini-title">Round {{ roundIdx + 1 }}</span>
                              <span class="round-mini-ord-num">#{{ roundOrd.orderNumber }}</span>
                            </div>
                            <div class="round-mini-right">
                              <span class="round-mini-time"
                                ><i class="ph ph-clock"></i>
                                {{ roundOrd.createdAt | date: 'shortTime' }}</span
                              >
                              <app-status-badge [status]="roundOrd.status"></app-status-badge>
                            </div>
                          </div>
                        }

                        <!-- Dishes List -->
                        <div class="round-items-clean">
                          @for (item of roundOrd.items; track item.id) {
                            <div class="receipt-item-row">
                              <div class="item-name-cluster">
                                <span class="qty-bubble">{{ item.quantity }}×</span>
                                <span class="item-title truncate" [title]="item.name">{{
                                  item.name
                                }}</span>
                                @if (item.selectedPortion) {
                                  <span class="portion-tag">{{ item.selectedPortion.label }}</span>
                                }
                              </div>
                              <span class="item-price">{{ item.itemTotal | currencyInr }}</span>
                            </div>
                          }
                        </div>
                      </div>
                    }
                  </div>
                </div>

                <!-- 4. Grand Total Financial Breakdown Strip -->
                <div class="bill-strip grand-bill-strip-apple">
                  <div class="sub-line">
                    <span class="bill-label"
                      >Subtotal ({{ session.orderCount }}
                      {{ session.orderCount === 1 ? 'order' : 'orders' }})</span
                    >
                    <span class="bill-val">{{ session.grandSubtotal | currencyInr }}</span>
                  </div>
                  @if (session.grandDiscount > 0) {
                    <div class="sub-line discount">
                      <span class="bill-label"
                        ><i class="ph ph-tag"></i>
                        {{ session.primaryOrder.appliedCouponCode || 'Discount' }}</span
                      >
                      <span class="bill-val">-{{ session.grandDiscount | currencyInr }}</span>
                    </div>
                  }
                  @if (session.isSplit && session.splitCount) {
                    <div class="sub-line split-note">
                      <span class="bill-label"
                        ><i class="ph ph-users"></i> Split ({{ session.splitCount }} ways)</span
                      >
                      <span class="bill-val"
                        >{{ session.grandTotal / session.splitCount | currencyInr }}/pers</span
                      >
                    </div>
                  }
                  <div class="total-row-apple">
                    <div class="total-meta-left">
                      <span class="total-label-apple">Payable Total</span>
                      <span class="tax-badge-apple">Taxes Included</span>
                    </div>
                    <span class="payable-val-apple">{{ session.grandTotal | currencyInr }}</span>
                  </div>
                </div>

                <!-- 5. Tactile Action Controls: Primary CTA + 4 Utility Buttons -->
                <div class="card-footer-actions-apple">
                  <!-- Primary Action Button: Direct Feedback -->
                  <div class="action-row-primary">
                    <button
                      type="button"
                      (click)="$event.stopPropagation(); handleCheckoutAndPrint(session)"
                      class="apple-btn-primary"
                      [disabled]="
                        isProcessingCheckout() === session.primaryOrder.id ||
                        isNavigatingToInvoice() === session.primaryOrder.id
                      "
                    >
                      @if (isProcessingCheckout() === session.primaryOrder.id) {
                        <i class="ph ph-spinner ph-spin"></i>
                        <span>Opening Checkout...</span>
                      } @else if (isNavigatingToInvoice() === session.primaryOrder.id) {
                        <i class="ph ph-spinner ph-spin"></i>
                        <span>Opening Invoice...</span>
                      } @else if (!session.isAllPaid) {
                        <i class="ph ph-credit-card"></i>
                        <span>Settle Bill ({{ session.grandTotal | currencyInr }})</span>
                      } @else {
                        <i class="ph ph-receipt"></i>
                        <span>Print Invoice ({{ session.grandTotal | currencyInr }})</span>
                      }
                    </button>
                  </div>

                  <!-- Secondary 4-Column Utility Grid -->
                  <div class="apple-util-grid">
                    <button
                      type="button"
                      (click)="$event.stopPropagation(); openOrderSidePanel(session.primaryOrder)"
                      class="apple-util-btn"
                      title="View Full Bill & Order Details"
                    >
                      <i class="ph ph-sidebar-simple"></i>
                      <span>Details</span>
                    </button>

                    @if (!session.isAllCompleted && session.effectiveStatus !== 'CANCELLED') {
                      <button
                        type="button"
                        class="apple-util-btn"
                        [class.paid-locked]="session.isAllPaid"
                        (click)="
                          $event.stopPropagation();
                          openEditOrderModal(session.latestOrder || session.primaryOrder)
                        "
                        [title]="
                          session.isAllPaid
                            ? 'Order is PAID — Admin Password required to edit'
                            : 'Edit Order & Add Further Dishes'
                        "
                      >
                        <i
                          class="ph"
                          [class.ph-lock-key]="session.isAllPaid"
                          [class.ph-pencil-simple-line]="!session.isAllPaid"
                        ></i>
                        <span>{{ session.isAllPaid ? 'Edit (Paid)' : 'Edit' }}</span>
                      </button>
                    }

                    @if (session.isAllPaid && session.effectiveStatus !== 'CANCELLED') {
                      <button
                        type="button"
                        (click)="$event.stopPropagation(); handlePrintInvoice(session.primaryOrder)"
                        class="apple-util-btn"
                        [disabled]="isNavigatingToInvoice() === session.primaryOrder.id"
                        [title]="
                          session.printCount && session.printCount > 0
                            ? 'Tax Invoice printed ' + session.printCount + ' time(s)'
                            : 'Print Tax Invoice'
                        "
                      >
                        @if (isNavigatingToInvoice() === session.primaryOrder.id) {
                          <i class="ph ph-spinner ph-spin"></i>
                          <span>Opening...</span>
                        } @else {
                          <i class="ph ph-printer"></i>
                          <span>{{
                            session.printCount && session.printCount > 0
                              ? 'Invoice (' + session.printCount + 'x)'
                              : 'Invoice'
                          }}</span>
                        }
                      </button>
                    }

                    @if (session.effectiveStatus !== 'CANCELLED') {
                      <button
                        type="button"
                        class="apple-util-btn btn-apple-cancel"
                        (click)="$event.stopPropagation(); openCancelModal(session.primaryOrder)"
                        title="Cancel Order"
                      >
                        <i class="ph ph-x-circle"></i>
                        <span>Cancel</span>
                      </button>
                    }
                  </div>
                </div>
              </div>
            }
          } @empty {
            <div style="grid-column: 1 / -1; width: 100%;">
              <app-empty-state
                icon="ph-tray"
                [title]="emptyStateTitle()"
                [message]="emptyStateMessage()"
                [actionText]="emptyStateActionText()"
                [actionIcon]="emptyStateActionIcon()"
                (actionClick)="onEmptyStateAction()"
                [secondaryActionText]="emptyStateSecondaryText()"
                (secondaryActionClick)="onEmptyStateSecondary()"
                [bordered]="false"
              />
            </div>
          }
        }
      </div>

      <!-- Order Quick Details Side Drawer -->
      @if (selectedSidePanelOrder(); as sideOrd) {
        <div class="side-drawer-backdrop" (click)="closeOrderSidePanel()"></div>
        <aside
          class="order-side-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="side-drawer-order-title"
        >
          <!-- Drawer Header -->
          <div class="drawer-header">
            <div class="drawer-title-group">
              <div class="drawer-title-row">
                <h3 id="side-drawer-order-title" class="drawer-order-num">
                  {{ sideOrd.orderNumber }}
                </h3>
                <app-status-badge [status]="sideOrd.status"></app-status-badge>
              </div>
              <div class="drawer-sub-meta">
                <span
                  class="drawer-type-pill"
                  [class.takeaway-pill]="sideOrd.orderType === 'TAKEAWAY'"
                >
                  <i
                    class="ph"
                    [class.ph-bag]="sideOrd.orderType === 'TAKEAWAY'"
                    [class.ph-table]="sideOrd.orderType !== 'TAKEAWAY'"
                  ></i>
                  {{
                    sideOrd.orderType === 'TAKEAWAY'
                      ? 'Takeaway • ' + (sideOrd.pickupReference || sideOrd.orderNumber)
                      : 'Dine-In • Table ' + sideOrd.tableNumber
                  }}
                </span>
                <span class="drawer-time-stamp">
                  <i class="ph ph-clock"></i> {{ sideOrd.createdAt | date: 'shortTime' }}
                </span>
              </div>
            </div>
            <button
              class="close-btn"
              (click)="closeOrderSidePanel()"
              aria-label="Close side panel"
              title="Close panel"
            >
              <i class="ph ph-x"></i>
            </button>
          </div>

          <!-- Drawer Body (Scrollable) -->
          <div class="drawer-body">
            @if (selectedSessionOrders().length > 1) {
              <div
                class="drawer-session-banner"
                style="margin-bottom: 14px; background: rgba(37, 99, 235, 0.08); border: 1px solid rgba(37, 99, 235, 0.2); border-radius: 8px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between;"
              >
                <div style="display: flex; align-items: center; gap: 8px;">
                  <i class="ph ph-stack" style="color: #2563eb; font-size: 1.1rem;"></i>
                  <div>
                    <strong style="font-size: 0.8125rem; color: #1e40af;"
                      >CONSOLIDATED DINING SESSION</strong
                    >
                    <div style="font-size: 0.75rem; color: var(--color-text-muted);">
                      {{ selectedSessionOrders().length }} Orders unified for Table
                      {{ sideOrd.tableNumber }}
                    </div>
                  </div>
                </div>
                <span style="font-size: 0.875rem; font-weight: 800; color: #1e40af;">{{
                  getSettlementGrandTotal(sideOrd) | currencyInr
                }}</span>
              </div>
            }

            <!-- 1. Customer & Contact Details Card -->
            <div class="drawer-section-card">
              <div class="section-card-header">
                <span class="section-card-title"
                  ><i class="ph ph-user"></i> Guest & Location Details</span
                >
                @if (!isOrderPaid(sideOrd)) {
                  <button
                    type="button"
                    class="btn btn-secondary btn-xs"
                    (click)="openChangeTableModal(sideOrd)"
                    title="Change or allot dining table for this order"
                  >
                    <i class="ph ph-arrows-left-right"></i>
                    <span>{{ sideOrd.tableNumber ? 'Change Table' : 'Allot Table' }}</span>
                  </button>
                }
              </div>
              <div class="drawer-info-grid">
                <div class="drawer-info-row">
                  <span class="drawer-info-label">Customer Name</span>
                  <span class="drawer-info-value font-semibold">{{
                    sideOrd.customerName || 'Walk-in Guest'
                  }}</span>
                </div>
                <div class="drawer-info-row">
                  <span class="drawer-info-label">Phone Contact</span>
                  <div class="drawer-phone-wrap">
                    <span class="drawer-info-value">{{
                      sideOrd.customerPhone || 'Not provided'
                    }}</span>
                    @if (sideOrd.customerPhone) {
                      <a
                        [href]="'tel:' + sideOrd.customerPhone"
                        class="btn-tel-call"
                        title="Call Customer"
                      >
                        <i class="ph ph-phone-call"></i>
                        <span>Call</span>
                      </a>
                    }
                  </div>
                </div>
                <div class="drawer-info-row">
                  <span class="drawer-info-label">Dining Location</span>
                  <div
                    class="drawer-location-cell"
                    style="display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;"
                  >
                    <span class="drawer-info-value font-bold text-crimson">
                      {{
                        sideOrd.orderType === 'TAKEAWAY'
                          ? 'Takeaway Counter (' +
                            (sideOrd.pickupReference || sideOrd.orderNumber) +
                            ')'
                          : sideOrd.tableNumber
                            ? 'Table ' + sideOrd.tableNumber
                            : 'Unassigned Table'
                      }}
                    </span>
                    @if (!isOrderPaid(sideOrd)) {
                      <button
                        type="button"
                        class="btn-change-table-pill"
                        (click)="openChangeTableModal(sideOrd)"
                        title="Change or allot dining table for this order"
                      >
                        <i class="ph ph-arrows-left-right"></i>
                        <span>{{ sideOrd.tableNumber ? 'Change Table' : 'Allot Table' }}</span>
                      </button>
                    }
                  </div>
                </div>
                <div class="drawer-info-row">
                  <span class="drawer-info-label">Serving Staff</span>
                  @if (isOrderPaid(sideOrd)) {
                    <div class="drawer-server-locked">
                      <span class="font-semibold">
                        <i class="ph ph-lock-key text-muted"></i>
                        {{ getServerStaffName(sideOrd.serverStaffId) || 'Unassigned' }}
                      </span>
                      <button
                        type="button"
                        class="btn-unlock-server"
                        (click)="promptChangeCompletedServer(sideOrd)"
                        title="Change serving staff (Admin Password required)"
                      >
                        <i class="ph ph-lock-key"></i>
                        <span>Change</span>
                      </button>
                    </div>
                  } @else {
                    <div class="drawer-server-select-wrap">
                      <select
                        class="form-select form-select-xs"
                        [ngModel]="sideOrd.serverStaffId || ''"
                        (ngModelChange)="onAssignOrderServer(sideOrd, $event)"
                        title="Assign staff handling this order"
                      >
                        <option value="">Unassigned</option>
                        @for (s of staffMembers(); track s.id) {
                          <option [value]="s.id">{{ s.name }} ({{ s.role }})</option>
                        }
                        @if (sideOrd.serverStaffId && !isStaffInList(sideOrd.serverStaffId)) {
                          <option [value]="sideOrd.serverStaffId">
                            {{ sideOrd.serverStaffId }}
                          </option>
                        }
                      </select>
                    </div>
                  }
                </div>
              </div>
            </div>

            <!-- 2. Billing & Payment Status Card (Unpaid vs Paid vs Completed) -->
            <div class="drawer-section-card billing-card">
              <div class="section-card-header">
                <span class="section-card-title"
                  ><i class="ph ph-receipt"></i> Billing & Payment Status</span
                >
                <span
                  class="payment-status-pill"
                  [class.status-paid]="isOrderPaid(sideOrd)"
                  [class.status-unpaid]="!isOrderPaid(sideOrd)"
                >
                  <i
                    class="ph"
                    [class.ph-check-circle]="isOrderPaid(sideOrd)"
                    [class.ph-warning-circle]="!isOrderPaid(sideOrd)"
                  ></i>
                  {{
                    isOrderPaid(sideOrd)
                      ? 'PAID (' + (sideOrd.paymentMethod || 'PAID') + ')'
                      : 'UNPAID / PENDING'
                  }}
                </span>
              </div>

              <div class="billing-action-content">
                @if (!isOrderPaid(sideOrd) && sideOrd.status !== 'CANCELLED') {
                  <div class="unpaid-alert-banner">
                    <i class="ph ph-info"></i>
                    <div>
                      <strong>Order is Unsettled</strong>
                      <p>
                        Total amount of {{ sideOrd.totalAmount | currencyInr }} is pending
                        collection from guest.
                      </p>
                    </div>
                  </div>

                  <div class="billing-buttons-cluster">
                    <button
                      class="btn btn-primary btn-sm flex-1"
                      (click)="openSettleModal(sideOrd)"
                    >
                      <i class="ph ph-credit-card"></i> Settle Bill
                    </button>
                  </div>
                } @else if (sideOrd.status === 'COMPLETED') {
                  <div class="completed-summary-box">
                    <div class="completed-chips-cluster">
                      <span class="status-chip chip-completed-pill">
                        <i class="ph ph-check-circle"></i> Completed
                      </span>
                      <span class="status-chip chip-paid-pill">
                        <i class="ph ph-money"></i> Paid ({{ sideOrd.paymentMethod || 'PAID' }})
                      </span>
                      <span class="status-chip chip-printed-pill">
                        <i class="ph ph-printer"></i> Printed ({{ sideOrd.printCount || 1 }}x)
                      </span>
                    </div>
                    <p class="text-xs text-muted" style="margin-top: 6px;">
                      Order is completed, settled and invoice printed.
                    </p>
                    <div class="completed-invoice-actions">
                      <button
                        class="btn btn-secondary btn-sm"
                        (click)="handlePrintInvoice(sideOrd)"
                        [disabled]="isNavigatingToInvoice() === sideOrd.id"
                      >
                        @if (isNavigatingToInvoice() === sideOrd.id) {
                          <i class="ph ph-spinner ph-spin"></i>
                          <span>Opening...</span>
                        } @else {
                          <i class="ph ph-printer"></i>
                          <span>Reprint Receipt</span>
                        }
                      </button>
                      <button
                        class="btn btn-whatsapp btn-sm"
                        (click)="openWhatsAppModal(sideOrd)"
                        title="Send Digital Bill via WhatsApp"
                        aria-label="Send Digital Bill via WhatsApp"
                      >
                        <i class="ph ph-whatsapp-logo"></i>
                      </button>
                      <a
                        [routerLink]="['/admin/billing', sideOrd.id]"
                        [queryParams]="
                          sideOrd.printCount && sideOrd.printCount > 0 ? { reprint: 'true' } : null
                        "
                        class="btn btn-secondary btn-sm"
                        (click)="closeOrderSidePanel()"
                      >
                        <i class="ph ph-file-text"></i> Full Tax Invoice
                      </a>
                    </div>
                  </div>
                } @else if (sideOrd.status === 'CANCELLED') {
                  <div class="cancelled-summary-box">
                    <i class="ph ph-x-circle text-crimson"></i>
                    <div>
                      <strong class="text-crimson">Order Cancelled</strong>
                      <p class="text-xs text-muted">
                        This order was cancelled. Invoicing and settlements are disabled.
                      </p>
                    </div>
                  </div>
                } @else {
                  <!-- Paid but not yet marked completed (Needs invoice print) -->
                  <div class="paid-pending-print-box">
                    <p class="text-xs text-muted">
                      Payment of {{ sideOrd.totalAmount | currencyInr }} is collected via
                      {{ sideOrd.paymentMethod || 'PAID' }}. Print invoice to complete order.
                    </p>
                    <div style="display: flex; gap: 8px;">
                      <button
                        class="btn btn-primary btn-sm flex-1"
                        (click)="printOrderReceipt(sideOrd)"
                      >
                        <i class="ph ph-printer"></i> Print Invoice to Complete
                      </button>
                      <button
                        class="btn btn-whatsapp btn-sm"
                        (click)="openWhatsAppModal(sideOrd)"
                        title="Send Bill via WhatsApp"
                        aria-label="Send Bill via WhatsApp"
                      >
                        <i class="ph ph-whatsapp-logo"></i>
                      </button>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- 4. Itemized Bill & Dish Details -->
            <div class="drawer-section-card dishes-card">
              <div class="section-card-header">
                <span class="section-card-title">
                  <i class="ph ph-bowl-food"></i> Itemized Order Bill ({{ sideOrd.items.length }}
                  dishes)
                </span>
                @if (sideOrd.status !== 'CANCELLED' && sideOrd.status !== 'COMPLETED') {
                  <button class="btn btn-secondary btn-xs" (click)="openEditOrderModal(sideOrd)">
                    <i class="ph ph-plus-circle"></i> Add / Edit Dishes
                  </button>
                }
              </div>

              <!-- Item List Table -->
              <div class="drawer-items-list">
                @for (item of sideOrd.items; track item.id) {
                  <div class="drawer-item-row">
                    <div class="item-qty-badge">{{ item.quantity }}×</div>
                    <div class="item-info-col">
                      <span class="item-name-txt">{{ item.name }}</span>
                      <div class="item-sub-tags">
                        @if (item.selectedPortion) {
                          <span class="portion-tag">{{ item.selectedPortion.label }}</span>
                        }
                        @for (v of item.selectedVariants; track v.optionName) {
                          <span class="variant-tag">{{ v.groupName }}: {{ v.optionName }}</span>
                        }
                        @for (a of item.selectedAddons; track a.name || a.addonName || a) {
                          <span class="addon-tag"
                            >+{{ a.name || a.addonName }} (₹{{
                              a.priceDelta || a.price || 0
                            }})</span
                          >
                        }
                        @if (item.specialInstructions || item.customInstructions) {
                          <span class="notes-tag"
                            ><i class="ph ph-chat-text"></i>
                            {{ item.specialInstructions || item.customInstructions }}</span
                          >
                        }
                      </div>
                    </div>
                    <div class="item-price-col">
                      <span class="item-rate">₹{{ item.unitPrice }}</span>
                      <span class="item-total-val font-semibold">₹{{ item.itemTotal }}</span>
                    </div>
                  </div>
                }
              </div>

              <!-- Financial Breakdown -->
              <div class="drawer-financial-summary">
                <div class="fin-row">
                  <span>Subtotal</span>
                  <span>{{ sideOrd.subtotal | currencyInr }}</span>
                </div>
                @if (sideOrd.discountAmount > 0) {
                  <div class="fin-row discount-row">
                    <span
                      >Discount
                      {{
                        sideOrd.appliedCouponCode ? '(' + sideOrd.appliedCouponCode + ')' : ''
                      }}</span
                    >
                    <span class="text-success">-{{ sideOrd.discountAmount | currencyInr }}</span>
                  </div>
                }
                <div class="fin-row">
                  <span>CGST ({{ getOrderCgstRate(sideOrd) }}%)</span>
                  <span>{{ sideOrd.cgstAmount | currencyInr }}</span>
                </div>
                <div class="fin-row">
                  <span>SGST ({{ getOrderSgstRate(sideOrd) }}%)</span>
                  <span>{{ sideOrd.sgstAmount | currencyInr }}</span>
                </div>
                @if (sideOrd.serviceChargeAmount && sideOrd.serviceChargeAmount > 0) {
                  <div class="fin-row">
                    <span>Service Charge</span>
                    <span>{{ sideOrd.serviceChargeAmount | currencyInr }}</span>
                  </div>
                }
                <div class="fin-total-row">
                  <span class="total-lbl">Grand Total</span>
                  <span class="total-amt">{{ sideOrd.totalAmount | currencyInr }}</span>
                </div>
              </div>
            </div>

            <!-- 5. Order Management Utilities & Full Navigation -->
            <div class="drawer-quick-actions">
              <a
                [routerLink]="['/admin/orders', sideOrd.id]"
                class="btn btn-secondary w-full"
                (click)="closeOrderSidePanel()"
              >
                <i class="ph ph-arrow-square-out"></i>
                <span>Open Dedicated Order Page</span>
              </a>

              @if (sideOrd.status !== 'COMPLETED' && sideOrd.status !== 'CANCELLED') {
                <button
                  type="button"
                  class="btn btn-danger-outline w-full"
                  (click)="openCancelModal(sideOrd)"
                >
                  <i class="ph ph-x-circle"></i>
                  <span>Cancel Order</span>
                </button>
              }
            </div>
          </div>
        </aside>
      }

      <!-- Manual Walk-in Order Creation Modal -->
      @if (showManualModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div
            class="modal-card manual-order-modal-canvas"
            role="dialog"
            aria-modal="true"
            (click)="$event.stopPropagation()"
          >
            <div class="modal-header">
              <div class="modal-title-with-icon">
                <div class="icon-circle"><i class="ph ph-receipt"></i></div>
                <div>
                  <h3 class="heading-card">Create Dining &amp; Counter Order</h3>
                  <p class="text-xs text-muted" style="margin: 2px 0 0;">
                    Direct entry for walk-in dining guests or takeaway counter.
                  </p>
                </div>
              </div>
              <button class="close-btn" (click)="showManualModal = false" type="button">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body manual-order-workspace">
              <!-- LEFT SIDE: DISH CATALOG SIDE PANEL -->
              <aside class="pos-dish-catalog-panel">
                <div class="catalog-panel-top">
                  <div class="catalog-search-wrap">
                    <i class="ph ph-magnifying-glass search-ico"></i>
                    <input
                      type="text"
                      class="form-input catalog-search-input"
                      placeholder="Search dishes by name..."
                      [ngModel]="manualDishSearch()"
                      (ngModelChange)="manualDishSearch.set($event)"
                    />
                    @if (manualDishSearch()) {
                      <button
                        type="button"
                        class="search-clear-btn"
                        (click)="manualDishSearch.set('')"
                      >
                        <i class="ph ph-x"></i>
                      </button>
                    }
                  </div>

                  <!-- Category Filter Scroll Chips -->
                  <div class="catalog-cat-chips">
                    <button
                      type="button"
                      class="cat-chip"
                      [class.active]="manualDishCategory() === 'ALL'"
                      (click)="manualDishCategory.set('ALL')"
                    >
                      All ({{ menuItems().length }})
                    </button>
                    @for (cat of categories(); track cat.id) {
                      <button
                        type="button"
                        class="cat-chip"
                        [class.active]="manualDishCategory() === cat.id"
                        (click)="manualDishCategory.set(cat.id)"
                      >
                        {{ cat.name }}
                      </button>
                    }
                  </div>

                  <!-- Dietary Filter Chips -->
                  <div class="catalog-diet-chips">
                    <button
                      type="button"
                      class="diet-filter-pill"
                      [class.active]="manualDishDietary() === 'ALL'"
                      (click)="manualDishDietary.set('ALL')"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      class="diet-filter-pill veg"
                      [class.active]="manualDishDietary() === 'VEG'"
                      (click)="manualDishDietary.set('VEG')"
                    >
                      <span class="diet-dot veg"></span> Veg
                    </button>
                    <button
                      type="button"
                      class="diet-filter-pill non-veg"
                      [class.active]="manualDishDietary() === 'NON_VEG'"
                      (click)="manualDishDietary.set('NON_VEG')"
                    >
                      <span class="diet-dot non-veg"></span> Non-Veg
                    </button>
                  </div>
                </div>

                <!-- Dish List / Grid Stream -->
                <div class="catalog-dishes-stream">
                  @for (dish of filteredManualDishes(); track dish.id) {
                    @let inTray = getItemCountInManualOrder(dish.id);
                    @let avail = getDishAvailability(dish.id);
                    <div
                      class="pos-dish-card"
                      [class.in-tray]="inTray > 0"
                      [class.is-out-of-stock]="avail === 'OUT_OF_STOCK' || !dish.isAvailable"
                      (click)="
                        avail !== 'OUT_OF_STOCK' && dish.isAvailable && addDishToManualOrder(dish)
                      "
                    >
                      <div class="dish-card-details">
                        <div class="dish-name-row">
                          <app-dietary-badge [type]="dish.dietary"></app-dietary-badge>
                          <span class="dish-title">{{ dish.name }}</span>
                        </div>
                        <div class="dish-sub-row">
                          <strong class="dish-cost">{{ dish.price | currencyInr }}</strong>
                          @if (avail === 'LOW_STOCK') {
                            <span class="stock-tag low">Low Stock</span>
                          } @else if (avail === 'OUT_OF_STOCK' || !dish.isAvailable) {
                            <span class="stock-tag out">Out of Stock</span>
                          }
                        </div>
                      </div>

                      <div class="dish-card-action">
                        @if (inTray > 0) {
                          <span class="tray-counter-pill">{{ inTray }} in tray</span>
                        }
                        <button
                          type="button"
                          class="quick-add-btn"
                          [disabled]="avail === 'OUT_OF_STOCK' || !dish.isAvailable"
                          title="Add dish to order"
                        >
                          <i class="ph ph-plus"></i>
                        </button>
                      </div>
                    </div>
                  } @empty {
                    <div class="empty-catalog-msg">
                      <i class="ph ph-magnifying-glass"></i>
                      <p>No dishes match filter.</p>
                    </div>
                  }
                </div>
              </aside>

              <!-- RIGHT SIDE: ORDER DETAILS & TRAY SUMMARY -->
              <section class="pos-order-summary-panel">
                <!-- Dining Context & Guest Details -->
                <div class="pos-context-card">
                  <!-- Order Type Segmented Switcher (Dine-In vs Takeaway / Counter) -->
                  <div class="pos-order-type-segmented">
                    <button
                      type="button"
                      class="type-seg-btn"
                      [class.active]="manualOrderType === 'DINE_IN'"
                      (click)="manualOrderType = 'DINE_IN'"
                    >
                      <i class="ph ph-fork-knife"></i>
                      <span>Dine-In Table</span>
                    </button>
                    <button
                      type="button"
                      class="type-seg-btn"
                      [class.active]="manualOrderType === 'TAKEAWAY'"
                      [class.disabled]="!isTakeawayEnabled()"
                      [disabled]="!isTakeawayEnabled()"
                      (click)="setManualOrderTypeTakeaway()"
                    >
                      <i class="ph ph-bag"></i>
                      <span>Takeaway / Counter</span>
                    </button>
                  </div>

                  <!-- Active Table Showcase & Switcher (When Dine-In) -->
                  @if (manualOrderType === 'DINE_IN') {
                    <div class="table-assignment-banner">
                      <div class="assignment-meta">
                        <div class="assignment-label-row">
                          <span class="context-eyebrow">
                            <i class="ph ph-armchair"></i> Assigned Table
                          </span>
                          @if (selectedManualTable(); as tbl) {
                            <span class="table-status-pill" [class]="tbl.status.toLowerCase()">
                              <span class="status-dot"></span> {{ tbl.status }}
                            </span>
                          }
                        </div>

                        @if (selectedManualTable(); as tbl) {
                          <div class="selected-table-showcase">
                            <span class="tbl-badge">Table {{ tbl.number }}</span>
                            <span class="tbl-detail-pill">
                              <i class="ph ph-map-pin"></i> {{ tbl.section }}
                            </span>
                            <span class="tbl-detail-pill">
                              <i class="ph ph-users"></i> {{ tbl.capacity }} Seats
                            </span>
                          </div>
                        }
                      </div>

                      <div class="table-picker-control">
                        <label class="picker-label" for="manualOrderTableSelect"
                          >Change Table</label
                        >
                        <select
                          id="manualOrderTableSelect"
                          class="form-select custom-table-select"
                          [ngModel]="manualTableId()"
                          (ngModelChange)="manualTableId.set($event)"
                        >
                          <option value="" disabled>-- Select Table --</option>
                          @for (tbl of tables(); track tbl.id) {
                            <option [value]="tbl.id">
                              Table {{ tbl.number }} ({{ tbl.section }} • {{ tbl.capacity }}p) —
                              {{ tbl.status }}
                            </option>
                          }
                        </select>
                      </div>
                    </div>
                  } @else {
                    <!-- Takeaway Showcase Banner -->
                    <div class="table-assignment-banner takeaway-banner">
                      <div class="assignment-meta">
                        <div class="assignment-label-row">
                          <span class="context-eyebrow">
                            <i class="ph ph-bag"></i> Takeaway / Pickup
                          </span>
                          <span class="table-status-pill takeaway-pill">
                            <span class="status-dot"></span> Counter Order
                          </span>
                        </div>
                        <div class="selected-table-showcase">
                          <span class="tbl-badge takeaway-ref-badge">#{{ manualPickupRef }}</span>
                          <span class="tbl-detail-pill">
                            <i class="ph ph-storefront"></i> Front Counter
                          </span>
                          <span class="tbl-detail-pill">
                            <i class="ph ph-clock"></i> Immediate Prep
                          </span>
                        </div>
                      </div>

                      <div class="table-picker-control">
                        <label class="picker-label">Pickup Reference</label>
                        <input
                          type="text"
                          class="form-input custom-input takeaway-ref-input"
                          [value]="manualPickupRef"
                          readonly
                        />
                      </div>
                    </div>
                  }

                  <!-- Guest Information Inputs -->
                  <div class="guest-details-grid">
                    <div class="form-group compact">
                      <label class="form-label-compact" for="manualOrderCustName">
                        <i class="ph ph-user"></i> Guest Name
                      </label>
                      <div class="input-icon-wrap">
                        <i class="ph ph-user-circle input-prefix-icon"></i>
                        <input
                          id="manualOrderCustName"
                          type="text"
                          class="form-input custom-input"
                          [placeholder]="
                            manualOrderType === 'TAKEAWAY'
                              ? 'e.g. Rahul Verma (optional)'
                              : 'e.g. Rahul Verma / Walk-in'
                          "
                          [(ngModel)]="manualCustomerName"
                        />
                      </div>
                    </div>
                    <div class="form-group compact">
                      <label class="form-label-compact" for="manualOrderCustPhone">
                        <i class="ph ph-phone"></i> Guest Phone
                      </label>
                      <div class="input-icon-wrap">
                        <i class="ph ph-phone-call input-prefix-icon"></i>
                        <input
                          id="manualOrderCustPhone"
                          type="tel"
                          class="form-input custom-input"
                          placeholder="+91 98765 00000 (optional)"
                          [(ngModel)]="manualCustomerPhone"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Selected Items List -->
                <div class="manual-items-box">
                  <div class="tray-header">
                    <div class="tray-title-group">
                      <span class="tray-title">Order Items Tray</span>
                      <span class="tray-badge" [class.has-items]="manualItems.length > 0">
                        {{ manualItems.length }} {{ manualItems.length === 1 ? 'item' : 'items' }}
                      </span>
                    </div>
                    @if (manualItems.length > 0) {
                      <button
                        type="button"
                        class="clear-tray-btn"
                        (click)="clearManualTray()"
                        title="Clear all dishes from tray"
                      >
                        <i class="ph ph-trash"></i>
                        <span>Clear Tray</span>
                      </button>
                    }
                  </div>

                  @if (manualItems.length === 0) {
                    <div class="empty-tray-state">
                      <div class="empty-tray-icon">
                        <i class="ph ph-hand-pointing"></i>
                      </div>
                      <h4 class="empty-tray-title">Tray is empty</h4>
                      <p class="empty-tray-subtitle">
                        Click any dish from the catalog on the left to add it to this order.
                      </p>
                    </div>
                  } @else {
                    <div class="manual-items-table custom-scrollbar">
                      @for (item of manualItems; track item.id; let idx = $index) {
                        <div class="m-item-row">
                          <div class="m-item-details">
                            <strong class="m-item-title">{{ item.name }}</strong>
                            <span class="m-item-rate">{{ item.unitPrice | currencyInr }} each</span>
                          </div>

                          <div class="m-qty-stepper">
                            <button
                              type="button"
                              class="stepper-btn minus"
                              (click)="updateManualItemQty(item, -1)"
                              title="Decrease"
                            >
                              <i class="ph ph-minus"></i>
                            </button>
                            <span class="stepper-count">{{ item.quantity }}</span>
                            <button
                              type="button"
                              class="stepper-btn plus"
                              (click)="updateManualItemQty(item, 1)"
                              title="Increase"
                            >
                              <i class="ph ph-plus"></i>
                            </button>
                          </div>

                          <div class="m-item-right">
                            <span class="m-item-total">{{ item.itemTotal | currencyInr }}</span>
                            <button
                              type="button"
                              class="m-remove-btn"
                              (click)="removeManualItem(idx)"
                              title="Remove {{ item.name }}"
                            >
                              <i class="ph ph-x"></i>
                            </button>
                          </div>
                        </div>
                      }
                    </div>

                    <div class="order-math-summary">
                      <div class="math-row">
                        <span class="math-label">Item Subtotal</span>
                        <strong class="math-value">{{ manualSubtotal() | currencyInr }}</strong>
                      </div>
                      <div class="math-row tax-line">
                        <span class="math-label">
                          <span>Taxes &amp; Levies</span>
                          <span class="tax-rate-pill">
                            CGST {{ restaurant()?.taxSettings?.cgstRate ?? 2.5 }}% + SGST
                            {{ restaurant()?.taxSettings?.sgstRate ?? 2.5 }}%
                          </span>
                        </span>
                        <span class="math-value">{{ manualTax() | currencyInr }}</span>
                      </div>
                      <div class="math-divider"></div>
                      <div class="math-row total-highlight">
                        <div class="total-text-group">
                          <span class="total-main-label">Net Payable Total</span>
                          <span class="total-sub-label">Includes all taxes &amp; fees</span>
                        </div>
                        <span class="total-grand-amount">{{ manualTotal() | currencyInr }}</span>
                      </div>
                    </div>
                  }
                </div>
              </section>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showManualModal = false">Cancel</button>
              <button
                class="btn btn-primary"
                (click)="submitManualOrder()"
                [disabled]="manualItems.length === 0"
              >
                <i class="ph ph-check"></i>
                <span>Dispatch Order ({{ manualTotal() | currencyInr }})</span>
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Reallot / Change Table Modal -->
      @if (showChangeTableModal() && orderForTableChange(); as changeOrd) {
        <div class="modal-overlay" (click)="closeChangeTableModal()">
          <div
            class="modal-card reallot-table-modal"
            (click)="$event.stopPropagation()"
            role="dialog"
            aria-modal="true"
          >
            <div class="modal-header">
              <div>
                <h3 class="heading-card">Change / Allot Dining Table</h3>
                <p class="text-xs text-muted" style="margin-top: 2px;">
                  Order <strong>{{ changeOrd.orderNumber }}</strong> ({{
                    changeOrd.customerName || 'Guest'
                  }}) • Currently:
                  <strong>{{
                    changeOrd.tableNumber
                      ? 'Table ' + changeOrd.tableNumber
                      : 'Unassigned / Counter'
                  }}</strong>
                </p>
              </div>
              <button class="close-btn" (click)="closeChangeTableModal()">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body" style="padding: 20px;">
              <div class="form-group">
                <label
                  class="form-label"
                  style="font-weight: 600; margin-bottom: 8px; display: block;"
                  >Select Destination Table *</label
                >
                <select
                  class="form-select"
                  [ngModel]="selectedNewTableId()"
                  (ngModelChange)="selectedNewTableId.set($event)"
                  style="width: 100%; padding: 10px 12px; font-size: 0.9375rem; border-radius: 8px;"
                >
                  <option value="" disabled>-- Choose Table --</option>
                  @for (tbl of tables(); track tbl.id) {
                    <option [value]="tbl.id" [disabled]="tbl.id === changeOrd.tableId">
                      Table {{ tbl.number }} ({{ tbl.section }}) — {{ tbl.status }} •
                      {{ tbl.capacity }} Seats
                      {{ tbl.id === changeOrd.tableId ? ' [Current Table]' : '' }}
                    </option>
                  }
                </select>
                <p class="text-xs text-muted" style="margin-top: 8px;">
                  Select a table to assign. The guest order and dining bill will immediately
                  transfer to the selected table.
                </p>
              </div>
            </div>

            <div
              class="modal-footer"
              style="padding: 16px 20px; display: flex; justify-content: flex-end; gap: 10px;"
            >
              <button class="btn btn-secondary" (click)="closeChangeTableModal()">Cancel</button>
              <button
                class="btn btn-primary"
                [disabled]="!selectedNewTableId() || selectedNewTableId() === changeOrd.tableId"
                (click)="confirmChangeTable()"
              >
                <i class="ph ph-arrows-left-right"></i>
                <span>Assign Order to Table</span>
              </button>
            </div>
          </div>
        </div>
      }
      @if (showSettleModal() && selectedOrderForSettlement(); as ord) {
        <div class="modal-overlay" (click)="onBackdropClick($event, 'settle')">
          <div
            class="modal-card settle-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settle-order-title"
          >
            <div class="modal-header">
              <div>
                <h3 id="settle-order-title" class="heading-card">
                  {{
                    ord.isSplit
                      ? 'Split Bills Settlement'
                      : ord.orderType === 'TAKEAWAY'
                        ? 'Settle Takeaway Bill'
                        : 'Settle Dining Bill'
                  }}
                </h3>
                <span class="text-xs text-muted"
                  >{{ ord.orderNumber }} •
                  {{
                    ord.orderType === 'TAKEAWAY'
                      ? 'Takeaway (' + (ord.pickupReference || ord.orderNumber) + ')'
                      : 'Table ' + ord.tableNumber
                  }}</span
                >
              </div>
              <button
                class="close-btn"
                (click)="closeSettleModal()"
                aria-label="Close settle modal"
              >
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <!-- Mode Tabs if order is not split yet -->
              @if (!ord.isSplit && getOrderSplitBills(ord.id).length === 0) {
                <div class="settle-mode-tabs">
                  <button
                    type="button"
                    class="mode-tab-btn"
                    [class.active]="settleMode() === 'FULL'"
                    (click)="settleMode.set('FULL')"
                  >
                    <i class="ph ph-receipt"></i>
                    <span>Full Bill Settle</span>
                  </button>
                  <button
                    type="button"
                    class="mode-tab-btn"
                    [class.active]="settleMode() === 'SPLIT'"
                    (click)="settleMode.set('SPLIT')"
                  >
                    <i class="ph ph-split-horizontal"></i>
                    <span>Split Bill (Equal)</span>
                  </button>
                </div>
              }

              <!-- 1. FULL BILL SETTLEMENT VIEW -->
              @if (!ord.isSplit && settleMode() === 'FULL') {
                <div class="settle-summary-box">
                  <div class="settle-row">
                    <span>Guest Name</span>
                    <strong>{{ ord.customerName }}</strong>
                  </div>

                  <!-- Itemized dishes breakdown -->
                  <div class="settle-items-section">
                    <div class="settle-items-header">
                      <span>Ordered Dishes</span>
                      <span class="text-xs text-muted"
                        >{{ getSettlementItems(ord).length }} items</span
                      >
                    </div>
                    <div class="settle-items-list">
                      @for (item of getSettlementItems(ord); track $index) {
                        <div class="settle-item-row">
                          <div class="settle-item-left">
                            <span class="item-qty-pill">{{ item.quantity }}x</span>
                            <div class="item-text-group">
                              <span class="item-name-text">{{ item.name }}</span>
                              @if (item.notes || item.specialInstructions) {
                                <span class="item-instruction-text">{{
                                  item.notes || item.specialInstructions
                                }}</span>
                              }
                            </div>
                          </div>
                          <span class="item-total-price">{{
                            item.itemTotal || item.unitPrice * item.quantity | currencyInr
                          }}</span>
                        </div>
                      }
                    </div>
                  </div>

                  <div class="settle-divider"></div>

                  <div class="settle-row">
                    <span>Item Subtotal</span>
                    <span class="font-semibold">{{ ord.subtotal | currencyInr }}</span>
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
                    <span>Net Payable Total</span>
                    <span class="amount-large">{{ getSettlementTotal(ord) | currencyInr }}</span>
                  </div>
                </div>

                <!-- Counter Discount & Coupons Block -->
                <div class="settle-discount-card">
                  <div class="discount-header-row">
                    <span class="discount-title">
                      <i class="ph ph-tag"></i> Discount & Offers
                    </span>
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
                          [max]="ord.subtotal + ord.taxAmount"
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
                          <button
                            type="button"
                            class="btn-disc-clear-pill"
                            (click)="clearDiscount()"
                          >
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
              }

              <!-- 2. SPLIT BILL CREATION VIEW -->
              @if (!ord.isSplit && settleMode() === 'SPLIT') {
                <div class="split-create-workspace">
                  <div class="settle-row total-highlight" style="margin-bottom: 12px;">
                    <span>Total Bill to Split:</span>
                    <strong class="text-crimson" style="font-size: 1.15rem;">{{
                      ord.totalAmount | currencyInr
                    }}</strong>
                  </div>

                  <div class="split-stepper-box">
                    <span class="stepper-label">Number of Split Bills</span>
                    <div class="stepper-controls">
                      <button
                        type="button"
                        class="stepper-btn"
                        (click)="decrementSplitCount()"
                        [disabled]="splitCount() <= 2"
                      >
                        -
                      </button>
                      <span class="stepper-val">{{ splitCount() }} Bills</span>
                      <button
                        type="button"
                        class="stepper-btn"
                        (click)="incrementSplitCount()"
                        [disabled]="splitCount() >= 6"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div class="split-preview-grid">
                    @for (idx of getSplitPreviewIndices(); track idx) {
                      <div class="split-preview-item">
                        <span class="p-num">Part #{{ idx + 1 }}</span>
                        <strong class="p-val">{{
                          getEqualSplitPartAmount(ord, idx) | currencyInr
                        }}</strong>
                      </div>
                    }
                  </div>

                  <p class="text-xs text-muted" style="margin-top: 10px;">
                    Splitting will create {{ splitCount() }} independent payable bills for
                    individual guests at this table.
                  </p>
                </div>
              }

              <!-- 3. SPLIT BILLS MANAGEMENT & SETTLEMENT VIEW -->
              @if (ord.isSplit) {
                <div class="split-bills-live-box">
                  <div class="split-banner-notice">
                    <i class="ph ph-split-horizontal"></i>
                    <span
                      >This dining order is split into
                      {{ getOrderSplitBills(ord.id).length }} individual bills.</span
                    >
                  </div>

                  <div class="split-cards-stream">
                    @for (split of getOrderSplitBills(ord.id); track split.id) {
                      <div class="split-card-row" [class.is-paid]="split.paymentStatus === 'PAID'">
                        <div class="split-card-info">
                          <strong
                            >Part #{{ split.splitIndex }} of {{ split.splitTotalCount }}</strong
                          >
                          <span class="split-amount">{{ split.totalAmount | currencyInr }}</span>
                        </div>
                        <div class="split-card-actions">
                          @if (split.paymentStatus === 'PAID') {
                            <span class="badge badge-success"
                              ><i class="ph ph-check"></i> Paid ({{
                                split.paymentMethod || 'PAID'
                              }})</span
                            >
                          } @else {
                            <button
                              type="button"
                              class="btn btn-secondary btn-xs"
                              (click)="settleSplitPart(ord, split, 'UPI')"
                              [disabled]="isSettling()"
                              title="Settle with UPI"
                            >
                              <i class="ph ph-qr-code"></i> UPI
                            </button>
                            <button
                              type="button"
                              class="btn btn-secondary btn-xs"
                              (click)="settleSplitPart(ord, split, 'CASH')"
                              [disabled]="isSettling()"
                              title="Settle with Cash"
                            >
                              <i class="ph ph-money"></i> Cash
                            </button>
                            <button
                              type="button"
                              class="btn btn-secondary btn-xs"
                              (click)="settleSplitPart(ord, split, 'CARD')"
                              [disabled]="isSettling()"
                              title="Settle with Card"
                            >
                              <i class="ph ph-credit-card"></i> Card
                            </button>
                          }
                        </div>
                      </div>
                    }
                  </div>

                  @if (areAllSplitBillsPaid(ord.id)) {
                    <div class="alert-box success" style="margin-top: 12px;">
                      <i class="ph ph-check-circle"></i>
                      <span>All split parts have been paid in full! Ready to complete order.</span>
                    </div>
                  }
                </div>
              }
            </div>

            <div class="modal-footer">
              <div class="footer-left-action">
                <button
                  type="button"
                  class="btn btn-ghost text-crimson"
                  (click)="switchFromSettleToCancel(ord)"
                >
                  <i class="ph ph-x-circle"></i>
                  <span>Cancel Order</span>
                </button>
              </div>

              <div class="footer-right-actions">
                <button
                  class="btn btn-secondary"
                  (click)="closeSettleModal()"
                  [disabled]="isSettling()"
                >
                  Close
                </button>

                @if (!ord.isSplit && settleMode() === 'FULL') {
                  <button
                    class="btn btn-primary"
                    (click)="confirmSettlement()"
                    [disabled]="isSettling()"
                  >
                    @if (isSettling()) {
                      <i class="ph ph-spinner ph-spin"></i>
                      <span>Settling & Generating Invoice...</span>
                    } @else {
                      <i class="ph ph-check"></i>
                      <span>Confirm {{ selectedPaymentMethod() }} Settlement</span>
                    }
                  </button>
                }

                @if (!ord.isSplit && settleMode() === 'SPLIT') {
                  <button
                    class="btn btn-primary"
                    (click)="confirmCreateSplit(ord)"
                    [disabled]="isSettling()"
                  >
                    <i class="ph ph-split-horizontal"></i>
                    <span>Divide Bill into {{ splitCount() }} Parts</span>
                  </button>
                }

                @if (ord.isSplit) {
                  @if (areAllSplitBillsPaid(ord.id)) {
                    <button
                      class="btn btn-success"
                      (click)="confirmSettlement()"
                      [disabled]="isSettling()"
                    >
                      @if (isSettling()) {
                        <i class="ph ph-spinner ph-spin"></i>
                        <span>Finalizing Order...</span>
                      } @else {
                        <i class="ph ph-check-circle"></i>
                        <span>{{
                          ord.orderType === 'TAKEAWAY'
                            ? 'Complete Order'
                            : 'Complete Order & Release Table'
                        }}</span>
                      }
                    </button>
                  } @else {
                    <button
                      class="btn btn-primary"
                      (click)="settleAllSplitParts(ord)"
                      [disabled]="isSettling()"
                    >
                      @if (isSettling()) {
                        <i class="ph ph-spinner ph-spin"></i>
                        <span>Settling Split Bills...</span>
                      } @else {
                        <i class="ph ph-check-double"></i>
                        <span>Settle All Remaining ({{ selectedPaymentMethod() }})</span>
                      }
                    </button>
                  }
                }
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Cancel Order Confirmation Modal -->
      @if (showCancelModal() && orderToCancel(); as ord) {
        <div class="modal-overlay" (click)="onBackdropClick($event, 'cancel')">
          <div
            class="modal-card cancel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-order-title"
          >
            <div class="modal-header">
              <div class="cancel-header-group">
                <div class="cancel-icon-circle"><i class="ph ph-warning-circle"></i></div>
                <div>
                  <h3 id="cancel-order-title" class="heading-card">
                    {{
                      ord.orderType === 'TAKEAWAY' ? 'Cancel Takeaway Order' : 'Cancel Dining Order'
                    }}
                  </h3>
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
              <button
                class="close-btn"
                (click)="closeCancelModal()"
                aria-label="Close cancel dialog"
              >
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <div class="cancel-warning-box">
                <i class="ph ph-shield-warning"></i>
                <div>
                  <strong>{{
                    ord.orderType === 'TAKEAWAY'
                      ? 'Kitchen stock release'
                      : 'Kitchen stock & table occupancy release'
                  }}</strong>
                  <p class="text-xs">
                    {{
                      ord.orderType === 'TAKEAWAY'
                        ? 'Cancelling will release reserved ingredients back to stock.'
                        : 'Cancelling will release reserved ingredients back to stock and immediately mark Table ' +
                          ord.tableNumber +
                          ' as available for new guests.'
                    }}
                  </p>
                </div>
              </div>

              <div class="cancel-order-chip">
                <span
                  >Guest: <strong>{{ ord.customerName }}</strong></span
                >
                <span class="sep-dot">•</span>
                <span
                  >Items: <strong>{{ ord.items.length }}</strong></span
                >
                <span class="sep-dot">•</span>
                <span
                  >Bill Total:
                  <strong class="text-crimson">{{ ord.totalAmount | currencyInr }}</strong></span
                >
              </div>

              <div class="form-group">
                <label class="form-label">Reason for Cancellation *</label>
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
                  placeholder="Or enter specific reason for cancellation audit log..."
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
                Keep Order
              </button>
              <button
                class="btn btn-danger"
                (click)="confirmCancelOrder()"
                [disabled]="isCancelling() || !cancellationReason().trim()"
              >
                @if (isCancelling()) {
                  <span>Cancelling...</span>
                } @else {
                  <i class="ph ph-trash"></i>
                  <span>Confirm Cancellation</span>
                }
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Admin Password Authorization Modal for Paid Orders -->
      @if (showAdminPasswordModal() && pendingEditOrder(); as pendingOrd) {
        <div class="modal-overlay" (click)="onBackdropClick($event, 'admin-password')">
          <div
            class="modal-card auth-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-auth-dialog-title"
          >
            <div class="modal-header">
              <div class="auth-modal-title-wrap">
                <div class="auth-icon-badge">
                  <i class="ph ph-shield-lock"></i>
                </div>
                <div>
                  <h3 id="admin-auth-dialog-title" class="heading-card">Admin Password Required</h3>
                  <span class="text-xs text-muted"
                    >Supervisor authorization for settled order {{ pendingOrd.orderNumber }}</span
                  >
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
                <p>
                  Order <strong>{{ pendingOrd.orderNumber }}</strong> (Table
                  {{ pendingOrd.tableNumber }}) has already been
                  <span class="paid-tag">PAID & SETTLED</span>. Modifying items, quantities, or
                  prices alters financial invoices and sales records.
                </p>
              </div>

              <div class="form-group">
                <label class="form-label" for="adminQueuePassword"
                  >Enter Admin Password / Staff PIN</label
                >
                <div class="input-with-icon">
                  <i class="ph ph-lock-key"></i>
                  <input
                    id="adminQueuePassword"
                    type="password"
                    class="form-input"
                    placeholder="Enter password or 4-digit PIN..."
                    [value]="adminPasswordInput()"
                    (input)="adminPasswordInput.set($any($event.target).value)"
                    (keyup.enter)="verifyAdminPasswordForEdit()"
                    autocomplete="current-password"
                    autofocus
                  />
                </div>
                <span class="hint-text"
                  >Staff/Manager PIN: <strong>1234</strong> or password <strong>admin</strong></span
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
              <button type="button" class="btn btn-secondary" (click)="cancelAdminPasswordModal()">
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="!adminPasswordInput().trim()"
                (click)="verifyAdminPasswordForEdit()"
              >
                <i class="ph ph-lock-key-open"></i>
                <span>Authorize & Edit</span>
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Admin Password Authorization Modal for Changing Server on Completed Order -->
      @if (showServerAdminModal() && pendingServerOrder(); as serverOrd) {
        <div class="modal-overlay" (click)="onBackdropClick($event, 'server-admin-password')">
          <div
            class="modal-card auth-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="server-admin-dialog-title"
          >
            <div class="modal-header">
              <div class="auth-modal-title-wrap">
                <div class="auth-icon-badge">
                  <i class="ph ph-shield-lock"></i>
                </div>
                <div>
                  <h3 id="server-admin-dialog-title" class="heading-card">
                    Admin Password Required
                  </h3>
                  <span class="text-xs text-muted"
                    >Authorization required to change serving staff for completed order
                    {{ serverOrd.orderNumber }}</span
                  >
                </div>
              </div>
              <button class="close-btn" (click)="closeServerAdminModal()" aria-label="Close dialog">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body auth-dialog-body">
              <div class="auth-warning-box">
                <i class="ph ph-warning-circle"></i>
                <p>
                  Order <strong>{{ serverOrd.orderNumber }}</strong> is finalized and completed.
                  Changing the assigned serving staff impacts service records, audit logs, and tip
                  distribution.
                </p>
              </div>

              <div class="form-group">
                <label class="form-label" for="newServerSelect">Select New Serving Staff</label>
                <select
                  id="newServerSelect"
                  class="form-select"
                  [value]="selectedNewStaffId()"
                  (change)="selectedNewStaffId.set($any($event.target).value)"
                >
                  <option value="">Unassigned</option>
                  @for (s of staffMembers(); track s.id) {
                    <option [value]="s.id">{{ s.name }} ({{ s.role }})</option>
                  }
                  @if (selectedNewStaffId() && !isStaffInList(selectedNewStaffId())) {
                    <option [value]="selectedNewStaffId()">{{ selectedNewStaffId() }}</option>
                  }
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="serverAdminPassword"
                  >Enter Admin Password / Staff PIN</label
                >
                <div class="input-with-icon">
                  <i class="ph ph-lock-key"></i>
                  <input
                    id="serverAdminPassword"
                    type="password"
                    class="form-input"
                    placeholder="Enter password or 4-digit PIN..."
                    [value]="serverAdminPasswordInput()"
                    (input)="serverAdminPasswordInput.set($any($event.target).value)"
                    (keyup.enter)="confirmChangeCompletedServer()"
                    autocomplete="current-password"
                    autofocus
                  />
                </div>
                <span class="hint-text"
                  >Staff/Manager PIN: <strong>1234</strong> or password <strong>admin</strong></span
                >
              </div>

              @if (serverAdminPasswordError()) {
                <div class="auth-error-banner">
                  <i class="ph ph-warning-circle"></i>
                  <span>{{ serverAdminPasswordError() }}</span>
                </div>
              }
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="closeServerAdminModal()">
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="!serverAdminPasswordInput().trim()"
                (click)="confirmChangeCompletedServer()"
              >
                <i class="ph ph-lock-key-open"></i>
                <span>Authorize & Reassign Staff</span>
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Edit Order & Add Dishes Modal -->
      @if (showEditModal() && editingOrder(); as ord) {
        <div class="modal-overlay" (click)="onBackdropClick($event, 'edit')">
          <div
            class="modal-card edit-queue-order-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-queue-order-title"
          >
            <div class="modal-header">
              <div>
                <h3 id="edit-queue-order-title" class="heading-card">
                  Edit Order {{ ord.orderNumber }}
                </h3>
                <span class="text-xs text-muted"
                  >Table {{ ord.tableNumber }} • Add further dishes or adjust items</span
                >
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

            <div class="modal-body edit-queue-workspace">
              <!-- Left: Catalog Dish Picker -->
              <div class="edit-catalog-col">
                <div class="box-title">Add Dishes From Catalog</div>
                <div class="catalog-search-wrap">
                  <i class="ph ph-magnifying-glass"></i>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="Search menu to add dishes..."
                    [ngModel]="editDishSearch()"
                    (ngModelChange)="editDishSearch.set($event)"
                  />
                </div>

                <div class="catalog-items-grid">
                  @for (dish of filteredEditMenuItems(); track dish.id) {
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
                        title="Add dish to order"
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
                  <div class="form-group">
                    <label class="form-label">Dining Table</label>
                    <select
                      class="form-select"
                      [ngModel]="editTableId()"
                      (ngModelChange)="editTableId.set($event)"
                    >
                      <option value="">-- No Table / Takeaway --</option>
                      @for (tbl of tables(); track tbl.id) {
                        <option [value]="tbl.id">
                          Table {{ tbl.number }} ({{ tbl.section }}) — {{ tbl.status }}
                        </option>
                      }
                    </select>
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
                    <span>GST ({{ getOrderCgstRate(ord) + getOrderSgstRate(ord) }}%)</span>
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

      <!-- WhatsApp Delivery Modal (Apple Fluid Design) -->
      @if (showWhatsAppModal() && whatsAppOrder(); as ord) {
        <div class="modal-overlay" (click)="onBackdropClick($event, 'whatsapp')">
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
                    <span
                      class="badge-gateway-chip"
                      [class.is-connected]="whatsAppBridge.connectionStatus() === 'CONNECTED'"
                    >
                      <span class="dot-indicator"></span>
                      {{
                        whatsAppBridge.connectionStatus() === 'CONNECTED'
                          ? 'DIRECT GATEWAY'
                          : 'WEB FALLBACK'
                      }}
                    </span>
                  </div>
                  <span class="text-xs text-muted">
                    {{ ord.orderNumber }} • Table {{ ord.tableNumber || 'Dine-In' }}
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
                  <label class="form-label font-bold" for="oq-wa-phone">
                    <i class="ph ph-phone text-whatsapp"></i> Customer WhatsApp Number
                  </label>
                  @if (authService.isAdmin()) {
                    <span
                      class="admin-verified-pill"
                      title="Administrator access permitted to change recipient"
                    >
                      <i class="ph ph-shield-check"></i> Admin Editable
                    </span>
                  } @else {
                    <span
                      class="admin-locked-pill"
                      title="Only Admin can modify customer phone number"
                    >
                      <i class="ph ph-lock-key"></i> Admin Protected
                    </span>
                  }
                </div>

                <div class="input-with-icon">
                  <i class="ph ph-phone"></i>
                  <input
                    id="oq-wa-phone"
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
                    <i
                      class="ph ph-lock-key lock-status-icon"
                      title="Only Admins can modify phone number"
                    ></i>
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
              <button
                type="button"
                class="btn btn-secondary btn-apple-cancel"
                (click)="closeWhatsAppModal()"
              >
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
      .ph-spin {
        animation: spin 0.8s linear infinite;
        display: inline-block;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      button:active:not(:disabled) {
        transform: scale(0.98);
        transition: transform 0.08s cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .orders-page {
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

      .live-counter-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--color-success-bg);
        border: 1px solid rgba(27, 99, 62, 0.25);
        color: var(--color-success);
        padding: 6px 14px;
        border-radius: var(--radius-full);
        font-size: 0.8125rem;
        font-weight: 700;
        transition: all var(--transition-fast);

        &.offline {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.3);
          color: var(--color-danger);

          .pulse-indicator {
            background: var(--color-danger);
            animation: none;
            box-shadow: none;
          }
        }
      }

      .pulse-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-success);
        animation: pulseGlow 1.5s infinite;

        &.offline {
          background: var(--color-danger);
          animation: none;
          box-shadow: none;
        }
      }

      @keyframes pulseGlow {
        0% {
          box-shadow: 0 0 0 0 rgba(27, 99, 62, 0.7);
        }
        70% {
          box-shadow: 0 0 0 8px rgba(27, 99, 62, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(27, 99, 62, 0);
        }
      }

      .sound-toggle-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-onyx);
        cursor: pointer;
        font-size: 1.15rem;
        transition: all var(--transition-fast);

        &:hover {
          background: var(--color-bone-light);
          border-color: var(--color-onyx);
        }
        &.muted {
          color: var(--color-text-muted);
          background: var(--color-bone-light);
        }
      }

      .completed-order-badge-strip {
        padding: 8px 12px;
        background: rgba(27, 99, 62, 0.08);
        border: 1px solid rgba(27, 99, 62, 0.2);
        border-radius: var(--radius-sm);
        margin-bottom: 6px;
      }

      .completed-chips-cluster {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .chip-completed-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        background: var(--color-success);
        color: #ffffff;
        border-radius: var(--radius-full);
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.02em;
      }

      .chip-paid-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        background: rgba(27, 99, 62, 0.15);
        color: var(--color-success);
        border: 1px solid rgba(27, 99, 62, 0.3);
        border-radius: var(--radius-full);
        font-size: 0.75rem;
        font-weight: 700;
      }

      .chip-printed-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        background: rgba(184, 134, 11, 0.12);
        color: #8b6508;
        border: 1px solid rgba(184, 134, 11, 0.3);
        border-radius: var(--radius-full);
        font-size: 0.75rem;
        font-weight: 700;
      }

      .tab-live-dot {
        display: inline-block;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #10b981;
        margin-right: 6px;
        box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.3);
        animation: pulseGlow 1.5s infinite;
      }

      .order-board-card.new-order-flash {
        animation: cardNewOrderFlash 2s ease-in-out infinite alternate;
        border-color: #d4af37 !important;
      }

      @keyframes cardNewOrderFlash {
        0% {
          box-shadow:
            0 0 0 2px #d4af37,
            0 8px 24px rgba(212, 175, 55, 0.25);
          transform: translateY(-2px);
        }
        100% {
          box-shadow:
            0 0 0 1px rgba(212, 175, 55, 0.3),
            0 2px 8px rgba(0, 0, 0, 0.05);
          transform: translateY(0);
        }
      }

      .toolbar-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 10px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      }

      .status-tabs {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow-x: auto;
        padding: 2px 0;
        scrollbar-width: none;
        -ms-overflow-style: none;
        max-width: calc(100% - 260px);

        &::-webkit-scrollbar {
          display: none;
        }

        @media (max-width: 900px) {
          max-width: 100%;
          width: 100%;
        }
      }

      .tab-divider {
        display: inline-block;
        width: 1px;
        height: 16px;
        background: var(--color-border);
        margin: 0 2px;
        flex-shrink: 0;
      }

      .status-tab {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        font-size: 0.78rem;
        font-weight: 600;
        color: #64748b;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 8px;
        white-space: nowrap;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        user-select: none;

        .tab-icon {
          font-size: 0.95rem;
          line-height: 1;
          flex-shrink: 0;

          &.status-pending {
            color: #f59e0b;
          }
          &.status-preparing {
            color: #f97316;
          }
          &.status-ready {
            color: #10b981;
          }
          &.status-dispatched {
            color: #3b82f6;
          }
          &.status-served {
            color: #8b5cf6;
          }
          &.status-completed {
            color: #6366f1;
          }
        }

        .tab-count-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          font-size: 0.68rem;
          font-weight: 700;
          font-family: monospace;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.15);
          color: #64748b;
          transition: all 0.2s ease;

          &.has-count {
            background: rgba(217, 119, 6, 0.15);
            color: #d97706;
          }
        }

        &:hover {
          background: #f1f5f9;
          color: #1e293b;
        }

        &.active {
          background: #121212;
          border-color: #121212;
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);

          .tab-count-badge {
            background: rgba(255, 255, 255, 0.22);
            color: #ffffff;

            &.has-count {
              background: #f59e0b;
              color: #121212;
            }
          }
        }
      }

      .search-wrap {
        position: relative;
        min-width: 220px;
        flex: 1;
        max-width: 320px;

        @media (max-width: 900px) {
          max-width: 100%;
          width: 100%;
        }

        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--color-text-muted);
          font-size: 1.125rem;
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          height: 44px;
          padding: 0 16px 0 42px;
          font-size: 0.875rem;
          border-radius: var(--radius-md, 10px);
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          color: var(--color-text-primary);
          transition: all var(--transition-fast, 0.15s ease);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);

          &::placeholder {
            color: var(--color-text-muted);
          }

          &:focus {
            outline: none;
            border-color: var(--color-primary);
            box-shadow: 0 0 0 3px rgba(194, 65, 12, 0.12);
          }
        }

        .search-clear-btn {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: none;
          background: rgba(148, 163, 184, 0.25);
          color: #64748b;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.7rem;
          cursor: pointer;
          transition: all 0.15s ease;

          &:hover {
            background: rgba(239, 68, 68, 0.2);
            color: #dc2626;
          }
        }
      }

      .theme-dark,
      [data-theme='dark'] {
        .toolbar-card {
          background: #121418;
          border-color: rgba(255, 255, 255, 0.08);
        }

        .tab-divider {
          background: rgba(255, 255, 255, 0.1);
        }

        .status-tab {
          color: #94a3b8;

          .tab-count-badge {
            background: rgba(255, 255, 255, 0.08);
            color: #94a3b8;

            &.has-count {
              background: rgba(245, 158, 11, 0.18);
              color: #fbbf24;
            }
          }

          &:hover {
            background: rgba(255, 255, 255, 0.06);
            color: #f1f5f9;
          }

          &.active {
            background: #202632;
            border-color: rgba(251, 191, 36, 0.4);
            color: #ffffff;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);

            .tab-count-badge {
              background: rgba(255, 255, 255, 0.2);
              color: #ffffff;

              &.has-count {
                background: #fbbf24;
                color: #121418;
              }
            }
          }
        }

        .search-wrap {
          .search-icon {
            color: #64748b;
          }

          .search-input {
            background: #181b22;
            border-color: rgba(255, 255, 255, 0.12);
            color: #f1f5f9;

            &::placeholder {
              color: #64748b;
            }

            &:focus {
              border-color: #fbbf24;
              box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.2);
            }
          }

          .search-clear-btn {
            background: rgba(255, 255, 255, 0.15);
            color: #cbd5e1;

            &:hover {
              background: rgba(248, 113, 113, 0.3);
              color: #f87171;
            }
          }
        }
      }

      .orders-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 20px;
      }

      .order-board-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 16px;
        box-shadow: var(--shadow-xs);
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
        overflow: hidden;
        cursor: pointer;
        transition: all var(--transition-fast);

        &:hover {
          border-color: var(--color-crimson);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
          transform: translateY(-2px);
        }

        &.pending-highlight {
          border-left: 4px solid var(--color-crimson);
        }

        &.card-selected {
          border-color: var(--color-crimson);
          box-shadow:
            0 0 0 2px rgba(139, 0, 0, 0.15),
            0 8px 24px rgba(0, 0, 0, 0.1);
        }
      }

      /* Completed Order Card Editorial Layout */
      .completed-board-card {
        padding: 14px 16px;
        gap: 10px;

        &:hover {
          border-color: var(--color-border);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.07);
        }

        /* Row 1: (customer name) ---------------- (status) */
        .completed-row-1 {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;

          .cust-info {
            display: flex;
            align-items: baseline;
            gap: 6px;
            min-width: 0;
            overflow: hidden;

            .cust-name-main {
              font-size: 0.9375rem;
              font-weight: 700;
              color: var(--color-text-primary);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              letter-spacing: -0.01em;
            }

            .cust-phone-inline {
              font-size: 0.75rem;
              color: var(--color-text-muted);
              font-weight: 500;
              white-space: nowrap;
            }
          }
        }

        /* Row 2: (table number) ----------------- (time) */
        .completed-row-2 {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;

          .table-info {
            display: flex;
            align-items: center;
            gap: 6px;

            .completed-tbl-badge {
              font-weight: 700;
              font-size: 0.8125rem;
              padding: 2px 8px;
              border-radius: var(--radius-xs);
              background: var(--color-bone-light);
              border: 1px solid var(--color-border-subtle);
              color: var(--color-text-primary);
              display: inline-flex;
              align-items: center;
              gap: 5px;
            }
          }

          .ord-time {
            font-size: 0.75rem;
            color: var(--color-text-muted);
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-weight: 500;
          }
        }

        /* Row 3: (order id) --------------------- (who served) */
        .completed-row-3 {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;

          .completed-ord-num {
            font-size: 0.8125rem;
            font-weight: 700;
            font-family: var(--font-mono, monospace);
            color: var(--color-text-secondary);
            display: inline-flex;
            align-items: center;
            gap: 4px;
          }

          .completed-server-cell {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 0.75rem;

            .server-caption {
              color: var(--color-text-muted);
              font-size: 0.75rem;
            }

            .server-name-text {
              font-weight: 600;
              color: var(--color-text-primary);
              max-width: 140px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .btn-unlock-server-xs {
              border: none;
              background: transparent;
              color: var(--color-text-muted);
              cursor: pointer;
              padding: 2px 4px;
              border-radius: 3px;
              display: inline-flex;
              align-items: center;
              font-size: 0.8rem;
              transition: all 0.15s;

              &:hover {
                color: var(--color-crimson);
                background: rgba(220, 38, 38, 0.1);
              }
            }
          }
        }

        /* Row 4: (payment method) ------- (printed receipt) ------- (Invoice) */
        .completed-row-4 {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 6px 0;
          border-top: 1px dashed var(--color-border);
          border-bottom: 1px dashed var(--color-border);

          .meta-pill {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 8px;
            border-radius: var(--radius-xs);
            font-size: 0.75rem;
            font-weight: 700;
            white-space: nowrap;

            &.pill-paid {
              background: var(--color-success-bg, rgba(34, 197, 94, 0.12));
              color: var(--color-success, #16a34a);
              border: 1px solid rgba(34, 197, 94, 0.25);
            }

            &.pill-printed {
              background: rgba(184, 134, 11, 0.12);
              color: #7d6514;
              border: 1px solid rgba(184, 134, 11, 0.3);
            }
          }

          .btn-invoice-action {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 4px 10px;
            font-size: 0.75rem;
            font-weight: 700;
            border-radius: var(--radius-xs);
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            color: var(--color-crimson);
            text-decoration: none;
            cursor: pointer;
            transition: all 0.15s ease;

            &:hover {
              background: var(--color-crimson);
              color: #ffffff;
              border-color: var(--color-crimson);
            }

            &.btn-wa-action {
              color: #25d366;
              border-color: rgba(37, 211, 102, 0.4);
              &:hover {
                background: #25d366;
                color: #ffffff;
                border-color: #25d366;
              }
            }
          }
        }

        /* Inset Box: Order Details & Prices */
        .completed-items-inset-box {
          background: var(--color-bone-light);
          border: 1px solid var(--color-border-subtle);
          border-radius: var(--radius-sm);
          padding: 8px 10px;
          margin-top: 2px;

          .items-summary-list {
            display: flex;
            flex-direction: column;
            gap: 5px;
            max-height: 140px;
            overflow-y: auto;
            padding-right: 2px;

            .item-line {
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-size: 0.8125rem;
              gap: 8px;

              .item-info-group {
                display: flex;
                align-items: baseline;
                gap: 5px;
                min-width: 0;
                overflow: hidden;

                .qty-pill {
                  font-weight: 800;
                  font-size: 0.75rem;
                  color: var(--color-crimson);
                  flex-shrink: 0;
                }

                .dish-name {
                  font-weight: 600;
                  color: var(--color-text-primary);
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                }

                .portion-label {
                  font-size: 0.6875rem;
                  color: var(--color-text-muted);
                  font-weight: 500;
                  flex-shrink: 0;
                }
              }

              .line-cost {
                font-weight: 700;
                color: var(--color-text-primary);
                font-size: 0.8125rem;
                flex-shrink: 0;
                font-variant-numeric: tabular-nums;
              }
            }
          }
        }

        /* Bottom Row: Total Amount */
        .completed-total-strip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 2px;

          .sub-meta-left {
            display: flex;
            align-items: center;
            gap: 6px;

            .discount-pill {
              font-size: 0.72rem;
              font-weight: 700;
              color: var(--color-success, #16a34a);
              background: var(--color-success-bg, rgba(34, 197, 94, 0.12));
              padding: 2px 6px;
              border-radius: 4px;
              border: 1px solid rgba(34, 197, 94, 0.25);
            }

            .split-pill {
              font-size: 0.72rem;
              font-weight: 600;
              color: var(--color-text-muted);
            }
          }

          .total-amount-box {
            display: flex;
            align-items: baseline;
            gap: 6px;
            margin-left: auto;

            .total-label-compact {
              font-size: 0.75rem;
              font-weight: 600;
              color: var(--color-text-muted);
            }

            .payable-val-highlight {
              font-size: 1.0625rem;
              font-weight: 800;
              color: var(--color-crimson);
              letter-spacing: -0.01em;
              font-variant-numeric: tabular-nums;
            }
          }
        }
      }

      .card-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .order-id-group {
        display: flex;
        align-items: baseline;
        gap: 8px;
        min-width: 0;
      }

      .ord-num {
        font-size: 1.125rem;
        font-weight: 800;
        letter-spacing: -0.01em;
        color: var(--color-text-primary);
        white-space: nowrap;
      }

      .ord-time {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;

        i {
          font-size: 0.85rem;
        }
      }

      .card-status-badges {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }

      .dispatch-status-dropdown-wrap {
        display: inline-flex;
        align-items: center;
      }

      .dispatch-status-select {
        padding: 3px 6px;
        font-size: 0.6875rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-xs);
        color: var(--color-text-secondary);
        cursor: pointer;
        outline: none;
        transition: all var(--transition-fast);

        &:hover {
          border-color: var(--color-onyx);
          color: var(--color-onyx);
        }

        &:focus {
          border-color: var(--color-crimson);
          background: var(--color-surface);
        }
      }

      .split-indicator-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: var(--radius-full);
        background: var(--color-crimson-subtle);
        border: 1px solid rgba(194, 24, 7, 0.2);
        color: var(--color-crimson);
        font-size: 0.6875rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        white-space: nowrap;

        i {
          font-size: 0.8rem;
        }
      }

      .guest-bar {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-sm);
        padding: 8px 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .tbl-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 8px;
        border-radius: var(--radius-xs);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        color: var(--color-crimson);
        font-family: inherit;
        font-weight: 800;
        font-size: 0.8125rem;
        line-height: 1.2;
        white-space: nowrap;
        flex-shrink: 0;
        cursor: default;

        i {
          font-size: 0.95rem;
        }

        &.takeaway-badge {
          background: var(--color-warning-bg);
          border-color: rgba(212, 175, 55, 0.4);
          color: var(--color-warning);
        }

        &.reallot-clickable {
          cursor: pointer;
          transition: all 0.15s ease;
          &:hover {
            border-color: var(--color-crimson);
            background: #fff5f5;
            box-shadow: 0 2px 6px rgba(220, 38, 38, 0.15);
          }
        }
      }

      .btn-change-table-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        font-size: 0.75rem;
        font-weight: 600;
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        color: #334155;
        cursor: pointer;
        transition: all 0.15s ease;
        &:hover {
          background: #fee2e2;
          border-color: #ef4444;
          color: #dc2626;
        }
      }

      .reallot-table-modal {
        max-width: 480px;
        width: 100%;
      }

      .guest-meta {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        min-width: 0;
        overflow: hidden;
      }

      .cust-name {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-primary);
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .phone-sub {
        font-size: 0.72rem;
        color: var(--color-text-muted);
        display: inline-flex;
        align-items: center;
        gap: 3px;
        white-space: nowrap;
      }

      .server-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 5px 8px;
        background: var(--color-bone, #f8fafc);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-sm, 8px);
        font-size: 0.75rem;
        transition:
          border-color var(--transition-fast, 0.15s ease),
          background var(--transition-fast, 0.15s ease);

        &:hover {
          border-color: var(--color-border-hover, #cbd5e1);
        }

        &.has-server {
          background: var(--color-bone-light, #f8fafc);
        }
      }

      .server-label {
        color: var(--color-text-secondary, #64748b);
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        display: flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
        user-select: none;

        i {
          font-size: 0.82rem;
          color: var(--color-text-muted, #94a3b8);
        }
      }

      .server-select-wrapper {
        position: relative;
        flex: 1;
        display: flex;
        align-items: center;
        min-width: 0;
      }

      .server-select {
        width: 100%;
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        font-size: 0.75rem;
        font-weight: 500;
        padding: 4px 22px 4px 8px;
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-xs, 6px);
        background: var(--color-surface, #ffffff);
        color: var(--color-text-primary, #1e293b);
        outline: none;
        cursor: pointer;
        transition: all var(--transition-fast, 0.15s ease);
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;

        &:hover {
          border-color: var(--color-border-hover, #cbd5e1);
        }

        &:focus {
          border-color: var(--color-primary, #6366f1);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12);
        }

        &.is-unassigned {
          color: var(--color-text-muted, #94a3b8);
        }
      }

      .server-select-caret {
        position: absolute;
        right: 7px;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: none;
        font-size: 0.7rem;
        color: var(--color-text-muted, #64748b);
      }

      .server-bar-locked {
        background: var(--color-surface-soft, rgba(0, 0, 0, 0.02));
        border-color: var(--color-border-subtle, rgba(0, 0, 0, 0.08));

        .server-label {
          color: var(--color-text-muted, #94a3b8);
          i {
            color: var(--color-text-muted, #94a3b8);
          }
        }
      }

      .server-completed-box {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        flex: 1;
        min-width: 0;
      }

      .server-name-badge {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--color-text-primary, #1e293b);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .btn-unlock-server {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 7px;
        border-radius: var(--radius-xs, 4px);
        border: 1px solid var(--color-border, #cbd5e1);
        background: var(--color-surface, #ffffff);
        color: var(--color-text-secondary, #475569);
        font-size: 0.7rem;
        font-weight: 600;
        cursor: pointer;
        transition: all var(--transition-fast, 0.15s ease);

        &:hover {
          background: #eff6ff;
          border-color: #3b82f6;
          color: #1d4ed8;
        }

        i {
          font-size: 0.75rem;
        }
      }

      .items-summary-list {
        display: flex;
        flex-direction: column;
        gap: 7px;
        max-height: 145px;
        overflow-y: auto;
        overflow-x: hidden;
        border-top: 1px dashed var(--color-border-subtle);
        border-bottom: 1px dashed var(--color-border-subtle);
        padding: 8px 0;
        min-width: 0;

        &::-webkit-scrollbar {
          width: 4px;
        }
        &::-webkit-scrollbar-thumb {
          background: var(--color-border);
          border-radius: 4px;
        }
      }

      .item-line {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        font-size: 0.8125rem;
        min-width: 0;
      }

      .item-info-group {
        display: flex;
        align-items: flex-start;
        gap: 7px;
        min-width: 0;
        flex: 1;
      }

      .qty-pill {
        font-weight: 800;
        color: var(--color-crimson);
        font-size: 0.75rem;
        background: var(--color-crimson-subtle);
        padding: 1px 5px;
        border-radius: 4px;
        flex-shrink: 0;
        line-height: 1.4;
      }

      .dish-details {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }

      .dish-name {
        font-weight: 600;
        color: var(--color-text-primary);
        font-size: 0.8125rem;
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .portion-label {
        color: var(--color-text-muted);
        font-size: 0.7rem;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .line-cost {
        font-weight: 700;
        color: var(--color-text-primary);
        font-size: 0.8125rem;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
        white-space: nowrap;
        padding-top: 1px;
      }

      .bill-strip {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 0.8125rem;
        padding: 4px 0;
      }

      .sub-line {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: var(--color-text-secondary);
        font-size: 0.78125rem;

        .bill-label {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: var(--color-text-muted);
        }

        .bill-val {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
        }

        &.discount {
          color: var(--color-success);
          .bill-label {
            color: var(--color-success);
            font-weight: 600;
          }
          .bill-val {
            font-weight: 700;
          }
        }

        &.split-note {
          color: var(--color-text-muted);
          font-style: italic;
          font-size: 0.75rem;
        }

        &.total-line {
          margin-top: 5px;
          padding-top: 8px;
          border-top: 1px solid var(--color-border);
          font-weight: 800;
          font-size: 0.9375rem;
          color: var(--color-text-primary);

          .total-label {
            font-size: 0.875rem;
            letter-spacing: -0.01em;
          }
        }
      }

      .payable-val {
        color: var(--color-crimson);
        font-size: 1.05rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
      }

      .card-footer-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: auto;
        min-width: 0;
      }

      /* Progressive Stepper Bar in Card Footer */
      .dispatch-stepper-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-sm);
        padding: 8px 10px;
        margin-bottom: 4px;
        gap: 2px;
      }

      .step-bubble {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        cursor: pointer;
        user-select: none;
        flex: 1;
        transition: all var(--transition-fast);

        .step-num {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--color-surface);
          border: 1.5px solid var(--color-border);
          color: var(--color-text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
          transition: all var(--transition-fast);
        }

        .step-txt {
          font-size: 0.625rem;
          font-weight: 600;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        &:hover {
          .step-num {
            border-color: var(--color-onyx);
            color: var(--color-onyx);
            transform: scale(1.08);
          }
          .step-txt {
            color: var(--color-onyx);
          }
        }

        &.completed {
          .step-num {
            background: var(--color-success);
            border-color: var(--color-success);
            color: #ffffff;
          }
          .step-txt {
            color: var(--color-success);
            font-weight: 700;
          }
        }

        &.active {
          .step-num {
            background: var(--color-crimson);
            border-color: var(--color-crimson);
            color: #ffffff;
            box-shadow: 0 0 0 3px rgba(194, 24, 7, 0.2);
          }
          .step-txt {
            color: var(--color-crimson);
            font-weight: 800;
          }
        }
      }

      .step-connector {
        height: 2px;
        background: var(--color-border);
        flex: 0.8;
        margin-top: -12px;
        transition: background var(--transition-fast);

        &.filled {
          background: var(--color-success);
        }
      }

      .checkout-glow {
        box-shadow: 0 2px 10px rgba(194, 24, 7, 0.3);
        font-weight: 800 !important;
      }

      .action-row-primary {
        display: flex;
        width: 100%;

        .action-btn-main {
          width: 100%;
          padding: 8px 12px;
          font-size: 0.8125rem;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-radius: var(--radius-sm);
          letter-spacing: 0.01em;
        }

        .settle-glow {
          box-shadow: 0 2px 8px rgba(139, 29, 36, 0.25);
        }
      }

      .action-row-secondary {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 6px;
        width: 100%;
      }

      /* Session Parent Container & Child Rounds (Apple-Design Polish) */
      .session-parent-card {
        border-radius: 20px;
        position: relative;
        overflow: hidden;
        background: var(--color-surface, #ffffff);
        border: 1px solid rgba(0, 0, 0, 0.08);
        box-shadow:
          0 4px 20px -2px rgba(0, 0, 0, 0.05),
          0 1px 3px rgba(0, 0, 0, 0.03);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        transition:
          transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
          box-shadow 0.2s ease,
          border-color 0.2s ease;

        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.1);
        }

        &.pending-highlight {
          border-color: rgba(186, 12, 47, 0.4);
        }
      }

      .apple-card-accent {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, var(--color-crimson, #ba0c2f), #e11d48, #f59e0b);
        border-top-left-radius: 20px;
        border-top-right-radius: 20px;
      }

      .apple-card-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding-top: 2px;
        flex-wrap: wrap;

        .header-left-cluster {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .header-right-cluster {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
      }

      .apple-table-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.75rem;
        font-weight: 700;
        color: #065f46;
        background: rgba(16, 185, 129, 0.12);
        border: 1px solid rgba(16, 185, 129, 0.25);
        padding: 3px 9px;
        border-radius: 999px;
        cursor: pointer;
        transition:
          transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
          background-color 0.15s ease;

        &:hover:not(:disabled) {
          background: rgba(16, 185, 129, 0.18);
        }

        &:active:not(:disabled) {
          transform: scale(0.96);
        }

        &:disabled {
          cursor: default;
          opacity: 0.9;
        }

        .text-micro {
          font-size: 0.625rem;
          opacity: 0.75;
        }

        &.takeaway-pill {
          color: #1e40af;
          background: rgba(59, 130, 246, 0.12);
          border-color: rgba(59, 130, 246, 0.25);
        }
      }

      .apple-ord-num {
        font-family: var(--font-mono, monospace);
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-text-secondary, #64748b);
      }

      .apple-ord-time {
        font-size: 0.6875rem;
        color: var(--color-text-muted, #94a3b8);
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-weight: 500;
      }

      .session-rounds-chip {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 0.6875rem;
        font-weight: 700;
        color: #1d4ed8;
        background: rgba(37, 99, 235, 0.1);
        border: 1px solid rgba(37, 99, 235, 0.25);
        padding: 1px 6px;
        border-radius: 999px;
      }

      /* Apple Recessed Meta Surface */
      .guest-server-recessed {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        background: rgba(0, 0, 0, 0.025);
        border: 1px solid rgba(0, 0, 0, 0.05);
        border-radius: 14px;
        padding: 7px 10px;

        .guest-compact-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;

          .guest-avatar-disc {
            width: 26px;
            height: 26px;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.07);
            color: var(--color-text-primary, #0f172a);
            font-size: 0.6875rem;
            font-weight: 800;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .guest-text-col {
            display: flex;
            flex-direction: column;
            line-height: 1.2;

            .cust-name-clean {
              font-size: 0.75rem;
              font-weight: 700;
              color: var(--color-text-primary, #0f172a);
            }

            .phone-sub-clean {
              font-size: 0.6875rem;
              color: var(--color-text-muted, #94a3b8);
              display: inline-flex;
              align-items: center;
              gap: 3px;
            }
          }
        }

        .server-inline-picker {
          flex-shrink: 0;

          .server-select-pill,
          .server-completed-pill {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 0.7rem;
            color: var(--color-text-secondary, #64748b);
            background: rgba(255, 255, 255, 0.8);
            border: 1px solid rgba(0, 0, 0, 0.08);
            border-radius: 999px;
            padding: 2px 6px 2px 8px;
          }

          .server-select-clean {
            background: transparent;
            border: none;
            font-size: 0.7rem;
            font-weight: 600;
            color: var(--color-text-primary, #0f172a);
            outline: none;
            cursor: pointer;
            padding-right: 2px;
            max-width: 110px;

            &.is-unassigned {
              color: var(--color-text-muted, #94a3b8);
              font-weight: 500;
            }
          }

          .pill-caret {
            font-size: 0.625rem;
            color: var(--color-text-muted, #94a3b8);
            pointer-events: none;
          }

          .btn-unlock-inline {
            background: transparent;
            border: none;
            color: var(--color-text-muted, #94a3b8);
            cursor: pointer;
            padding: 1px 3px;
            font-size: 0.6875rem;

            &:hover {
              color: var(--color-crimson, #ba0c2f);
            }
          }
        }
      }

      /* Editorial Receipt Stream */
      .session-receipt-stream {
        display: flex;
        flex-direction: column;
        gap: 8px;

        .receipt-stream-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--color-text-muted, #94a3b8);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 0 2px;

          .receipt-stream-title {
            display: inline-flex;
            align-items: center;
            gap: 4px;
          }

          .receipt-stream-subtotal {
            font-family: var(--font-mono, monospace);
            font-size: 0.75rem;
            color: var(--color-text-secondary, #64748b);
          }
        }

        .receipt-rounds-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .receipt-round-segment {
          display: flex;
          flex-direction: column;
          gap: 4px;
          border-radius: 10px;
          padding: 2px;

          &.round-pending-soft {
            background: rgba(186, 12, 47, 0.02);
            border-left: 2px solid var(--color-crimson, #ba0c2f);
            padding-left: 6px;
          }
        }

        .round-mini-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 3px 6px;
          margin-bottom: 2px;
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.025);
          border-bottom: 1px dashed rgba(0, 0, 0, 0.06);

          .round-mini-left {
            display: flex;
            align-items: center;
            gap: 6px;

            .round-mini-title {
              font-size: 0.6875rem;
              font-weight: 800;
              color: var(--color-crimson, #ba0c2f);
            }

            .round-mini-ord-num {
              font-family: var(--font-mono, monospace);
              font-size: 0.6875rem;
              font-weight: 700;
              color: var(--color-text-secondary, #64748b);
            }
          }

          .round-mini-right {
            display: flex;
            align-items: center;
            gap: 6px;

            .round-mini-time {
              font-size: 0.625rem;
              color: var(--color-text-muted, #94a3b8);
              display: inline-flex;
              align-items: center;
              gap: 2px;
            }
          }
        }

        .round-items-clean {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .receipt-item-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2px 0;
          font-size: 0.75rem;

          .item-name-cluster {
            display: flex;
            align-items: center;
            gap: 6px;
            min-width: 0;

            .qty-bubble {
              font-family: var(--font-mono, monospace);
              font-size: 0.6875rem;
              font-weight: 700;
              background: rgba(0, 0, 0, 0.05);
              color: var(--color-text-primary, #0f172a);
              padding: 1px 5px;
              border-radius: 5px;
              flex-shrink: 0;
            }

            .item-title {
              font-weight: 600;
              color: var(--color-text-primary, #0f172a);
            }

            .portion-tag {
              font-size: 0.625rem;
              background: rgba(0, 0, 0, 0.04);
              color: var(--color-text-secondary, #64748b);
              padding: 1px 4px;
              border-radius: 4px;
              flex-shrink: 0;
            }
          }

          .item-price {
            font-family: var(--font-mono, monospace);
            font-size: 0.75rem;
            font-weight: 600;
            color: var(--color-text-secondary, #64748b);
            flex-shrink: 0;
          }
        }
      }

      /* Apple Financial Strip */
      .grand-bill-strip-apple {
        padding: 10px 12px;
        background: rgba(0, 0, 0, 0.02);
        border: 1px solid rgba(0, 0, 0, 0.06);
        border-radius: 14px;
        display: flex;
        flex-direction: column;
        gap: 4px;

        .sub-line {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.75rem;
          color: var(--color-text-secondary, #64748b);

          .bill-val {
            font-family: var(--font-mono, monospace);
            font-weight: 600;
          }

          &.discount {
            color: #15803d;
          }

          &.split-note {
            color: #1d4ed8;
          }
        }

        .total-row-apple {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 6px;
          margin-top: 2px;
          border-top: 1px solid rgba(0, 0, 0, 0.06);

          .total-meta-left {
            display: flex;
            align-items: center;
            gap: 6px;

            .total-label-apple {
              font-size: 0.8125rem;
              font-weight: 700;
              color: var(--color-text-primary, #0f172a);
            }

            .tax-badge-apple {
              font-size: 0.625rem;
              font-weight: 600;
              color: #b45309;
              background: rgba(245, 158, 11, 0.12);
              padding: 1px 6px;
              border-radius: 999px;
            }
          }

          .payable-val-apple {
            font-family: var(--font-mono, monospace);
            font-size: 1.125rem;
            font-weight: 800;
            color: var(--color-crimson, #ba0c2f);
            letter-spacing: -0.02em;
          }
        }
      }

      /* Apple Action Controls */
      .card-footer-actions-apple {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-top: 2px;

        .action-row-primary {
          width: 100%;
        }

        .apple-btn-primary {
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 9px 14px;
          border-radius: 12px;
          background: var(--color-crimson, #ba0c2f);
          color: #ffffff;
          font-size: 0.8125rem;
          font-weight: 700;
          border: none;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(186, 12, 47, 0.25);
          transition:
            transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
            background-color 0.15s ease,
            opacity 0.15s ease;

          &:hover:not(:disabled) {
            background: #960a26;
            box-shadow: 0 4px 12px rgba(186, 12, 47, 0.35);
          }

          &:active:not(:disabled) {
            transform: scale(0.98);
          }

          &:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }
        }

        .apple-util-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;

          @media (max-width: 480px) {
            grid-template-columns: repeat(2, 1fr);
          }

          .apple-util-btn {
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 2px;
            padding: 6px 4px;
            border-radius: 10px;
            background: rgba(0, 0, 0, 0.03);
            border: 1px solid rgba(0, 0, 0, 0.05);
            color: var(--color-text-secondary, #64748b);
            font-size: 0.6875rem;
            font-weight: 600;
            cursor: pointer;
            transition:
              transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
              background-color 0.15s ease,
              color 0.15s ease;

            i {
              font-size: 0.875rem;
            }

            &:hover:not(:disabled) {
              background: rgba(0, 0, 0, 0.07);
              color: var(--color-text-primary, #0f172a);
            }

            &:active:not(:disabled) {
              transform: scale(0.95);
            }

            &:disabled {
              opacity: 0.6;
              cursor: not-allowed;
            }

            &.btn-apple-cancel {
              color: var(--color-crimson, #ba0c2f);

              &:hover:not(:disabled) {
                background: rgba(186, 12, 47, 0.08);
                color: #960a26;
              }
            }
          }
        }
      }

      /* =========================================================================
         Apple Live Order Card — High-Contrast Dark Mode Enhancements
         Applies to both attribute [data-theme='dark'] and class .theme-dark
         ========================================================================= */
      :host-context([data-theme='dark']),
      :host-context(.theme-dark) {
        .session-parent-card {
          background: var(--color-surface-card, #161920);
          border: 1px solid rgba(255, 255, 255, 0.09);
          box-shadow:
            0 4px 24px -2px rgba(0, 0, 0, 0.5),
            0 1px 3px rgba(0, 0, 0, 0.3);

          &:hover {
            box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.7);
            border-color: rgba(255, 255, 255, 0.15);
          }
        }

        .apple-table-pill {
          background: rgba(16, 185, 129, 0.16);
          color: #34d399;
          border-color: rgba(16, 185, 129, 0.35);

          &:hover:not(:disabled) {
            background: rgba(16, 185, 129, 0.24);
          }

          &.takeaway-pill {
            background: rgba(59, 130, 246, 0.18);
            color: #93c5fd;
            border-color: rgba(59, 130, 246, 0.35);
          }
        }

        .apple-ord-num {
          color: #94a3b8;
        }

        .apple-ord-time {
          color: #64748b;
        }

        .session-rounds-chip {
          background: rgba(59, 130, 246, 0.18);
          color: #60a5fa;
          border-color: rgba(59, 130, 246, 0.35);
        }

        /* Recessed Guest & Server Strip Dark Mode */
        .guest-server-recessed {
          background: rgba(255, 255, 255, 0.035);
          border-color: rgba(255, 255, 255, 0.07);

          .guest-compact-meta {
            .guest-avatar-disc {
              background: rgba(255, 255, 255, 0.1);
              color: #f1f5f9;
            }

            .guest-text-col {
              .cust-name-clean {
                color: #f1f5f9;
              }

              .phone-sub-clean {
                color: #94a3b8;
              }
            }
          }

          .server-inline-picker {
            .server-select-pill,
            .server-completed-pill {
              background: rgba(255, 255, 255, 0.06);
              border-color: rgba(255, 255, 255, 0.12);
              color: #cbd5e1;
            }

            .server-select-clean {
              color: #f1f5f9;
              background: transparent;

              &.is-unassigned {
                color: #64748b;
              }

              option {
                background: #181b21;
                color: #f1f5f9;
              }
            }

            .pill-caret {
              color: #94a3b8;
            }

            .btn-unlock-inline {
              color: #94a3b8;

              &:hover {
                color: #f87171;
              }
            }
          }
        }

        /* Editorial Receipt Stream Dark Mode */
        .session-receipt-stream {
          .receipt-stream-header {
            color: #64748b;

            .receipt-stream-subtotal {
              color: #94a3b8;
            }
          }

          .receipt-round-segment {
            &.round-pending-soft {
              background: rgba(239, 68, 68, 0.06);
              border-left-color: #f87171;
            }
          }

          .round-mini-bar {
            color: #94a3b8;
            border-bottom-color: rgba(255, 255, 255, 0.07);

            .round-mini-time {
              color: #64748b;
            }
          }

          .receipt-item-row {
            .item-name-cluster {
              .qty-bubble {
                background: rgba(255, 255, 255, 0.08);
                color: #f1f5f9;
              }

              .item-title {
                color: #f1f5f9;
              }

              .portion-tag {
                background: rgba(255, 255, 255, 0.06);
                color: #94a3b8;
              }
            }

            .item-price {
              color: #cbd5e1;
            }
          }
        }

        /* Apple Financial Breakdown Strip Dark Mode */
        .grand-bill-strip-apple {
          background: rgba(255, 255, 255, 0.03);
          border-color: rgba(255, 255, 255, 0.07);

          .sub-line {
            color: #94a3b8;

            &.discount {
              color: #4ade80;
            }

            &.split-note {
              color: #60a5fa;
            }
          }

          .total-row-apple {
            border-top-color: rgba(255, 255, 255, 0.08);

            .total-meta-left {
              .total-label-apple {
                color: #f8fafc;
              }

              .tax-badge-apple {
                color: #fbbf24;
                background: rgba(245, 158, 11, 0.16);
                border: 1px solid rgba(245, 158, 11, 0.25);
              }
            }

            .payable-val-apple {
              color: #f87171;
            }
          }
        }

        /* Apple Action Controls Dark Mode */
        .card-footer-actions-apple {
          .apple-util-grid {
            .apple-util-btn {
              background: rgba(255, 255, 255, 0.05);
              border-color: rgba(255, 255, 255, 0.08);
              color: #cbd5e1;

              &:hover:not(:disabled) {
                background: rgba(255, 255, 255, 0.1);
                color: #ffffff;
              }

              &.btn-apple-cancel {
                color: #f87171;
                background: rgba(239, 68, 68, 0.08);
                border-color: rgba(239, 68, 68, 0.15);

                &:hover:not(:disabled) {
                  background: rgba(239, 68, 68, 0.16);
                  color: #fca5a5;
                }
              }
            }
          }
        }
      }

      .completed-round-section {
        padding: 6px 0;
        border-bottom: 1px dashed var(--color-border);

        &:last-child {
          border-bottom: none;
        }

        .completed-round-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--color-text-secondary);
          margin-bottom: 4px;

          .completed-round-title {
            color: var(--color-text-primary);
          }

          .completed-round-total {
            color: var(--color-crimson);
          }
        }
      }

      .card-util-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 6px 8px;
        min-height: 32px;
        border-radius: var(--radius-xs);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text-secondary);
        font-size: 0.75rem;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
        transition: all var(--transition-fast);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        i {
          font-size: 0.875rem;
        }

        &:hover {
          background: var(--color-bone-light);
          color: var(--color-text-primary);
          border-color: var(--color-taupe);
        }

        &.btn-cancel-order {
          color: var(--color-crimson);
          &:hover {
            background: rgba(139, 29, 36, 0.08);
            border-color: rgba(139, 29, 36, 0.3);
          }
        }
      }

      .btn-gold {
        background: var(--color-gold);
        color: var(--color-onyx);
        border: 1px solid var(--color-gold);
        font-weight: 700;
        &:hover {
          background: var(--color-gold-hover);
        }
      }

      .btn-success {
        background: var(--color-success);
        color: #ffffff;
        font-weight: 700;
        &:hover {
          opacity: 0.9;
        }
      }

      .btn-whatsapp {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #25d366;
        color: #ffffff;
        font-weight: 600;
        border: none;
        cursor: pointer;
        transition:
          background 0.15s ease,
          transform 0.1s ease;
        padding: 0 10px;
        height: 32px;
        min-width: 34px;
        border-radius: var(--radius-sm, 6px);

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
      }

      .empty-orders-panel {
        grid-column: 1 / -1;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 48px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }

      .empty-icon {
        font-size: 2.5rem;
        color: var(--color-taupe);
      }

      .header-right-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .modal-card.manual-order-modal-canvas {
        max-width: 1040px !important;
        width: 95vw;
        height: 88vh;
        max-height: 840px;
        display: flex;
        flex-direction: column;
        border-radius: 16px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        overflow: hidden;

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 22px;
          border-bottom: 1px solid var(--color-border);
          background: var(--color-surface);

          .modal-title-with-icon {
            display: flex;
            align-items: center;
            gap: 12px;

            .icon-circle {
              width: 38px;
              height: 38px;
              border-radius: 10px;
              background: var(--color-bone-light, #f1f5f9);
              color: var(--color-crimson, #dc2626);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1.25rem;
              border: 1px solid var(--color-border);
            }

            .heading-card {
              font-size: 1.125rem;
              font-weight: 700;
              margin: 0;
              color: var(--color-text-primary);
            }
          }

          .close-btn {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--color-surface);
            color: var(--color-text-muted);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1rem;
            transition: all 0.15s ease;

            &:hover {
              background: var(--color-bone-light, #f1f5f9);
              color: var(--color-text-primary);
            }
          }
        }

        .manual-order-workspace {
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 20px;
          padding: 20px 24px;
          flex: 1;
          min-height: 0;
          overflow: hidden;

          @media (max-width: 860px) {
            grid-template-columns: 1fr;
            overflow-y: auto;
          }
        }

        /* LEFT SIDE: DISH CATALOG */
        .pos-dish-catalog-panel {
          border-right: 1px solid var(--color-border);
          padding-right: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-height: 0;
          overflow: hidden;

          @media (max-width: 860px) {
            border-right: none;
            padding-right: 0;
            border-bottom: 1px solid var(--color-border);
            padding-bottom: 16px;
            max-height: 360px;
          }

          .catalog-panel-top {
            display: flex;
            flex-direction: column;
            gap: 10px;
            flex-shrink: 0;
          }

          .catalog-search-wrap {
            position: relative;
            display: flex;
            align-items: center;

            .search-ico {
              position: absolute;
              left: 12px;
              color: var(--color-text-muted);
              font-size: 0.9375rem;
              pointer-events: none;
            }

            .catalog-search-input {
              padding-left: 36px;
              padding-right: 32px;
              width: 100%;
              font-size: 0.8125rem;
              height: 38px;
              border-radius: 8px;
              border: 1px solid var(--color-border);
              background: var(--color-surface);
              color: var(--color-text-primary);
              transition:
                border-color 0.15s ease,
                box-shadow 0.15s ease;

              &:focus {
                border-color: var(--color-crimson, #dc2626);
                box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12);
                outline: none;
              }
            }

            .search-clear-btn {
              position: absolute;
              right: 10px;
              background: none;
              border: none;
              cursor: pointer;
              color: var(--color-text-muted);
              padding: 4px;
              border-radius: 4px;
              display: flex;
              align-items: center;

              &:hover {
                color: var(--color-text-primary);
              }
            }
          }

          .catalog-cat-chips {
            display: flex;
            gap: 6px;
            overflow-x: auto;
            padding-bottom: 4px;
            scrollbar-width: none;
            &::-webkit-scrollbar {
              display: none;
            }

            .cat-chip {
              padding: 5px 12px;
              border-radius: 999px;
              font-size: 0.75rem;
              font-weight: 600;
              border: 1px solid var(--color-border);
              background: var(--color-surface);
              color: var(--color-text-secondary);
              cursor: pointer;
              white-space: nowrap;
              transition: all 0.15s ease;

              &:hover {
                border-color: var(--color-text-muted);
                color: var(--color-text-primary);
              }

              &.active {
                background: var(--color-crimson, #dc2626);
                color: #ffffff;
                border-color: var(--color-crimson, #dc2626);
                box-shadow: 0 2px 8px rgba(220, 38, 38, 0.25);
              }
            }
          }

          .catalog-diet-chips {
            display: flex;
            gap: 6px;

            .diet-filter-pill {
              display: inline-flex;
              align-items: center;
              gap: 5px;
              padding: 4px 10px;
              font-size: 0.71875rem;
              font-weight: 600;
              border-radius: 6px;
              border: 1px solid var(--color-border);
              background: var(--color-surface);
              color: var(--color-text-secondary);
              cursor: pointer;
              transition: all 0.15s ease;

              &:hover {
                border-color: var(--color-text-muted);
              }

              &.active {
                border-color: var(--color-text-primary);
                color: var(--color-text-primary);
                background: var(--color-bone-light, #f8fafc);
                font-weight: 700;
              }

              .diet-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                &.veg {
                  background: #16a34a;
                }
                &.non-veg {
                  background: #dc2626;
                }
              }
            }
          }

          .catalog-dishes-stream {
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding-right: 6px;
            flex: 1;
            min-height: 0;

            .pos-dish-card {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 10px 14px;
              background: var(--color-surface);
              border: 1px solid var(--color-border);
              border-radius: 10px;
              cursor: pointer;
              transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);

              &:hover {
                border-color: var(--color-crimson, #dc2626);
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
              }

              &.in-tray {
                border-color: #10b981;
                background: rgba(16, 185, 129, 0.05);
              }

              &.is-out-of-stock {
                opacity: 0.55;
                cursor: not-allowed;
                pointer-events: none;
                filter: grayscale(0.6);
              }

              .dish-card-details {
                display: flex;
                flex-direction: column;
                gap: 3px;
                min-width: 0;

                .dish-name-row {
                  display: flex;
                  align-items: center;
                  gap: 6px;

                  .dish-title {
                    font-size: 0.84375rem;
                    font-weight: 600;
                    color: var(--color-text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 220px;
                  }
                }

                .dish-sub-row {
                  display: flex;
                  align-items: center;
                  gap: 8px;

                  .dish-cost {
                    font-size: 0.8125rem;
                    color: var(--color-text-secondary);
                    font-weight: 600;
                  }

                  .stock-tag {
                    font-size: 0.625rem;
                    font-weight: 700;
                    padding: 1px 6px;
                    border-radius: 4px;
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                    &.low {
                      background: #fef3c7;
                      color: #b45309;
                    }
                    &.out {
                      background: #fee2e2;
                      color: #b91c1c;
                    }
                  }
                }
              }

              .dish-card-action {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;

                .tray-counter-pill {
                  font-size: 0.6875rem;
                  font-weight: 700;
                  background: #10b981;
                  color: #ffffff;
                  padding: 2px 8px;
                  border-radius: 999px;
                  box-shadow: 0 1px 4px rgba(16, 185, 129, 0.3);
                }

                .quick-add-btn {
                  width: 30px;
                  height: 30px;
                  border-radius: 8px;
                  border: 1px solid var(--color-border);
                  background: var(--color-surface);
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: var(--color-crimson, #dc2626);
                  font-size: 0.9375rem;
                  transition: all 0.15s ease;

                  &:hover {
                    background: var(--color-crimson, #dc2626);
                    color: #ffffff;
                    border-color: var(--color-crimson, #dc2626);
                  }
                }
              }
            }

            .empty-catalog-msg {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 40px 16px;
              color: var(--color-text-muted);
              font-size: 0.8125rem;
              text-align: center;
              gap: 8px;

              i {
                font-size: 1.75rem;
                opacity: 0.7;
              }
            }
          }
        }

        /* RIGHT SIDE: ORDER DETAILS & TRAY SUMMARY */
        .pos-order-summary-panel {
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-height: 0;
          overflow: hidden;

          /* Table & Guest Context Card */
          .pos-context-card {
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: 12px;
            padding: 14px 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);

            /* Segmented order-type switcher */
            .pos-order-type-segmented {
              display: flex;
              background: var(--color-bone-light, #f1f5f9);
              padding: 3px;
              border-radius: 8px;
              gap: 4px;
              border: 1px solid var(--color-border);

              .type-seg-btn {
                flex: 1;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 6px 12px;
                font-size: 0.75rem;
                font-weight: 700;
                color: var(--color-text-secondary);
                background: transparent;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.15s ease;

                i {
                  font-size: 0.875rem;
                }

                &:hover:not(:disabled) {
                  color: var(--color-text-primary);
                }

                &.active {
                  background: var(--color-surface);
                  color: var(--color-crimson, #dc2626);
                  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
                }

                &:disabled,
                &.disabled {
                  opacity: 0.45;
                  cursor: not-allowed;
                }
              }
            }

            .table-assignment-banner {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              padding-bottom: 12px;
              border-bottom: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.06));

              @media (max-width: 640px) {
                flex-direction: column;
                align-items: stretch;
              }

              &.takeaway-banner {
                background: linear-gradient(135deg, rgba(30, 41, 59, 0.03), transparent);
                padding: 10px 12px;
                border-radius: 8px;
                border: 1px dashed var(--color-border);

                .takeaway-pill {
                  background: rgba(30, 41, 59, 0.12);
                  color: var(--color-onyx);
                  .status-dot {
                    background: var(--color-onyx);
                  }
                }

                .takeaway-ref-badge {
                  color: var(--color-onyx);
                  background: rgba(30, 41, 59, 0.08);
                  font-family: monospace;
                  letter-spacing: 0.03em;
                }

                .takeaway-ref-input {
                  font-family: monospace;
                  font-weight: 700;
                  background: var(--color-bone-light, #f1f5f9);
                  cursor: default;
                }
              }

              .assignment-meta {
                display: flex;
                flex-direction: column;
                gap: 6px;

                .assignment-label-row {
                  display: flex;
                  align-items: center;
                  gap: 8px;

                  .context-eyebrow {
                    font-size: 0.6875rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: var(--color-text-muted);
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;

                    i {
                      font-size: 0.8125rem;
                    }
                  }

                  .table-status-pill {
                    font-size: 0.625rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    padding: 2px 7px;
                    border-radius: 999px;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    letter-spacing: 0.04em;

                    .status-dot {
                      width: 5px;
                      height: 5px;
                      border-radius: 50%;
                    }

                    &.available {
                      background: rgba(22, 163, 74, 0.12);
                      color: #16a34a;
                      .status-dot {
                        background: #16a34a;
                      }
                    }

                    &.occupied {
                      background: rgba(220, 38, 38, 0.12);
                      color: #dc2626;
                      .status-dot {
                        background: #dc2626;
                      }
                    }

                    &.reserved {
                      background: rgba(217, 119, 6, 0.12);
                      color: #d97706;
                      .status-dot {
                        background: #d97706;
                      }
                    }

                    &.dirty {
                      background: rgba(100, 116, 139, 0.14);
                      color: #64748b;
                      .status-dot {
                        background: #64748b;
                      }
                    }
                  }
                }

                .selected-table-showcase {
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  flex-wrap: wrap;

                  .tbl-badge {
                    font-size: 1rem;
                    font-weight: 800;
                    color: var(--color-text-primary);
                    background: var(--color-bone-light, #f1f5f9);
                    padding: 3px 10px;
                    border-radius: 8px;
                    border: 1px solid var(--color-border);
                  }

                  .tbl-detail-pill {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--color-text-secondary);
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;

                    i {
                      font-size: 0.8125rem;
                      color: var(--color-text-muted);
                    }
                  }
                }
              }

              .table-picker-control {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 4px;

                @media (max-width: 640px) {
                  align-items: stretch;
                }

                .picker-label {
                  font-size: 0.6875rem;
                  font-weight: 600;
                  color: var(--color-text-muted);
                }

                .custom-table-select {
                  min-width: 200px;
                  max-width: 260px;
                  height: 34px;
                  font-size: 0.75rem;
                  font-weight: 600;
                  padding: 4px 10px;
                  border-radius: 8px;
                  border: 1px solid var(--color-border);
                  background: var(--color-surface);
                  color: var(--color-text-primary);
                  cursor: pointer;
                }
              }
            }

            .guest-details-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;

              @media (max-width: 540px) {
                grid-template-columns: 1fr;
              }

              .form-group.compact {
                display: flex;
                flex-direction: column;
                gap: 4px;

                .form-label-compact {
                  font-size: 0.6875rem;
                  font-weight: 700;
                  color: var(--color-text-muted);
                  text-transform: uppercase;
                  letter-spacing: 0.04em;
                  display: flex;
                  align-items: center;
                  gap: 4px;

                  i {
                    font-size: 0.75rem;
                  }
                }

                .input-icon-wrap {
                  position: relative;
                  display: flex;
                  align-items: center;

                  .input-prefix-icon {
                    position: absolute;
                    left: 10px;
                    color: var(--color-text-muted);
                    font-size: 0.875rem;
                    pointer-events: none;
                  }

                  .custom-input {
                    padding-left: 32px;
                    height: 34px;
                    font-size: 0.8125rem;
                    border-radius: 8px;
                    border: 1px solid var(--color-border);
                    background: var(--color-surface);
                    color: var(--color-text-primary);
                    width: 100%;

                    &:focus {
                      border-color: var(--color-crimson, #dc2626);
                      box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.1);
                      outline: none;
                    }
                  }
                }
              }
            }
          }

          /* Items Tray Box */
          .manual-items-box {
            display: flex;
            flex-direction: column;
            background: var(--color-bone-light, #f8fafc);
            border: 1px solid var(--color-border);
            border-radius: 12px;
            padding: 14px;
            flex: 1;
            min-height: 0;
            overflow: hidden;

            .tray-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding-bottom: 10px;
              border-bottom: 1px solid var(--color-border);
              flex-shrink: 0;

              .tray-title-group {
                display: flex;
                align-items: center;
                gap: 8px;

                .tray-title {
                  font-size: 0.75rem;
                  font-weight: 700;
                  color: var(--color-text-primary);
                  text-transform: uppercase;
                  letter-spacing: 0.05em;
                }

                .tray-badge {
                  font-size: 0.6875rem;
                  font-weight: 700;
                  padding: 2px 7px;
                  border-radius: 999px;
                  background: var(--color-border);
                  color: var(--color-text-muted);

                  &.has-items {
                    background: #10b981;
                    color: #ffffff;
                  }
                }
              }

              .clear-tray-btn {
                background: none;
                border: none;
                color: var(--color-text-muted);
                cursor: pointer;
                font-size: 0.6875rem;
                font-weight: 600;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 3px 6px;
                border-radius: 4px;
                transition: all 0.15s ease;

                &:hover {
                  color: var(--color-danger, #dc2626);
                  background: rgba(220, 38, 38, 0.08);
                }
              }
            }

            .empty-tray-state {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 32px 16px;
              text-align: center;
              gap: 8px;
              margin: auto 0;

              .empty-tray-icon {
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: var(--color-surface);
                border: 1px solid var(--color-border);
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--color-text-muted);
                font-size: 1.25rem;
              }

              .empty-tray-title {
                font-size: 0.875rem;
                font-weight: 700;
                color: var(--color-text-primary);
                margin: 0;
              }

              .empty-tray-subtitle {
                font-size: 0.75rem;
                color: var(--color-text-muted);
                margin: 0;
                max-width: 260px;
                line-height: 1.4;
              }
            }

            .manual-items-table {
              overflow-y: auto;
              display: flex;
              flex-direction: column;
              gap: 8px;
              padding: 10px 4px 10px 0;
              flex: 1;
              min-height: 0;

              .m-item-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 8px 12px;
                background: var(--color-surface);
                border: 1px solid var(--color-border);
                border-radius: 8px;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
                transition: border-color 0.15s ease;

                &:hover {
                  border-color: rgba(220, 38, 38, 0.3);
                }

                .m-item-details {
                  display: flex;
                  flex-direction: column;
                  gap: 2px;
                  flex: 1;
                  min-width: 0;

                  .m-item-title {
                    font-size: 0.8125rem;
                    font-weight: 600;
                    color: var(--color-text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                  }

                  .m-item-rate {
                    font-size: 0.6875rem;
                    color: var(--color-text-muted);
                    font-weight: 500;
                  }
                }

                .m-qty-stepper {
                  display: inline-flex;
                  align-items: center;
                  gap: 2px;
                  background: var(--color-bone-light, #f1f5f9);
                  border: 1px solid var(--color-border);
                  border-radius: 6px;
                  padding: 2px;

                  .stepper-btn {
                    width: 24px;
                    height: 24px;
                    border: none;
                    background: transparent;
                    color: var(--color-text-primary);
                    border-radius: 4px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.75rem;
                    transition: background 0.15s ease;

                    &:hover {
                      background: var(--color-surface);
                      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
                    }
                  }

                  .stepper-count {
                    min-width: 24px;
                    text-align: center;
                    font-size: 0.75rem;
                    font-weight: 700;
                    font-variant-numeric: tabular-nums;
                    color: var(--color-text-primary);
                  }
                }

                .m-item-right {
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  flex-shrink: 0;

                  .m-item-total {
                    font-size: 0.8125rem;
                    font-weight: 700;
                    font-family: monospace;
                    color: var(--color-text-primary);
                    min-width: 54px;
                    text-align: right;
                  }

                  .m-remove-btn {
                    width: 22px;
                    height: 22px;
                    border-radius: 4px;
                    border: none;
                    background: transparent;
                    color: var(--color-text-muted);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.875rem;
                    transition: all 0.15s ease;

                    &:hover {
                      background: rgba(220, 38, 38, 0.1);
                      color: #dc2626;
                    }
                  }
                }
              }
            }

            .order-math-summary {
              margin-top: auto;
              padding: 12px 14px;
              background: var(--color-surface);
              border: 1px solid var(--color-border);
              border-radius: 8px;
              display: flex;
              flex-direction: column;
              gap: 6px;
              flex-shrink: 0;

              .math-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 0.75rem;
                color: var(--color-text-secondary);

                .math-label {
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                }

                .tax-rate-pill {
                  font-size: 0.625rem;
                  font-weight: 600;
                  padding: 1px 5px;
                  background: var(--color-bone-light, #f1f5f9);
                  border: 1px solid var(--color-border);
                  border-radius: 4px;
                  color: var(--color-text-muted);
                }

                .math-value {
                  font-weight: 600;
                  color: var(--color-text-primary);
                }

                &.total-highlight {
                  padding-top: 6px;
                  border-top: 1px solid var(--color-border);
                  margin-top: 2px;

                  .total-text-group {
                    display: flex;
                    flex-direction: column;

                    .total-main-label {
                      font-size: 0.875rem;
                      font-weight: 700;
                      color: var(--color-text-primary);
                    }

                    .total-sub-label {
                      font-size: 0.625rem;
                      color: var(--color-text-muted);
                    }
                  }

                  .total-grand-amount {
                    font-size: 1.1875rem;
                    font-weight: 800;
                    color: var(--color-crimson, #dc2626);
                    font-family: monospace;
                    letter-spacing: -0.02em;
                  }
                }
              }

              .math-divider {
                height: 1px;
                background: var(--color-border-subtle, rgba(0, 0, 0, 0.05));
                margin: 2px 0;
              }
            }
          }
        }

        .modal-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          padding: 14px 22px;
          border-top: 1px solid var(--color-border);
          background: var(--color-surface);
          flex-shrink: 0;

          .btn-primary {
            min-width: 160px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-weight: 600;
          }
        }
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

      /* Settle Bill & Split Modal */
      .settle-modal {
        max-width: 540px;
        width: 100%;
      }

      .settle-mode-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
        background: var(--color-bone-light);
        padding: 4px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
      }

      .mode-tab-btn {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 12px;
        border: none;
        border-radius: var(--radius-xs);
        background: transparent;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all var(--transition-fast);

        &.active {
          background: var(--color-surface);
          color: var(--color-onyx);
          box-shadow: var(--shadow-xs);
          font-weight: 700;
        }
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
        gap: 6px;
        padding: 12px;
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
        font-size: 1.5rem;
        color: var(--color-onyx);
      }

      .tile-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .tile-title {
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--color-onyx);
      }

      .tile-sub {
        font-size: 0.65rem;
        color: var(--color-text-muted);
      }

      .tile-check {
        position: absolute;
        top: 8px;
        right: 8px;
        font-size: 1rem;
        color: var(--color-crimson);
      }

      .split-create-workspace {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 10px;
      }

      .split-stepper-box {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);

        .stepper-label {
          font-weight: 600;
          font-size: 0.875rem;
          color: var(--color-onyx);
        }

        .stepper-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .stepper-btn {
          width: 32px;
          height: 32px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-surface);
          font-weight: 700;
          font-size: 1.1rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;

          &:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }

          &:hover:not(:disabled) {
            border-color: var(--color-gold);
            background: #faf7f2;
          }
        }

        .stepper-val {
          font-weight: 700;
          font-size: 0.9375rem;
          color: var(--color-onyx);
          min-width: 54px;
          text-align: center;
        }
      }

      .split-preview-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        gap: 8px;

        .split-preview-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: 8px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);

          .p-num {
            font-size: 0.6875rem;
            color: var(--color-text-muted);
            text-transform: uppercase;
          }

          .p-val {
            font-size: 0.875rem;
            color: var(--color-crimson);
            font-weight: 800;
          }
        }
      }

      .split-bills-live-box {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .split-banner-notice {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: rgba(212, 175, 55, 0.1);
        border: 1px solid rgba(212, 175, 55, 0.3);
        border-radius: var(--radius-sm);
        color: var(--color-onyx);
        font-size: 0.8125rem;
        font-weight: 600;
      }

      .split-cards-stream {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 240px;
        overflow-y: auto;
      }

      .split-card-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        background: var(--color-surface);

        &.is-paid {
          background: rgba(27, 99, 62, 0.05);
          border-color: rgba(27, 99, 62, 0.2);
        }

        .split-card-info {
          display: flex;
          flex-direction: column;
          gap: 2px;

          .split-amount {
            font-weight: 700;
            color: var(--color-crimson);
            font-size: 0.875rem;
          }
        }

        .split-card-actions {
          display: flex;
          gap: 6px;
        }
      }

      .btn-cancel-order {
        border-color: rgba(194, 24, 7, 0.3);
        color: var(--color-crimson);

        &:hover {
          background: #fee2e2;
          border-color: var(--color-crimson);
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
      }

      .footer-left-action {
        margin-right: auto;
      }

      .footer-right-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      /* Edit Order Modal on Queue */
      .edit-queue-order-modal {
        max-width: 960px;
        width: 100%;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
      }

      .edit-queue-workspace {
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

      .pickup-ref-input {
        background: var(--color-surface-hover);
        font-weight: 700;
        color: #7d6514;
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
          transition:
            transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
            background-color 0.15s ease,
            opacity 0.15s ease;

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

      .card-util-btn.paid-locked {
        border-color: rgba(184, 134, 11, 0.3);
        color: #8b6508;
        background: rgba(184, 134, 11, 0.05);

        &:hover {
          background: rgba(184, 134, 11, 0.12);
          border-color: #b8860b;
        }
      }

      /* Order Side Drawer */
      .side-drawer-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(2px);
        z-index: 990;
        animation: fadeIn 0.2s ease-out;
      }

      .order-side-drawer {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        max-width: 480px;
        background: var(--color-surface);
        box-shadow: -8px 0 32px rgba(0, 0, 0, 0.15);
        z-index: 995;
        display: flex;
        flex-direction: column;
        animation: slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;
      }

      @keyframes slideInRight {
        from {
          transform: translateX(100%);
        }
        to {
          transform: translateX(0);
        }
      }

      .drawer-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding: 18px 20px;
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface);
        gap: 12px;
      }

      .drawer-title-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }

      .drawer-title-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .drawer-order-num {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 800;
        color: var(--color-onyx);
        letter-spacing: -0.01em;
      }

      .drawer-sub-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .drawer-type-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        background: rgba(186, 12, 47, 0.08);
        color: var(--color-crimson);
        font-weight: 700;
        border-radius: var(--radius-full);

        &.takeaway-pill {
          background: rgba(30, 41, 59, 0.08);
          color: var(--color-onyx);
        }
      }

      .drawer-time-stamp {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .drawer-body {
        flex: 1;
        overflow-y: auto;
        padding: 16px 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .drawer-section-card {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .section-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .section-card-title {
        font-size: 0.8125rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-text-muted);
        display: flex;
        align-items: center;
        gap: 6px;

        i {
          font-size: 1rem;
          color: var(--color-crimson);
        }
      }

      .current-stage-tag {
        font-size: 0.6875rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        padding: 2px 8px;
        border-radius: var(--radius-xs);
        background: var(--color-onyx);
        color: #fff;
      }

      .drawer-info-grid {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .drawer-info-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.8125rem;
        gap: 8px;
      }

      .drawer-info-label {
        color: var(--color-text-muted);
        flex-shrink: 0;
      }

      .drawer-info-value {
        color: var(--color-onyx);
        text-align: right;
        word-break: break-word;
      }

      .drawer-phone-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .btn-tel-call {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: var(--radius-xs);
        background: var(--color-crimson);
        color: #fff;
        text-decoration: none;
        transition: opacity var(--transition-fast);

        &:hover {
          opacity: 0.88;
        }
      }

      .drawer-server-locked {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.8125rem;
      }

      .btn-unlock-server {
        background: transparent;
        border: 1px solid var(--color-border);
        color: var(--color-text-muted);
        font-size: 0.6875rem;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: var(--radius-xs);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;

        &:hover {
          color: var(--color-onyx);
          border-color: var(--color-onyx);
        }
      }

      .drawer-server-select-wrap {
        min-width: 140px;
      }

      /* Billing Card */
      .payment-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.6875rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        padding: 3px 8px;
        border-radius: var(--radius-xs);

        &.status-paid {
          background: rgba(46, 125, 50, 0.1);
          color: #2e7d32;
          border: 1px solid rgba(46, 125, 50, 0.25);
        }

        &.status-unpaid {
          background: rgba(184, 134, 11, 0.1);
          color: #b8860b;
          border: 1px solid rgba(184, 134, 11, 0.3);
        }
      }

      .unpaid-alert-banner {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        background: rgba(184, 134, 11, 0.08);
        border: 1px solid rgba(184, 134, 11, 0.25);
        border-radius: var(--radius-sm);
        margin-bottom: 10px;

        i {
          font-size: 1.125rem;
          color: #b8860b;
          margin-top: 1px;
        }

        strong {
          display: block;
          font-size: 0.8125rem;
          color: #8b6508;
        }

        p {
          margin: 2px 0 0;
          font-size: 0.75rem;
          color: var(--color-text-secondary);
        }
      }

      .billing-buttons-cluster {
        display: flex;
        gap: 8px;
      }

      .completed-summary-box {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .completed-chips-cluster {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .completed-invoice-actions {
        display: flex;
        gap: 8px;
        margin-top: 6px;
      }

      .cancelled-summary-box {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        background: rgba(186, 12, 47, 0.06);
        border: 1px solid rgba(186, 12, 47, 0.2);
        border-radius: var(--radius-sm);

        i {
          font-size: 1.5rem;
        }
      }

      .paid-pending-print-box {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .checkout-glow {
        box-shadow: 0 4px 14px rgba(186, 12, 47, 0.3);
      }

      /* Dishes & Items */
      .drawer-items-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .drawer-item-row {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 8px 10px;
        background: var(--color-surface);
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
      }

      .item-qty-badge {
        font-weight: 800;
        font-size: 0.75rem;
        color: var(--color-crimson);
        padding: 2px 6px;
        background: rgba(186, 12, 47, 0.08);
        border-radius: var(--radius-xs);
        flex-shrink: 0;
        margin-top: 1px;
      }

      .item-info-col {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .item-name-txt {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-onyx);
      }

      .item-sub-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 2px;
      }

      .portion-tag,
      .variant-tag,
      .addon-tag {
        font-size: 0.625rem;
        font-weight: 600;
        padding: 1px 5px;
        border-radius: var(--radius-xs);
        background: var(--color-bone);
        color: var(--color-text-secondary);
      }

      .addon-tag {
        color: var(--color-crimson);
        background: rgba(186, 12, 47, 0.05);
      }

      .notes-tag {
        font-size: 0.625rem;
        font-style: italic;
        color: var(--color-text-muted);
        display: flex;
        align-items: center;
        gap: 3px;
      }

      .item-price-col {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        flex-shrink: 0;
      }

      .item-rate {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
      }

      .item-total-val {
        font-size: 0.8125rem;
        color: var(--color-onyx);
      }

      /* Financial Summary */
      .drawer-financial-summary {
        margin-top: 4px;
        padding-top: 10px;
        border-top: 1px dashed var(--color-border);
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .fin-row {
        display: flex;
        justify-content: space-between;
        font-size: 0.8125rem;
        color: var(--color-text-secondary);

        &.discount-row {
          color: #2e7d32;
          font-weight: 600;
        }
      }

      .fin-total-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 8px;
        margin-top: 4px;
        border-top: 1px solid var(--color-border);

        .total-lbl {
          font-size: 0.9375rem;
          font-weight: 800;
          color: var(--color-onyx);
        }

        .total-amt {
          font-size: 1.125rem;
          font-weight: 900;
          color: var(--color-crimson);
        }
      }

      /* Quick Actions */
      .drawer-quick-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-top: 4px;
      }

      .btn-danger-outline {
        background: transparent;
        border: 1px solid rgba(186, 12, 47, 0.4);
        color: var(--color-crimson);
        font-weight: 600;
        padding: 8px 14px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: all var(--transition-fast);

        &:hover {
          background: rgba(186, 12, 47, 0.08);
          border-color: var(--color-crimson);
        }
      }
    `,
  ],
})
export class OrderQueueComponent {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);
  readonly authService = inject(AdminAuthService);
  private adminAuth = this.authService;
  private router = inject(Router);
  readonly whatsAppBridge = inject(WhatsAppBridgeService);

  restaurant = this.dataService.restaurant;

  get cgstRate(): number {
    return this.restaurant()?.taxSettings?.cgstRate ?? 2.5;
  }

  get sgstRate(): number {
    return this.restaurant()?.taxSettings?.sgstRate ?? 2.5;
  }

  get gstRate(): number {
    return this.cgstRate + this.sgstRate;
  }

  getOrderCgstRate(ord: Order | null | undefined): number {
    if (!ord) return this.cgstRate;
    if (typeof (ord as any).cgstRate === 'number') return (ord as any).cgstRate;
    if (typeof (ord as any).cgst_rate === 'number') return (ord as any).cgst_rate;
    if (ord.subtotal > 0 && ord.cgstAmount) {
      return Math.round((ord.cgstAmount / ord.subtotal) * 1000) / 10;
    }
    return this.cgstRate;
  }

  getOrderSgstRate(ord: Order | null | undefined): number {
    if (!ord) return this.sgstRate;
    if (typeof (ord as any).sgstRate === 'number') return (ord as any).sgstRate;
    if (typeof (ord as any).sgst_rate === 'number') return (ord as any).sgst_rate;
    if (ord.subtotal > 0 && ord.sgstAmount) {
      return Math.round((ord.sgstAmount / ord.subtotal) * 1000) / 10;
    }
    return this.sgstRate;
  }

  readonly isLoading = computed(
    () => this.dataService.isOrdersLoading() || !this.dataService.ordersLoaded(),
  );

  // Order side panel drawer state
  selectedSidePanelOrderId = signal<string | null>(null);
  selectedSidePanelOrder = computed(() => {
    const id = this.selectedSidePanelOrderId();
    if (!id) return null;
    return this.orders().find((o) => o.id === id) || null;
  });

  openOrderSidePanel(ord: Order): void {
    this.selectedSidePanelOrderId.set(ord.id);
  }

  closeOrderSidePanel(): void {
    this.selectedSidePanelOrderId.set(null);
  }

  printOrderReceipt(ord: Order): void {
    const freshOrd = this.mock.orders().find((o) => o.id === ord.id) || ord;
    if (!this.isOrderPaid(freshOrd) || freshOrd.status === 'CANCELLED') {
      this.toastService.warning('Cannot print bill for an unpaid or cancelled order.');
      return;
    }
    if ((freshOrd.printCount || 0) > 0) {
      this.router.navigate(['/admin/billing', freshOrd.id], { queryParams: { reprint: 'true' } });
    } else {
      this.router.navigate(['/admin/billing', freshOrd.id], {
        queryParams: { preview: 'thermal' },
      });
    }
  }

  handlePrintInvoice(ord: Order): void {
    if (!this.isOrderPaid(ord) || ord.status === 'CANCELLED') {
      this.toastService.warning('Cannot print bill for an unpaid or cancelled order.');
      return;
    }
    if (this.isNavigatingToInvoice()) return;
    this.isNavigatingToInvoice.set(ord.id);
    this.printOrderReceipt(ord);
    setTimeout(() => {
      this.isNavigatingToInvoice.set(null);
    }, 1200);
  }

  handleCheckoutAndPrint(session: any): void {
    const ord = session.primaryOrder;
    if (!ord) return;
    if (session.isAllPaid || this.isOrderPaid(ord)) {
      this.handlePrintInvoice(ord);
      return;
    }
    this.openSettleModal(ord);
  }

  isOrderPaid(order: Order | null | undefined): boolean {
    if (!order) return false;
    const ps = (order.paymentStatus || '').toUpperCase();
    if (ps === 'PAID' || ps === 'COMPLETED') return true;
    if (order.status === 'COMPLETED' || !!order.settledAt) return true;
    if (order.isSplit && this.areAllSplitBillsPaid(order.id)) return true;
    return false;
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showChangeTableModal()) {
      this.closeChangeTableModal();
    }
    if (this.selectedSidePanelOrderId()) {
      this.closeOrderSidePanel();
    }
  }

  network = inject(NetworkStatusService);
  soundService = inject(SoundService);
  orders = this.mock.orders;
  tables = this.mock.tables;
  menuItems = this.mock.menuItems;
  staffMembers = this.dataService.staffMembers;

  selectedStatus = signal<string>('ACTIVE');
  searchQuery = signal<string>('');
  latestNewOrderId = signal<string | null>(null);
  lastSyncTime = signal<Date>(new Date());

  streamStatusText = computed(() => {
    if (!this.network.isOnline()) {
      return 'Stream Offline';
    }
    return 'Live Order Stream';
  });

  streamTooltip = computed(() => {
    if (!this.network.isOnline()) {
      return 'Internet: Offline | Real-time cross-station order stream is paused until network reconnects';
    }
    const channel = this.network.isBroadcastChannelSupported()
      ? 'WebSocket + BroadcastChannel Active'
      : 'WebSocket + LocalStorage Sync Active';
    const timeStr = this.lastSyncTime().toLocaleTimeString();
    return `Status: Connected | Transport: ${channel} | Active Queue: ${this.activeOrdersCount()} | Last Event: ${timeStr}`;
  });

  emptyStateTitle = computed(() => {
    const q = this.searchQuery().trim();
    if (q) return `No orders matching "${q}"`;
    const st = this.selectedStatus();
    if (st === 'ACTIVE') {
      return this.orders().length > 0 ? 'No Active Orders' : 'Order Queue Clear';
    }
    if (st === 'COMPLETED') return 'No Completed Orders Yet';
    return `No ${st.charAt(0) + st.slice(1).toLowerCase()} Orders`;
  });

  emptyStateMessage = computed(() => {
    const q = this.searchQuery().trim();
    if (q) return 'Check the order number, guest name, or clear the search query.';
    const st = this.selectedStatus();
    if (st === 'ACTIVE' && this.orders().length > 0) {
      const compCount = this.countByStatus('COMPLETED');
      return `All active tickets are fulfilled. You have ${compCount} completed order${compCount === 1 ? '' : 's'} in today's archive.`;
    }
    return 'Incoming dine-in QR orders, takeaway tickets, and walk-ins appear here automatically.';
  });

  emptyStateActionText = computed(() => {
    if (this.searchQuery().trim()) return 'Clear Search';
    return 'New Order';
  });

  emptyStateActionIcon = computed(() => {
    if (this.searchQuery().trim()) return 'ph-x';
    return 'ph-plus-circle';
  });

  emptyStateSecondaryText = computed(() => {
    if (this.searchQuery().trim()) return '';
    const st = this.selectedStatus();
    if (st === 'ACTIVE' && this.countByStatus('COMPLETED') > 0) {
      return `View Completed (${this.countByStatus('COMPLETED')})`;
    }
    if (st !== 'ACTIVE' && this.activeOrdersCount() > 0) {
      return `View Active (${this.activeOrdersCount()})`;
    }
    return '';
  });

  onEmptyStateAction() {
    if (this.searchQuery().trim()) {
      this.searchQuery.set('');
    } else {
      this.openManualOrderModal();
    }
  }

  onEmptyStateSecondary() {
    const st = this.selectedStatus();
    if (st === 'ACTIVE' && this.countByStatus('COMPLETED') > 0) {
      this.selectedStatus.set('COMPLETED');
    } else {
      this.selectedStatus.set('ACTIVE');
    }
  }

  constructor() {
    this.dataService.loadStaff();
    let lastHandledEventTimestamp = 0;
    effect(() => {
      const ev = this.dataService.liveOrderEvent();
      if (!ev) return;
      if (ev.timestamp && ev.timestamp === lastHandledEventTimestamp) return;
      lastHandledEventTimestamp = ev.timestamp || Date.now();

      this.lastSyncTime.set(new Date());

      if (ev.type === 'ORDER_CREATED' && ev.order) {
        const order = ev.order;
        this.latestNewOrderId.set(order.id);
        const loc =
          order.orderType === 'TAKEAWAY' ? 'Takeaway' : `Table ${order.tableNumber || '?'}`;
        this.toastService.info(
          `New live QR order ${order.orderNumber} placed for ${loc} (${order.items.length} dishes)`,
          '🔔 Real-time Live Order',
        );
        this.soundService.playOrderArrivalSound();
        setTimeout(() => {
          if (this.latestNewOrderId() === order.id) {
            this.latestNewOrderId.set(null);
          }
        }, 8000);
      }
    });
  }

  showManualModal = false;
  manualTableId = signal<string>('');
  readonly selectedManualTable = computed(
    () => this.tables().find((t) => t.id === this.manualTableId()) || null,
  );
  clearManualTray(): void {
    this.manualItems = [];
  }
  manualCustomerName = '';
  manualCustomerPhone = '';
  manualSelectedDishId = '';
  manualItems: OrderItem[] = [];

  // Settle Bill Modal & Split state
  showSettleModal = signal<boolean>(false);
  selectedOrderForSettlement = signal<Order | null>(null);
  selectedPaymentMethod = signal<'UPI' | 'CASH' | 'CARD'>('UPI');
  settleMode = signal<'FULL' | 'SPLIT'>('FULL');
  splitCount = signal<number>(2);
  isSettling = signal<boolean>(false);
  isProcessingCheckout = signal<string | null>(null);
  isNavigatingToInvoice = signal<string | null>(null);

  // WhatsApp Delivery State
  showWhatsAppModal = signal<boolean>(false);
  whatsAppOrder = signal<Order | null>(null);
  whatsAppPhone = signal<string>('');
  whatsAppCustomMessage = signal<string>('');
  isDispatchingWhatsApp = signal<boolean>(false);

  whatsAppMessagePreview = computed(() => {
    if (this.whatsAppCustomMessage()) {
      return this.whatsAppCustomMessage();
    }
    const ord = this.whatsAppOrder();
    if (!ord) return '';
    const restName = this.dataService.restaurant()?.name || 'GuruKripa Dhaba';
    return buildWhatsAppBillMessage(restName, ord, null);
  });

  whatsAppWebUrl = computed(() => {
    const ord = this.whatsAppOrder();
    if (!ord) return '';
    const restName = this.dataService.restaurant()?.name || 'GuruKripa Dhaba';
    return getWhatsAppWebUrl(this.whatsAppPhone(), restName, ord, null);
  });

  whatsAppAppUrl = computed(() => {
    const ord = this.whatsAppOrder();
    if (!ord) return '';
    const restName = this.dataService.restaurant()?.name || 'GuruKripa Dhaba';
    return getWhatsAppAppUrl(this.whatsAppPhone(), restName, ord, null);
  });

  // Settlement Discount & Offers state
  settleDiscountMode = signal<'CUSTOM' | 'COUPON'>('CUSTOM');
  customDiscountRupees = signal<number>(0);
  selectedCouponCode = signal<string>('');
  activeCoupons = computed(() =>
    this.mock.coupons ? this.mock.coupons().filter((c) => c.isActive) : [],
  );

  // Cancel Order Modal state
  showCancelModal = signal<boolean>(false);
  orderToCancel = signal<Order | null>(null);
  cancellationReason = signal<string>('');

  // Reallot / Change Table Modal state
  showChangeTableModal = signal<boolean>(false);
  orderForTableChange = signal<Order | null>(null);
  selectedNewTableId = signal<string>('');
  cancelError = signal<string>('');
  isCancelling = signal<boolean>(false);
  readonly commonCancelReasons: string[] = [
    'Guest Walked Out',
    'Ordered in Error',
    'Kitchen Shortage',
    'Customer Cancelled',
    'Duplicate Order Entry',
  ];

  // Admin Password Override for Paid Orders
  showAdminPasswordModal = signal<boolean>(false);
  adminPasswordInput = signal<string>('');
  adminPasswordError = signal<string>('');
  pendingEditOrder = signal<Order | null>(null);
  isManagerOverrideActive = signal<boolean>(false);

  // Admin Password Override for Changing Server on Completed Orders
  showServerAdminModal = signal<boolean>(false);
  pendingServerOrder = signal<Order | null>(null);
  selectedNewStaffId = signal<string>('');
  serverAdminPasswordInput = signal<string>('');
  serverAdminPasswordError = signal<string>('');

  // Edit Order Modal state
  showEditModal = signal<boolean>(false);
  editingOrder = signal<Order | null>(null);
  editCustomerName = signal<string>('');
  editCustomerPhone = signal<string>('');
  editTableId = signal<string>('');
  editItems = signal<OrderItem[]>([]);
  editDishSearch = signal<string>('');
  isSavingEdit = signal<boolean>(false);

  filteredEditMenuItems = computed(() => {
    const q = this.editDishSearch().toLowerCase().trim();
    const items = this.menuItems();
    if (!q) return items.slice(0, 10);
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
    const ord = this.editingOrder();
    const rate = ord ? this.getOrderCgstRate(ord) + this.getOrderSgstRate(ord) : this.gstRate;
    return Math.round(this.editSubtotal() * (rate / 100) * 100) / 100;
  });

  editTotal = computed(() => {
    const ord = this.editingOrder();
    const discount = ord?.discountAmount || 0;
    return Math.max(0, this.editSubtotal() + this.editTax() - discount);
  });

  isOrderActive(o: Order): boolean {
    if (o.status === 'CANCELLED') return false;
    // Keep in active if status is in active kitchen/floor dispatch progression
    if (['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED', 'SERVED'].includes(o.status)) {
      return true;
    }
    // Also keep in active if order has not been fully paid/settled
    if (!this.isOrderPaid(o)) {
      return true;
    }
    return false;
  }

  groupOrdersIntoSessions(ordersList: Order[]): OrderSessionGroup[] {
    const sessionMap = new Map<string, Order[]>();

    for (const ord of ordersList) {
      let key = '';
      if (ord.seatingSessionId) {
        key = `sess_${ord.seatingSessionId}`;
      } else {
        // No session ID → each order is its own standalone session.
        // Never group by table alone: different customer visits at the same table
        // must stay separate. seatingSessionId is the ONLY grouping key.
        key = `single_${ord.id}`;
      }

      if (!sessionMap.has(key)) {
        sessionMap.set(key, []);
      }
      sessionMap.get(key)!.push(ord);
    }

    const groups: OrderSessionGroup[] = [];

    for (const [sId, groupOrders] of sessionMap.entries()) {
      const sorted = [...groupOrders].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const primary = sorted[0];
      const latest = sorted[sorted.length - 1];

      const grandSubtotal =
        Math.round(sorted.reduce((sum, r) => sum + (r.subtotal || 0), 0) * 100) / 100;
      const grandTax =
        Math.round(sorted.reduce((sum, r) => sum + (r.taxAmount || 0), 0) * 100) / 100;
      const grandDiscount =
        Math.round(sorted.reduce((sum, r) => sum + (r.discountAmount || 0), 0) * 100) / 100;
      const grossTotal = Math.round((grandSubtotal + grandTax) * 100) / 100;
      const grandTotal = Math.round(Math.max(0, grossTotal - grandDiscount));

      const isAllCompleted = sorted.every((r) => r.status === 'COMPLETED');
      const isAllPaid = sorted.every((r) => r.paymentStatus === 'PAID');

      // Determine highest operational priority status across active rounds
      let effectiveStatus: OrderStatus = latest.status;
      if (sorted.some((r) => r.status === 'PENDING')) {
        effectiveStatus = 'PENDING';
      } else if (sorted.some((r) => r.status === 'ACCEPTED')) {
        effectiveStatus = 'ACCEPTED';
      } else if (sorted.some((r) => r.status === 'PREPARING')) {
        effectiveStatus = 'PREPARING';
      } else if (sorted.some((r) => r.status === 'READY')) {
        effectiveStatus = 'READY';
      } else if (sorted.some((r) => r.status === 'DISPATCHED')) {
        effectiveStatus = 'DISPATCHED';
      } else if (sorted.every((r) => r.status === 'SERVED')) {
        effectiveStatus = 'SERVED';
      } else if (isAllCompleted) {
        effectiveStatus = 'COMPLETED';
      } else if (sorted.every((r) => r.status === 'CANCELLED')) {
        effectiveStatus = 'CANCELLED';
      }

      const maxPrint = Math.max(0, ...sorted.map((r) => r.printCount || 0));
      const hasSplit = sorted.some((r) => r.isSplit);
      const splitCnt = sorted.find((r) => r.isSplit)?.splitCount;

      groups.push({
        sessionId: sId,
        primaryOrder: primary,
        latestOrder: latest,
        orders: sorted,
        isMultiRound: sorted.length > 1,
        orderCount: sorted.length,
        tableNumber: primary.tableNumber,
        tableId: primary.tableId,
        orderType: primary.orderType || 'DINE_IN',
        pickupReference: primary.pickupReference,
        customerName: primary.customerName || 'Walk-in Guest',
        customerPhone: primary.customerPhone,
        serverStaffId: sorted.find((r) => r.serverStaffId)?.serverStaffId || primary.serverStaffId,
        createdAt: primary.createdAt,
        latestCreatedAt: latest.createdAt,
        grandSubtotal,
        grandTax,
        grandDiscount,
        grandTotal,
        effectiveStatus,
        isAllCompleted,
        isAllPaid,
        isSplit: hasSplit,
        splitCount: splitCnt,
        printCount: maxPrint,
        paymentMethod: sorted.find((r) => r.paymentMethod)?.paymentMethod || primary.paymentMethod,
      });
    }

    return groups;
  }

  isSessionNew(session: OrderSessionGroup): boolean {
    const newId = this.latestNewOrderId();
    if (!newId) return false;
    return session.orders.some((o) => o.id === newId);
  }

  isSessionSelected(session: OrderSessionGroup): boolean {
    const selId = this.selectedSidePanelOrderId();
    if (!selId) return false;
    return session.orders.some((o) => o.id === selId);
  }

  getSessionOrders(ord: Order | null): Order[] {
    if (!ord) return [];
    const groups = this.groupOrdersIntoSessions(this.orders());
    const sess = groups.find((g) => g.orders.some((o) => o.id === ord.id));
    return sess ? sess.orders : [ord];
  }

  getSettlementGrandTotal(ord: Order | null): number {
    const rounds = this.getSessionOrders(ord);
    if (rounds.length <= 1) return ord?.totalAmount !== undefined ? Math.round(ord.totalAmount) : 0;
    const sub = Math.round(rounds.reduce((sum, r) => sum + (r.subtotal || 0), 0) * 100) / 100;
    const tax = Math.round(rounds.reduce((sum, r) => sum + (r.taxAmount || 0), 0) * 100) / 100;
    const disc =
      Math.round(rounds.reduce((sum, r) => sum + (r.discountAmount || 0), 0) * 100) / 100;
    return Math.round(Math.max(0, sub + tax - disc));
  }

  getSettlementItemsCount(ord: Order | null): number {
    const rounds = this.getSessionOrders(ord);
    return rounds.reduce((sum, r) => sum + (r.items ? r.items.length : 0), 0);
  }

  selectedSessionOrders = computed<Order[]>(() => {
    const selOrd = this.selectedSidePanelOrder();
    if (!selOrd) return [];
    return this.getSessionOrders(selOrd);
  });

  activeOrdersCount = computed(() => {
    return this.groupOrdersIntoSessions(this.orders()).filter(
      (g) =>
        !g.isAllCompleted &&
        !g.isAllPaid &&
        g.effectiveStatus !== 'COMPLETED' &&
        g.effectiveStatus !== 'CANCELLED',
    ).length;
  });

  countByStatus(status: OrderStatus): number {
    const groups = this.groupOrdersIntoSessions(this.orders());
    if (status === 'COMPLETED') {
      return groups.filter(
        (g) => g.isAllCompleted || g.isAllPaid || g.effectiveStatus === 'COMPLETED',
      ).length;
    }
    return groups.filter((g) => g.orders.some((o) => o.status === status)).length;
  }

  filteredOrderSessions = computed(() => {
    const all = this.orders();
    const groups = this.groupOrdersIntoSessions(all);
    const st = this.selectedStatus();

    let list = groups;

    if (st === 'ACTIVE') {
      list = list.filter(
        (g) =>
          !g.isAllCompleted &&
          !g.isAllPaid &&
          g.effectiveStatus !== 'COMPLETED' &&
          g.effectiveStatus !== 'CANCELLED',
      );
    } else if (st === 'COMPLETED') {
      list = list.filter(
        (g) => g.isAllCompleted || g.isAllPaid || g.effectiveStatus === 'COMPLETED',
      );
    }

    const q = this.searchQuery().toLowerCase().trim();
    if (q) {
      list = list.filter(
        (g) =>
          g.orders.some((o) => o.orderNumber.toLowerCase().includes(q)) ||
          g.customerName.toLowerCase().includes(q) ||
          (g.customerPhone && g.customerPhone.toLowerCase().includes(q)) ||
          (g.pickupReference && g.pickupReference.toLowerCase().includes(q)) ||
          (g.tableNumber && g.tableNumber.toLowerCase().includes(q)) ||
          g.orders.some((o) => o.items.some((it) => it.name.toLowerCase().includes(q))),
      );
    }

    return list.sort(
      (a, b) => new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime(),
    );
  });

  filteredOrders = computed(() => {
    return this.filteredOrderSessions().flatMap((g) => g.orders);
  });

  categories = this.mock.categories;
  manualDishSearch = signal<string>('');
  manualDishCategory = signal<string>('ALL');
  manualDishDietary = signal<string>('ALL');

  filteredManualDishes = computed(() => {
    let list = this.menuItems();
    const cat = this.manualDishCategory();
    if (cat !== 'ALL') {
      list = list.filter((m) => m.categoryId === cat);
    }
    const diet = this.manualDishDietary();
    if (diet !== 'ALL') {
      list = list.filter((m) => m.dietary === diet);
    }
    const q = this.manualDishSearch().toLowerCase().trim();
    if (q) {
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.description && m.description.toLowerCase().includes(q)),
      );
    }
    return list;
  });

  getItemCountInManualOrder(menuItemId: string): number {
    const item = this.manualItems.find((i) => i.menuItemId === menuItemId);
    return item ? item.quantity : 0;
  }

  getDishAvailability(dishId: string): MenuStockStatus {
    return this.mock.getMenuItemAvailability(dishId);
  }

  manualOrderType: 'DINE_IN' | 'TAKEAWAY' = 'DINE_IN';
  manualPickupRef = '';

  isTakeawayEnabled(): boolean {
    return this.mock.restaurant()?.orderingSettings?.takeawayEnabled !== false;
  }

  setManualOrderTypeTakeaway(): void {
    if (!this.isTakeawayEnabled()) {
      this.toastService.warning('Takeaway is disabled in restaurant settings');
      return;
    }
    this.manualOrderType = 'TAKEAWAY';
  }

  openManualOrderModal(): void {
    this.manualOrderRequestId = undefined;
    const firstAvail = this.tables().find((t) => t.status === 'AVAILABLE');
    this.manualOrderType = 'DINE_IN';
    this.manualPickupRef = `TK-${Math.floor(100 + Math.random() * 900)}`;
    this.manualTableId.set(firstAvail ? firstAvail.id : '');
    this.manualCustomerName = 'Walk-in Guest';
    this.manualCustomerPhone = '';
    this.manualDishSearch.set('');
    this.manualDishCategory.set('ALL');
    this.manualDishDietary.set('ALL');
    this.manualItems = [];
    this.showManualModal = true;
  }

  addDishToManualOrder(dish: MenuItem): void {
    const avail = this.mock.getMenuItemAvailability(dish.id);
    if (avail === 'OUT_OF_STOCK' || !dish.isAvailable) {
      this.toastService.warning(`${dish.name} is currently out of stock.`);
      return;
    }

    const existing = this.manualItems.find((i) => i.menuItemId === dish.id);
    if (existing) {
      existing.quantity++;
      existing.itemTotal = existing.quantity * existing.unitPrice;
    } else {
      this.manualItems.push({
        id: `oi-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        menuItemId: dish.id,
        name: dish.name,
        unitPrice: dish.price,
        quantity: 1,
        itemTotal: dish.price,
        selectedVariants: [],
        selectedAddons: [],
      });
    }

    this.toastService.info(`Added ${dish.name} to order`);
  }

  updateManualItemQty(item: OrderItem, delta: number): void {
    item.quantity += delta;
    if (item.quantity <= 0) {
      this.manualItems = this.manualItems.filter((i) => i !== item);
    } else {
      item.itemTotal = item.quantity * item.unitPrice;
    }
  }

  removeManualItem(index: number): void {
    this.manualItems.splice(index, 1);
  }

  manualSubtotal(): number {
    return this.manualItems.reduce((acc, curr) => acc + curr.itemTotal, 0);
  }

  manualTax(): number {
    return Math.round(this.manualSubtotal() * (this.gstRate / 100) * 100) / 100;
  }

  manualTotal(): number {
    return Math.round((this.manualSubtotal() + this.manualTax()) * 100) / 100;
  }

  private isSubmittingManualOrder = false;

  private manualOrderRequestId?: string;

  async submitManualOrder(): Promise<void> {
    if (this.isSubmittingManualOrder || this.manualItems.length === 0) return;
    this.isSubmittingManualOrder = true;
    try {
      const isTakeaway = this.manualOrderType === 'TAKEAWAY';

      if (isTakeaway) {
        if (!this.isTakeawayEnabled()) {
          this.toastService.error('Takeaway orders are currently disabled in restaurant settings.');
          return;
        }
      } else {
        if (!this.manualTableId() || this.manualTableId() === 'counter') {
          const firstAvail = this.tables().find((t) => t.status === 'AVAILABLE');
          if (!firstAvail) {
            this.toastService.error('A dining table is required for dine-in orders.');
            return;
          }
          this.manualTableId.set(firstAvail.id);
        }
      }

      const validation = this.mock.validateOrderStockAvailability(this.manualItems);
      if (!validation.isValid) {
        this.toastService.error(`Cannot place order: ${validation.errors.join('; ')}`);
        return;
      }

      const sub = this.manualSubtotal();
      const cgstAmt = Math.round(sub * (this.cgstRate / 100) * 100) / 100;
      const sgstAmt = Math.round(sub * (this.sgstRate / 100) * 100) / 100;
      const tax = Math.round((cgstAmt + sgstAmt) * 100) / 100;
      const tot = this.manualTotal();

      const selectedTable = isTakeaway
        ? undefined
        : this.tables().find((t) => t.id === this.manualTableId());

      const existingActiveTableOrder =
        !isTakeaway && selectedTable
          ? this.orders().find(
              (o) =>
                (o.tableId === selectedTable.id || o.tableNumber === selectedTable.number) &&
                o.status !== 'CANCELLED' &&
                o.paymentStatus !== 'PAID' &&
                o.seatingSessionId,
            )
          : undefined;

      const generateUuid = () =>
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });

      const assignedSessionId =
        existingActiveTableOrder?.seatingSessionId ||
        selectedTable?.currentSeatingSessionId ||
        (!isTakeaway && selectedTable ? generateUuid() : undefined);

      const orderNum = `#ORD-${Math.floor(100 + Math.random() * 900)}`;

      const orderUuid = (this.manualOrderRequestId ??= generateUuid());

      const newOrder: Order = {
        id: orderUuid,
        orderNumber: orderNum,
        orderType: this.manualOrderType,
        pickupReference: isTakeaway ? this.manualPickupRef : undefined,
        restaurantSlug: 'gurukripa-dhaba',
        tableId: !isTakeaway && selectedTable ? selectedTable.id : undefined,
        tableNumber: !isTakeaway && selectedTable ? selectedTable.number : undefined,
        seatingSessionId: assignedSessionId,
        customerName:
          this.manualCustomerName.trim() || (isTakeaway ? 'Counter Guest' : 'Walk-in Guest'),
        customerPhone: this.manualCustomerPhone.replace(/\s+/g, '').trim() || '',
        items: [...this.manualItems],
        subtotal: sub,
        discountAmount: 0,
        taxAmount: tax,
        cgstRate: this.cgstRate,
        sgstRate: this.sgstRate,
        cgstAmount: cgstAmt,
        sgstAmount: sgstAmt,
        totalAmount: tot,
        status: 'ACCEPTED',
        paymentStatus: 'UNPAID',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [
          {
            status: 'ACCEPTED',
            timestamp: new Date().toISOString(),
            note: isTakeaway
              ? `Manual takeaway order (${this.manualPickupRef}) created at Counter`
              : `Manual walk-in order created for Table ${selectedTable?.number}`,
          },
        ],
      };

      // Persist to backend database via API and record in memory/localStorage
      if (!(await this.dataService.addOrder(newOrder))) return;
      this.manualOrderRequestId = undefined;

      // Reserve stock for the newly accepted manual order
      this.mock.reserveStockForOrder(newOrder.id);

      if (!isTakeaway && selectedTable) {
        const confirmed = this.dataService.orders().find((o) => o.id === newOrder.id);
        const updatedTables = this.mock.tables().map((t) =>
          t.id === selectedTable.id
            ? {
                ...t,
                status: 'OCCUPIED' as const,
                activeOrderId: newOrder.id,
                currentSeatingSessionId: confirmed?.seatingSessionId,
              }
            : t,
        );
        this.mock.tables.set(updatedTables);
        this.mock.saveLocal('tables', updatedTables);
      }

      this.toastService.success(
        isTakeaway
          ? `Takeaway order ${newOrder.orderNumber} placed (Pickup Ref: ${newOrder.pickupReference})`
          : `Manual order ${newOrder.orderNumber} placed for Table ${newOrder.tableNumber}`,
      );
      this.showManualModal = false;
    } finally {
      this.isSubmittingManualOrder = false;
    }
  }

  handleTableBadgeClick(event: Event, order: Order): void {
    event.stopPropagation();
    if (!this.isOrderPaid(order)) {
      this.openChangeTableModal(order);
    }
  }

  openChangeTableModal(order: Order): void {
    if (this.isOrderPaid(order)) {
      this.toastService.warning('Cannot change table for settled or completed orders.');
      return;
    }
    this.orderForTableChange.set(order);
    this.selectedNewTableId.set(order.tableId || '');
    this.showChangeTableModal.set(true);
  }

  closeChangeTableModal(): void {
    this.showChangeTableModal.set(false);
    this.orderForTableChange.set(null);
    this.selectedNewTableId.set('');
  }

  confirmChangeTable(): void {
    const ord = this.orderForTableChange();
    const newTableId = this.selectedNewTableId();
    if (!ord || !newTableId) return;

    const newTable = this.tables().find((t) => t.id === newTableId || t.number === newTableId);
    if (!newTable) {
      this.toastService.error('Selected table not found');
      return;
    }

    if (ord.tableId === newTable.id) {
      this.toastService.info(`Order is already allotted to Table ${newTable.number}`);
      this.closeChangeTableModal();
      return;
    }

    const res = this.mock.transferTable({
      orderId: ord.id,
      destinationTableId: newTable.id,
      staffName: 'Admin / POS',
    });

    if (!res.success) {
      this.toastService.warning(res.error || 'Cannot reallot table');
      return;
    }

    // Update backend table statuses via API & local state
    this.mock.updateTableStatus(newTable.id, 'OCCUPIED');
    if (ord.tableId && ord.tableId !== newTable.id) {
      const remainingActive = this.mock
        .orders()
        .some(
          (o) =>
            o.id !== ord.id &&
            o.tableId === ord.tableId &&
            !['COMPLETED', 'CANCELLED'].includes(o.status),
        );
      if (!remainingActive) {
        this.mock.updateTableStatus(ord.tableId, 'AVAILABLE');
      }
    }

    // Update local orders state & persistence
    const currentOrders = this.mock.orders().map((o) =>
      o.id === ord.id
        ? {
            ...o,
            tableId: newTable.id,
            tableNumber: newTable.number,
            orderType: 'DINE_IN' as const,
            timeline: [
              ...o.timeline,
              {
                status: o.status,
                timestamp: new Date().toISOString(),
                note: `Table changed from Table ${ord.tableNumber || 'Unassigned'} to Table ${newTable.number}`,
              },
            ],
          }
        : o,
    );
    this.mock.orders.set(currentOrders);
    this.mock.saveLocal('orders', currentOrders);

    this.toastService.success(
      `Order ${ord.orderNumber} successfully allotted to Table ${newTable.number} (${newTable.section})`,
    );
    this.closeChangeTableModal();
  }

  isStaffInList(staffId: string | undefined): boolean {
    if (!staffId) return true;
    return this.staffMembers().some((s) => s.id === staffId);
  }

  getServerStaffName(staffId: string | undefined): string {
    if (!staffId) return '';
    const staff = this.staffMembers().find((s) => s.id === staffId);
    return staff ? `${staff.name} (${staff.role})` : staffId;
  }

  promptChangeCompletedServer(ord: Order): void {
    this.pendingServerOrder.set(ord);
    this.selectedNewStaffId.set(ord.serverStaffId || '');
    this.serverAdminPasswordInput.set('');
    this.serverAdminPasswordError.set('');
    this.showServerAdminModal.set(true);
  }

  async confirmChangeCompletedServer(): Promise<void> {
    const ord = this.pendingServerOrder();
    if (!ord) return;

    const pwd = this.serverAdminPasswordInput().trim();
    if (!(await this.adminAuth.verifyAdminPassword(pwd))) {
      this.serverAdminPasswordError.set(
        'Incorrect admin password. Authorization required to change serving staff on completed orders.',
      );
      return;
    }

    const newStaffId = this.selectedNewStaffId();
    const res = await this.dataService.assignOrderServer(
      ord.id,
      newStaffId ? newStaffId : null,
      pwd,
    );

    if (res.success) {
      const staffName = this.getServerStaffName(newStaffId) || 'Unassigned';
      this.toastService.success(
        `Serving staff for completed order ${ord.orderNumber} updated to ${staffName} (Admin Authorized)`,
      );
      this.closeServerAdminModal();
    } else {
      this.serverAdminPasswordError.set(res.error || 'Failed to update serving staff');
    }
  }

  closeServerAdminModal(): void {
    this.showServerAdminModal.set(false);
    this.pendingServerOrder.set(null);
    this.selectedNewStaffId.set('');
    this.serverAdminPasswordInput.set('');
    this.serverAdminPasswordError.set('');
  }

  async onAssignOrderServer(ord: Order, staffIdStr: string): Promise<void> {
    if (this.isOrderPaid(ord)) {
      this.promptChangeCompletedServer(ord);
      return;
    }
    const staffId = staffIdStr && staffIdStr.trim().length > 0 ? staffIdStr : null;
    const sessionOrders = this.getSessionOrders(ord);
    for (const s of sessionOrders) {
      const result = await this.dataService.assignOrderServer(s.id, staffId);
      if (!result.success) {
        this.toastService.error(result.error || 'Server assignment failed.');
        return;
      }
    }
    this.toastService.success(`Server assigned for Table ${ord.tableNumber || ord.orderNumber}`);
  }

  // --- Settle Bill Modal Actions ---
  openSettleModal(order: Order): void {
    const sessionOrders = this.getSessionOrders(order);
    if (sessionOrders.length > 1) {
      const allItems = sessionOrders.flatMap((o) => o.items);
      const sub =
        Math.round(sessionOrders.reduce((sum, o) => sum + (o.subtotal || 0), 0) * 100) / 100;
      const tax =
        Math.round(sessionOrders.reduce((sum, o) => sum + (o.taxAmount || 0), 0) * 100) / 100;
      const disc =
        Math.round(sessionOrders.reduce((sum, o) => sum + (o.discountAmount || 0), 0) * 100) / 100;
      const tot = Math.max(0, Math.round((sub + tax - disc) * 100) / 100);
      const consolidated: Order = {
        ...order,
        items: allItems,
        subtotal: sub,
        taxAmount: tax,
        discountAmount: disc,
        totalAmount: tot,
        isSessionConsolidated: true,
        sessionRoundsCount: sessionOrders.length,
        sessionRounds: sessionOrders,
      };
      this.selectedOrderForSettlement.set(consolidated);
    } else {
      this.selectedOrderForSettlement.set(order);
    }
    const defaultMethod =
      order.paymentMethod === 'CARD' ? 'CARD' : order.paymentMethod === 'UPI' ? 'UPI' : 'CASH';
    this.selectedPaymentMethod.set(defaultMethod);
    this.settleMode.set('FULL');
    this.splitCount.set(2);
    this.isSettling.set(false);
    this.customDiscountRupees.set(order.discountAmount || 0);
    this.selectedCouponCode.set(order.appliedCouponCode || '');
    this.settleDiscountMode.set(order.appliedCouponCode ? 'COUPON' : 'CUSTOM');
    this.showSettleModal.set(true);
  }

  getEffectiveDiscount(ord: Order | null): number {
    if (!ord) return 0;
    const subtotal = ord.subtotal || 0;
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

  getSettlementItems(ord: Order | null): OrderItem[] {
    if (!ord) return [];
    const rounds =
      ord.sessionRounds && ord.sessionRounds.length > 0
        ? ord.sessionRounds
        : this.getSessionOrders(ord);
    if (rounds.length > 1) {
      return rounds.flatMap((r) => r.items || []);
    }
    return ord.items || [];
  }

  getSettlementTax(ord: Order | null): number {
    if (!ord) return 0;
    const subtotal = ord.subtotal || 0;
    const taxRate = (this.cgstRate || 2.5) + (this.sgstRate || 2.5);
    if (this.settleDiscountMode() === 'COUPON') {
      const couponDisc = this.getEffectiveDiscount(ord);
      const taxable = Math.max(0, subtotal - couponDisc);
      return Math.round(taxable * (taxRate / 100) * 100) / 100;
    } else {
      return Math.round(subtotal * (taxRate / 100) * 100) / 100;
    }
  }

  getSettlementTotal(ord: Order | null): number {
    if (!ord) return 0;
    const subtotal = ord.subtotal || 0;
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
    const subtotal = ord.subtotal || 0;
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
    this.isSettling.set(false);
  }

  async confirmSettlement(): Promise<void> {
    const ord = this.selectedOrderForSettlement();
    if (!ord || this.isSettling()) return;

    this.isSettling.set(true);
    const method = this.selectedPaymentMethod();
    const finalDiscount = this.getEffectiveDiscount(ord);
    const appliedCode = this.settleDiscountMode() === 'COUPON' ? this.selectedCouponCode() : '';

    // 1. If not yet marked PAID and not split, perform authoritative settlement
    if (ord.paymentStatus !== 'PAID' && !ord.isSplit) {
      const settleRes = await this.mock.settleOrder({
        orderId: ord.id,
        paymentMethod: method,
        discountAmount: finalDiscount,
        appliedCouponCode: appliedCode,
      });

      if (!settleRes.success) {
        this.toastService.warning(settleRes.error || 'Failed to settle order');
        this.isSettling.set(false);
        this.closeSettleModal();
        return;
      }
    }

    // 2. Advance operational status to COMPLETED for this order and any sibling session rounds
    const rounds =
      ord.sessionRounds && ord.sessionRounds.length > 0
        ? ord.sessionRounds
        : this.getSessionOrders(ord);
    for (const r of rounds) {
      if (r.id !== ord.id) {
        this.mock.updateOrderStatusAtomic(r.id, 'COMPLETED', {
          note: `Consolidated & settled under Master Bill #${ord.orderNumber} via ${method}`,
        });
      }
    }

    if (ord.tableId || ord.tableNumber) {
      this.mock.recalculateTableStatus(ord.tableId || ord.tableNumber!);
    }

    this.toastService.success(
      `Order ${ord.orderNumber} successfully settled & marked COMPLETED via ${method}`,
    );
    // Apple-style tactile settlement delay to display loading state clearly
    setTimeout(() => {
      this.isSettling.set(false);
      this.closeSettleModal();
      this.router.navigate(['/admin/billing', ord.id], { queryParams: { preview: 'thermal' } });
    }, 400);
  }

  // --- Split Bill Helpers & Handlers ---
  getOrderSplitBills(orderId: string): SplitBill[] {
    return this.mock.splitBills().filter((b) => b.orderId === orderId);
  }

  areAllSplitBillsPaid(orderId: string): boolean {
    const splits = this.getOrderSplitBills(orderId);
    return splits.length > 0 && splits.every((s) => s.paymentStatus === 'PAID');
  }

  getSplitPreviewIndices(): number[] {
    const count = this.splitCount();
    const arr: number[] = [];
    for (let i = 0; i < count; i++) arr.push(i);
    return arr;
  }

  getEqualSplitPartAmount(order: Order, index: number): number {
    const n = this.splitCount();
    const totalCents = Math.round(order.totalAmount * 100);
    const baseCents = Math.floor(totalCents / n);
    const rem = totalCents % n;
    return (baseCents + (index < rem ? 1 : 0)) / 100;
  }

  incrementSplitCount(): void {
    if (this.splitCount() < 6) {
      this.splitCount.update((c) => c + 1);
    }
  }

  decrementSplitCount(): void {
    if (this.splitCount() > 2) {
      this.splitCount.update((c) => c - 1);
    }
  }

  async confirmCreateSplit(order: Order): Promise<void> {
    this.isSettling.set(true);
    const res = await this.mock.splitOrderEqual({
      orderId: order.id,
      splitCount: this.splitCount(),
    });
    this.isSettling.set(false);

    if (res.success) {
      this.toastService.success(
        `Order ${order.orderNumber} successfully divided into ${this.splitCount()} equal bills.`,
      );
      const updatedOrder = this.orders().find((o) => o.id === order.id);
      if (updatedOrder) {
        this.selectedOrderForSettlement.set(updatedOrder);
      }
    } else {
      this.toastService.error(res.error || 'Failed to split bill');
    }
  }

  async settleSplitPart(
    order: Order,
    split: SplitBill,
    method?: 'CASH' | 'UPI' | 'CARD',
  ): Promise<void> {
    const tender = method || this.selectedPaymentMethod();
    this.isSettling.set(true);
    const res = await this.mock.settleSplitBill({
      orderId: order.id,
      splitBillId: split.id,
      paymentMethod: tender,
    });
    this.isSettling.set(false);

    if (res.success) {
      this.toastService.success(
        `Part #${split.splitIndex} (${split.totalAmount}) settled via ${tender}.`,
      );
      if (this.areAllSplitBillsPaid(order.id)) {
        this.toastService.info('All split bills are paid! You can now complete the order.');
      }
    } else {
      this.toastService.error(res.error || 'Failed to settle split bill');
    }
  }

  async settleAllSplitParts(order: Order): Promise<void> {
    const unpaid = this.getOrderSplitBills(order.id).filter((s) => s.paymentStatus !== 'PAID');
    const tender = this.selectedPaymentMethod();
    this.isSettling.set(true);
    for (const split of unpaid) {
      const result = await this.mock.settleSplitBill({
        orderId: order.id,
        splitBillId: split.id,
        paymentMethod: tender,
      });
      if (!result.success) {
        this.isSettling.set(false);
        this.toastService.error(result.error || 'Split payment was not confirmed.');
        return;
      }
    }
    setTimeout(() => {
      this.isSettling.set(false);
      this.mock.updateOrderStatusAtomic(order.id, 'COMPLETED');
      if (order.tableId || order.tableNumber) {
        this.mock.recalculateTableStatus(order.tableId || order.tableNumber!);
      }
      this.toastService.success(`All remaining split parts settled via ${tender}.`);
      this.closeSettleModal();
      this.printOrderReceipt(order);
    }, 400);
  }

  // --- Order Cancellation Handlers ---
  openCancelModal(order: Order): void {
    this.orderToCancel.set(order);
    this.cancellationReason.set('Customer Cancelled');
    this.cancelError.set('');
    this.isCancelling.set(false);
    this.showCancelModal.set(true);
  }

  closeCancelModal(): void {
    this.showCancelModal.set(false);
    this.orderToCancel.set(null);
    this.cancellationReason.set('');
    this.cancelError.set('');
    this.isCancelling.set(false);
  }

  switchFromSettleToCancel(order: Order): void {
    this.closeSettleModal();
    this.openCancelModal(order);
  }

  confirmCancelOrder(): void {
    const ord = this.orderToCancel();
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
      staffName: 'Floor Dispatch',
    });

    this.isCancelling.set(false);
    if (res.success) {
      if (ord.tableId || ord.tableNumber) {
        this.mock.recalculateTableStatus(ord.tableId || ord.tableNumber!);
      }
      this.toastService.success(
        `Order ${ord.orderNumber} has been cancelled. Inventory & table released.`,
      );
      this.closeCancelModal();
    } else {
      this.cancelError.set(res.error || 'Failed to cancel order.');
    }
  }

  // --- Edit Order Modal Handlers ---
  openEditOrderModal(order: Order): void {
    if (order.status === 'CANCELLED') {
      this.toastService.warning('Cancelled orders cannot be modified.');
      return;
    }
    if (order.status === 'COMPLETED') {
      this.toastService.warning('Completed orders are finalized and cannot be modified.');
      return;
    }

    if (this.isOrderPaid(order)) {
      this.pendingEditOrder.set(order);
      this.adminPasswordInput.set('');
      this.adminPasswordError.set('');
      this.showAdminPasswordModal.set(true);
      return;
    }

    this.startEditingOrder(order, false);
  }

  async verifyAdminPasswordForEdit(): Promise<void> {
    const input = this.adminPasswordInput();
    if (!(await this.adminAuth.verifyAdminPassword(input))) {
      this.adminPasswordError.set(
        'Incorrect admin password. Authorization required to modify paid orders.',
      );
      return;
    }

    const ord = this.pendingEditOrder();
    this.showAdminPasswordModal.set(false);
    this.adminPasswordInput.set('');
    this.adminPasswordError.set('');
    this.pendingEditOrder.set(null);

    if (ord) {
      this.toastService.info(`Admin authorization verified for Order ${ord.orderNumber}.`);
      this.startEditingOrder(ord, true);
    }
  }

  cancelAdminPasswordModal(): void {
    this.showAdminPasswordModal.set(false);
    this.adminPasswordInput.set('');
    this.adminPasswordError.set('');
    this.pendingEditOrder.set(null);
  }

  startEditingOrder(order: Order, isManagerOverride = false): void {
    this.isManagerOverrideActive.set(isManagerOverride);
    this.editingOrder.set(order);
    this.editCustomerName.set(order.customerName);
    this.editCustomerPhone.set(order.customerPhone || '');
    this.editTableId.set(order.tableId || '');
    this.editItems.set(order.items.map((i) => ({ ...i })));
    this.editDishSearch.set('');
    this.isSavingEdit.set(false);
    this.showEditModal.set(true);
  }

  closeEditOrderModal(): void {
    this.showEditModal.set(false);
    this.editingOrder.set(null);
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
    const ord = this.editingOrder();
    if (!ord || this.isSavingEdit()) return;

    if (this.editItems().length === 0) {
      this.toastService.error('An order must contain at least one dish.');
      return;
    }

    this.isSavingEdit.set(true);

    const sub = this.editSubtotal();
    const orderCgst = this.getOrderCgstRate(ord);
    const orderSgst = this.getOrderSgstRate(ord);
    const cgstAmt = Math.round(sub * (orderCgst / 100) * 100) / 100;
    const sgstAmt = Math.round(sub * (orderSgst / 100) * 100) / 100;
    const tax = Math.round((cgstAmt + sgstAmt) * 100) / 100;
    const tot = this.editTotal();

    const isOverride = this.isManagerOverrideActive() || this.isOrderPaid(ord);
    const noteText = isOverride
      ? `Order modified with Admin Override after settlement (New Total: ₹${tot})`
      : `Order modified by Dispatch: Items updated (New Total: ₹${tot})`;

    const newTblId = this.editTableId();
    const oldTblId = ord.tableId;
    let newTableNumber = ord.tableNumber;
    let newOrderType = ord.orderType;

    if (newTblId && newTblId !== oldTblId) {
      const newTable = this.tables().find((t) => t.id === newTblId || t.number === newTblId);
      if (newTable) {
        newTableNumber = newTable.number;
        newOrderType = 'DINE_IN';
        this.mock.updateTableStatus(newTable.id, 'OCCUPIED');
        if (oldTblId) {
          const remainingActive = this.mock
            .orders()
            .some(
              (o) =>
                o.id !== ord.id &&
                o.tableId === oldTblId &&
                !['COMPLETED', 'CANCELLED'].includes(o.status),
            );
          if (!remainingActive) {
            this.mock.updateTableStatus(oldTblId, 'AVAILABLE');
          }
        }
      }
    }

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
          tableId: newTblId || o.tableId,
          tableNumber: newTableNumber,
          orderType: newOrderType,
          items: [...this.editItems()],
          subtotal: sub,
          taxAmount: tax,
          cgstRate: orderCgst,
          sgstRate: orderSgst,
          cgstAmount: cgstAmt,
          sgstAmount: sgstAmt,
          totalAmount: tot,
          updatedAt: new Date().toISOString(),
          timeline: updatedTimeline,
        };
      }
      return o;
    });

    this.mock.orders.set(updatedOrders);
    this.mock.saveLocal('orders', updatedOrders);

    this.mock.updateOrderItems(ord.id, {
      items: [...this.editItems()],
      customerName: this.editCustomerName(),
      customerPhone: this.editCustomerPhone(),
      tableId: newTblId,
      notes: ord.notes,
    });

    this.isSavingEdit.set(false);
    this.showEditModal.set(false);
    this.isManagerOverrideActive.set(false);
    this.toastService.success(`Order ${ord.orderNumber} successfully updated.`);
  }

  // --- WhatsApp Bill Delivery Actions ---
  openWhatsAppModal(ord: Order): void {
    this.whatsAppOrder.set(ord);
    this.whatsAppPhone.set(ord.customerPhone || '');
    const restName = this.dataService.restaurant()?.name || 'GuruKripa Dhaba';
    this.whatsAppCustomMessage.set(buildWhatsAppBillMessage(restName, ord, null));
    this.showWhatsAppModal.set(true);
    this.whatsAppBridge.startStatusPoller();
  }

  closeWhatsAppModal(): void {
    this.showWhatsAppModal.set(false);
    this.whatsAppOrder.set(null);
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
    const restName = this.dataService.restaurant()?.name || 'GuruKripa Dhaba';
    const message = this.whatsAppMessagePreview();

    this.isDispatchingWhatsApp.set(true);

    if (this.whatsAppBridge.connectionStatus() === 'CONNECTED') {
      this.toastService.info('Dispatching WhatsApp message in background...');
      this.whatsAppBridge.sendBill(phone, restName, ord, null, message).subscribe({
        next: (res) => {
          this.isDispatchingWhatsApp.set(false);
          if (res.success) {
            this.toastService.success('WhatsApp bill delivered directly to customer!');
            this.closeWhatsAppModal();
          } else {
            this.toastService.warning(
              res.error || 'Direct dispatch failed, opening WhatsApp fallback...',
            );
            launchExternalUrl(
              `https://web.whatsapp.com/send?phone=${phone.replace(/\D/g, '')}&text=${encodeURIComponent(message)}`,
            );
            this.closeWhatsAppModal();
          }
        },
        error: () => {
          this.isDispatchingWhatsApp.set(false);
          launchExternalUrl(
            `https://web.whatsapp.com/send?phone=${phone.replace(/\D/g, '')}&text=${encodeURIComponent(message)}`,
          );
          this.closeWhatsAppModal();
        },
      });
      return;
    }

    this.isDispatchingWhatsApp.set(false);
    const cleanDigits = phone.replace(/\D/g, '');
    if (cleanDigits.length >= 10) {
      launchExternalUrl(
        `https://web.whatsapp.com/send?phone=${cleanDigits}&text=${encodeURIComponent(message)}`,
      );
      this.toastService.success('WhatsApp opened with customer bill!');
      this.closeWhatsAppModal();
    } else {
      this.toastService.error('Invalid phone number format. Please provide at least 10 digits.');
    }
  }

  onBackdropClick(event: MouseEvent, modalType?: string): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      if (modalType === 'settle') {
        this.closeSettleModal();
      } else if (modalType === 'cancel') {
        this.closeCancelModal();
      } else if (modalType === 'edit') {
        this.closeEditOrderModal();
      } else if (modalType === 'admin-password') {
        this.cancelAdminPasswordModal();
      } else if (modalType === 'server-admin-password') {
        this.closeServerAdminModal();
      } else if (modalType === 'whatsapp') {
        this.closeWhatsAppModal();
      } else {
        this.showManualModal = false;
      }
    }
  }
}
