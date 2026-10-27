import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { Order, OrderStatus, OrderItem } from '../../../core/models/order.model';
import { MenuItem } from '../../../core/models/menu.model';
import { MenuStockStatus } from '../../../core/models/inventory.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { DietaryBadgeComponent } from '../../../shared/components/dietary-badge/dietary-badge.component';
import { ToastService } from '../../../core/services/toast.service';
import { SplitBill } from '../../../core/models/billing.model';
import { AdminAuthService } from '../../../core/services/admin-auth.service';

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
  ],
  template: `
    <div class="orders-page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="heading-display">Live Order Queue</h1>
          <p class="text-muted">
            Real-time order dispatch board synchronized across table QR scans and kitchen stations.
          </p>
        </div>

        <div class="header-right-actions">
          <button class="btn btn-primary" (click)="openManualOrderModal()">
            <i class="ph ph-plus-circle"></i>
            <span>Create Manual Order</span>
          </button>
          <div class="live-counter-badge">
            <span class="pulse-indicator"></span>
            <span>Live Synchronized Stream</span>
          </div>
        </div>
      </div>

      <!-- Status Tabs & Filter Toolbar -->
      <div class="toolbar-card">
        <div class="status-tabs">
          <button
            class="status-tab"
            [class.active]="selectedStatus() === 'ALL'"
            (click)="selectedStatus.set('ALL')"
          >
            All Orders ({{ orders().length }})
          </button>
          <button
            class="status-tab"
            [class.active]="selectedStatus() === 'ACTIVE'"
            (click)="selectedStatus.set('ACTIVE')"
          >
            Active Dispatch ({{ activeOrdersCount() }})
          </button>
          <button
            class="status-tab"
            [class.active]="selectedStatus() === 'PENDING'"
            (click)="selectedStatus.set('PENDING')"
          >
            Pending ({{ countByStatus('PENDING') }})
          </button>
          <button
            class="status-tab"
            [class.active]="selectedStatus() === 'PREPARING'"
            (click)="selectedStatus.set('PREPARING')"
          >
            In Kitchen ({{ countByStatus('PREPARING') }})
          </button>
          <button
            class="status-tab"
            [class.active]="selectedStatus() === 'READY'"
            (click)="selectedStatus.set('READY')"
          >
            Ready to Serve ({{ countByStatus('READY') }})
          </button>
          <button
            class="status-tab"
            [class.active]="selectedStatus() === 'SERVED'"
            (click)="selectedStatus.set('SERVED')"
          >
            Served ({{ countByStatus('SERVED') }})
          </button>
          <button
            class="status-tab"
            [class.active]="selectedStatus() === 'COMPLETED'"
            (click)="selectedStatus.set('COMPLETED')"
          >
            Completed ({{ countByStatus('COMPLETED') }})
          </button>
        </div>

        <div class="search-wrap">
          <i class="ph ph-magnifying-glass"></i>
          <input
            type="text"
            class="form-input"
            placeholder="Search by order #, guest name, or table..."
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)"
          />
        </div>
      </div>

      <!-- Orders Board (Responsive Cards / Table View) -->
      <div class="orders-grid">
        @for (ord of filteredOrders(); track ord.id) {
          <div class="order-board-card" [class.pending-highlight]="ord.status === 'PENDING'">
            <!-- 1. Header: ID & Time + Status Badge & Split Indicator -->
            <div class="card-top">
              <div class="order-id-group">
                <span class="ord-num">{{ ord.orderNumber }}</span>
                <span class="ord-time">
                  <i class="ph ph-clock"></i> {{ ord.createdAt | date: 'shortTime' }}
                </span>
              </div>
              <div class="card-status-badges">
                @if (ord.isSplit && ord.splitCount) {
                  <span class="split-indicator-pill" title="Split Bill Active">
                    <i class="ph ph-users"></i> {{ ord.splitCount }}P Split
                  </span>
                }
                <app-status-badge [status]="ord.status"></app-status-badge>
              </div>
            </div>

            <!-- 2. Guest & Location Bar -->
            <div class="guest-bar">
              @if (ord.orderType === 'TAKEAWAY') {
                <div
                  class="tbl-badge takeaway-badge"
                  style="background: rgba(212, 175, 55, 0.15); border-color: rgba(212, 175, 55, 0.4); color: #8b6508;"
                >
                  <i class="ph ph-bag"></i>
                  <span>Takeaway ({{ ord.pickupReference || ord.orderNumber }})</span>
                </div>
              } @else {
                <div class="tbl-badge">
                  <i class="ph ph-table"></i>
                  <span>Table {{ ord.tableNumber }}</span>
                </div>
              }
              <div class="guest-meta">
                <span class="cust-name" [title]="ord.customerName">{{ ord.customerName }}</span>
                @if (ord.customerPhone) {
                  <span class="phone-sub">
                    <i class="ph ph-phone"></i> {{ ord.customerPhone }}
                  </span>
                }
              </div>
            </div>

            <!-- 3. Ordered Dishes Stream -->
            <div class="items-summary-list">
              @for (item of ord.items; track item.id) {
                <div class="item-line">
                  <div class="item-info-group">
                    <span class="qty-pill">{{ item.quantity }}×</span>
                    <div class="dish-details">
                      <span class="dish-name" [title]="item.name">{{ item.name }}</span>
                      @if (item.selectedPortion) {
                        <span class="portion-label">{{ item.selectedPortion.label }}</span>
                      }
                    </div>
                  </div>
                  <span class="line-cost">{{ item.itemTotal | currencyInr }}</span>
                </div>
              }
            </div>

            <!-- 4. Financial Summary & Total Breakdown -->
            <div class="bill-strip">
              <div class="sub-line">
                <span class="bill-label"
                  >Subtotal ({{ ord.items.length }}
                  {{ ord.items.length === 1 ? 'item' : 'items' }})</span
                >
                <span class="bill-val">{{ ord.subtotal | currencyInr }}</span>
              </div>
              @if (ord.discountAmount > 0) {
                <div class="sub-line discount">
                  <span class="bill-label"
                    ><i class="ph ph-tag"></i> {{ ord.appliedCouponCode }}</span
                  >
                  <span class="bill-val">-{{ ord.discountAmount | currencyInr }}</span>
                </div>
              }
              @if (ord.isSplit && ord.splitCount) {
                <div class="sub-line split-note">
                  <span class="bill-label"
                    ><i class="ph ph-users"></i> Split ({{ ord.splitCount }} ways)</span
                  >
                  <span class="bill-val"
                    >{{ ord.totalAmount / ord.splitCount | currencyInr }}/pers</span
                  >
                </div>
              }
              <div class="sub-line total-line">
                <span class="total-label">Final Payable</span>
                <span class="payable-val">{{ ord.totalAmount | currencyInr }}</span>
              </div>
            </div>

            <!-- 5. Operational Actions: Primary Workflow + Secondary Utilities -->
            <div class="card-footer-actions">
              <div class="action-row-primary">
                @if (ord.status === 'PENDING') {
                  <button
                    class="btn btn-primary btn-sm w-full action-btn-main"
                    (click)="advanceStatus(ord, 'ACCEPTED')"
                  >
                    <i class="ph ph-check-bold"></i> Accept Order
                  </button>
                } @else if (ord.status === 'ACCEPTED') {
                  <button
                    class="btn btn-dark btn-sm w-full action-btn-main"
                    (click)="advanceStatus(ord, 'PREPARING')"
                  >
                    <i class="ph ph-cooking-pot"></i> Send to Kitchen
                  </button>
                } @else if (ord.status === 'PREPARING') {
                  <button
                    class="btn btn-gold btn-sm w-full action-btn-main"
                    (click)="advanceStatus(ord, 'READY')"
                  >
                    <i class="ph ph-bell-ringing"></i> Mark Ready
                  </button>
                } @else if (ord.status === 'READY') {
                  <button
                    class="btn btn-success btn-sm w-full action-btn-main"
                    (click)="advanceStatus(ord, 'SERVED')"
                  >
                    <i class="ph ph-hand-waving"></i> Mark Served
                  </button>
                } @else if (ord.status === 'SERVED') {
                  <button
                    class="btn btn-primary btn-sm w-full action-btn-main settle-glow"
                    (click)="openSettleModal(ord)"
                  >
                    <i class="ph ph-receipt"></i> Settle & Complete
                  </button>
                }
              </div>

              <div class="action-row-secondary">
                <a
                  [routerLink]="['/admin/orders', ord.id]"
                  class="card-util-btn"
                  title="View Full Bill & Order Details"
                >
                  <i class="ph ph-file-text"></i>
                  <span>Details</span>
                </a>

                @if (ord.status !== 'CANCELLED') {
                  <button
                    type="button"
                    class="card-util-btn"
                    [class.paid-locked]="ord.paymentStatus === 'PAID'"
                    (click)="openEditOrderModal(ord)"
                    [title]="
                      ord.paymentStatus === 'PAID'
                        ? 'Order is PAID — Admin Password required to edit'
                        : 'Edit Order & Add Further Dishes'
                    "
                  >
                    <i
                      class="ph"
                      [class.ph-lock-key]="ord.paymentStatus === 'PAID'"
                      [class.ph-pencil-simple-line]="ord.paymentStatus !== 'PAID'"
                    ></i>
                    <span>{{ ord.paymentStatus === 'PAID' ? 'Edit (Paid)' : 'Edit' }}</span>
                  </button>
                }

                <a
                  [routerLink]="['/admin/billing', ord.id]"
                  class="card-util-btn"
                  [title]="
                    ord.printCount && ord.printCount > 0
                      ? 'Tax Invoice printed ' +
                        ord.printCount +
                        ' time(s) — Reprint requires Admin authorization'
                      : 'Print Tax Invoice'
                  "
                >
                  <i class="ph ph-printer"></i>
                  <span>{{
                    ord.printCount && ord.printCount > 0
                      ? 'Invoice (' + ord.printCount + 'x)'
                      : 'Invoice'
                  }}</span>
                </a>

                @if (ord.status !== 'COMPLETED' && ord.status !== 'CANCELLED') {
                  <button
                    type="button"
                    class="card-util-btn btn-cancel-order"
                    (click)="openCancelModal(ord)"
                    title="Cancel Order"
                  >
                    <i class="ph ph-x-circle text-crimson"></i>
                    <span>Cancel</span>
                  </button>
                }
              </div>
            </div>
          </div>
        } @empty {
          <div class="empty-orders-panel">
            <i class="ph ph-tray empty-icon"></i>
            <h3 class="heading-card">No Orders In This Queue</h3>
            <p class="text-muted">
              New orders placed by table diners will appear here in real-time.
            </p>
          </div>
        }
      </div>

      <!-- Manual Walk-in Order Creation Modal -->
      @if (showManualModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card manual-order-modal" role="dialog" aria-modal="true">
            <div class="modal-header">
              <div>
                <h3 class="heading-card">Create Manual Walk-in Order</h3>
                <p class="text-xs text-muted" style="margin-top: 2px;">
                  Direct entry for walk-in guests or phone orders without app scan.
                </p>
              </div>
              <button class="close-btn" (click)="showManualModal = false">
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
                <div
                  class="pos-order-type-picker"
                  style="display: flex; gap: 8px; margin-bottom: 12px; align-items: center;"
                >
                  <button
                    type="button"
                    class="btn btn-sm"
                    [class.btn-primary]="manualOrderType === 'DINE_IN'"
                    [class.btn-secondary]="manualOrderType !== 'DINE_IN'"
                    (click)="manualOrderType = 'DINE_IN'"
                  >
                    <i class="ph ph-fork-knife"></i> Dine-In
                  </button>
                  <button
                    type="button"
                    class="btn btn-sm"
                    [class.btn-primary]="manualOrderType === 'TAKEAWAY'"
                    [class.btn-secondary]="manualOrderType !== 'TAKEAWAY'"
                    [disabled]="!isTakeawayEnabled()"
                    (click)="setManualOrderTypeTakeaway()"
                  >
                    <i class="ph ph-bag"></i> Takeaway / Counter
                  </button>
                  @if (!isTakeawayEnabled()) {
                    <span class="text-xs text-muted">(Takeaway disabled in settings)</span>
                  }
                </div>

                <div class="form-row-3">
                  @if (manualOrderType === 'DINE_IN') {
                    <div class="form-group">
                      <label class="form-label">Dining Table *</label>
                      <select class="form-select" [(ngModel)]="manualTableId">
                        <option value="" disabled>-- Select Table --</option>
                        @for (tbl of tables(); track tbl.id) {
                          <option [value]="tbl.id">
                            Table {{ tbl.number }} ({{ tbl.section }}) — {{ tbl.status }}
                          </option>
                        }
                      </select>
                    </div>
                  } @else {
                    <div class="form-group">
                      <label class="form-label">Pickup Reference</label>
                      <input
                        type="text"
                        class="form-input"
                        [value]="manualPickupRef"
                        readonly
                        style="background: var(--color-surface-hover); font-weight: 700; color: #8b6508;"
                      />
                    </div>
                  }
                  <div class="form-group">
                    <label class="form-label">Guest Name</label>
                    <input
                      type="text"
                      class="form-input"
                      [placeholder]="
                        manualOrderType === 'TAKEAWAY'
                          ? 'e.g. Rahul Verma (optional)'
                          : 'e.g. Rahul Verma'
                      "
                      [(ngModel)]="manualCustomerName"
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Guest Phone</label>
                    <input
                      type="tel"
                      class="form-input"
                      placeholder="+91 98765 00000 (optional)"
                      [(ngModel)]="manualCustomerPhone"
                    />
                  </div>
                </div>

                <!-- Selected Items List -->
                <div class="manual-items-box">
                  <div class="box-title">Order Items Tray ({{ manualItems.length }})</div>
                  @if (manualItems.length === 0) {
                    <div class="empty-items-notice">
                      <i
                        class="ph ph-hand-pointing"
                        style="font-size: 1.5rem; display: block; margin-bottom: 6px;"
                      ></i>
                      Click any dish from the side panel on the left to add items to this order.
                    </div>
                  } @else {
                    <div class="manual-items-table">
                      @for (item of manualItems; track item.id; let idx = $index) {
                        <div class="m-item-row">
                          <div class="m-item-name">
                            <strong>{{ item.name }}</strong>
                            <span class="m-item-price"
                              >{{ item.unitPrice | currencyInr }} each</span
                            >
                          </div>
                          <div class="m-qty-controls">
                            <button
                              type="button"
                              class="qty-btn"
                              (click)="updateManualItemQty(item, -1)"
                            >
                              -
                            </button>
                            <span class="qty-num">{{ item.quantity }}</span>
                            <button
                              type="button"
                              class="qty-btn"
                              (click)="updateManualItemQty(item, 1)"
                            >
                              +
                            </button>
                          </div>
                          <div class="m-item-total">{{ item.itemTotal | currencyInr }}</div>
                          <button
                            type="button"
                            class="remove-btn"
                            (click)="removeManualItem(idx)"
                            title="Remove item"
                          >
                            <i class="ph ph-trash"></i>
                          </button>
                        </div>
                      }
                    </div>

                    <div class="order-math-summary">
                      <div class="math-line">
                        <span>Subtotal</span>
                        <strong>{{ manualSubtotal() | currencyInr }}</strong>
                      </div>
                      <div class="math-line">
                        <span>Taxes (CGST 2.5% + SGST 2.5%)</span>
                        <span>{{ manualTax() | currencyInr }}</span>
                      </div>
                      <div class="math-line total">
                        <span>Grand Total</span>
                        <strong class="text-price">{{ manualTotal() | currencyInr }}</strong>
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

      <!-- Cash / UPI / Card Settlement & Split Bill Modal for Live Order -->
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
              @if (!ord.isSplit) {
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
                                split.paymentMethod || 'UPI'
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
                      <span>Recording...</span>
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
                      <i class="ph ph-check-circle"></i>
                      <span>{{
                        ord.orderType === 'TAKEAWAY'
                          ? 'Complete Order'
                          : 'Complete Order & Release Table'
                      }}</span>
                    </button>
                  } @else {
                    <button
                      class="btn btn-primary"
                      (click)="settleAllSplitParts(ord)"
                      [disabled]="isSettling()"
                    >
                      <i class="ph ph-check-double"></i>
                      <span>Settle All Remaining ({{ selectedPaymentMethod() }})</span>
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
                          ' as available for new diners.'
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
    </div>
  `,
  styles: [
    `
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
      }

      .pulse-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-success);
        animation: pulseGlow 1.5s infinite;
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

      .status-tabs {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        max-width: calc(100% - 280px);

        @media (max-width: 900px) {
          max-width: 100%;
        }
      }

      .status-tab {
        padding: 8px 14px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        border-radius: var(--radius-sm);
        white-space: nowrap;
        transition: all var(--transition-fast);

        &:hover {
          background: var(--color-bone-light);
        }
        &.active {
          background: var(--color-onyx);
          color: #ffffff;
        }
      }

      .search-wrap {
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
        transition: all var(--transition-fast);

        &:hover {
          border-color: var(--color-taupe);
          box-shadow: var(--shadow-sm);
        }

        &.pending-highlight {
          border-left: 4px solid var(--color-crimson);
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

      .split-indicator-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: 999px;
        background: rgba(139, 29, 36, 0.08);
        border: 1px solid rgba(139, 29, 36, 0.2);
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
        font-weight: 800;
        font-size: 0.8125rem;
        white-space: nowrap;
        flex-shrink: 0;

        i {
          font-size: 0.95rem;
        }
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
        background: rgba(139, 29, 36, 0.08);
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
        grid-template-columns: repeat(auto-fit, minmax(56px, 1fr));
        gap: 6px;
        width: 100%;
      }

      .card-util-btn {
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
        text-decoration: none;
        cursor: pointer;
        transition: all var(--transition-fast);
        white-space: nowrap;

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

      .manual-order-modal {
        width: 100%;
        max-width: 1040px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
      }

      .manual-order-workspace {
        display: grid;
        grid-template-columns: 1.15fr 1fr;
        gap: 20px;
        overflow-y: auto;
        padding: 16px 20px;
        max-height: calc(90vh - 140px);

        @media (max-width: 860px) {
          grid-template-columns: 1fr;
        }
      }

      /* POS Dish Catalog Panel (Left) */
      .pos-dish-catalog-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 14px;
        max-height: 540px;
        overflow: hidden;
      }

      .catalog-panel-top {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .catalog-search-wrap {
        position: relative;
        display: flex;
        align-items: center;

        .search-ico {
          position: absolute;
          left: 12px;
          color: var(--color-taupe);
          font-size: 1.05rem;
          pointer-events: none;
        }

        .catalog-search-input {
          padding-left: 36px;
          padding-right: 32px;
          height: 38px;
          background: var(--color-surface);
          border-radius: var(--radius-sm);
        }

        .search-clear-btn {
          position: absolute;
          right: 8px;
          background: transparent;
          border: none;
          color: var(--color-text-muted);
          cursor: pointer;
          font-size: 0.85rem;
          padding: 4px;
          &:hover {
            color: var(--color-onyx);
          }
        }
      }

      .catalog-cat-chips {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding-bottom: 2px;
        scrollbar-width: none;
        &::-webkit-scrollbar {
          display: none;
        }
      }

      .cat-chip {
        padding: 5px 12px;
        font-size: 0.75rem;
        font-weight: 600;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-full);
        color: var(--color-text-secondary);
        white-space: nowrap;
        cursor: pointer;
        transition: all var(--transition-fast);

        &:hover {
          border-color: var(--color-taupe);
          color: var(--color-onyx);
        }

        &.active {
          background: var(--color-onyx);
          color: #ffffff;
          border-color: var(--color-onyx);
        }
      }

      .catalog-diet-chips {
        display: flex;
        gap: 6px;
      }

      .diet-filter-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        font-size: 0.6875rem;
        font-weight: 700;
        border-radius: var(--radius-full);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all var(--transition-fast);

        &:hover {
          border-color: var(--color-taupe);
        }

        &.active {
          background: var(--color-onyx);
          color: #ffffff;
          border-color: var(--color-onyx);
        }

        .diet-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          &.veg {
            background: #1b633e;
          }
          &.non-veg {
            background: #a91c12;
          }
        }
      }

      .catalog-dishes-stream {
        display: flex;
        flex-direction: column;
        gap: 8px;
        overflow-y: auto;
        padding-right: 4px;
        flex: 1;
        min-height: 240px;
      }

      .pos-dish-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 10px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        cursor: pointer;
        transition: all var(--transition-fast);

        &:hover:not(.is-out-of-stock) {
          border-color: var(--color-crimson);
          background: #fffdf9;
          transform: translateX(2px);
          box-shadow: var(--shadow-xs);
        }

        &.in-tray {
          border-color: rgba(212, 175, 55, 0.7);
          background: var(--color-gold-subtle);
        }

        &.is-out-of-stock {
          opacity: 0.55;
          cursor: not-allowed;
          background: var(--color-bone);
        }
      }

      .dish-card-details {
        display: flex;
        flex-direction: column;
        gap: 3px;
        flex: 1;
        min-width: 0;
      }

      .dish-name-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .dish-title {
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .dish-sub-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .dish-cost {
        font-size: 0.8125rem;
        color: var(--color-onyx);
      }

      .stock-tag {
        font-size: 0.625rem;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: var(--radius-xs);
        text-transform: uppercase;

        &.low {
          background: var(--color-warning-bg);
          color: var(--color-warning);
        }
        &.out {
          background: var(--color-danger-bg);
          color: var(--color-danger);
        }
      }

      .dish-card-action {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }

      .tray-counter-pill {
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: var(--radius-full);
        background: #7d6514;
        color: #ffffff;
      }

      .quick-add-btn {
        width: 30px;
        height: 30px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-crimson);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
        cursor: pointer;
        transition: all var(--transition-fast);

        &:hover:not(:disabled) {
          background: var(--color-crimson);
          color: #ffffff;
          border-color: var(--color-crimson);
        }
      }

      .empty-catalog-msg {
        text-align: center;
        padding: 30px 10px;
        color: var(--color-text-muted);
        font-size: 0.8125rem;

        i {
          font-size: 1.5rem;
          margin-bottom: 6px;
          display: block;
        }
      }

      /* POS Order Summary Panel (Right) */
      .pos-order-summary-panel {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .manual-items-box {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 14px;
        background: var(--color-surface);
      }

      .box-title {
        font-size: 0.8125rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted);
        margin-bottom: 10px;
      }

      .empty-items-notice {
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        font-style: italic;
        text-align: center;
        padding: 12px 0;
      }

      .manual-items-table {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 12px;
      }

      .m-item-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 10px;
        background: var(--color-surface-hover);
        border-radius: var(--radius-xs);
      }

      .m-item-name {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 0.875rem;
      }

      .m-item-price {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .m-qty-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .qty-btn {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        border-radius: 4px;
        font-weight: 700;
        cursor: pointer;
        &:hover {
          background: var(--color-border-subtle);
        }
      }

      .qty-num {
        font-weight: 700;
        font-size: 0.875rem;
        min-width: 16px;
        text-align: center;
      }

      .m-item-total {
        font-weight: 700;
        font-size: 0.875rem;
        min-width: 70px;
        text-align: right;
      }

      .remove-btn {
        color: var(--color-danger);
        background: none;
        font-size: 1rem;
        cursor: pointer;
        padding: 4px;
        &:hover {
          opacity: 0.8;
        }
      }

      .order-math-summary {
        border-top: 1px solid var(--color-border);
        padding-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .math-line {
        display: flex;
        justify-content: space-between;
        font-size: 0.8125rem;
        color: var(--color-text-secondary);

        &.total {
          font-size: 1rem;
          font-weight: 800;
          color: var(--color-text-primary);
          border-top: 1px dashed var(--color-border);
          padding-top: 6px;
          margin-top: 2px;
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
        margin-bottom: 18px;
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
    `,
  ],
})
export class OrderQueueComponent {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);
  private adminAuth = inject(AdminAuthService);

  orders = this.mock.orders;
  tables = this.mock.tables;
  menuItems = this.mock.menuItems;

  selectedStatus = signal<string>('ALL');
  searchQuery = signal<string>('');

  showManualModal = false;
  manualTableId = 'counter';
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

  // Cancel Order Modal state
  showCancelModal = signal<boolean>(false);
  orderToCancel = signal<Order | null>(null);
  cancellationReason = signal<string>('');
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

  // Edit Order Modal state
  showEditModal = signal<boolean>(false);
  editingOrder = signal<Order | null>(null);
  editCustomerName = signal<string>('');
  editCustomerPhone = signal<string>('');
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
    return Math.round(this.editSubtotal() * 0.05 * 100) / 100;
  });

  editTotal = computed(() => {
    const ord = this.editingOrder();
    const discount = ord?.discountAmount || 0;
    return Math.max(0, this.editSubtotal() + this.editTax() - discount);
  });

  activeOrdersCount = computed(() => {
    return this.orders().filter((o) =>
      ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status),
    ).length;
  });

  countByStatus(status: OrderStatus): number {
    return this.orders().filter((o) => o.status === status).length;
  }

  filteredOrders = computed(() => {
    let list = this.orders();
    const st = this.selectedStatus();
    if (st === 'ACTIVE') {
      list = list.filter((o) => ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status));
    } else if (st !== 'ALL') {
      list = list.filter((o) => o.status === st);
    }

    const q = this.searchQuery().toLowerCase().trim();
    if (q) {
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          (o.pickupReference && o.pickupReference.toLowerCase().includes(q)) ||
          (o.tableNumber && o.tableNumber.toLowerCase().includes(q)),
      );
    }

    return list;
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
    const firstAvail = this.tables().find((t) => t.status === 'AVAILABLE');
    this.manualOrderType = 'DINE_IN';
    this.manualPickupRef = `TK-${Math.floor(100 + Math.random() * 900)}`;
    this.manualTableId = firstAvail ? firstAvail.id : '';
    this.manualCustomerName = 'Walk-in Guest';
    this.manualCustomerPhone = '+91 98765 00000';
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
    return Math.round(this.manualSubtotal() * 0.05 * 100) / 100;
  }

  manualTotal(): number {
    return Math.round((this.manualSubtotal() + this.manualTax()) * 100) / 100;
  }

  submitManualOrder(): void {
    if (this.manualItems.length === 0) return;

    const isTakeaway = this.manualOrderType === 'TAKEAWAY';

    if (isTakeaway) {
      if (!this.isTakeawayEnabled()) {
        this.toastService.error('Takeaway orders are currently disabled in restaurant settings.');
        return;
      }
    } else {
      if (!this.manualTableId || this.manualTableId === 'counter') {
        const firstAvail = this.tables().find((t) => t.status === 'AVAILABLE');
        if (!firstAvail) {
          this.toastService.error('A dining table is required for dine-in orders.');
          return;
        }
        this.manualTableId = firstAvail.id;
      }
    }

    const validation = this.mock.validateOrderStockAvailability(this.manualItems);
    if (!validation.isValid) {
      this.toastService.error(`Cannot place order: ${validation.errors.join('; ')}`);
      return;
    }

    const sub = this.manualSubtotal();
    const tax = this.manualTax();
    const halfTax = Math.round((tax / 2) * 100) / 100;
    const tot = this.manualTotal();

    const selectedTable = isTakeaway
      ? undefined
      : this.tables().find((t) => t.id === this.manualTableId);
    const orderNum = `#ORD-${Math.floor(100 + Math.random() * 900)}`;

    const newOrder: Order = {
      id: `ord-${Date.now().toString().slice(-5)}`,
      orderNumber: orderNum,
      orderType: this.manualOrderType,
      pickupReference: isTakeaway ? this.manualPickupRef : undefined,
      restaurantSlug: 'gurukripa-dhaba',
      tableId: !isTakeaway && selectedTable ? selectedTable.id : undefined,
      tableNumber: !isTakeaway && selectedTable ? selectedTable.number : undefined,
      customerName:
        this.manualCustomerName.trim() || (isTakeaway ? 'Counter Guest' : 'Walk-in Guest'),
      customerPhone: this.manualCustomerPhone.trim() || '',
      items: [...this.manualItems],
      subtotal: sub,
      discountAmount: 0,
      taxAmount: tax,
      cgstAmount: halfTax,
      sgstAmount: halfTax,
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

    const updatedOrders = [newOrder, ...this.mock.orders()];
    this.mock.orders.set(updatedOrders);
    this.mock.saveLocal('orders', updatedOrders);

    // Reserve stock for the newly accepted manual order
    this.mock.reserveStockForOrder(newOrder.id);

    // If dining at a table, mark table as OCCUPIED
    if (!isTakeaway && selectedTable) {
      const updatedTables = this.mock
        .tables()
        .map((t) => (t.id === selectedTable!.id ? { ...t, status: 'OCCUPIED' as const } : t));
      this.mock.tables.set(updatedTables);
      this.mock.saveLocal('tables', updatedTables);
    }

    this.toastService.success(
      isTakeaway
        ? `Takeaway order ${newOrder.orderNumber} placed (Pickup Ref: ${newOrder.pickupReference})`
        : `Manual order ${newOrder.orderNumber} placed for Table ${newOrder.tableNumber}`,
    );
    this.showManualModal = false;
  }

  advanceStatus(order: Order, nextStatus: OrderStatus): void {
    const res = this.mock.updateOrderStatusAtomic(order.id, nextStatus, {
      note: `Updated to ${nextStatus} by Floor Dispatch`,
    });

    if (!res.success) {
      this.toastService.error(res.error || `Could not advance order to ${nextStatus}`);
      return;
    }

    this.toastService.success(`Order ${order.orderNumber} advanced to ${nextStatus}`);
  }

  // --- Settle Bill Modal Actions ---
  openSettleModal(order: Order): void {
    this.selectedOrderForSettlement.set(order);
    this.selectedPaymentMethod.set(order.paymentMethod === 'CASH' ? 'CASH' : 'UPI');
    this.settleMode.set('FULL');
    this.splitCount.set(2);
    this.isSettling.set(false);
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

    // 1. If not yet marked PAID and not split, perform authoritative settlement
    if (ord.paymentStatus !== 'PAID' && !ord.isSplit) {
      const settleRes = this.mock.settleOrder({
        orderId: ord.id,
        paymentMethod: method,
      });

      if (!settleRes.success) {
        this.toastService.warning(settleRes.error || 'Failed to settle order');
        this.isSettling.set(false);
        this.closeSettleModal();
        return;
      }
    }

    // 2. Advance operational status to COMPLETED
    const completeRes = this.mock.updateOrderStatusAtomic(ord.id, 'COMPLETED', {
      note: `Bill settled via ${method} & marked COMPLETED by Floor Dispatch`,
    });

    this.isSettling.set(false);
    if (completeRes.success) {
      this.toastService.success(
        `Order ${ord.orderNumber} successfully settled & marked COMPLETED via ${method}`,
      );
      this.closeSettleModal();
    } else {
      this.toastService.error(completeRes.error || `Could not complete order ${ord.orderNumber}`);
      this.closeSettleModal();
    }
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

  confirmCreateSplit(order: Order): void {
    this.isSettling.set(true);
    const res = this.mock.splitOrderEqual({
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

  settleSplitPart(order: Order, split: SplitBill, method?: 'CASH' | 'UPI' | 'CARD'): void {
    const tender = method || this.selectedPaymentMethod();
    this.isSettling.set(true);
    const res = this.mock.settleSplitBill({
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

  settleAllSplitParts(order: Order): void {
    const unpaid = this.getOrderSplitBills(order.id).filter((s) => s.paymentStatus !== 'PAID');
    const tender = this.selectedPaymentMethod();
    this.isSettling.set(true);
    for (const split of unpaid) {
      this.mock.settleSplitBill({
        orderId: order.id,
        splitBillId: split.id,
        paymentMethod: tender,
      });
    }
    this.isSettling.set(false);
    this.toastService.success(`All remaining split parts settled via ${tender}.`);
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

    if (order.paymentStatus === 'PAID') {
      this.pendingEditOrder.set(order);
      this.adminPasswordInput.set('');
      this.adminPasswordError.set('');
      this.showAdminPasswordModal.set(true);
      return;
    }

    this.startEditingOrder(order, false);
  }

  verifyAdminPasswordForEdit(): void {
    const input = this.adminPasswordInput();
    if (!this.adminAuth.verifyAdminPassword(input)) {
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
    this.editCustomerPhone.set(order.customerPhone);
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
    const tax = this.editTax();
    const halfTax = Math.round((tax / 2) * 100) / 100;
    const tot = this.editTotal();

    const isOverride = this.isManagerOverrideActive() || ord.paymentStatus === 'PAID';
    const noteText = isOverride
      ? `Order modified with Admin Override after settlement (New Total: ₹${tot})`
      : `Order modified by Dispatch: Items updated (New Total: ₹${tot})`;

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
      } else {
        this.showManualModal = false;
      }
    }
  }
}
