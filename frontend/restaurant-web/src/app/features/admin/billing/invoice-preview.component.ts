import { Component, inject, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Order } from '../../../core/models/order.model';
import { SplitBill } from '../../../core/models/billing.model';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { ToastService } from '../../../core/services/toast.service';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { ThermalPrinterService } from '../../../core/services/thermal-printer.service';
import { SkeletonLoaderComponent } from '../../../shared/components/loading/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThermalReceiptModalComponent } from '../../../shared/components/thermal-receipt-modal/thermal-receipt-modal.component';
import { amountInWordsINR } from '../../../core/utils/financial.utils';
import {
  openWhatsAppBill,
  buildWhatsAppBillMessage,
  getWhatsAppWebUrl,
  getWhatsAppAppUrl,
  launchExternalUrl,
} from '../../../core/utils/whatsapp-bill.util';
import { WhatsAppBridgeService } from '../../../core/services/whatsapp-bridge.service';

@Component({
  selector: 'app-invoice-preview',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    CurrencyInrPipe,
    SkeletonLoaderComponent,
    EmptyStateComponent,
    ThermalReceiptModalComponent,
  ],
  template: `
    @if (effectiveOrder(); as ord) {
      <div class="invoice-page">
        <!-- Action Bar (Screen Only Command Toolbar) -->
        <nav class="action-bar no-print" aria-label="Invoice navigation and actions">
          <div class="actions-left">
            @if (isFromCanvas()) {
              <a routerLink="/admin/tables" class="back-link action-nav-btn">
                <i class="ph ph-arrow-left"></i>
                <span>Back to Floor Canvas</span>
              </a>
            } @else {
              <a routerLink="/admin/billing" class="back-link action-nav-btn">
                <i class="ph ph-arrow-left"></i>
                <span>Back to Billing</span>
              </a>
            }
            @if (splitBill()) {
              <a
                [routerLink]="['/admin/billing', ord.id]"
                class="split-view-full-btn"
                title="Switch from split slip to master order invoice"
              >
                <i class="ph ph-receipt"></i>
                <span>View Full Order</span>
              </a>
            } @else if (ord.isSplit && getOrderSplitBills(ord.id).length > 0) {
              <div class="split-slips-nav-menu">
                <button
                  type="button"
                  class="split-view-full-btn"
                  (click)="showSplitDropdown.set(!showSplitDropdown())"
                  title="View individual split slips for this order"
                >
                  <i class="ph ph-split-horizontal"></i>
                  <span>Split Slips ({{ getOrderSplitBills(ord.id).length }})</span>
                  <i class="ph" [class.ph-caret-down]="!showSplitDropdown()" [class.ph-caret-up]="showSplitDropdown()"></i>
                </button>
                @if (showSplitDropdown()) {
                  <div class="split-dropdown-box">
                    @for (s of getOrderSplitBills(ord.id); track s.id) {
                      <a
                        [routerLink]="['/admin/billing', ord.id]"
                        [queryParams]="{ splitId: s.id }"
                        class="split-dropdown-link"
                        (click)="showSplitDropdown.set(false)"
                      >
                        <div class="split-link-info">
                          <span class="split-link-title">Bill #{{ s.splitIndex }}/{{ s.splitTotalCount }}</span>
                          <span class="split-link-status" [class.paid]="s.paymentStatus === 'PAID'">{{ s.paymentStatus }}</span>
                        </div>
                        <strong class="split-link-amt">{{ s.totalAmount | currencyInr }}</strong>
                      </a>
                    }
                  </div>
                }
              </div>
            }
          </div>

          <div class="actions-right">
            @if (isCurrentTargetPaid() && ord.status !== 'CANCELLED') {
              <button
                type="button"
                class="btn btn-secondary btn-action-tool"
                (click)="openThermalPreviewModal()"
                title="Preview ESC/POS thermal receipt tape & printer hardware connection"
              >
                <i class="ph ph-receipt"></i>
                <span>Thermal Slip</span>
              </button>

              <button
                type="button"
                class="btn btn-whatsapp btn-action-share"
                (click)="openWhatsAppModal()"
                title="Share Digital Invoice to customer on WhatsApp"
              >
                <i class="ph ph-whatsapp-logo"></i>
                <span>WhatsApp</span>
              </button>

              @if (effectivePrintCount() === 0) {
                <button
                  type="button"
                  class="btn btn-primary btn-action-print"
                  (click)="openThermalPreviewModal()"
                  [disabled]="isPrinting()"
                  [title]="splitBill() ? 'Print Split Bill Receipt' : 'Print Original Tax Invoice'"
                >
                  @if (isPrinting()) {
                    <i class="ph ph-spinner ph-spin"></i>
                    <span>Printing Slip...</span>
                  } @else {
                    <i class="ph ph-printer"></i>
                    <span>{{ splitBill() ? 'Print Split Slip' : 'Print Tax Invoice' }}</span>
                  }
                </button>
              } @else {
                <div class="print-count-indicator print-badge-pill" title="Invoice print history">
                  <span class="badge-dot"></span>
                  <span>Printed {{ effectivePrintCount() }}×</span>
                </div>
                <button
                  type="button"
                  class="btn btn-primary btn-reprint btn-action-reprint"
                  (click)="openReprintModal()"
                  title="Admin Password required to reprint bill"
                >
                  <i class="ph ph-lock-key"></i>
                  <span>Reprint</span>
                </button>
              }
            } @else if (ord.status !== 'CANCELLED') {
              <button
                type="button"
                class="btn btn-primary btn-action-settle"
                (click)="settleCurrentTarget()"
                title="Settle bill payment"
              >
                <i class="ph ph-credit-card"></i>
                <span>Settle Bill</span>
              </button>
            }
          </div>
        </nav>

        <!-- Printable Professional Tax Invoice / Receipt Card -->
        <div class="invoice-paper" id="invoicePaper">
          @if (splitBill(); as split) {
            <!-- SPLIT BILL INVOICE -->
            @if (split.printCount && split.printCount > 1) {
              <div class="invoice-banner-ribbon duplicate">
                *** DUPLICATE SPLIT SLIP — REPRINT (COPY #{{ split.printCount }}) ***
              </div>
            } @else if (split.paymentStatus !== 'PAID') {
              <div class="invoice-banner-ribbon proforma">
                *** PRO-FORMA SPLIT BILL (AWAITING SETTLEMENT) ***
              </div>
            }

            <header class="invoice-header">
              <div class="brand-top-row">
                <div class="brand-identity-visual">
                  @if (!logoFailed()) {
                    <img
                      [src]="restaurant()?.logoUrl || '/logo.svg'"
                      [alt]="restaurant()?.name || 'Restaurant Logo'"
                      class="restaurant-logo-img"
                      (error)="logoFailed.set(true)"
                    />
                  } @else {
                    <div class="brand-crest-fallback">
                      <i class="ph ph-receipt"></i>
                    </div>
                  }
                </div>

                <div class="brand-text-block">
                  <h1 class="brand-name">{{ restaurant()?.name || 'GuruKripa Dhaba' }}</h1>
                  <p class="brand-tagline">
                    {{ restaurant()?.tagline || 'Artisanal Awadhi & Mughlai Bistro' }}
                  </p>
                  <p class="brand-address">{{ restaurantAddress }}</p>
                  <div class="brand-contacts-row">
                    <span><i class="ph ph-phone"></i> {{ restaurantPhone }}</span>
                    <span><i class="ph ph-envelope"></i> {{ restaurantEmail }}</span>
                  </div>
                </div>

                <div class="brand-legal-badge-col">
                  <div class="tax-document-tag split-tag">SPLIT TAX SLIP</div>
                  <div class="legal-id-card">
                    <div class="legal-id-row">
                      <span class="legal-lbl">GSTIN:</span>
                      <strong class="legal-val">{{ restaurantGstin }}</strong>
                    </div>
                    <div class="legal-id-row">
                      <span class="legal-lbl">FSSAI No:</span>
                      <strong class="legal-val">{{ fssaiLicense }}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <div class="header-rule"></div>

            <div class="split-slip-badge-row">
              <span class="split-badge-chip">
                ITEMIZED SPLIT RECEIPT — PART #{{ split.splitIndex }} OF {{ split.splitTotalCount }}
              </span>
            </div>

            <!-- Two-Column Particulars Section -->
            <section class="invoice-meta-section">
              <div class="meta-card invoice-meta-card">
                <div class="meta-card-title">SPLIT RECEIPT PARTICULARS</div>
                <div class="meta-field-row">
                  <span class="m-label">Receipt Slip ID:</span>
                  <strong class="m-val mono"
                    >{{ split.id.substring(0, 12).toUpperCase() }}</strong
                  >
                </div>
                <div class="meta-field-row">
                  <span class="m-label">Parent Order No:</span>
                  <span class="m-val">{{ split.orderNumber }}</span>
                </div>
                <div class="meta-field-row">
                  <span class="m-label">Settlement Date:</span>
                  <span class="m-val"
                    >@if (split.settledAt) {
                      {{ split.settledAt | date: 'mediumDate' }},
                      {{ split.settledAt | date: 'shortTime' }}
                    } @else {
                      <span class="text-muted" style="font-style: italic;">Pending Settlement</span>
                    }</span
                  >
                </div>
                <div class="meta-field-row">
                  <span class="m-label">Split Mode:</span>
                  <span class="m-val">{{
                    split.splitType === 'ITEM_BASED'
                      ? 'Itemized Dish Allocation'
                      : 'Equal Proportional Share'
                  }}</span>
                </div>
              </div>

              <div class="meta-card guest-meta-card">
                <div class="meta-card-title">CUSTOMER & SERVICE DETAILS</div>
                <div class="meta-field-row">
                  <span class="m-label">Service Type:</span>
                  @if (ord.orderType === 'TAKEAWAY' || split.orderType === 'TAKEAWAY') {
                    <span class="service-pill takeaway">
                      <i class="ph ph-shopping-bag"></i> TAKEAWAY •
                      {{ split.pickupReference || ord.pickupReference || ord.orderNumber }}
                    </span>
                  } @else {
                    <span class="service-pill dinein">
                      <i class="ph ph-fork-knife"></i> TABLE
                      {{ split.tableNumber || ord.tableNumber || 'DINE-IN' }}
                    </span>
                  }
                </div>
                <div class="meta-field-row">
                  <span class="m-label">Guest Name:</span>
                  <strong class="m-val">{{
                    split.customerName || ord.customerName || 'Walk-in Guest'
                  }}</strong>
                </div>
                <div class="meta-field-row">
                  <span class="m-label">Payment Status:</span>
                  <span
                    class="m-val payment-status-pill"
                    [class.paid]="split.paymentStatus === 'PAID'"
                  >
                    {{
                      split.paymentStatus === 'PAID'
                        ? 'PAID (' + (split.paymentMethod || 'SETTLED') + ')'
                        : 'UNPAID'
                    }}
                  </span>
                </div>
                @if (split.printCount && split.printCount > 0) {
                  <div class="meta-field-row">
                    <span class="m-label">Print Copy:</span>
                    <span class="m-val"
                      >#{{ split.printCount }}
                      {{ split.printCount > 1 ? '(Duplicate Reprint)' : '(Original)' }}</span
                    >
                  </div>
                }
              </div>
            </section>

            <!-- Table of allocated items -->
            <section class="invoice-table-section">
              <table class="invoice-items-table">
                <thead>
                  <tr>
                    <th class="col-num">#</th>
                    <th class="col-desc">SPLIT DESCRIPTION / DISH</th>
                    <th class="col-hsn">HSN/SAC</th>
                    <th class="col-qty">QTY</th>
                    <th class="col-rate">RATE (₹)</th>
                    <th class="col-amt">AMOUNT (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  @if (
                    split.splitType === 'ITEM_BASED' &&
                    split.allocatedItems &&
                    split.allocatedItems.length > 0
                  ) {
                    @for (it of split.allocatedItems; track it.orderItemId; let i = $index) {
                      <tr>
                        <td class="col-num">{{ i + 1 }}</td>
                        <td class="col-desc">
                          <div class="item-primary-name">{{ it.name }}</div>
                        </td>
                        <td class="col-hsn">996331</td>
                        <td class="col-qty font-bold">{{ it.quantity }}</td>
                        <td class="col-rate">{{ it.unitPrice | number: '1.2-2' }}</td>
                        <td class="col-amt font-bold">
                          {{ it.quantity * it.unitPrice | number: '1.2-2' }}
                        </td>
                      </tr>
                    }
                  } @else {
                    <tr>
                      <td class="col-num">1</td>
                      <td class="col-desc">
                        <div class="item-primary-name">
                          Equal Split Share (Part {{ split.splitIndex }} of
                          {{ split.splitTotalCount }})
                        </div>
                        <span class="item-micro-spec variant">
                          Proportionate 1/{{ split.splitTotalCount }} share of parent order #{{
                            ord.orderNumber
                          }}
                        </span>
                      </td>
                      <td class="col-hsn">996331</td>
                      <td class="col-qty font-bold">1</td>
                      <td class="col-rate">{{ split.subtotal | number: '1.2-2' }}</td>
                      <td class="col-amt font-bold">{{ split.subtotal | number: '1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </section>

            <!-- Split Totals & Summary -->
            <section class="invoice-summary-section">
              <div class="summary-left-block">
                <div class="words-card">
                  <span class="words-label">AMOUNT IN WORDS:</span>
                  <p class="words-text">{{ amountInWords(split.totalAmount) }}</p>
                </div>
                <div class="settlement-info-box">
                  <div class="settlement-row">
                    <span>Payment Tender:</span>
                    <strong>{{ split.paymentMethod || 'Direct Tender' }}</strong>
                  </div>
                  <div class="settlement-badge" [class.paid]="split.paymentStatus === 'PAID'">
                    <i class="ph ph-seal-check"></i>
                    <span>{{
                      split.paymentStatus === 'PAID' ? 'SPLIT SHARE SETTLED' : 'AWAITING PAYMENT'
                    }}</span>
                  </div>
                </div>
              </div>

              <div class="summary-right-block">
                <div class="totals-table">
                  <div class="total-line">
                    <span class="t-label">Split Subtotal:</span>
                    <span class="t-val">{{ split.subtotal | currencyInr }}</span>
                  </div>
                  @if (split.discountAmount > 0) {
                    <div class="total-line discount-line">
                      <span class="t-label">Split Discount:</span>
                      <span class="t-val">-{{ split.discountAmount | currencyInr }}</span>
                    </div>
                  }
                  @if (split.taxBreakdown && split.taxBreakdown.length > 0) {
                    @for (t of split.taxBreakdown; track t.name) {
                      <div class="total-line tax-line">
                        <span class="t-label">{{ t.name }}:</span>
                        <span class="t-val">{{ t.amount | currencyInr }}</span>
                      </div>
                    }
                  } @else {
                    <div class="total-line tax-line">
                      <span class="t-label"
                        >GST ({{ getOrderCgstRate(ord) + getOrderSgstRate(ord) }}%):</span
                      >
                      <span class="t-val">{{ split.taxAmount | currencyInr }}</span>
                    </div>
                  }
                  <div class="totals-separator"></div>
                  <div class="total-line grand-total-line">
                    <span class="grand-label">NET PAYABLE:</span>
                    <span class="grand-val">{{ split.totalAmount | currencyInr }}</span>
                  </div>
                </div>
              </div>
            </section>

            <footer class="invoice-footer-section">
              <div class="footer-terms-block">
                <strong class="terms-title">Terms & Notes:</strong>
                <p class="terms-text">
                  Itemized split bill for individual dining party share. Parent order:
                  {{ ord.orderNumber }}.
                </p>
                <p class="computer-gen-notice">
                  This is a computer-generated tax receipt. No physical signature required.
                </p>
              </div>
              <div class="footer-signatory-block">
                <div class="signatory-space"></div>
                <div class="signatory-rule"></div>
                <span class="signatory-name"
                  >For {{ restaurant()?.name || 'GuruKripa Dhaba' }}</span
                >
                <span class="signatory-title">Authorized Signatory</span>
              </div>
            </footer>
          } @else {
            <!-- FULL PARENT ORDER TAX INVOICE -->
            @if (ord.printCount && ord.printCount > 1) {
              <div class="invoice-banner-ribbon duplicate">
                *** DUPLICATE TAX INVOICE — REPRINT (COPY #{{ ord.printCount }}) ***
              </div>
            } @else if (ord.status === 'CANCELLED') {
              <div
                class="invoice-banner-ribbon cancelled"
                style="background: rgba(239, 68, 68, 0.12); color: #dc2626; border-color: rgba(239, 68, 68, 0.3);"
              >
                *** CANCELLED / VOID ORDER — NOT PAYABLE ***
              </div>
            } @else if (!isPaid(ord)) {
              <div class="invoice-banner-ribbon proforma">
                *** PRO-FORMA INVOICE • PENDING PAYMENT SETTLEMENT ***
              </div>
            }

            <header class="invoice-header">
              <div class="brand-top-row">
                <div class="brand-identity-visual">
                  @if (!logoFailed()) {
                    <img
                      [src]="restaurant()?.logoUrl || '/logo.svg'"
                      [alt]="restaurant()?.name || 'Restaurant Logo'"
                      class="restaurant-logo-img"
                      (error)="logoFailed.set(true)"
                    />
                  } @else {
                    <div class="brand-crest-fallback">
                      <i class="ph ph-receipt"></i>
                    </div>
                  }
                </div>

                <div class="brand-text-block">
                  <h1 class="brand-name">{{ restaurant()?.name || 'GuruKripa Dhaba' }}</h1>
                  <p class="brand-tagline">
                    {{ restaurant()?.tagline || 'Artisanal Awadhi & Mughlai Bistro' }}
                  </p>
                  <p class="brand-address">{{ restaurantAddress }}</p>
                  <div class="brand-contacts-row">
                    <span><i class="ph ph-phone"></i> {{ restaurantPhone }}</span>
                    <span><i class="ph ph-envelope"></i> {{ restaurantEmail }}</span>
                  </div>
                </div>

                <div class="brand-legal-badge-col">
                  <div class="tax-document-tag" [class.consolidated-tag]="sessionRounds().length > 1">
                    {{ sessionRounds().length > 1 ? 'CONSOLIDATED TAX INVOICE' : 'TAX INVOICE' }}
                  </div>
                  <div class="legal-id-card">
                    <div class="legal-id-row">
                      <span class="legal-lbl">GSTIN:</span>
                      <strong class="legal-val">{{ restaurantGstin }}</strong>
                    </div>
                    <div class="legal-id-row">
                      <span class="legal-lbl">FSSAI No:</span>
                      <strong class="legal-val">{{ fssaiLicense }}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <div class="header-rule"></div>

            @if (sessionRounds().length > 1) {
              <div class="session-consolidated-badge-banner">
                <div class="consolidated-badge-content">
                  <i class="ph ph-receipt"></i>
                  <span>CONSOLIDATED DINING SESSION BILL — {{ sessionRounds().length }} SERVICE ROUNDS UNIFIED</span>
                </div>
              </div>
            }

            <!-- Two-Column Particulars Section -->
            <section class="invoice-meta-section">
              <div class="meta-card invoice-meta-card">
                <div class="meta-card-title">INVOICE PARTICULARS</div>
                <div class="meta-field-row">
                  <span class="m-label">Invoice Number:</span>
                  <strong class="m-val mono">{{ getInvoiceNumber(ord) }}</strong>
                </div>
                <div class="meta-field-row">
                  <span class="m-label">Order Ref No:</span>
                  <span class="m-val mono">{{ ord.orderNumber }}</span>
                </div>
                @if (sessionRounds().length > 1) {
                  <div class="meta-field-row">
                    <span class="m-label">Session Rounds:</span>
                    <span class="m-val session-badge-pill">
                      <i class="ph ph-stack"></i> {{ sessionRounds().length }} Orders Unified
                    </span>
                  </div>
                }
                <div class="meta-field-row">
                  <span class="m-label">Invoice Date:</span>
                  <span class="m-val"
                    >{{ ord.createdAt | date: 'mediumDate' }},
                    {{ ord.createdAt | date: 'shortTime' }}</span
                  >
                </div>
                <div class="meta-field-row">
                  <span class="m-label">Billed By (Cashier):</span>
                  <span class="m-val">{{ getBilledByStaff(ord) }}</span>
                </div>
              </div>

              <div class="meta-card guest-meta-card">
                <div class="meta-card-title">CUSTOMER & SERVICE DETAILS</div>
                <div class="meta-field-row">
                  <span class="m-label">Service Type:</span>
                  @if (ord.orderType === 'TAKEAWAY') {
                    <span class="service-pill takeaway">
                      <i class="ph ph-shopping-bag"></i> TAKEAWAY •
                      {{ ord.pickupReference || ord.orderNumber }}
                    </span>
                  } @else {
                    <span class="service-pill dinein">
                      <i class="ph ph-fork-knife"></i> TABLE {{ ord.tableNumber || 'DINE-IN' }}
                    </span>
                  }
                </div>
                <div class="meta-field-row">
                  <span class="m-label">Guest Name:</span>
                  <strong class="m-val">{{ ord.customerName || 'Walk-in Guest' }}</strong>
                </div>
                <div class="meta-field-row">
                  <span class="m-label">Mobile Number:</span>
                  <span class="m-val">{{ ord.customerPhone || 'Not Provided' }}</span>
                </div>
                <div class="meta-field-row">
                  <span class="m-label">Payment Status:</span>
                  <span
                    class="m-val payment-status-pill"
                    [class.paid]="isPaid(ord)"
                  >
                    {{
                      isPaid(ord)
                        ? 'PAID (' + (ord.paymentMethod || 'SETTLED') + ')'
                        : 'UNPAID'
                    }}
                  </span>
                </div>
                @if (sessionRounds().length > 1) {
                  <div class="meta-field-row">
                    <span class="m-label">Total Ordered:</span>
                    <span class="m-val font-semibold">{{ ord.items.length }} Items across {{ sessionRounds().length }} Rounds</span>
                  </div>
                }
                @if (ord.printCount && ord.printCount > 0) {
                  <div class="meta-field-row">
                    <span class="m-label">Print Copy:</span>
                    <span class="m-val"
                      >#{{ ord.printCount }}
                      {{ ord.printCount > 1 ? '(Duplicate Reprint)' : '(Original)' }}</span
                    >
                  </div>
                }
              </div>
            </section>

            <!-- Session Rounds Quick Progression Strip (When multi-round session) -->
            @if (sessionRounds().length > 1) {
              <div class="session-timeline-strip">
                <div class="strip-header">
                  <span class="strip-title"><i class="ph ph-clock-counter-clockwise"></i> SESSION ROUNDS BREAKDOWN</span>
                  <span class="strip-total-badge">{{ sessionRounds().length }} Rounds • {{ ord.items.length }} Items • {{ ord.subtotal | currencyInr }}</span>
                </div>
                <div class="rounds-pills-row">
                  @for (rnd of sessionRounds(); track rnd.order.id) {
                    <div class="round-summary-chip">
                      <span class="chip-rnd-idx">ROUND {{ rnd.roundIndex }}</span>
                      <span class="chip-ord-no">{{ rnd.order.orderNumber }}</span>
                      <span class="chip-time">{{ rnd.order.createdAt | date: 'shortTime' }}</span>
                      <span class="chip-subtotal">{{ rnd.roundSubtotal | currencyInr }}</span>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Line Items Table -->
            <section class="invoice-table-section">
              <table class="invoice-items-table">
                <thead>
                  <tr>
                    <th class="col-num">#</th>
                    <th class="col-desc">ITEM DESCRIPTION & SPECIFICATION</th>
                    <th class="col-hsn">HSN/SAC</th>
                    <th class="col-qty">QTY</th>
                    <th class="col-rate">RATE (₹)</th>
                    <th class="col-amt">AMOUNT (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  @if (sessionRounds().length > 1) {
                    @for (rnd of sessionRounds(); track rnd.order.id) {
                      <tr class="round-separator-row">
                        <td colspan="6">
                          <div class="invoice-round-header">
                            <span class="rnd-tag">ROUND {{ rnd.roundIndex }}</span>
                            <span class="rnd-ord-no">{{ rnd.order.orderNumber }}</span>
                            <span class="rnd-time">
                              <i class="ph ph-clock"></i> {{ rnd.order.createdAt | date: 'shortTime' }}
                            </span>
                            <span class="rnd-count">{{ rnd.itemsCount }} item{{ rnd.itemsCount > 1 ? 's' : '' }}</span>
                            <span class="rnd-subtotal">Round Subtotal: {{ rnd.roundSubtotal | currencyInr }}</span>
                          </div>
                        </td>
                      </tr>
                      @for (item of rnd.order.items; track item.id; let i = $index) {
                        <tr>
                          <td class="col-num">{{ rnd.itemStartIndex + i }}</td>
                          <td class="col-desc">
                            <div class="item-primary-name">{{ item.name }}</div>
                            @if (item.selectedPortion) {
                              <span class="item-micro-spec portion"
                                >Portion: {{ item.selectedPortion.label }}</span
                              >
                            }
                            @if (item.selectedVariants && item.selectedVariants.length > 0) {
                              <div class="item-variants-list">
                                @for (v of item.selectedVariants; track v.optionName) {
                                  <span class="item-micro-spec variant">{{ v.optionName }}</span>
                                }
                              </div>
                            }
                            @if (item.specialInstructions) {
                              <span class="item-micro-spec notes"
                                >Note: {{ item.specialInstructions }}</span
                              >
                            }
                          </td>
                          <td class="col-hsn">996331</td>
                          <td class="col-qty font-bold">{{ item.quantity }}</td>
                          <td class="col-rate">{{ item.unitPrice || 0 | number: '1.2-2' }}</td>
                          <td class="col-amt font-bold">
                            {{ item.quantity * (item.unitPrice || 0) | number: '1.2-2' }}
                          </td>
                        </tr>
                      }
                      <tr class="round-subtotal-footer-row">
                        <td colspan="4" class="round-subtotal-label">
                          Subtotal for Round {{ rnd.roundIndex }} ({{ rnd.order.orderNumber }}):
                        </td>
                        <td colspan="2" class="round-subtotal-amount">
                          {{ rnd.roundSubtotal | currencyInr }}
                        </td>
                      </tr>
                    }
                  } @else {
                    @for (item of ord.items; track item.id; let i = $index) {
                      <tr>
                        <td class="col-num">{{ i + 1 }}</td>
                        <td class="col-desc">
                          <div class="item-primary-name">{{ item.name }}</div>
                          @if (item.selectedPortion) {
                            <span class="item-micro-spec portion"
                              >Portion: {{ item.selectedPortion.label }}</span
                            >
                          }
                          @if (item.selectedVariants && item.selectedVariants.length > 0) {
                            <div class="item-variants-list">
                              @for (v of item.selectedVariants; track v.optionName) {
                                <span class="item-micro-spec variant">{{ v.optionName }}</span>
                              }
                            </div>
                          }
                          @if (item.specialInstructions) {
                            <span class="item-micro-spec notes"
                              >Note: {{ item.specialInstructions }}</span
                            >
                          }
                        </td>
                        <td class="col-hsn">996331</td>
                        <td class="col-qty font-bold">{{ item.quantity }}</td>
                        <td class="col-rate">{{ item.unitPrice | number: '1.2-2' }}</td>
                        <td class="col-amt font-bold">
                          {{ item.quantity * item.unitPrice | number: '1.2-2' }}
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </section>

            <!-- Split Bottom Section: Words + Financial Summary -->
            <section class="invoice-summary-section">
              <div class="summary-left-block">
                <div class="words-card">
                  <span class="words-label">INVOICE AMOUNT IN WORDS:</span>
                  <p class="words-text">{{ amountInWords(ord.totalAmount) }}</p>
                </div>

                <div class="settlement-info-box">
                  <div class="settlement-row">
                    <span>Payment Tender:</span>
                    <strong>{{ ord.paymentMethod || 'Cash / Counter' }}</strong>
                  </div>
                  <div class="settlement-row">
                    <span>Settlement Time:</span>
                    <span
                      >{{ ord.settledAt || ord.createdAt | date: 'mediumDate' }},
                      {{ ord.settledAt || ord.createdAt | date: 'shortTime' }}</span
                    >
                  </div>
                  @if (sessionRounds().length > 1) {
                    <div class="settlement-row">
                      <span>Dining Rounds:</span>
                      <strong>{{ sessionRounds().length }} Service Rounds ({{ ord.items.length }} Items)</strong>
                    </div>
                  }
                  <div
                    class="settlement-badge"
                    [class.paid]="isPaid(ord)"
                    [class.cancelled]="ord.status === 'CANCELLED'"
                  >
                    <i
                      [class]="
                        ord.status === 'CANCELLED'
                          ? 'ph ph-x-circle text-crimson'
                          : 'ph ph-seal-check'
                      "
                    ></i>
                    <span>{{
                      ord.status === 'CANCELLED'
                        ? 'ORDER CANCELLED (VOID)'
                        : isPaid(ord)
                          ? 'TRANSACTION SETTLED & VERIFIED'
                          : 'PAYMENT PENDING SETTLEMENT'
                    }}</span>
                  </div>
                </div>
              </div>

              <div class="summary-right-block">
                <div class="totals-table">
                  <div class="total-line">
                    <span class="t-label">
                      {{ sessionRounds().length > 1 ? 'Consolidated Subtotal (' + sessionRounds().length + ' Rounds):' : 'Items Subtotal:' }}
                    </span>
                    <span class="t-val">{{ ord.subtotal | currencyInr }}</span>
                  </div>
                  @if (ord.discountAmount > 0 && ord.appliedCouponCode) {
                    <div class="total-line discount-line">
                      <span class="t-label">Coupon Discount ({{ ord.appliedCouponCode }}):</span>
                      <span class="t-val">-{{ ord.discountAmount | currencyInr }}</span>
                    </div>
                  }
                  <div class="total-line">
                    <span class="t-label">Taxable Value:</span>
                    <span class="t-val">{{ getTaxableValue(ord) | currencyInr }}</span>
                  </div>
                  <div class="total-line tax-line">
                    <span class="t-label">CGST ({{ getOrderCgstRate(ord) }}%):</span>
                    <span class="t-val">{{ ord.cgstAmount | currencyInr }}</span>
                  </div>
                  <div class="total-line tax-line">
                    <span class="t-label">SGST ({{ getOrderSgstRate(ord) }}%):</span>
                    <span class="t-val">{{ ord.sgstAmount | currencyInr }}</span>
                  </div>
                  @if (ord.discountAmount > 0 && !ord.appliedCouponCode) {
                    <div class="total-line discount-line">
                      <span class="t-label">Admin Discount / Round-off:</span>
                      <span class="t-val">-{{ ord.discountAmount | currencyInr }}</span>
                    </div>
                  }
                  <div class="totals-separator"></div>
                  <div class="total-line grand-total-line">
                    <span class="grand-label">NET PAYABLE:</span>
                    <span class="grand-val">{{ ord.totalAmount | currencyInr }}</span>
                  </div>
                </div>
              </div>
            </section>

            <!-- Legal Terms & Signatory Section -->
            <footer class="invoice-footer-section">
              <div class="footer-terms-block">
                <strong class="terms-title">Terms & Conditions:</strong>
                <ol class="terms-list">
                  <li>All disputes are subject to local state jurisdiction only.</li>
                  <li>
                    GST is levied as applicable on Restaurant Services under GST Act (SAC 996331).
                  </li>
                  <li>Food items once delivered cannot be returned or exchanged.</li>
                </ol>
                <p class="computer-gen-notice">
                  This is a computer-generated commercial tax invoice. No physical signature is
                  required.
                </p>
              </div>

              <div class="footer-signatory-block">
                <div class="signatory-space"></div>
                <div class="signatory-rule"></div>
                <span class="signatory-name"
                  >For {{ restaurant()?.name || 'GuruKripa Dhaba' }}</span
                >
                <span class="signatory-title">Authorized Signatory</span>
              </div>
            </footer>
          }

          <div class="invoice-bottom-bar">
            <span>Thank you for dining with us! Visit again.</span>
            <span>FSSAI Lic: {{ fssaiLicense }} • GSTIN: {{ restaurantGstin }}</span>
          </div>
        </div>

        <!-- Admin Password Authorization Modal for Reprinting -->
        @if (showAdminReprintModal()) {
          <div class="modal-overlay" (click)="onBackdropClick($event)">
            <div
              class="modal-card auth-modal-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-reprint-dialog-title"
            >
              <div class="modal-header">
                <div class="auth-modal-title-wrap">
                  <div class="auth-icon-badge">
                    <i class="ph ph-shield-lock"></i>
                  </div>
                  <div>
                    <h3 id="admin-reprint-dialog-title" class="heading-card">
                      Admin Password Required
                    </h3>
                    <span class="text-xs text-muted"
                      >Supervisor authorization to reprint Tax Invoice</span
                    >
                  </div>
                </div>
                <button class="close-btn" (click)="cancelReprintModal()" aria-label="Close dialog">
                  <i class="ph ph-x"></i>
                </button>
              </div>

              <div class="modal-body auth-dialog-body">
                <div class="auth-warning-box">
                  <i class="ph ph-warning-circle"></i>
                  <p>
                    Receipt for
                    <strong>{{
                      splitBill()
                        ? 'Split Bill #' + splitBill()!.splitIndex + ' (' + ord.orderNumber + ')'
                        : ord.orderNumber
                    }}</strong>
                    has already been printed
                    <strong
                      >{{ effectivePrintCount() }} time{{
                        effectivePrintCount() > 1 ? 's' : ''
                      }}</strong
                    >. Reprinting duplicate bills requires supervisor authorization to prevent
                    billing discrepancies.
                  </p>
                </div>

                <div class="form-group">
                  <label class="form-label" for="adminReprintPassword"
                    >Enter Admin Password / Staff PIN</label
                  >
                  <div class="input-with-icon">
                    <i class="ph ph-lock-key"></i>
                    <input
                      id="adminReprintPassword"
                      type="password"
                      class="form-input"
                      placeholder="Enter password or 4-digit PIN..."
                      [value]="adminPasswordInput()"
                      (input)="adminPasswordInput.set($any($event.target).value)"
                      (keyup.enter)="confirmReprintWithAdmin()"
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
                <button type="button" class="btn btn-secondary" (click)="cancelReprintModal()">
                  Cancel
                </button>
                <button
                  type="button"
                  class="btn btn-primary"
                  [disabled]="!adminPasswordInput().trim()"
                  (click)="confirmReprintWithAdmin()"
                >
                  <i class="ph ph-printer"></i>
                  <span>Authorize & Print Reprint</span>
                </button>
              </div>
            </div>
          </div>
        }

        <!-- WhatsApp Delivery Modal (Apple Fluid Design) -->
        @if (showWhatsAppModal() && effectiveOrder(); as ord) {
          <div class="modal-overlay" (click)="onBackdropClick($event)">
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
                      @if (splitBill(); as split) {
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
                    <label class="form-label font-bold" for="inv-wa-phone">
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
                      id="inv-wa-phone"
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

        <!-- Thermal Receipt Print & Preview Modal (Hardware ESC/POS) -->
        <app-thermal-receipt-modal
          [isOpen]="showThermalPreviewModal()"
          [order]="ord"
          [splitBill]="splitBill()"
          [restaurant]="restaurant()"
          [effectivePrintCount]="effectivePrintCount()"
          (close)="showThermalPreviewModal.set(false)"
          (printed)="onThermalReceiptPrinted($event)"
        />
      </div>
    } @else if (isLoading()) {
      <div
        class="invoice-page"
        style="display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 24px;"
      >
        <div
          style="width: 100%; max-width: 580px; display: flex; justify-content: space-between; align-items: center;"
        >
          <div class="skeleton-base" style="width: 120px; height: 16px; border-radius: 4px;"></div>
          <div class="skeleton-base" style="width: 100px; height: 36px; border-radius: 6px;"></div>
        </div>
        <div
          style="width: 100%; max-width: 580px; background: var(--color-surface, #fff); border: 1px solid var(--color-border, #e5ded4); border-radius: var(--radius-md, 12px); padding: 32px; display: flex; flex-direction: column; gap: 18px;"
        >
          <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
            <div class="skeleton-base" style="width: 50%; height: 24px; border-radius: 4px;"></div>
            <div class="skeleton-base" style="width: 70%; height: 14px; border-radius: 4px;"></div>
          </div>
          <div class="skeleton-base" style="width: 100%; height: 1px; margin: 8px 0;"></div>
          <app-skeleton variant="table-row" [count]="4" />
          <div class="skeleton-base" style="width: 100%; height: 1px; margin: 8px 0;"></div>
          <div style="display: flex; justify-content: flex-end;">
            <div
              class="skeleton-base"
              style="width: 160px; height: 32px; border-radius: 4px;"
            ></div>
          </div>
        </div>
      </div>
    } @else {
      <app-empty-state
        icon="ph-receipt"
        title="Invoice Not Found"
        message="The requested bill invoice does not exist or has been archived."
        [actionText]="isFromCanvas() ? 'Return to Floor Canvas' : 'Return to Billing Queue'"
        actionIcon="ph-arrow-left"
        (actionClick)="router.navigate([isFromCanvas() ? '/admin/tables' : '/admin/billing'])"
      />
    }
  `,
  styles: [
    `
      .ph-spin {
        animation: spin 0.8s linear infinite;
        display: inline-block;
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      button:active:not(:disabled) {
        transform: scale(0.98);
        transition: transform 0.08s cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .invoice-page {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
      }

      .action-bar {
        width: 100%;
        max-width: 680px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 12px;
        padding: 8px 14px;
        box-shadow:
          0 2px 8px -2px rgba(15, 23, 42, 0.05),
          0 1px 3px rgba(15, 23, 42, 0.03);
        box-sizing: border-box;

        @media (max-width: 679px) {
          flex-direction: column;
          align-items: stretch;
          gap: 10px;
          padding: 10px 12px;
        }
      }

      .actions-left {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }

      .action-nav-btn,
      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary, #475569);
        text-decoration: none;
        padding: 6px 10px;
        border-radius: 8px;
        background: transparent;
        border: 1px solid transparent;
        transition: all 0.15s ease;

        i {
          font-size: 0.95rem;
          transition: transform 0.15s ease;
        }

        &:hover {
          background: var(--color-surface-hover, #f1f5f9);
          color: var(--color-text-primary, #0f172a);
          i {
            transform: translateX(-2px);
          }
        }
      }

      .split-view-full-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.75rem;
        font-weight: 600;
        color: #b45309;
        background: #fef3c7;
        border: 1px solid #fde68a;
        padding: 4px 10px;
        border-radius: 6px;
        text-decoration: none;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background: #fde68a;
          color: #92400e;
        }
      }

      .split-slips-nav-menu {
        position: relative;
      }

      .split-dropdown-box {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        z-index: 100;
        min-width: 220px;
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm, 10px);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        animation: fadeIn 0.15s ease-out;
      }

      .split-dropdown-link {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-radius: var(--radius-xs, 6px);
        text-decoration: none;
        color: var(--color-text-primary);
        font-size: 0.8125rem;
        transition: background 0.15s ease;

        &:hover {
          background: var(--color-bone-light);
        }

        .split-link-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .split-link-title {
          font-weight: 600;
        }

        .split-link-status {
          font-size: 0.6875rem;
          font-weight: 700;
          color: #dc2626;

          &.paid {
            color: #16a34a;
          }
        }

        .split-link-amt {
          font-family: var(--font-mono, monospace);
          color: var(--color-crimson);
        }
      }

      .actions-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;

        @media (max-width: 680px) {
          justify-content: stretch;
          button {
            flex: 1;
          }
        }
      }

      .btn-action-tool {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 12px;
        border-radius: 8px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-primary, #1e293b);
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #cbd5e1);
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background: var(--color-surface-hover, #f1f5f9);
          border-color: #94a3b8;
          color: #0f172a;
        }

        i {
          font-size: 0.95rem;
          color: #64748b;
        }
      }

      .btn-action-share {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 13px;
        border-radius: 8px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #ffffff;
        background: #16a34a;
        border: 1px solid #15803d;
        cursor: pointer;
        box-shadow: 0 1px 2px rgba(22, 163, 74, 0.2);
        transition: all 0.15s ease;

        &:hover {
          background: #15803d;
          box-shadow: 0 2px 5px rgba(22, 163, 74, 0.3);
        }

        i {
          font-size: 1.05rem;
        }
      }

      .btn-action-print {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 16px;
        border-radius: 8px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #ffffff;
        background: #0284c7;
        border: 1px solid #0369a1;
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(2, 132, 199, 0.25);
        transition: all 0.15s ease;

        &:hover {
          background: #0369a1;
          box-shadow: 0 2px 6px rgba(2, 132, 199, 0.35);
        }

        i {
          font-size: 1.05rem;
        }
      }

      .print-badge-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        background: #fef3c7;
        border: 1px solid #fde68a;
        border-radius: 9999px;
        font-size: 0.72rem;
        font-weight: 700;
        color: #92400e;

        .badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #d97706;
        }
      }

      .btn-action-reprint {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: 8px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #ffffff;
        background: #b45309;
        border: 1px solid #92400e;
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(180, 83, 9, 0.25);
        transition: all 0.15s ease;

        &:hover {
          background: #92400e;
        }

        i {
          font-size: 1.05rem;
        }
      }

      .invoice-paper {
        color-scheme: light !important;
        width: 100%;
        max-width: 680px;
        background: #ffffff !important;
        background-color: #ffffff !important;
        color: #0f172a !important;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 32px 36px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
        font-family:
          -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        position: relative;
        overflow: hidden;
        isolation: isolate;

        // Prevent theme inversion: invoice sheet always maintains sharp print contrast
        h1,
        h2,
        h3,
        h4,
        strong,
        b {
          color: #0f172a;
        }
      }

      /* Ribbons */
      .invoice-banner-ribbon {
        text-align: center;
        padding: 6px 12px;
        margin: -16px -16px 20px -16px;
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;

        &.duplicate {
          background: #fef2f2;
          border-bottom: 2px dashed #f87171;
          color: #dc2626;
        }

        &.proforma {
          background: #fffbeb;
          border-bottom: 2px dashed #f59e0b;
          color: #b45309;
        }
      }

      /* Header */
      .invoice-header {
        margin-bottom: 12px;
      }

      .brand-top-row {
        display: flex;
        align-items: flex-start;
        gap: 16px;
      }

      .brand-identity-visual {
        flex-shrink: 0;

        .restaurant-logo-img {
          height: 64px;
          max-width: 130px;
          object-fit: contain;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          padding: 2px;
          background: #ffffff;
        }

        .brand-crest-fallback {
          width: 56px;
          height: 56px;
          border-radius: 12px;
          background: #0f172a;
          color: #d4af37;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.6rem;
        }
      }

      .brand-text-block {
        flex: 1;

        .brand-name {
          font-size: 1.45rem;
          font-weight: 800;
          color: #0f172a;
          margin: 0 0 2px 0;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .brand-tagline {
          font-size: 0.75rem;
          font-weight: 700;
          color: #b45309;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 0 4px 0;
        }

        .brand-address {
          font-size: 0.75rem;
          color: #475569;
          line-height: 1.4;
          margin: 0 0 4px 0;
        }

        .brand-contacts-row {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          font-size: 0.75rem;
          color: #475569;
          font-weight: 500;

          i {
            color: #b45309;
            margin-right: 2px;
          }
        }
      }

      .brand-legal-badge-col {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
        flex-shrink: 0;

        .tax-document-tag {
          background: #0f172a;
          color: #ffffff;
          padding: 5px 12px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.08em;

          &.split-tag {
            background: #b45309;
          }

          &.consolidated-tag {
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
          }
        }

        .legal-id-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 0.6875rem;
          line-height: 1.4;

          .legal-id-row {
            display: flex;
            justify-content: space-between;
            gap: 8px;

            .legal-lbl {
              color: #64748b;
              font-weight: 600;
            }

            .legal-val {
              color: #0f172a;
            }
          }
        }
      }

      .header-rule {
        height: 2px;
        background: #0f172a;
        margin: 12px 0 16px 0;
      }

      .split-slip-badge-row {
        text-align: center;
        margin-bottom: 12px;

        .split-badge-chip {
          display: inline-block;
          padding: 4px 14px;
          background: rgba(180, 83, 9, 0.12);
          border: 1px solid rgba(180, 83, 9, 0.3);
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #92400e;
        }
      }

      .session-consolidated-badge-banner {
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 6px 14px;
        margin-bottom: 14px;
        text-align: center;

        .consolidated-badge-content {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #1e293b;

          i {
            font-size: 0.95rem;
            color: #0284c7;
          }
        }
      }

      .session-timeline-strip {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 8px 12px;
        margin-bottom: 14px;

        .strip-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;

          .strip-title {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 0.6875rem;
            font-weight: 800;
            color: #64748b;
            letter-spacing: 0.05em;
            text-transform: uppercase;

            i {
              color: #0284c7;
            }
          }

          .strip-total-badge {
            font-size: 0.6875rem;
            font-weight: 700;
            color: #0f172a;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            padding: 2px 8px;
            border-radius: 4px;
          }
        }

        .rounds-pills-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;

          .round-summary-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 3px 8px;
            font-size: 0.6875rem;

            .chip-rnd-idx {
              font-weight: 800;
              background: #0f172a;
              color: #ffffff;
              border-radius: 3px;
              padding: 1px 5px;
              font-size: 0.625rem;
            }

            .chip-ord-no {
              font-family: 'SF Mono', Consolas, monospace;
              font-weight: 700;
              color: #334155;
            }

            .chip-time {
              color: #64748b;
              font-size: 0.625rem;
            }

            .chip-subtotal {
              font-family: 'SF Mono', Consolas, monospace;
              font-weight: 800;
              color: #0f172a;
              margin-left: 2px;
            }
          }
        }
      }

      .session-badge-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 7px;
        border-radius: 4px;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #1d4ed8;
        font-size: 0.6875rem;
        font-weight: 700;
      }

      /* Metadata Section */
      .invoice-meta-section {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 16px;
      }

      .meta-card {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 10px 14px;

        .meta-card-title {
          font-size: 0.6875rem;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 8px;
          padding-bottom: 4px;
          border-bottom: 1px solid #e2e8f0;
        }

        .meta-field-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.75rem;
          line-height: 1.5;
          margin-bottom: 3px;

          .m-label {
            color: #64748b;
            font-weight: 500;
          }

          .m-val {
            color: #0f172a;
            font-weight: 600;

            &.mono {
              font-family: 'SF Mono', Consolas, monospace;
            }
          }
        }
      }

      .service-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 700;

        &.takeaway {
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #b45309;
        }

        &.dinein {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1d4ed8;
        }
      }

      .payment-status-pill {
        display: inline-block;
        padding: 1px 8px;
        border-radius: 4px;
        font-size: 0.6875rem;
        font-weight: 700;
        background: #fef2f2;
        color: #b91c1c;

        &.paid {
          background: #ecfdf5;
          color: #047857;
        }
      }

      /* Line Items Table */
      .invoice-table-section {
        margin-bottom: 16px;
      }

      .invoice-items-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8125rem;

        thead th {
          background: #f1f5f9;
          color: #334155;
          font-weight: 800;
          font-size: 0.6875rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 8px 6px;
          border-top: 1px solid #cbd5e1;
          border-bottom: 1px solid #cbd5e1;
        }

        tbody td {
          padding: 8px 6px;
          vertical-align: top;
          border-bottom: 1px solid #f1f5f9;
        }

        tbody tr:nth-child(even) {
          background: #fafafa;
        }

        .round-separator-row {
          background: #f1f5f9 !important;
          border-top: 2px solid #cbd5e1;
          border-bottom: 1px solid #cbd5e1;

          td {
            padding: 6px 10px !important;
          }

          .invoice-round-header {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.75rem;

            .rnd-tag {
              background: #0f172a;
              color: #ffffff;
              font-weight: 800;
              font-size: 0.625rem;
              padding: 2px 8px;
              border-radius: 4px;
              letter-spacing: 0.05em;
            }

            .rnd-ord-no {
              font-family: 'SF Mono', Consolas, monospace;
              font-weight: 700;
              color: #0f172a;
            }

            .rnd-time {
              color: #64748b;
              font-size: 0.6875rem;
              display: inline-flex;
              align-items: center;
              gap: 3px;

              i {
                font-size: 0.8rem;
              }
            }

            .rnd-count {
              color: #475569;
              font-size: 0.6875rem;
              font-weight: 600;
              background: #e2e8f0;
              padding: 1px 6px;
              border-radius: 3px;
            }

            .rnd-subtotal {
              margin-left: auto;
              font-weight: 800;
              color: #0f172a;
              font-family: 'SF Mono', Consolas, monospace;
              font-size: 0.75rem;
            }
          }
        }

        .round-subtotal-footer-row {
          background: #fafafa !important;
          border-bottom: 2px solid #e2e8f0;

          td {
            padding: 5px 8px !important;
          }

          .round-subtotal-label {
            text-align: right;
            font-size: 0.72rem;
            font-weight: 600;
            color: #64748b;
            font-style: italic;
          }

          .round-subtotal-amount {
            text-align: right;
            font-size: 0.75rem;
            font-weight: 800;
            color: #0f172a;
            font-family: 'SF Mono', Consolas, monospace;
          }
        }

        .col-num {
          width: 5%;
          text-align: center;
          color: #64748b;
          font-size: 0.75rem;
        }

        .col-desc {
          width: 47%;
          text-align: left;
        }

        .col-hsn {
          width: 12%;
          text-align: center;
          font-size: 0.75rem;
          color: #64748b;
          font-family: 'SF Mono', Consolas, monospace;
        }

        .col-qty {
          width: 10%;
          text-align: center;
        }

        .col-rate {
          width: 13%;
          text-align: right;
          font-family: 'SF Mono', Consolas, monospace;
        }

        .col-amt {
          width: 13%;
          text-align: right;
          font-family: 'SF Mono', Consolas, monospace;
        }

        .item-primary-name {
          font-weight: 700;
          color: #0f172a;
          margin-bottom: 2px;
        }

        .item-micro-spec {
          display: inline-block;
          font-size: 0.6875rem;
          color: #64748b;
          margin-right: 6px;

          &.portion {
            font-weight: 600;
            color: #b45309;
          }

          &.variant {
            background: #f1f5f9;
            padding: 1px 6px;
            border-radius: 3px;
          }

          &.notes {
            font-style: italic;
            color: #dc2626;
          }
        }
      }

      /* Summary Section */
      .invoice-summary-section {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        align-items: start;
        margin-bottom: 16px;
        padding-top: 6px;
      }

      .summary-left-block {
        display: flex;
        flex-direction: column;
        gap: 10px;

        .words-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 8px 12px;

          .words-label {
            font-size: 0.625rem;
            font-weight: 800;
            color: #64748b;
            letter-spacing: 0.05em;
            display: block;
            margin-bottom: 2px;
          }

          .words-text {
            font-size: 0.75rem;
            font-weight: 700;
            color: #0f172a;
            margin: 0;
            font-style: italic;
            line-height: 1.35;
          }
        }

        .settlement-info-box {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;

          .settlement-row {
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
            color: #475569;

            strong {
              color: #0f172a;
            }
          }

          .settlement-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 0.6875rem;
            font-weight: 800;
            letter-spacing: 0.05em;
            background: #fef2f2;
            color: #b91c1c;
            border: 1px solid #fecaca;
            margin-top: 2px;

            &.paid {
              background: #ecfdf5;
              border-color: #a7f3d0;
              color: #047857;
            }
          }
        }
      }

      .summary-right-block {
        .totals-table {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.8125rem;

          .total-line {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 2px 0;

            .t-label {
              color: #475569;
            }

            .t-val {
              font-weight: 600;
              color: #0f172a;
              font-family: 'SF Mono', Consolas, monospace;
            }

            &.discount-line {
              color: #059669;
              .t-val {
                color: #059669;
              }
            }

            &.tax-line {
              font-size: 0.75rem;
              color: #64748b;
            }
          }

          .totals-separator {
            height: 1px;
            background: #cbd5e1;
            margin: 4px 0;
          }

          .grand-total-line {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            border: 1px solid #334155;
            color: #ffffff !important;
            padding: 10px 14px;
            border-radius: 8px;
            margin-top: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);

            .grand-label {
              font-size: 0.8125rem;
              font-weight: 800;
              letter-spacing: 0.06em;
              text-transform: uppercase;
              color: #cbd5e1 !important;
            }

            .grand-val {
              font-size: 1.25rem;
              font-weight: 900;
              color: #ffffff !important;
              font-family: 'SF Mono', Consolas, monospace;
              letter-spacing: -0.01em;
            }
          }
        }
      }

      /* Legal Terms & Signatory */
      .invoice-footer-section {
        display: grid;
        grid-template-columns: 1.6fr 1fr;
        gap: 20px;
        padding-top: 14px;
        border-top: 1px solid #e2e8f0;
        margin-bottom: 12px;

        .footer-terms-block {
          .terms-title {
            font-size: 0.6875rem;
            color: #475569;
            display: block;
            margin-bottom: 3px;
          }

          .terms-list {
            margin: 0 0 6px 0;
            padding-left: 14px;
            font-size: 0.6875rem;
            color: #64748b;
            line-height: 1.35;
          }

          .terms-text {
            margin: 0 0 4px 0;
            font-size: 0.6875rem;
            color: #64748b;
          }

          .computer-gen-notice {
            font-size: 0.625rem;
            color: #94a3b8;
            margin: 0;
            font-style: italic;
          }
        }

        .footer-signatory-block {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          justify-content: flex-end;

          .signatory-space {
            height: 36px;
          }

          .signatory-rule {
            height: 1px;
            background: #475569;
            width: 140px;
            margin-bottom: 4px;
          }

          .signatory-name {
            font-size: 0.75rem;
            font-weight: 700;
            color: #0f172a;
          }

          .signatory-title {
            font-size: 0.6875rem;
            color: #64748b;
          }
        }
      }

      .invoice-bottom-bar {
        border-top: 1px dashed #cbd5e1;
        padding-top: 8px;
        display: flex;
        justify-content: space-between;
        font-size: 0.6875rem;
        color: #64748b;
      }

      /* Media Print Overrides */
      @media print {
        @page {
          size: A4 portrait;
          margin: 8mm 10mm;
        }

        body {
          background: #ffffff !important;
          color: #0f172a !important;
        }

        .no-print,
        .action-bar,
        .modal-overlay {
          display: none !important;
        }

        .invoice-page {
          margin: 0 !important;
          padding: 0 !important;
          display: block !important;
          width: 100% !important;
        }

        .invoice-paper {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          box-shadow: none !important;
          background: #ffffff !important;
          color: #0f172a !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        // Ensure all headings, text, and totals maintain dark ink on paper even if "Background graphics" is disabled
        .brand-name,
        .item-primary-name,
        .item-name-text,
        .item-total-cell,
        .net-lbl,
        .net-val,
        .m-val,
        .legal-val,
        .words-text,
        strong,
        b,
        h1,
        h2,
        h3 {
          color: #0f172a !important;
        }

        .grand-total-line {
          background: #f8fafc !important;
          border: 2px solid #0f172a !important;
          color: #0f172a !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;

          .grand-label,
          .grand-val {
            color: #0f172a !important;
          }
        }

        .tax-document-tag {
          background: #f8fafc !important;
          border: 1px solid #0f172a !important;
          color: #0f172a !important;
        }

        .brand-crest-fallback {
          background: #ffffff !important;
          border: 1px solid #0f172a !important;
          color: #0f172a !important;
        }

        .invoice-items-table {
          page-break-inside: auto;
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
        }

        .invoice-summary-section,
        .invoice-footer-section {
          page-break-inside: avoid;
        }
      }

      .print-count-indicator {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: rgba(184, 134, 11, 0.1);
        border: 1px solid rgba(184, 134, 11, 0.3);
        border-radius: var(--radius-sm, 6px);
        font-size: 0.8125rem;
        font-weight: 600;
        color: #8b6508;

        i {
          font-size: 0.9375rem;
        }
      }

      .reprint-watermark-ribbon {
        text-align: center;
        padding: 6px;
        margin-bottom: 12px;
        background: #fef2f2;
        border: 1px dashed #ef4444;
        color: #b91c1c;
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        border-radius: 4px;
      }

      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }

      .auth-modal-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: var(--radius-md, 8px);
        max-width: 440px;
        width: 100%;
        box-shadow: var(--shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.15));
        overflow: hidden;

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid var(--color-border, #e5e7eb);

          .auth-modal-title-wrap {
            display: flex;
            align-items: center;
            gap: 12px;

            .auth-icon-badge {
              width: 36px;
              height: 36px;
              border-radius: 50%;
              background: rgba(184, 134, 11, 0.15);
              color: #b8860b;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1.25rem;
              flex-shrink: 0;
            }

            .heading-card {
              margin: 0;
              font-size: 1.0625rem;
              font-weight: 700;
            }
          }

          .close-btn {
            background: transparent;
            border: none;
            font-size: 1.25rem;
            color: var(--color-text-muted, #6b7280);
            cursor: pointer;
          }
        }

        .auth-dialog-body {
          padding: 20px;
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
          border-radius: 6px;
          font-size: 0.8125rem;
          color: var(--color-text-primary);

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
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;

          .form-label {
            font-size: 0.8125rem;
            font-weight: 600;
            color: var(--color-text-primary);
          }

          .input-with-icon {
            position: relative;
            display: flex;
            align-items: center;

            i {
              position: absolute;
              left: 12px;
              font-size: 1rem;
              color: #9ca3af;
              pointer-events: none;
            }

            .form-input {
              width: 100%;
              padding: 8px 12px 8px 36px;
              border: 1px solid var(--color-border, #d1d5db);
              border-radius: 6px;
              font-size: 0.875rem;
              outline: none;
              &:focus {
                border-color: #b8860b;
                box-shadow: 0 0 0 2px rgba(184, 134, 11, 0.2);
              }
            }
          }

          .hint-text {
            font-size: 0.75rem;
            color: #6b7280;
          }
        }

        .auth-error-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: #fef2f2;
          border: 1px solid rgba(220, 38, 38, 0.25);
          border-radius: 6px;
          color: #dc2626;
          font-size: 0.8125rem;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 14px 20px;
          background: var(--color-bone-light, #f9fafb);
          border-top: 1px solid var(--color-border, #e5e7eb);
        }
      }

      .btn-whatsapp {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #25d366;
        color: #ffffff;
        font-weight: 500;
        font-size: 0.875rem;
        padding: 8px 14px;
        border-radius: var(--radius-sm, 6px);
        border: none;
        cursor: pointer;
        transition:
          background 0.15s ease,
          transform 0.1s ease;

        &:hover {
          background: #20ba5a;
        }

        i {
          font-size: 1.15rem;
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
export class InvoicePreviewComponent implements OnInit {
  router = inject(Router);
  private route = inject(ActivatedRoute);
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);
  readonly authService = inject(AdminAuthService);
  private adminAuth = this.authService;
  private thermalPrinter = inject(ThermalPrinterService);
  readonly whatsAppBridge = inject(WhatsAppBridgeService);

  isFromCanvas = signal<boolean>(false);
  private hasAutoOpenedThermal = false;

  constructor() {
    // Automatically trigger thermal preview once the order is loaded and verified paid if preview=thermal is requested
    effect(() => {
      const ord = this.effectiveOrder();
      const s = this.splitBill();
      const q = this.route.snapshot.queryParamMap;
      const shouldAutoPreview =
        q.get('preview') === 'thermal' ||
        q.get('thermal') === 'true' ||
        q.get('print') === 'true';

      if (ord && shouldAutoPreview && !this.hasAutoOpenedThermal) {
        const isPaidTarget = s ? s.paymentStatus === 'PAID' : this.isPaid(ord);
        if (isPaidTarget && ord.status !== 'CANCELLED') {
          this.hasAutoOpenedThermal = true;
          setTimeout(() => {
            this.showThermalPreviewModal.set(true);
          }, 150);
        }
      }
    });
  }

  readonly isLoading = computed(
    () => this.dataService.isOrdersLoading() || !this.dataService.ordersLoaded(),
  );

  restaurant = this.mock.restaurant;

  getOrderCgstRate(ord: Order | null | undefined): number {
    if (!ord) return this.restaurant()?.taxSettings?.cgstRate ?? 2.5;
    if (typeof (ord as any).cgstRate === 'number' && (ord as any).cgstRate > 0) return (ord as any).cgstRate;
    if (typeof (ord as any).cgst_rate === 'number' && (ord as any).cgst_rate > 0) return (ord as any).cgst_rate;
    return this.restaurant()?.taxSettings?.cgstRate ?? 2.5;
  }

  getOrderSgstRate(ord: Order | null | undefined): number {
    if (!ord) return this.restaurant()?.taxSettings?.sgstRate ?? 2.5;
    if (typeof (ord as any).sgstRate === 'number' && (ord as any).sgstRate > 0) return (ord as any).sgstRate;
    if (typeof (ord as any).sgst_rate === 'number' && (ord as any).sgst_rate > 0) return (ord as any).sgst_rate;
    return this.restaurant()?.taxSettings?.sgstRate ?? 2.5;
  }

  orderId = signal<string>('');
  splitBillId = signal<string>('');
  showSplitDropdown = signal<boolean>(false);

  getOrderSplitBills(orderId: string): SplitBill[] {
    return this.mock.splitBills ? this.mock.splitBills().filter((b) => b.orderId === orderId) : [];
  }

  showThermalPreviewModal = signal<boolean>(false);
  isPrinting = signal<boolean>(false);
  showAdminReprintModal = signal<boolean>(false);
  adminPasswordInput = signal<string>('');
  adminPasswordError = signal<string>('');

  showWhatsAppModal = signal<boolean>(false);
  whatsAppPhone = signal<string>('');
  whatsAppCustomMessage = signal<string>('');
  isDispatchingWhatsApp = signal<boolean>(false);

  whatsAppMessagePreview = computed(() => {
    if (this.whatsAppCustomMessage()) {
      return this.whatsAppCustomMessage();
    }
    const ord = this.effectiveOrder();
    if (!ord) return '';
    return buildWhatsAppBillMessage(this.restaurant()?.name || 'Restaurant', ord, this.splitBill());
  });

  whatsAppWebUrl = computed(() => {
    const ord = this.effectiveOrder();
    if (!ord) return '';
    return getWhatsAppWebUrl(
      this.whatsAppPhone(),
      this.restaurant()?.name || 'GuruKripa Dhaba',
      ord,
      this.splitBill(),
    );
  });

  whatsAppAppUrl = computed(() => {
    const ord = this.effectiveOrder();
    if (!ord) return '';
    return getWhatsAppAppUrl(
      this.whatsAppPhone(),
      this.restaurant()?.name || 'GuruKripa Dhaba',
      ord,
      this.splitBill(),
    );
  });

  order = computed(() => {
    return (
      this.mock.orders().find((o) => o.id === this.orderId() || o.orderNumber === this.orderId()) ||
      null
    );
  });

  sessionRounds = computed<
    {
      roundIndex: number;
      order: Order;
      itemStartIndex: number;
      roundSubtotal: number;
      itemsCount: number;
    }[]
  >(() => {
    const raw = this.order();
    if (!raw) return [];
    if (raw.orderType === 'TAKEAWAY' || (!raw.tableId && !raw.tableNumber)) {
      const roundSub =
        Math.round(
          (raw.items?.reduce((s, it) => s + (it.unitPrice || 0) * (it.quantity || 1), 0) ??
            raw.subtotal ??
            0) * 100,
        ) / 100;
      return [
        {
          roundIndex: 1,
          order: raw,
          itemStartIndex: 1,
          roundSubtotal: roundSub,
          itemsCount: raw.items?.length || 0,
        },
      ];
    }

    // 1. If pre-attached sessionRounds exists on order
    let allOrders: Order[] = [];
    if (raw.sessionRounds && raw.sessionRounds.length > 0) {
      allOrders = [...raw.sessionRounds];
      if (!allOrders.some((o) => o.id === raw.id)) {
        allOrders.push(raw);
      }
    } else {
      // 2. Discover all sibling orders belonging to this dining session
      const siblings = this.mock
        .orders()
        .filter((o) => {
          if (o.id === raw.id || o.status === 'CANCELLED' || o.orderType === 'TAKEAWAY') {
            return false;
          }

          // Seating session match if available on both
          if (raw.seatingSessionId && o.seatingSessionId) {
            return o.seatingSessionId === raw.seatingSessionId;
          }

          // Exact table matching (must match tableId if both present)
          if (raw.tableId && o.tableId && raw.tableId !== o.tableId) {
            return false;
          }
          const sameTable =
            (raw.tableId && o.tableId === raw.tableId) ||
            (raw.tableNumber &&
              o.tableNumber &&
              raw.tableNumber.trim().toLowerCase() === o.tableNumber.trim().toLowerCase());
          if (!sameTable) return false;

          // Time guard: Never mix orders across different dining times (> 3 hours apart)
          const timeDiff = Math.abs(
            new Date(raw.createdAt).getTime() - new Date(o.createdAt).getTime(),
          );
          if (timeDiff > 3 * 60 * 60 * 1000) return false;

          // If raw is settled, siblings must either be settled around the same time or absorbed
          if (raw.paymentStatus === 'PAID') {
            if (o.paymentStatus === 'PAID') {
              if (raw.settledAt && o.settledAt) {
                const diffMs = Math.abs(
                  new Date(raw.settledAt).getTime() - new Date(o.settledAt).getTime(),
                );
                return diffMs <= 10 * 60 * 1000;
              }
              return o.totalAmount === 0 || raw.totalAmount === 0;
            }
            return false;
          }

          // Both unpaid on same table within 3 hours
          return o.paymentStatus === 'UNPAID';
        });

      allOrders = [raw, ...siblings];
    }

    const sorted = allOrders.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    let runningIndex = 1;
    return sorted.map((ord, idx) => {
      const itemsCount = ord.items?.length || 0;
      const startIndex = runningIndex;
      runningIndex += itemsCount;

      const roundSubtotal =
        Math.round(
          (ord.items?.reduce((s, it) => s + (it.unitPrice || 0) * (it.quantity || 1), 0) ??
            ord.subtotal ??
            0) * 100,
        ) / 100;

      return {
        roundIndex: idx + 1,
        order: ord,
        itemStartIndex: startIndex,
        roundSubtotal,
        itemsCount,
      };
    });
  });

  getTaxableValue(ord: Order | null): number {
    if (!ord) return 0;
    if (ord.appliedCouponCode) {
      return Math.max(0, Math.round((ord.subtotal - (ord.discountAmount || 0)) * 100) / 100);
    }
    return ord.subtotal || 0;
  }

  effectiveOrder = computed(() => {
    const raw = this.order();
    if (!raw) return null;

    const rounds = this.sessionRounds();
    if (rounds.length <= 1) {
      const itemsSum = raw.items?.reduce((s, it) => s + (it.unitPrice || 0) * (it.quantity || 1), 0);
      const subtotal = itemsSum !== undefined && itemsSum > 0 ? Math.round(itemsSum * 100) / 100 : raw.subtotal;
      const discountAmount = raw.discountAmount || 0;
      const hasCoupon = !!raw.appliedCouponCode;

      const cgstRate = this.getOrderCgstRate(raw);
      const sgstRate = this.getOrderSgstRate(raw);

      let taxableValue: number;
      let cgstAmount: number;
      let sgstAmount: number;
      let taxAmount: number;
      let totalAmount: number;

      if (hasCoupon) {
        // Coupon discount applies to total BEFORE taxes
        taxableValue = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
        cgstAmount = Math.round(taxableValue * (cgstRate / 100) * 100) / 100;
        sgstAmount = Math.round(taxableValue * (sgstRate / 100) * 100) / 100;
        taxAmount = Math.round((cgstAmount + sgstAmount) * 100) / 100;
        // Chargeable amount never shows pointed/decimal value: rounded to whole rupee
        totalAmount = Math.round(Math.max(0, taxableValue + taxAmount));
      } else {
        // Admin / round-off discount applies to total AFTER taxes
        taxableValue = subtotal;
        cgstAmount = Math.round(taxableValue * (cgstRate / 100) * 100) / 100;
        sgstAmount = Math.round(taxableValue * (sgstRate / 100) * 100) / 100;
        taxAmount = Math.round((cgstAmount + sgstAmount) * 100) / 100;
        const grossTotal = Math.round((taxableValue + taxAmount) * 100) / 100;
        // Chargeable amount never shows pointed/decimal value: rounded to whole rupee
        totalAmount = Math.round(Math.max(0, grossTotal - discountAmount));
      }

      return {
        ...raw,
        subtotal,
        discountAmount,
        cgstRate,
        sgstRate,
        cgstAmount,
        sgstAmount,
        taxAmount,
        totalAmount,
      };
    }

    // Consolidated multi-round session order
    const allItems = rounds.flatMap((r) => r.order.items || []);
    const subtotal = Math.round(rounds.reduce((sum, r) => sum + r.roundSubtotal, 0) * 100) / 100;

    const discountAmount = Math.round(
      (raw.discountAmount ||
        rounds.reduce((sum, r) => sum + (r.order.discountAmount || 0), 0)) * 100,
    ) / 100;

    const hasCoupon = !!(raw.appliedCouponCode || rounds.some((r) => r.order.appliedCouponCode));
    const cgstRate = this.getOrderCgstRate(raw);
    const sgstRate = this.getOrderSgstRate(raw);

    let taxableValue: number;
    let cgstAmount: number;
    let sgstAmount: number;
    let taxAmount: number;
    let totalAmount: number;

    if (hasCoupon) {
      taxableValue = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
      cgstAmount = Math.round(taxableValue * (cgstRate / 100) * 100) / 100;
      sgstAmount = Math.round(taxableValue * (sgstRate / 100) * 100) / 100;
      taxAmount = Math.round((cgstAmount + sgstAmount) * 100) / 100;
      totalAmount = Math.round(Math.max(0, taxableValue + taxAmount));
    } else {
      taxableValue = subtotal;
      cgstAmount = Math.round(taxableValue * (cgstRate / 100) * 100) / 100;
      sgstAmount = Math.round(taxableValue * (sgstRate / 100) * 100) / 100;
      taxAmount = Math.round((cgstAmount + sgstAmount) * 100) / 100;
      const grossTotal = Math.round((taxableValue + taxAmount) * 100) / 100;
      totalAmount = Math.round(Math.max(0, grossTotal - discountAmount));
    }

    return {
      ...raw,
      items: allItems,
      subtotal,
      discountAmount,
      cgstRate,
      sgstRate,
      cgstAmount,
      sgstAmount,
      taxAmount,
      totalAmount,
      isSessionConsolidated: true,
      sessionRoundsCount: rounds.length,
      sessionRounds: rounds.map((r) => r.order),
    };
  });

  splitBill = computed(() => {
    const sid = this.splitBillId();
    if (!sid) return null;
    return this.mock.splitBills().find((b) => b.id === sid) || null;
  });

  effectivePrintCount = computed(() => {
    const s = this.splitBill();
    if (s) return s.printCount || 0;
    return this.order()?.printCount || 0;
  });

  // DC-10 fix: settledAt alone is not authoritative — trust paymentStatus
  isPaid(ord: Order | null | undefined): boolean {
    if (!ord) return false;
    return (
      ord.paymentStatus === 'PAID' ||
      (ord.paymentStatus as string)?.toUpperCase() === 'PAID' ||
      ord.status === 'COMPLETED'
    );
  }

  get restaurantAddress(): string {
    const r = this.restaurant();
    // DC-4 fix: return empty string when restaurant data not loaded; never show another brand's address
    if (!r?.address) return '';
    const parts = [r.address.street, r.address.area, r.address.city, r.address.zip].filter(Boolean);
    return parts.join(', ');
  }

  get restaurantContactInfo(): string {
    const r = this.restaurant();
    const phone = r?.contact?.phone || '';
    const gstin = r?.taxSettings?.gstNumber || '';
    return phone && gstin ? `Tel: ${phone} • GSTIN: ${gstin}` : phone || '';
  }

  get fssaiLicense(): string {
    const r = this.restaurant() as any;
    // DC-4 fix: return empty string when not configured; never show a fake license number
    return r?.taxSettings?.fssaiNumber || r?.fssaiNumber || '';
  }

  logoFailed = signal<boolean>(false);

  get restaurantPhone(): string {
    return this.restaurant()?.contact?.phone || '';
  }

  get restaurantEmail(): string {
    return this.restaurant()?.contact?.email || '';
  }

  get restaurantGstin(): string {
    // DC-4 fix: return empty string when not configured
    return this.restaurant()?.taxSettings?.gstNumber || '';
  }

  amountInWords(amount: number): string {
    return amountInWordsINR(amount);
  }

  getBilledByStaff(ord: Order): string {
    if (ord?.serverStaffId) {
      const staff = this.mock.staffMembers().find((s) => s.id === ord.serverStaffId);
      if (staff) return `${staff.name} (${staff.role})`;
    }
    return (
      (ord as any)?.serverStaffName ||
      (ord as any)?.server_staff_name ||
      'Billing Desk / Supervisor'
    );
  }

  // DM-4 fix: prefer backend invoice_number if available; synthesise from order number otherwise
  getInvoiceNumber(ord: Order): string {
    if ((ord as any).invoiceNumber) return (ord as any).invoiceNumber;
    if ((ord as any).invoice_number) return (ord as any).invoice_number;
    return `INV-${ord.orderNumber || ''}`;
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.orderId.set(params.get('invoiceId') || params.get('orderId') || '');
    });
    this.route.queryParamMap.subscribe((q) => {
      this.splitBillId.set(q.get('splitId') || '');
      this.isFromCanvas.set(q.get('from') === 'canvas');
      if (q.get('reprint') === 'true') {
        setTimeout(() => this.openReprintModal(), 50);
      }
      if (
        (q.get('preview') === 'thermal' ||
          q.get('thermal') === 'true' ||
          q.get('print') === 'true') &&
        !this.hasAutoOpenedThermal
      ) {
        const ord = this.effectiveOrder();
        const s = this.splitBill();
        const isPaidTarget = s ? s.paymentStatus === 'PAID' : this.isPaid(ord);
        if (ord && isPaidTarget && ord.status !== 'CANCELLED') {
          this.hasAutoOpenedThermal = true;
          setTimeout(() => this.showThermalPreviewModal.set(true), 150);
        }
      }
    });
  }

  private dispatchThermalOrBrowserPrint(ord: Order, split: any | null, infoMsg: string): void {
    const cfg = this.thermalPrinter.config();
    if (cfg.target === 'BROWSER') {
      this.toastService.success(infoMsg);
      window.print();
      return;
    }

    const rest = this.restaurant() || {};
    this.thermalPrinter.printOrderReceipt(rest, ord, split).subscribe({
      next: (res) => {
        if (res.success) {
          const targetName =
            cfg.target === 'NETWORK'
              ? cfg.networkAddress
              : cfg.printerName || 'Default Windows Printer';
          this.toastService.success(`Thermal receipt sent to ${targetName}.`);
        } else {
          this.toastService.warning(
            `Thermal printer error: ${res.message}. Opening standard print.`,
          );
          window.print();
        }
      },
      error: () => {
        this.toastService.warning('Thermal printer offline. Opening standard print.');
        window.print();
      },
    });
  }

  isCurrentTargetPaid(): boolean {
    const s = this.splitBill();
    if (s) return s.paymentStatus === 'PAID';
    return this.isPaid(this.order());
  }

  settleCurrentTarget(): void {
    const s = this.splitBill();
    const ord = this.order();
    if (!ord) return;
    if (s) {
      const res = this.mock.settleSplitBill({
        orderId: ord.id,
        splitBillId: s.id,
        paymentMethod: 'CASH',
      });
      if (res.success) {
        this.toastService.success(`Split bill #${s.splitIndex} settled successfully.`);
      } else {
        this.toastService.error(res.error || 'Failed to settle split bill');
      }
    } else {
      const res = this.mock.settleOrder({
        orderId: ord.id,
        paymentMethod: 'CASH',
      });
      if (res.success) {
        this.toastService.success(`Order #${ord.orderNumber} settled successfully.`);
      } else {
        this.toastService.error(res.error || 'Failed to settle order');
      }
    }
  }

  openThermalPreviewModal(): void {
    if (this.isPrinting()) return;
    const ord = this.order();
    if (!ord || ord.status === 'CANCELLED') {
      this.toastService.warning('Cannot print bill for a cancelled order.');
      return;
    }
    if (!this.isCurrentTargetPaid()) {
      this.toastService.warning('Cannot print bill for an unpaid or incomplete order.');
      return;
    }
    this.isPrinting.set(true);
    setTimeout(() => {
      this.showThermalPreviewModal.set(true);
      this.isPrinting.set(false);
    }, 250);
  }

  onThermalReceiptPrinted(event: { method: 'THERMAL' | 'BROWSER'; printCount: number }): void {
    const split = this.splitBill();
    if (split) {
      if ((split.printCount || 0) === 0) {
        this.mock.recordSplitBillPrint(split.id, false, 'Billing Staff');
      }
      return;
    }

    const ord = this.order();
    if (!ord) return;

    if ((ord.printCount || 0) === 0) {
      this.mock.recordOrderPrint(ord.id, false, 'Billing Staff');
      if (ord.paymentStatus === 'PAID' && ord.status !== 'COMPLETED') {
        this.mock.updateOrderStatusAtomic(ord.id, 'COMPLETED');
      }
    }
  }

  printInvoice(): void {
    this.openThermalPreviewModal();
  }

  openReprintModal(): void {
    this.adminPasswordInput.set('');
    this.adminPasswordError.set('');
    this.showAdminReprintModal.set(true);
  }

  cancelReprintModal(): void {
    this.showAdminReprintModal.set(false);
    this.adminPasswordInput.set('');
    this.adminPasswordError.set('');
  }

  confirmReprintWithAdmin(): void {
    const pwd = this.adminPasswordInput();
    if (!this.adminAuth.verifyAdminPassword(pwd)) {
      this.adminPasswordError.set(
        'Incorrect admin password. Authorization required to reprint invoice.',
      );
      return;
    }

    const split = this.splitBill();
    if (split) {
      this.showAdminReprintModal.set(false);
      this.adminPasswordInput.set('');
      this.adminPasswordError.set('');
      const res = this.mock.recordSplitBillPrint(split.id, true, 'Admin Override');
      if (res.success) {
        this.showThermalPreviewModal.set(true);
        this.toastService.success(
          `Admin authorization verified. Printing duplicate reprint (Copy #${res.printCount}).`,
        );
      }
      return;
    }

    const ord = this.order();
    if (!ord) return;

    this.showAdminReprintModal.set(false);
    this.adminPasswordInput.set('');
    this.adminPasswordError.set('');

    const res = this.mock.recordOrderPrint(ord.id, true, 'Admin Override');
    if (res.success) {
      if (ord.paymentStatus === 'PAID' && ord.status !== 'COMPLETED') {
        this.mock.updateOrderStatusAtomic(ord.id, 'COMPLETED');
      }
      this.showThermalPreviewModal.set(true);
      this.toastService.success(
        `Admin authorization verified. Printing duplicate reprint (Copy #${res.printCount}).`,
      );
    }
  }

  openWhatsAppModal(): void {
    const ord = this.effectiveOrder();
    const existingPhone = ord?.customerPhone || '';
    this.whatsAppPhone.set(existingPhone);
    const restName = this.restaurant()?.name || 'GuruKripa Dhaba';
    this.whatsAppCustomMessage.set(ord ? buildWhatsAppBillMessage(restName, ord, this.splitBill()) : '');
    this.showWhatsAppModal.set(true);
    this.whatsAppBridge.startStatusPoller();
  }

  closeWhatsAppModal(): void {
    this.showWhatsAppModal.set(false);
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
    const ord = this.order();
    if (!ord) return;
    const phone = this.whatsAppPhone().trim();
    if (!phone) {
      this.toastService.warning('Please enter customer WhatsApp phone number.');
      return;
    }
    const message = this.whatsAppMessagePreview();
    const restName = this.restaurant()?.name || 'GuruKripa Dhaba';

    this.isDispatchingWhatsApp.set(true);

    if (this.whatsAppBridge.connectionStatus() === 'CONNECTED') {
      this.toastService.info('Dispatching WhatsApp message in background...');
      this.whatsAppBridge.sendBill(phone, restName, ord, this.splitBill(), message).subscribe({
        next: (res) => {
          this.isDispatchingWhatsApp.set(false);
          if (res.success) {
            this.toastService.success('WhatsApp bill delivered directly to customer!');
            this.closeWhatsAppModal();
          } else {
            this.toastService.warning(res.error || 'Direct dispatch failed, opening WhatsApp fallback...');
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

  sendWhatsApp(): void {
    this.sendWhatsAppBill();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.cancelReprintModal();
      this.closeWhatsAppModal();
    }
  }
}
