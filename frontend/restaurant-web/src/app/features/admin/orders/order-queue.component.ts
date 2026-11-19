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
            [title]="!soundService.isMuted() ? 'Audio alerts active (click to mute)' : 'Audio alerts muted (click to enable)'"
          >
            <i class="ph" [class.ph-speaker-high]="!soundService.isMuted()" [class.ph-speaker-simple-slash]="soundService.isMuted()"></i>
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
            [class.active]="selectedStatus() === 'PENDING'"
            (click)="selectedStatus.set('PENDING')"
            type="button"
          >
            <i class="ph ph-clock-countdown tab-icon status-pending"></i>
            <span class="tab-label">Pending</span>
            <span class="tab-count-badge" [class.has-count]="countByStatus('PENDING') > 0">
              {{ countByStatus('PENDING') }}
            </span>
          </button>

          <button
            class="status-tab"
            [class.active]="selectedStatus() === 'PREPARING'"
            (click)="selectedStatus.set('PREPARING')"
            type="button"
          >
            <i class="ph ph-cooking-pot tab-icon status-preparing"></i>
            <span class="tab-label">In Kitchen</span>
            <span class="tab-count-badge" [class.has-count]="countByStatus('PREPARING') > 0">
              {{ countByStatus('PREPARING') }}
            </span>
          </button>

          <button
            class="status-tab"
            [class.active]="selectedStatus() === 'SERVED'"
            (click)="selectedStatus.set('SERVED')"
            type="button"
          >
            <i class="ph ph-check tab-icon status-served"></i>
            <span class="tab-label">Served</span>
            <span class="tab-count-badge" [class.has-count]="countByStatus('SERVED') > 0">
              {{ countByStatus('SERVED') }}
            </span>
          </button>

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
          @for (ord of filteredOrders(); track ord.id) {
            @if (ord.status === 'COMPLETED') {
              <!-- Completed Order Card (Clean Editorial Layout) -->
              <div
                class="order-board-card completed-board-card"
                [class.new-order-flash]="latestNewOrderId() === ord.id"
                [class.card-selected]="selectedSidePanelOrderId() === ord.id"
                (click)="openOrderSidePanel(ord)"
                title="Click to view full order bill & details in side panel"
              >
                <!-- Row 1: (customer name) -------------------------------- (status) -->
                <div class="completed-row-1">
                  <div class="cust-info">
                    <span class="cust-name-main" [title]="ord.customerName">
                      {{ ord.customerName }}
                    </span>
                    @if (ord.customerPhone) {
                      <span class="cust-phone-inline">
                        · {{ ord.customerPhone }}
                      </span>
                    }
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

                <!-- Row 2: (table number) ---------------------------------- (time) -->
                <div class="completed-row-2">
                  <div class="table-info">
                    @if (ord.orderType === 'TAKEAWAY') {
                      <span class="tbl-badge takeaway-badge">
                        <i class="ph ph-bag"></i> Takeaway ({{ ord.pickupReference || ord.orderNumber }})
                      </span>
                    } @else {
                      <span class="tbl-badge completed-tbl-badge" [title]="'Table ' + (ord.tableNumber || 'Unassigned')">
                        <i class="ph ph-table"></i> Table {{ ord.tableNumber || 'Unassigned' }}
                      </span>
                    }
                  </div>
                  <span class="ord-time">
                    <i class="ph ph-clock"></i> {{ ord.createdAt | date: 'shortTime' }}
                  </span>
                </div>

                <!-- Row 3: (order id) -------------------------------------- (who served) -->
                <div class="completed-row-3">
                  <span class="completed-ord-num" title="Order ID">
                    <i class="ph ph-receipt"></i> {{ ord.orderNumber }}
                  </span>
                  <div class="completed-server-cell">
                    <span class="server-caption">Served by:</span>
                    <span class="server-name-text" [title]="'Serving Staff: ' + (getServerStaffName(ord.serverStaffId) || 'Unassigned')">
                      {{ getServerStaffName(ord.serverStaffId) || 'Unassigned' }}
                    </span>
                    <button
                      type="button"
                      class="btn-unlock-server-xs"
                      (click)="$event.stopPropagation(); promptChangeCompletedServer(ord)"
                      title="Change serving staff for paid order (Admin Password required)"
                    >
                      <i class="ph ph-pencil-simple"></i>
                    </button>
                  </div>
                </div>

                <!-- Row 4: (payment method) ------- (printed receipt) ------- (Invoice) -->
                <div class="completed-row-4">
                  <span class="meta-pill pill-paid">
                    <i class="ph ph-check-circle"></i> Paid ({{ ord.paymentMethod || 'PAID' }})
                  </span>
                  <span class="meta-pill pill-printed">
                    <i class="ph ph-printer"></i> Printed ({{ ord.printCount || 1 }}x)
                  </span>
                  <a
                    [routerLink]="['/admin/billing', ord.id]"
                    [queryParams]="ord.printCount && ord.printCount > 0 ? { reprint: 'true' } : null"
                    (click)="$event.stopPropagation()"
                    class="btn-invoice-action"
                    [title]="
                      ord.printCount && ord.printCount > 0
                        ? 'Tax Invoice printed ' + ord.printCount + ' time(s) — Reprint requires Admin authorization'
                        : 'Print Tax Invoice'
                    "
                  >
                    <i class="ph ph-file-text"></i>
                    <span>Invoice</span>
                  </a>
                  <button
                    type="button"
                    class="btn-invoice-action btn-wa-action"
                    (click)="$event.stopPropagation(); openWhatsAppModal(ord)"
                    title="Send Digital Bill via WhatsApp"
                  >
                    <i class="ph ph-whatsapp-logo"></i>
                    <span>WhatsApp</span>
                  </button>
                </div>

                <!-- Row 5 (Inset Box): order details and prices -->
                <div class="completed-items-inset-box">
                  <div class="items-summary-list">
                    @for (item of ord.items; track item.id) {
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
                </div>

                <!-- Row 6: (total amount) -->
                <div class="completed-total-strip">
                  <div class="sub-meta-left">
                    @if (ord.discountAmount > 0) {
                      <span class="discount-pill">
                        <i class="ph ph-tag"></i> -{{ ord.discountAmount | currencyInr }}
                      </span>
                    }
                    @if (ord.isSplit && ord.splitCount) {
                      <span class="split-pill">
                        <i class="ph ph-users"></i> {{ ord.splitCount }} ways
                      </span>
                    }
                  </div>
                  <div class="total-amount-box">
                    <span class="total-label-compact">Total Amount:</span>
                    <span class="payable-val-highlight">{{ ord.totalAmount | currencyInr }}</span>
                  </div>
                </div>
              </div>
            } @else {
              <!-- Active Orders (Pending, Accepted, Preparing, Ready, Dispatched, Served) -->
              <div
                class="order-board-card"
                [class.pending-highlight]="ord.status === 'PENDING'"
                [class.new-order-flash]="latestNewOrderId() === ord.id"
                [class.card-selected]="selectedSidePanelOrderId() === ord.id"
                (click)="openOrderSidePanel(ord)"
                title="Click to view full order bill & details in side panel"
              >
                <!-- 1. Header: ID & Time + Split Indicator -->
                <div class="card-top">
                  <div class="order-id-group">
                    <span class="ord-num">{{ ord.orderNumber }}</span>
                    <span class="ord-time">
                      <i class="ph ph-clock"></i> {{ ord.createdAt | date: 'shortTime' }}
                    </span>
                  </div>
                  @if (ord.isSplit && ord.splitCount) {
                    <div class="card-status-badges">
                      <span class="split-indicator-pill" title="Split Bill Active">
                        <i class="ph ph-users"></i> {{ ord.splitCount }}P Split
                      </span>
                    </div>
                  }
                </div>

                <!-- 2. Guest & Location Bar -->
                <div class="guest-bar">
                  @if (ord.orderType === 'TAKEAWAY') {
                    <div class="tbl-badge takeaway-badge">
                      <i class="ph ph-bag"></i>
                      <span>Takeaway ({{ ord.pickupReference || ord.orderNumber }})</span>
                    </div>
                  } @else {
                    <button
                      type="button"
                      class="tbl-badge reallot-clickable"
                      [disabled]="isOrderPaid(ord)"
                      (click)="handleTableBadgeClick($event, ord)"
                      [title]="isOrderPaid(ord) ? 'Table ' + (ord.tableNumber || 'Unassigned') : 'Click to change/reallot table'"
                    >
                      <i class="ph ph-table"></i>
                      <span>{{ ord.tableNumber ? 'Table ' + ord.tableNumber : 'Allot Table' }}</span>
                      @if (!isOrderPaid(ord)) {
                        <i class="ph ph-pencil-simple" style="font-size: 0.75rem; margin-left: 2px; opacity: 0.85;"></i>
                      }
                    </button>
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

                <!-- Server / Staff Handling Order -->
                <div class="server-bar" [class.server-bar-locked]="isOrderPaid(ord)" [class.has-server]="!!ord.serverStaffId">
                  <span class="server-label">
                    <i class="ph" [class.ph-user-check]="!isOrderPaid(ord)" [class.ph-lock-key]="isOrderPaid(ord)"></i>
                    <span>Server:</span>
                  </span>
                  @if (isOrderPaid(ord)) {
                    <div class="server-completed-box">
                      <span class="server-name-badge" [title]="'Serving Staff: ' + (getServerStaffName(ord.serverStaffId) || 'Unassigned')">
                        {{ getServerStaffName(ord.serverStaffId) || 'Unassigned' }}
                      </span>
                      <button
                        type="button"
                        class="btn-unlock-server"
                        (click)="$event.stopPropagation(); promptChangeCompletedServer(ord)"
                        title="Change serving staff for paid order (Admin Password required)"
                      >
                        <i class="ph ph-lock-key"></i>
                        <span>Change</span>
                      </button>
                    </div>
                  } @else {
                    <div class="server-select-wrapper">
                      <select
                        class="server-select"
                        [class.is-unassigned]="!ord.serverStaffId"
                        [ngModel]="ord.serverStaffId || ''"
                        (ngModelChange)="onAssignOrderServer(ord, $event)"
                        (click)="$event.stopPropagation()"
                        title="Assign staff handling this order"
                      >
                        <option value="">Unassigned</option>
                        @for (s of staffMembers(); track s.id) {
                          <option [value]="s.id">{{ s.name }} ({{ s.role }})</option>
                        }
                      </select>
                      <i class="ph ph-caret-down server-select-caret"></i>
                    </div>
                  }
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

                <!-- 5. Progressive Dispatch Stepper Bar & Operational Actions -->
                <div class="card-footer-actions">
                  <!-- Progressive Step Indicators (Clickable on each stage) -->
                  @if (ord.status !== 'CANCELLED') {
                    <div class="dispatch-stepper-bar">
                      <div
                        class="step-bubble"
                        [class.completed]="getOrderStageIndex(ord.status) >= 1"
                        [class.active]="ord.status === 'ACCEPTED'"
                        (click)="$event.stopPropagation(); advanceStatus(ord, 'ACCEPTED')"
                        title="Click to mark Accepted"
                      >
                        <span class="step-num"><i class="ph ph-check"></i></span>
                        <span class="step-txt">Accept</span>
                      </div>
                      <div class="step-connector" [class.filled]="getOrderStageIndex(ord.status) >= 2"></div>

                      <div
                        class="step-bubble"
                        [class.completed]="getOrderStageIndex(ord.status) >= 2"
                        [class.active]="ord.status === 'PREPARING'"
                        (click)="$event.stopPropagation(); advanceStatus(ord, 'PREPARING')"
                        title="Click to send to Kitchen"
                      >
                        <span class="step-num"><i class="ph ph-cooking-pot"></i></span>
                        <span class="step-txt">Prepare</span>
                      </div>
                      <div class="step-connector" [class.filled]="getOrderStageIndex(ord.status) >= 3"></div>

                      <div
                        class="step-bubble"
                        [class.completed]="getOrderStageIndex(ord.status) >= 3"
                        [class.active]="ord.status === 'READY'"
                        (click)="$event.stopPropagation(); advanceStatus(ord, 'READY')"
                        title="Click to mark Ready"
                      >
                        <span class="step-num"><i class="ph ph-bell-ringing"></i></span>
                        <span class="step-txt">Ready</span>
                      </div>
                      <div class="step-connector" [class.filled]="getOrderStageIndex(ord.status) >= 4"></div>

                      <div
                        class="step-bubble"
                        [class.completed]="getOrderStageIndex(ord.status) >= 4"
                        [class.active]="ord.status === 'DISPATCHED'"
                        (click)="$event.stopPropagation(); advanceStatus(ord, 'DISPATCHED')"
                        title="Click to mark Dispatched"
                      >
                        <span class="step-num"><i class="ph ph-moped"></i></span>
                        <span class="step-txt">Dispatch</span>
                      </div>
                      <div class="step-connector" [class.filled]="getOrderStageIndex(ord.status) >= 5"></div>

                      <div
                        class="step-bubble"
                        [class.completed]="getOrderStageIndex(ord.status) >= 5"
                        [class.active]="ord.status === 'SERVED'"
                        (click)="$event.stopPropagation(); advanceStatus(ord, 'SERVED')"
                        title="Click to mark Served / Delivered"
                      >
                        <span class="step-num"><i class="ph ph-hand-waving"></i></span>
                        <span class="step-txt">Serve</span>
                      </div>
                    </div>
                  }

                  <!-- Primary Next-Stage Button -->
                  <div class="action-row-primary">
                    @if (ord.status === 'PENDING') {
                      <button
                        class="btn btn-primary btn-sm w-full action-btn-main"
                        (click)="$event.stopPropagation(); advanceStatus(ord, 'ACCEPTED')"
                      >
                        <i class="ph ph-check-bold"></i> Accept Order
                      </button>
                    } @else if (ord.status === 'ACCEPTED') {
                      <button
                        class="btn btn-dark btn-sm w-full action-btn-main"
                        (click)="$event.stopPropagation(); advanceStatus(ord, 'PREPARING')"
                      >
                        <i class="ph ph-cooking-pot"></i> Send to Kitchen
                      </button>
                    } @else if (ord.status === 'PREPARING') {
                      <button
                        class="btn btn-gold btn-sm w-full action-btn-main"
                        (click)="$event.stopPropagation(); advanceStatus(ord, 'READY')"
                      >
                        <i class="ph ph-bell-ringing"></i> Mark Ready
                      </button>
                    } @else if (ord.status === 'READY') {
                      <button
                        class="btn btn-info btn-sm w-full action-btn-main"
                        (click)="$event.stopPropagation(); advanceStatus(ord, 'DISPATCHED')"
                      >
                        <i class="ph ph-moped"></i>
                        <span>{{ ord.orderType === 'TAKEAWAY' ? 'Dispatch for Delivery/Handover' : 'Dispatch to Table' }}</span>
                      </button>
                    } @else if (ord.status === 'DISPATCHED') {
                      <button
                        class="btn btn-success btn-sm w-full action-btn-main"
                        (click)="$event.stopPropagation(); advanceStatus(ord, 'SERVED')"
                      >
                        <i class="ph ph-check-circle"></i>
                        <span>{{ ord.orderType === 'TAKEAWAY' ? 'Delivered / Handed Over' : 'Mark Delivered & Served' }}</span>
                      </button>
                    } @else if (ord.status === 'SERVED') {
                      <button
                        type="button"
                        (click)="$event.stopPropagation(); openSettleModal(ord)"
                        class="btn btn-primary btn-sm w-full action-btn-main checkout-glow"
                      >
                        <i class="ph ph-shopping-bag-open"></i>
                        <span>Checkout & Print Invoice</span>
                      </button>
                    }
                  </div>

                  <div class="action-row-secondary">
                    <button
                      type="button"
                      (click)="$event.stopPropagation(); openOrderSidePanel(ord)"
                      class="card-util-btn"
                      title="View Full Bill & Order Details in Side Panel"
                    >
                      <i class="ph ph-sidebar-simple"></i>
                      <span>Details</span>
                    </button>

                    @if (ord.status !== 'CANCELLED') {
                      <button
                        type="button"
                        class="card-util-btn"
                        [class.paid-locked]="isOrderPaid(ord)"
                        (click)="$event.stopPropagation(); openEditOrderModal(ord)"
                        [title]="
                          isOrderPaid(ord)
                            ? 'Order is PAID — Admin Password required to edit'
                            : 'Edit Order & Add Further Dishes'
                        "
                      >
                        <i
                          class="ph"
                          [class.ph-lock-key]="isOrderPaid(ord)"
                          [class.ph-pencil-simple-line]="!isOrderPaid(ord)"
                        ></i>
                        <span>{{ isOrderPaid(ord) ? 'Edit (Paid)' : 'Edit' }}</span>
                      </button>
                    }

                    @if (ord.status !== 'CANCELLED') {
                      <a
                        [routerLink]="['/admin/billing', ord.id]"
                        [queryParams]="ord.printCount && ord.printCount > 0 ? { reprint: 'true' } : null"
                        (click)="$event.stopPropagation()"
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
                    }

                    @if (ord.status !== 'CANCELLED') {
                      <button
                        type="button"
                        class="card-util-btn btn-cancel-order"
                        (click)="$event.stopPropagation(); openCancelModal(ord)"
                        title="Cancel Order"
                      >
                        <i class="ph ph-x-circle text-crimson"></i>
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
                <h3 id="side-drawer-order-title" class="drawer-order-num">{{ sideOrd.orderNumber }}</h3>
                <app-status-badge [status]="sideOrd.status"></app-status-badge>
              </div>
              <div class="drawer-sub-meta">
                <span class="drawer-type-pill" [class.takeaway-pill]="sideOrd.orderType === 'TAKEAWAY'">
                  <i class="ph" [class.ph-bag]="sideOrd.orderType === 'TAKEAWAY'" [class.ph-table]="sideOrd.orderType !== 'TAKEAWAY'"></i>
                  {{ sideOrd.orderType === 'TAKEAWAY' ? 'Takeaway • ' + (sideOrd.pickupReference || sideOrd.orderNumber) : 'Dine-In • Table ' + sideOrd.tableNumber }}
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
            <!-- 1. Customer & Contact Details Card -->
            <div class="drawer-section-card">
              <div class="section-card-header">
                <span class="section-card-title"><i class="ph ph-user"></i> Guest & Location Details</span>
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
                  <span class="drawer-info-value font-semibold">{{ sideOrd.customerName || 'Walk-in Guest' }}</span>
                </div>
                <div class="drawer-info-row">
                  <span class="drawer-info-label">Phone Contact</span>
                  <div class="drawer-phone-wrap">
                    <span class="drawer-info-value">{{ sideOrd.customerPhone || 'Not provided' }}</span>
                    @if (sideOrd.customerPhone) {
                      <a [href]="'tel:' + sideOrd.customerPhone" class="btn-tel-call" title="Call Customer">
                        <i class="ph ph-phone-call"></i>
                        <span>Call</span>
                      </a>
                    }
                  </div>
                </div>
                <div class="drawer-info-row">
                  <span class="drawer-info-label">Dining Location</span>
                  <div class="drawer-location-cell" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;">
                    <span class="drawer-info-value font-bold text-crimson">
                      {{ sideOrd.orderType === 'TAKEAWAY' ? 'Takeaway Counter (' + (sideOrd.pickupReference || sideOrd.orderNumber) + ')' : (sideOrd.tableNumber ? 'Table ' + sideOrd.tableNumber : 'Unassigned Table') }}
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
                      </select>
                    </div>
                  }
                </div>
              </div>
            </div>

            <!-- 2. Live Order Workflow & Dispatch Controls (If live) -->
            @if (sideOrd.status !== 'COMPLETED' && sideOrd.status !== 'CANCELLED') {
              <div class="drawer-section-card workflow-card">
                <div class="section-card-header">
                  <span class="section-card-title"><i class="ph ph-arrows-clockwise"></i> Live Dispatch Progression</span>
                  <span class="current-stage-tag">{{ sideOrd.status }}</span>
                </div>

                <!-- Stepper Progress Bar -->
                <div class="stepper-horizontal-bar">
                  <div class="step-point" [class.done]="getOrderStageIndex(sideOrd.status) >= 1" [class.current]="sideOrd.status === 'PENDING'">
                    <span class="point-dot"><i class="ph ph-bell"></i></span>
                    <span class="point-lbl">Pending</span>
                  </div>
                  <div class="step-connector" [class.filled]="getOrderStageIndex(sideOrd.status) >= 1"></div>
                  <div class="step-point" [class.done]="getOrderStageIndex(sideOrd.status) >= 2" [class.current]="sideOrd.status === 'ACCEPTED'">
                    <span class="point-dot"><i class="ph ph-check"></i></span>
                    <span class="point-lbl">Accepted</span>
                  </div>
                  <div class="step-connector" [class.filled]="getOrderStageIndex(sideOrd.status) >= 2"></div>
                  <div class="step-point" [class.done]="getOrderStageIndex(sideOrd.status) >= 3" [class.current]="sideOrd.status === 'PREPARING'">
                    <span class="point-dot"><i class="ph ph-cooking-pot"></i></span>
                    <span class="point-lbl">Kitchen</span>
                  </div>
                  <div class="step-connector" [class.filled]="getOrderStageIndex(sideOrd.status) >= 3"></div>
                  <div class="step-point" [class.done]="getOrderStageIndex(sideOrd.status) >= 4" [class.current]="sideOrd.status === 'READY'">
                    <span class="point-dot"><i class="ph ph-bell-ringing"></i></span>
                    <span class="point-lbl">Ready</span>
                  </div>
                  <div class="step-connector" [class.filled]="getOrderStageIndex(sideOrd.status) >= 4"></div>
                  <div class="step-point" [class.done]="getOrderStageIndex(sideOrd.status) >= 5" [class.current]="sideOrd.status === 'DISPATCHED'">
                    <span class="point-dot"><i class="ph ph-moped"></i></span>
                    <span class="point-lbl">Dispatch</span>
                  </div>
                  <div class="step-connector" [class.filled]="getOrderStageIndex(sideOrd.status) >= 5"></div>
                  <div class="step-point" [class.done]="sideOrd.status === 'SERVED'" [class.current]="sideOrd.status === 'SERVED'">
                    <span class="point-dot"><i class="ph ph-hand-waving"></i></span>
                    <span class="point-lbl">Served</span>
                  </div>
                </div>

                <!-- Next Dispatch Action Button -->
                <div class="drawer-dispatch-action-row">
                  @if (sideOrd.status === 'PENDING') {
                    <button class="btn btn-primary w-full" (click)="advanceStatus(sideOrd, 'ACCEPTED')">
                      <i class="ph ph-check-bold"></i> Accept Order
                    </button>
                  } @else if (sideOrd.status === 'ACCEPTED') {
                    <button class="btn btn-dark w-full" (click)="advanceStatus(sideOrd, 'PREPARING')">
                      <i class="ph ph-cooking-pot"></i> Send to Kitchen / Preparing
                    </button>
                  } @else if (sideOrd.status === 'PREPARING') {
                    <button class="btn btn-gold w-full" (click)="advanceStatus(sideOrd, 'READY')">
                      <i class="ph ph-bell-ringing"></i> Mark Food Ready
                    </button>
                  } @else if (sideOrd.status === 'READY') {
                    <button class="btn btn-info w-full" (click)="advanceStatus(sideOrd, 'DISPATCHED')">
                      <i class="ph ph-moped"></i> {{ sideOrd.orderType === 'TAKEAWAY' ? 'Handover for Delivery / Counter' : 'Dispatch to Table' }}
                    </button>
                  } @else if (sideOrd.status === 'DISPATCHED') {
                    <button class="btn btn-success w-full" (click)="advanceStatus(sideOrd, 'SERVED')">
                      <i class="ph ph-check-circle"></i> {{ sideOrd.orderType === 'TAKEAWAY' ? 'Mark Picked Up / Delivered' : 'Mark Delivered & Served' }}
                    </button>
                  } @else if (sideOrd.status === 'SERVED') {
                    <button class="btn btn-primary w-full checkout-glow" (click)="openSettleModal(sideOrd)">
                      <i class="ph ph-credit-card"></i> Proceed to Bill Settlement & Invoice
                    </button>
                  }
                </div>
              </div>
            }

            <!-- 3. Billing & Payment Status Card (Unpaid vs Paid vs Completed) -->
            <div class="drawer-section-card billing-card">
              <div class="section-card-header">
                <span class="section-card-title"><i class="ph ph-receipt"></i> Billing & Payment Status</span>
                <span
                  class="payment-status-pill"
                  [class.status-paid]="isOrderPaid(sideOrd)"
                  [class.status-unpaid]="!isOrderPaid(sideOrd)"
                >
                  <i class="ph" [class.ph-check-circle]="isOrderPaid(sideOrd)" [class.ph-warning-circle]="!isOrderPaid(sideOrd)"></i>
                  {{ isOrderPaid(sideOrd) ? 'PAID (' + (sideOrd.paymentMethod || 'PAID') + ')' : 'UNPAID / PENDING' }}
                </span>
              </div>

              <div class="billing-action-content">
                @if (!isOrderPaid(sideOrd) && sideOrd.status !== 'CANCELLED') {
                  <div class="unpaid-alert-banner">
                    <i class="ph ph-info"></i>
                    <div>
                      <strong>Order is Unsettled</strong>
                      <p>Total amount of {{ sideOrd.totalAmount | currencyInr }} is pending collection from guest.</p>
                    </div>
                  </div>

                  <div class="billing-buttons-cluster">
                    <button class="btn btn-primary btn-sm flex-1" (click)="openSettleModal(sideOrd)">
                      <i class="ph ph-credit-card"></i> Settle Bill
                    </button>
                    <button class="btn btn-secondary btn-sm" (click)="printOrderReceipt(sideOrd)" title="Print Bill Receipt">
                      <i class="ph ph-printer"></i> Print Bill
                    </button>
                    <button class="btn btn-whatsapp btn-sm" (click)="openWhatsAppModal(sideOrd)" title="Send Bill via WhatsApp">
                      <i class="ph ph-whatsapp-logo"></i> WhatsApp
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
                      <button class="btn btn-secondary btn-sm" (click)="printOrderReceipt(sideOrd)">
                        <i class="ph ph-printer"></i> Reprint Receipt
                      </button>
                      <button class="btn btn-whatsapp btn-sm" (click)="openWhatsAppModal(sideOrd)" title="Send Digital Bill via WhatsApp">
                        <i class="ph ph-whatsapp-logo"></i> WhatsApp
                      </button>
                      <a
                        [routerLink]="['/admin/billing', sideOrd.id]"
                        [queryParams]="sideOrd.printCount && sideOrd.printCount > 0 ? { reprint: 'true' } : null"
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
                      <p class="text-xs text-muted">This order was cancelled. Invoicing and settlements are disabled.</p>
                    </div>
                  </div>
                } @else {
                  <!-- Paid but not yet marked completed (Needs invoice print) -->
                  <div class="paid-pending-print-box">
                    <p class="text-xs text-muted">
                      Payment of {{ sideOrd.totalAmount | currencyInr }} is collected via {{ sideOrd.paymentMethod || 'PAID' }}. Print invoice to complete order.
                    </p>
                    <div style="display: flex; gap: 8px;">
                      <button class="btn btn-primary btn-sm flex-1" (click)="printOrderReceipt(sideOrd)">
                        <i class="ph ph-printer"></i> Print Invoice to Complete
                      </button>
                      <button class="btn btn-whatsapp btn-sm" (click)="openWhatsAppModal(sideOrd)" title="Send Bill via WhatsApp">
                        <i class="ph ph-whatsapp-logo"></i> WhatsApp
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
                  <i class="ph ph-bowl-food"></i> Itemized Order Bill ({{ sideOrd.items.length }} dishes)
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
                          <span class="addon-tag">+{{ a.name || a.addonName }} (₹{{ a.priceDelta || a.price || 0 }})</span>
                        }
                        @if (item.specialInstructions || item.customInstructions) {
                          <span class="notes-tag"><i class="ph ph-chat-text"></i> {{ item.specialInstructions || item.customInstructions }}</span>
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
                    <span>Discount {{ sideOrd.appliedCouponCode ? '(' + sideOrd.appliedCouponCode + ')' : '' }}</span>
                    <span class="text-success">-{{ sideOrd.discountAmount | currencyInr }}</span>
                  </div>
                }
                <div class="fin-row">
                  <span>CGST (2.5%)</span>
                  <span>{{ sideOrd.cgstAmount | currencyInr }}</span>
                </div>
                <div class="fin-row">
                  <span>SGST (2.5%)</span>
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
                        class="form-input pickup-ref-input"
                        [value]="manualPickupRef"
                        readonly
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

      <!-- Reallot / Change Table Modal -->
      @if (showChangeTableModal() && orderForTableChange(); as changeOrd) {
        <div class="modal-overlay" (click)="closeChangeTableModal()">
          <div class="modal-card reallot-table-modal" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
            <div class="modal-header">
              <div>
                <h3 class="heading-card">Change / Allot Dining Table</h3>
                <p class="text-xs text-muted" style="margin-top: 2px;">
                  Order <strong>{{ changeOrd.orderNumber }}</strong> ({{ changeOrd.customerName || 'Guest' }})
                  • Currently: <strong>{{ changeOrd.tableNumber ? 'Table ' + changeOrd.tableNumber : 'Unassigned / Counter' }}</strong>
                </p>
              </div>
              <button class="close-btn" (click)="closeChangeTableModal()">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body" style="padding: 20px;">
              <div class="form-group">
                <label class="form-label" style="font-weight: 600; margin-bottom: 8px; display: block;">Select Destination Table *</label>
                <select
                  class="form-select"
                  [ngModel]="selectedNewTableId()"
                  (ngModelChange)="selectedNewTableId.set($event)"
                  style="width: 100%; padding: 10px 12px; font-size: 0.9375rem; border-radius: 8px;"
                >
                  <option value="" disabled>-- Choose Table --</option>
                  @for (tbl of tables(); track tbl.id) {
                    <option
                      [value]="tbl.id"
                      [disabled]="tbl.id === changeOrd.tableId"
                    >
                      Table {{ tbl.number }} ({{ tbl.section }}) — {{ tbl.status }} • {{ tbl.capacity }} Seats
                      {{ tbl.id === changeOrd.tableId ? ' [Current Table]' : '' }}
                    </option>
                  }
                </select>
                <p class="text-xs text-muted" style="margin-top: 8px;">
                  Select a table to assign. The guest order and dining bill will immediately transfer to the selected table.
                </p>
              </div>
            </div>

            <div class="modal-footer" style="padding: 16px 20px; display: flex; justify-content: flex-end; gap: 10px;">
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
                  @if (getEffectiveDiscount(ord) > 0) {
                    <div class="settle-row discount">
                      <span>Discount ({{ settleDiscountMode() === 'COUPON' && selectedCouponCode() ? selectedCouponCode() : 'Counter Off' }})</span>
                      <span class="text-success font-semibold">-{{ getEffectiveDiscount(ord) | currencyInr }}</span>
                    </div>
                  }
                  <div class="settle-row">
                    <span>Taxes (CGST + SGST)</span>
                    <span>{{ getSettlementTax(ord) | currencyInr }}</span>
                  </div>
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
                              {{ c.code }} ({{ c.discountType === 'PERCENTAGE' ? c.discountValue + '% OFF' : '₹' + c.discountValue + ' OFF' }}{{ c.minOrderValue ? ', min ₹' + c.minOrderValue : '' }})
                            </option>
                          }
                        </select>
                        <i class="ph ph-caret-down coupon-caret"></i>
                      </div>
                      @if (selectedCouponCode()) {
                        <div class="applied-coupon-badge">
                          <i class="ph ph-seal-check"></i>
                          <span>Coupon <strong>{{ selectedCouponCode() }}</strong> applied: -{{ getEffectiveDiscount(ord) | currencyInr }}</span>
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
                  <h3 id="server-admin-dialog-title" class="heading-card">Admin Password Required</h3>
                  <span class="text-xs text-muted"
                    >Authorization required to change serving staff for completed order {{ serverOrd.orderNumber }}</span
                  >
                </div>
              </div>
              <button
                class="close-btn"
                (click)="closeServerAdminModal()"
                aria-label="Close dialog"
              >
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body auth-dialog-body">
              <div class="auth-warning-box">
                <i class="ph ph-warning-circle"></i>
                <p>
                  Order <strong>{{ serverOrd.orderNumber }}</strong> is finalized and completed.
                  Changing the assigned serving staff impacts service records, audit logs, and tip distribution.
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
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="serverAdminPassword">Enter Admin Password / Staff PIN</label>
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

      <!-- WhatsApp Delivery Modal -->
      @if (showWhatsAppModal() && whatsAppOrder(); as ord) {
        <div class="modal-overlay" (click)="onBackdropClick($event, 'whatsapp')">
          <div
            class="modal-card auth-modal-card whatsapp-dialog-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="oq-wa-title"
          >
            <div class="modal-header">
              <div class="auth-modal-title-wrap">
                <div class="auth-icon-badge whatsapp-badge">
                  <i class="ph ph-whatsapp-logo"></i>
                </div>
                <div>
                  <h3 id="oq-wa-title" class="heading-card">Send Bill via WhatsApp</h3>
                  <span class="text-xs text-muted"
                    >{{ ord.orderNumber }} • Table {{ ord.tableNumber || 'Dine-In' }}</span
                  >
                </div>
              </div>
              <button class="close-btn" (click)="closeWhatsAppModal()" aria-label="Close dialog">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body auth-dialog-body">
              <div class="form-group">
                <label class="form-label" for="oq-wa-phone">Customer WhatsApp Phone Number *</label>
                <div class="input-with-icon">
                  <i class="ph ph-phone"></i>
                  <input
                    id="oq-wa-phone"
                    type="tel"
                    class="form-input"
                    placeholder="e.g. 9876543210 or +91 98765 43210"
                    [value]="whatsAppPhone()"
                    (input)="whatsAppPhone.set($any($event.target).value)"
                    (keyup.enter)="sendWhatsAppBill()"
                    autofocus
                  />
                </div>
                <span class="hint-text"
                  >Enter 10-digit mobile number. Defaults to +91 (India) if country code is omitted.</span
                >
              </div>

              <div class="form-group">
                <label class="form-label">Message Preview</label>
                <pre class="whatsapp-preview-box">{{ whatsAppMessagePreview() }}</pre>
              </div>
            </div>

            <div class="modal-footer whatsapp-modal-footer">
              <button type="button" class="btn btn-secondary" (click)="closeWhatsAppModal()">
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                (click)="copyBillToClipboard()"
                title="Copy formatted bill text to clipboard"
              >
                <i class="ph ph-copy"></i>
                <span>Copy Text</span>
              </button>
              @if (whatsAppAppUrl()) {
                <a
                  [href]="whatsAppAppUrl()"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn btn-secondary"
                  (click)="onWhatsAppLinkClicked(whatsAppAppUrl())"
                  title="Open in WhatsApp Desktop App or Mobile"
                >
                  <i class="ph ph-device-mobile"></i>
                  <span>WhatsApp App</span>
                </a>
              }
              @if (whatsAppWebUrl()) {
                <a
                  [href]="whatsAppWebUrl()"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="btn btn-whatsapp-action"
                  (click)="onWhatsAppLinkClicked(whatsAppWebUrl())"
                  title="Directly launch WhatsApp Web in a new tab"
                >
                  <i class="ph ph-whatsapp-logo"></i>
                  <span>Open WhatsApp Web</span>
                </a>
              } @else {
                <button type="button" class="btn btn-whatsapp-action" disabled>
                  <i class="ph ph-whatsapp-logo"></i>
                  <span>Enter Valid 10-Digit Mobile</span>
                </button>
              }
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
          box-shadow: 0 0 0 2px #d4af37, 0 8px 24px rgba(212, 175, 55, 0.25);
          transform: translateY(-2px);
        }
        100% {
          box-shadow: 0 0 0 1px rgba(212, 175, 55, 0.3), 0 2px 8px rgba(0, 0, 0, 0.05);
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

          &.status-pending { color: #f59e0b; }
          &.status-preparing { color: #f97316; }
          &.status-ready { color: #10b981; }
          &.status-dispatched { color: #3b82f6; }
          &.status-served { color: #8b5cf6; }
          &.status-completed { color: #6366f1; }
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
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          font-size: 1rem;
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          padding: 7px 32px 7px 32px;
          font-size: 0.78rem;
          border-radius: 8px;
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          color: var(--color-text-primary);
          transition: all 0.2s ease;

          &::placeholder {
            color: #94a3b8;
          }

          &:focus {
            outline: none;
            border-color: #d97706;
            box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.15);
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
          box-shadow: 0 0 0 2px rgba(139, 0, 0, 0.15), 0 8px 24px rgba(0, 0, 0, 0.1);
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
        transition: border-color var(--transition-fast, 0.15s ease), background var(--transition-fast, 0.15s ease);

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
        gap: 5px;
        background: #25d366;
        color: #ffffff;
        font-weight: 600;
        border: none;
        cursor: pointer;
        transition: background 0.15s ease;

        &:hover {
          background: #20ba5a;
          color: #ffffff;
        }

        i {
          font-size: 1rem;
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
          background: var(--color-surface-hover);
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
        margin-bottom: 14px;
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
        max-width: 480px;
      }

      .auth-icon-badge.whatsapp-badge {
        background: rgba(37, 211, 102, 0.12) !important;
        color: #25d366 !important;
      }

      .whatsapp-preview-box {
        margin: 0;
        padding: 10px 12px;
        background: #f8fafc;
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 6px;
        font-family: monospace;
        font-size: 0.75rem;
        line-height: 1.45;
        color: #334155;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 180px;
        overflow-y: auto;
      }

      .btn-whatsapp-action {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #25d366;
        color: #ffffff;
        font-weight: 600;
        font-size: 0.875rem;
        padding: 8px 16px;
        border-radius: var(--radius-sm, 6px);
        border: none;
        cursor: pointer;
        transition: background 0.15s ease;

        &:hover:not(:disabled) {
          background: #20ba5a;
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        i {
          font-size: 1.15rem;
        }
      }

      .whatsapp-modal-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;

        a.btn {
          text-decoration: none;
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

      /* Horizontal Stepper */
      .stepper-horizontal-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 4px 4px;
      }

      .step-point {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        flex: 1;

        .point-dot {
          width: 28px;
          height: 28px;
          border-radius: var(--radius-full);
          background: var(--color-surface);
          border: 2px solid var(--color-border);
          color: var(--color-text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.875rem;
          transition: all var(--transition-fast);
        }

        .point-lbl {
          font-size: 0.625rem;
          font-weight: 700;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.03em;
          text-align: center;
        }

        &.done {
          .point-dot {
            background: #2e7d32;
            border-color: #2e7d32;
            color: #fff;
          }
          .point-lbl {
            color: #2e7d32;
          }
        }

        &.current {
          .point-dot {
            background: var(--color-crimson);
            border-color: var(--color-crimson);
            color: #fff;
            box-shadow: 0 0 0 3px rgba(186, 12, 47, 0.2);
          }
          .point-lbl {
            color: var(--color-crimson);
            font-weight: 800;
          }
        }
      }

      .step-connector {
        height: 2px;
        flex: 1;
        background: var(--color-border);
        margin-top: -16px;
        transition: background var(--transition-fast);

        &.filled {
          background: #2e7d32;
        }
      }

      .drawer-dispatch-action-row {
        margin-top: 4px;
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
  private adminAuth = inject(AdminAuthService);
  private router = inject(Router);

  readonly isLoading = computed(
    () => this.dataService.isOrdersLoading() || !this.dataService.ordersLoaded()
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
    if ((ord.printCount || 0) > 0) {
      this.router.navigate(['/admin/billing', ord.id], { queryParams: { reprint: 'true' } });
    } else {
      this.router.navigate(['/admin/billing', ord.id]);
    }
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
      ? 'BroadcastChannel Active (Zero-latency)'
      : 'LocalStorage Sync Active';
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
          order.orderType === 'TAKEAWAY'
            ? 'Takeaway'
            : `Table ${order.tableNumber || '?'}`;
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

  // WhatsApp Delivery State
  showWhatsAppModal = signal<boolean>(false);
  whatsAppOrder = signal<Order | null>(null);
  whatsAppPhone = signal<string>('');

  whatsAppMessagePreview = computed(() => {
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
  activeCoupons = computed(() => (this.mock.coupons ? this.mock.coupons().filter((c) => c.isActive) : []));

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
    return Math.round(this.editSubtotal() * 0.05 * 100) / 100;
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

  activeOrdersCount = computed(() => {
    return this.orders().filter((o) => this.isOrderActive(o)).length;
  });

  countByStatus(status: OrderStatus): number {
    return this.orders().filter((o) => o.status === status).length;
  }

  filteredOrders = computed(() => {
    let list = this.orders();
    const st = this.selectedStatus();
    if (st === 'ACTIVE') {
      list = list.filter((o) => this.isOrderActive(o));
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

    const orderUuid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });

    const newOrder: Order = {
      id: orderUuid,
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

    // Persist to backend database via API
    this.dataService.addOrder(newOrder);

    // If dining at a table, mark table as OCCUPIED and link activeOrderId
    if (!isTakeaway && selectedTable) {
      const updatedTables = this.mock
        .tables()
        .map((t) =>
          t.id === selectedTable.id ? { ...t, status: 'OCCUPIED' as const, activeOrderId: newOrder.id } : t,
        );
      this.mock.tables.set(updatedTables);
      this.mock.saveLocal('tables', updatedTables);
      this.mock.updateTableStatus(selectedTable.id, 'OCCUPIED');
    }

    this.toastService.success(
      isTakeaway
        ? `Takeaway order ${newOrder.orderNumber} placed (Pickup Ref: ${newOrder.pickupReference})`
        : `Manual order ${newOrder.orderNumber} placed for Table ${newOrder.tableNumber}`,
    );
    this.showManualModal = false;
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

  confirmChangeCompletedServer(): void {
    const ord = this.pendingServerOrder();
    if (!ord) return;

    const pwd = this.serverAdminPasswordInput().trim();
    if (!this.adminAuth.verifyAdminPassword(pwd)) {
      this.serverAdminPasswordError.set(
        'Incorrect admin password. Authorization required to change serving staff on completed orders.',
      );
      return;
    }

    const newStaffId = this.selectedNewStaffId();
    const res = this.dataService.assignOrderServer(
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

  onAssignOrderServer(ord: Order, staffIdStr: string): void {
    if (this.isOrderPaid(ord)) {
      this.promptChangeCompletedServer(ord);
      return;
    }
    const staffId = staffIdStr && staffIdStr.trim().length > 0 ? staffIdStr : null;
    const res = this.dataService.assignOrderServer(ord.id, staffId);
    if (res.success) {
      this.toastService.success('Order server assigned');
    } else {
      this.toastService.error(res.error || 'Could not assign server');
    }
  }

  getOrderStageIndex(status: OrderStatus | string): number {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'PENDING':
      case 'DRAFT':
        return 0;
      case 'ACCEPTED':
      case 'CONFIRMED':
        return 1;
      case 'PREPARING':
      case 'IN_PREPARATION':
        return 2;
      case 'READY':
        return 3;
      case 'DISPATCHED':
        return 4;
      case 'SERVED':
      case 'COMPLETED':
        return 5;
      default:
        return 0;
    }
  }

  advanceStatus(order: Order, nextStatus: OrderStatus): void {
    const live = this.orders().find((o) => o.id === order.id) || order;
    if (live.status === nextStatus) return;
    const currentStage = this.getOrderStageIndex(live.status);
    const targetStage = this.getOrderStageIndex(nextStatus);
    if (targetStage >= 0 && targetStage < currentStage && nextStatus !== 'CANCELLED') return;

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
    const defaultMethod = order.paymentMethod === 'CARD' ? 'CARD' : order.paymentMethod === 'UPI' ? 'UPI' : 'CASH';
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
    const grossTotal = Math.round(((ord.subtotal || 0) + (ord.taxAmount || 0)) * 100) / 100;
    if (this.settleDiscountMode() === 'CUSTOM') {
      const disc = Math.max(0, this.customDiscountRupees() || 0);
      return Math.min(grossTotal, Math.round(disc * 100) / 100);
    } else {
      const code = this.selectedCouponCode();
      if (!code) return 0;
      const coup = this.activeCoupons().find((c) => c.code.toUpperCase() === code.toUpperCase());
      if (!coup) return 0;
      if (coup.minOrderValue && ord.subtotal < coup.minOrderValue) return 0;

      let disc = 0;
      if (coup.discountType === 'PERCENTAGE') {
        disc = (grossTotal * coup.discountValue) / 100;
        if (coup.maxDiscountAmount && disc > coup.maxDiscountAmount) {
          disc = coup.maxDiscountAmount;
        }
      } else {
        disc = coup.discountValue;
      }
      return Math.min(grossTotal, Math.round(disc * 100) / 100);
    }
  }

  getSettlementTax(ord: Order | null): number {
    if (!ord) return 0;
    return ord.taxAmount;
  }

  getSettlementTotal(ord: Order | null): number {
    if (!ord) return 0;
    const grossTotal = Math.round(((ord.subtotal || 0) + (ord.taxAmount || 0)) * 100) / 100;
    const effectiveDisc = this.getEffectiveDiscount(ord);
    return Math.max(0, Math.round((grossTotal - effectiveDisc) * 100) / 100);
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
    const grossTotal = Math.round(((ord.subtotal || 0) + (ord.taxAmount || 0)) * 100) / 100;
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

  confirmSettlement(): void {
    const ord = this.selectedOrderForSettlement();
    if (!ord || this.isSettling()) return;

    this.isSettling.set(true);
    const method = this.selectedPaymentMethod();
    const finalDiscount = this.getEffectiveDiscount(ord);
    const appliedCode = this.settleDiscountMode() === 'COUPON' ? this.selectedCouponCode() : '';

    // 1. If not yet marked PAID and not split, perform authoritative settlement
    if (ord.paymentStatus !== 'PAID' && !ord.isSplit) {
      const settleRes = this.mock.settleOrder({
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

    // 2. Advance operational status to COMPLETED
    const completeRes = this.mock.updateOrderStatusAtomic(ord.id, 'COMPLETED', {
      note: `Bill settled via ${method}${finalDiscount > 0 ? ` with ₹${finalDiscount} discount` : ''} & marked COMPLETED by Floor Dispatch`,
    });

    this.isSettling.set(false);
    if (completeRes.success) {
      this.toastService.success(
        `Order ${ord.orderNumber} successfully settled & marked COMPLETED via ${method}`,
      );
      this.closeSettleModal();
      this.printOrderReceipt(ord);
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
    this.closeSettleModal();
    this.printOrderReceipt(order);
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
    const tax = this.editTax();
    const halfTax = Math.round((tax / 2) * 100) / 100;
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

  // --- WhatsApp Bill Delivery Actions ---
  openWhatsAppModal(ord: Order): void {
    this.whatsAppOrder.set(ord);
    this.whatsAppPhone.set(ord.customerPhone || '');
    this.showWhatsAppModal.set(true);
  }

  closeWhatsAppModal(): void {
    this.showWhatsAppModal.set(false);
    this.whatsAppOrder.set(null);
    this.whatsAppPhone.set('');
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
    const ok = openWhatsAppBill(phone, restName, ord, null);
    if (ok) {
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
