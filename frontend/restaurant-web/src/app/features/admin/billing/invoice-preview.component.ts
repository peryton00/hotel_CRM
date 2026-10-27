import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { ToastService } from '../../../core/services/toast.service';
import { AdminAuthService } from '../../../core/services/admin-auth.service';

@Component({
  selector: 'app-invoice-preview',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, CurrencyInrPipe],
  template: `
    @if (order(); as ord) {
      <div class="invoice-page">
        <!-- Action Bar (Screen Only) -->
        <div class="action-bar no-print">
          <div class="actions-left">
            <a routerLink="/admin/billing" class="back-link">
              <i class="ph ph-arrow-left"></i>
              <span>Back to Billing</span>
            </a>
            @if (splitBill()) {
              <a
                [routerLink]="['/admin/billing', ord.id]"
                class="btn btn-secondary btn-sm"
                style="margin-left: 12px;"
              >
                <i class="ph ph-receipt"></i>
                <span>View Full Order Invoice</span>
              </a>
            }
          </div>

          <div class="actions-right">
            @if (effectivePrintCount() === 0) {
              <button
                class="btn btn-primary"
                (click)="printInvoice()"
                [title]="splitBill() ? 'Print Split Bill Receipt' : 'Print Original Tax Invoice'"
              >
                <i class="ph ph-printer"></i>
                <span>{{ splitBill() ? 'Print Split Slip' : 'Print Tax Invoice' }}</span>
              </button>
            } @else {
              <div class="print-count-indicator">
                <i class="ph ph-check-circle"></i>
                <span
                  >Printed {{ effectivePrintCount() }} time{{
                    effectivePrintCount() > 1 ? 's' : ''
                  }}</span
                >
              </div>
              <button
                class="btn btn-primary btn-reprint"
                (click)="openReprintModal()"
                title="Admin Password required to reprint bill"
              >
                <i class="ph ph-lock-key"></i>
                <span>Reprint (Admin Authorized)</span>
              </button>
            }
          </div>
        </div>

        <!-- Printable Thermal / A4 Receipt Card -->
        <div class="invoice-paper" id="invoicePaper">
          @if (splitBill(); as split) {
            <!-- SPLIT BILL RECEIPT SLIP -->
            @if (split.printCount && split.printCount > 1) {
              <div class="reprint-watermark-ribbon">
                *** DUPLICATE SPLIT SLIP — REPRINT (COPY #{{ split.printCount }}) ***
              </div>
            } @else if (split.paymentStatus !== 'PAID') {
              <div
                class="reprint-watermark-ribbon unpaid-ribbon"
                style="background: #fffbeb; border-color: #f59e0b; color: #b45309;"
              >
                *** PRO-FORMA SPLIT BILL (AWAITING SETTLEMENT) ***
              </div>
            }

            <div class="invoice-header">
              <div class="brand-crest"><i class="ph ph-crown"></i></div>
              <h1 class="invoice-brand-title">{{ restaurant()?.name || 'GuruKripa Dhaba' }}</h1>
              <p class="invoice-sub-brand">
                {{ restaurant()?.tagline || 'Artisanal Awadhi & Mughlai Bistro' }}
              </p>
              <p class="invoice-address">
                14 Heritage Promenade, Civil Lines, MG Road, Bengaluru - 560001<br />
                Tel: +91 80 4912 8800 • GSTIN: 29AAAAA0000A1Z5
              </p>
              <div class="invoice-divider"></div>
            </div>

            <div class="split-slip-badge-row" style="text-align: center; margin-bottom: 12px;">
              <span
                style="display: inline-block; padding: 4px 12px; background: rgba(212, 175, 55, 0.15); border: 1px solid rgba(212, 175, 55, 0.35); border-radius: 4px; font-weight: 700; font-size: 0.8125rem;"
              >
                ITEMIZED SPLIT RECEIPT — PART #{{ split.splitIndex }} OF {{ split.splitTotalCount }}
              </span>
            </div>

            <div class="invoice-meta-grid">
              <div class="meta-col">
                <div class="m-item">
                  <strong>Receipt Slip:</strong> SPLIT-{{
                    split.orderNumber.replace(/[^0-9]/g, '')
                  }}-{{ split.splitIndex }}
                </div>
                <div class="m-item"><strong>Parent Order:</strong> {{ split.orderNumber }}</div>
                <div class="m-item">
                  <strong>Date:</strong> {{ split.settledAt || ord.createdAt | date: 'mediumDate' }}
                  {{ split.settledAt || ord.createdAt | date: 'shortTime' }}
                </div>
              </div>
              <div class="meta-col text-right">
                @if (ord.orderType === 'TAKEAWAY' || split.orderType === 'TAKEAWAY') {
                  <div class="m-item">
                    <strong
                      class="table-callout takeaway-callout"
                      style="color: #8b6508; background: rgba(212, 175, 55, 0.15); padding: 2px 8px; border-radius: 4px;"
                      >TAKEAWAY •
                      {{ split.pickupReference || ord.pickupReference || ord.orderNumber }}</strong
                    >
                  </div>
                } @else {
                  <div class="m-item">
                    <strong class="table-callout"
                      >TABLE {{ split.tableNumber || ord.tableNumber }}</strong
                    >
                  </div>
                }
                <div class="m-item">
                  <strong>Guest:</strong> {{ split.customerName || ord.customerName }}
                </div>
                <div class="m-item">
                  <strong>Split Mode:</strong>
                  {{ split.splitType === 'ITEM_BASED' ? 'Itemized Split' : 'Equal Share Split' }}
                </div>
                @if (split.printCount && split.printCount > 0) {
                  <div class="m-item">
                    <strong>Print Copy:</strong> #{{ split.printCount }}
                    {{ split.printCount > 1 ? '(Duplicate)' : '(Original)' }}
                  </div>
                }
              </div>
            </div>

            <div class="invoice-divider"></div>

            <!-- Line Items Table -->
            <table class="receipt-table">
              <thead>
                <tr>
                  <th class="text-left">Split Description / Dish</th>
                  <th class="text-center">Qty</th>
                  <th class="text-right">Rate</th>
                  <th class="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                @if (
                  split.splitType === 'ITEM_BASED' &&
                  split.allocatedItems &&
                  split.allocatedItems.length > 0
                ) {
                  @for (it of split.allocatedItems; track it.orderItemId) {
                    <tr>
                      <td class="text-left">
                        <div class="dish-item-name">{{ it.name }}</div>
                      </td>
                      <td class="text-center">{{ it.quantity }}</td>
                      <td class="text-right">{{ it.unitPrice | currencyInr }}</td>
                      <td class="text-right font-bold">{{ it.itemTotal | currencyInr }}</td>
                    </tr>
                  }
                } @else {
                  <tr>
                    <td class="text-left">
                      <div class="dish-item-name">
                        Equal Split Share (Part {{ split.splitIndex }} of
                        {{ split.splitTotalCount }})
                      </div>
                      <div class="dish-sub-text">
                        Proportionate 1/{{ split.splitTotalCount }} share of parent order #{{
                          ord.orderNumber
                        }}
                      </div>
                    </td>
                    <td class="text-center">1</td>
                    <td class="text-right">{{ split.subtotal | currencyInr }}</td>
                    <td class="text-right font-bold">{{ split.subtotal | currencyInr }}</td>
                  </tr>
                }
              </tbody>
            </table>

            <div class="invoice-divider"></div>

            <!-- Subtotal & GST Calculation -->
            <div class="totals-breakdown">
              <div class="t-row">
                <span>Split Subtotal:</span>
                <span>{{ split.subtotal | currencyInr }}</span>
              </div>
              @if (split.discountAmount > 0) {
                <div class="t-row discount">
                  <span>Split Discount:</span>
                  <span>-{{ split.discountAmount | currencyInr }}</span>
                </div>
              }
              @if (split.taxBreakdown && split.taxBreakdown.length > 0) {
                @for (t of split.taxBreakdown; track t.name) {
                  <div class="t-row">
                    <span>{{ t.name }}:</span>
                    <span>{{ t.amount | currencyInr }}</span>
                  </div>
                }
              } @else {
                <div class="t-row">
                  <span>GST (5%):</span>
                  <span>{{ split.taxAmount | currencyInr }}</span>
                </div>
              }
              <div class="invoice-divider thick"></div>
              <div class="t-row final-grand-total">
                <span>SPLIT SHARE TOTAL:</span>
                <span class="grand-val">{{ split.totalAmount | currencyInr }}</span>
              </div>
              <div class="invoice-divider thick"></div>
            </div>

            <!-- Payment Stamp -->
            <div class="payment-stamp-box">
              @if (split.paymentStatus === 'PAID') {
                <div class="stamp paid">
                  <span>PAID</span>
                  <small>{{ split.paymentMethod || 'UPI' }} SETTLED</small>
                </div>
              } @else {
                <div class="stamp unpaid">
                  <span>UNPAID</span>
                  <small>AWAITING SETTLEMENT</small>
                </div>
              }
            </div>

            <div class="receipt-footer">
              <p>Individual Split Receipt • {{ restaurant()?.name || 'GuruKripa Dhaba' }}</p>
              <p class="f-sub">
                Parent Order: {{ ord.orderNumber }} • FSSAI Lic No: 11223344556677
              </p>
            </div>
          } @else {
            <!-- FULL PARENT ORDER INVOICE -->
            @if (ord.printCount && ord.printCount > 1) {
              <div class="reprint-watermark-ribbon">
                *** DUPLICATE TAX INVOICE — REPRINT (COPY #{{ ord.printCount }}) ***
              </div>
            }

            <div class="invoice-header">
              <div class="brand-crest"><i class="ph ph-crown"></i></div>
              <h1 class="invoice-brand-title">{{ restaurant()?.name || 'GuruKripa Dhaba' }}</h1>
              <p class="invoice-sub-brand">
                {{ restaurant()?.tagline || 'Artisanal Awadhi & Mughlai Bistro' }}
              </p>
              <p class="invoice-address">
                14 Heritage Promenade, Civil Lines, MG Road, Bengaluru - 560001<br />
                Tel: +91 80 4912 8800 • GSTIN: 29AAAAA0000A1Z5
              </p>
              <div class="invoice-divider"></div>
            </div>

            <div class="invoice-meta-grid">
              <div class="meta-col">
                <div class="m-item">
                  <strong>Invoice No:</strong> INV-2026-{{ ord.orderNumber.replace('#ORD-', '') }}
                </div>
                <div class="m-item"><strong>Order Ref:</strong> {{ ord.orderNumber }}</div>
                <div class="m-item">
                  <strong>Date:</strong> {{ ord.createdAt | date: 'mediumDate' }}
                  {{ ord.createdAt | date: 'shortTime' }}
                </div>
              </div>
              <div class="meta-col text-right">
                @if (ord.orderType === 'TAKEAWAY') {
                  <div class="m-item">
                    <strong
                      class="table-callout takeaway-callout"
                      style="color: #8b6508; background: rgba(212, 175, 55, 0.15); padding: 2px 8px; border-radius: 4px;"
                      >TAKEAWAY • {{ ord.pickupReference || ord.orderNumber }}</strong
                    >
                  </div>
                } @else {
                  <div class="m-item">
                    <strong class="table-callout">TABLE {{ ord.tableNumber }}</strong>
                  </div>
                }
                <div class="m-item"><strong>Guest:</strong> {{ ord.customerName }}</div>
                <div class="m-item"><strong>Mobile:</strong> {{ ord.customerPhone }}</div>
                @if (ord.printCount && ord.printCount > 0) {
                  <div class="m-item">
                    <strong>Print Copy:</strong> #{{ ord.printCount }}
                    {{ ord.printCount > 1 ? '(Duplicate)' : '(Original)' }}
                  </div>
                }
              </div>
            </div>

            <div class="invoice-divider"></div>

            <!-- Line Items Table -->
            <table class="receipt-table">
              <thead>
                <tr>
                  <th class="text-left">Item Description</th>
                  <th class="text-center">Qty</th>
                  <th class="text-right">Rate</th>
                  <th class="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                @for (item of ord.items; track item.id) {
                  <tr>
                    <td class="text-left">
                      <div class="dish-item-name">{{ item.name }}</div>
                      @if (item.selectedPortion) {
                        <div class="dish-sub-text">Portion: {{ item.selectedPortion.label }}</div>
                      }
                      @if (item.selectedVariants && item.selectedVariants.length > 0) {
                        <div class="dish-sub-text">
                          @for (v of item.selectedVariants; track v.optionName) {
                            {{ v.optionName }}
                          }
                        </div>
                      }
                    </td>
                    <td class="text-center">{{ item.quantity }}</td>
                    <td class="text-right">{{ item.unitPrice | currencyInr }}</td>
                    <td class="text-right font-bold">{{ item.itemTotal | currencyInr }}</td>
                  </tr>
                }
              </tbody>
            </table>

            <div class="invoice-divider"></div>

            <!-- Subtotal & GST Calculation -->
            <div class="totals-breakdown">
              <div class="t-row">
                <span>Subtotal:</span>
                <span>{{ ord.subtotal | currencyInr }}</span>
              </div>
              @if (ord.discountAmount > 0) {
                <div class="t-row discount">
                  <span>Discount Privilege ({{ ord.appliedCouponCode }}):</span>
                  <span>-{{ ord.discountAmount | currencyInr }}</span>
                </div>
              }
              <div class="t-row">
                <span>CGST (2.5%):</span>
                <span>{{ ord.cgstAmount | currencyInr }}</span>
              </div>
              <div class="t-row">
                <span>SGST (2.5%):</span>
                <span>{{ ord.sgstAmount | currencyInr }}</span>
              </div>
              <div class="invoice-divider thick"></div>
              <div class="t-row final-grand-total">
                <span>NET PAYABLE AMOUNT:</span>
                <span class="grand-val">{{ ord.totalAmount | currencyInr }}</span>
              </div>
              <div class="invoice-divider thick"></div>
            </div>

            <!-- Payment Stamp -->
            <div class="payment-stamp-box">
              @if (ord.paymentStatus === 'PAID') {
                <div class="stamp paid">
                  <span>PAID</span>
                  <small>{{ ord.paymentMethod || 'UPI' }} SETTLED</small>
                </div>
              } @else {
                <div class="stamp unpaid">
                  <span>UNPAID</span>
                  <small>PENDING SETTLEMENT</small>
                </div>
              }
            </div>

            <div class="receipt-footer">
              <p>Thank you for dining at {{ restaurant()?.name || 'GuruKripa Dhaba' }}!</p>
              <p class="f-sub">FSSAI Lic No: 11223344556677 • Scan table QR for digital feedback</p>
            </div>
          }
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
      </div>
    } @else {
      <div class="empty-state-panel">
        <h2 class="heading-card">Invoice Not Found</h2>
        <a routerLink="/admin/billing" class="btn btn-secondary">Return to Billing Queue</a>
      </div>
    }
  `,
  styles: [
    `
      .invoice-page {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
      }

      .action-bar {
        width: 100%;
        max-width: 580px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        &:hover {
          color: var(--color-crimson);
        }
      }

      .actions-right {
        display: flex;
        gap: 10px;
      }

      .invoice-paper {
        width: 100%;
        max-width: 540px;
        background: #ffffff;
        color: #121212;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 36px 32px;
        box-shadow: var(--shadow-md);
        font-family: var(--font-ui);
      }

      .invoice-header {
        text-align: center;
        margin-bottom: 16px;
      }

      .brand-crest {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: #121212;
        color: #d4af37;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.35rem;
        margin: 0 auto 10px;
      }

      .invoice-brand-title {
        font-family: var(--font-display);
        font-size: 1.5rem;
        letter-spacing: 0.05em;
        margin-bottom: 2px;
      }

      .invoice-sub-brand {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #666;
        margin-bottom: 8px;
      }

      .invoice-address {
        font-size: 0.75rem;
        color: #555;
        line-height: 1.45;
      }

      .invoice-divider {
        height: 1px;
        background: #e5ded4;
        margin: 14px 0;

        &.thick {
          height: 2px;
          background: #121212;
        }
      }

      .invoice-meta-grid {
        display: flex;
        justify-content: space-between;
        font-size: 0.8125rem;
        line-height: 1.5;
      }

      .text-right {
        text-align: right;
      }

      .table-callout {
        color: var(--color-crimson);
        font-size: 0.9375rem;
      }

      .receipt-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8125rem;
        margin: 10px 0;

        th {
          padding: 8px 4px;
          border-bottom: 1px solid #121212;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 0.6875rem;
        }

        td {
          padding: 8px 4px;
          vertical-align: top;
        }
      }

      .dish-item-name {
        font-weight: 600;
      }

      .dish-sub-text {
        font-size: 0.6875rem;
        color: #666;
      }

      .totals-breakdown {
        display: flex;
        flex-direction: column;
        gap: 5px;
        font-size: 0.8125rem;
        margin-left: auto;
        max-width: 280px;
      }

      .t-row {
        display: flex;
        justify-content: space-between;

        &.discount {
          color: #1b633e;
          font-weight: 600;
        }

        &.final-grand-total {
          font-size: 1rem;
          font-weight: 900;
          color: #c21807;
        }
      }

      .payment-stamp-box {
        margin: 20px 0 10px;
        display: flex;
        justify-content: center;
      }

      .stamp {
        border: 2px solid;
        padding: 6px 18px;
        border-radius: 4px;
        display: flex;
        flex-direction: column;
        align-items: center;
        font-weight: 900;
        letter-spacing: 0.1em;
        transform: rotate(-3deg);

        &.paid {
          border-color: #1b633e;
          color: #1b633e;
        }

        &.unpaid {
          border-color: #c21807;
          color: #c21807;
        }

        small {
          font-size: 0.625rem;
          font-weight: 700;
        }
      }

      .receipt-footer {
        text-align: center;
        font-size: 0.75rem;
        color: #666;
        line-height: 1.45;
        margin-top: 16px;
      }

      .f-sub {
        font-size: 0.6875rem;
        color: #888;
        margin-top: 2px;
      }

      // Media Print Styling
      @media print {
        body {
          background: #ffffff !important;
        }

        .no-print {
          display: none !important;
        }

        .invoice-page {
          margin: 0;
          padding: 0;
        }

        .invoice-paper {
          border: none;
          box-shadow: none;
          padding: 0;
          width: 100%;
          max-width: 100%;
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
          color: #1f2937;

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
            color: #374151;
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
    `,
  ],
})
export class InvoicePreviewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);
  private adminAuth = inject(AdminAuthService);

  restaurant = this.mock.restaurant;
  orderId = signal<string>('');
  splitBillId = signal<string>('');

  showAdminReprintModal = signal<boolean>(false);
  adminPasswordInput = signal<string>('');
  adminPasswordError = signal<string>('');

  order = computed(() => {
    return (
      this.mock.orders().find((o) => o.id === this.orderId() || o.orderNumber === this.orderId()) ||
      null
    );
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

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.orderId.set(params.get('invoiceId') || params.get('orderId') || '');
    });
    this.route.queryParamMap.subscribe((q) => {
      this.splitBillId.set(q.get('splitId') || '');
    });
  }

  printInvoice(): void {
    const split = this.splitBill();
    if (split) {
      const res = this.mock.recordSplitBillPrint(split.id, false, 'Billing Staff');
      if (res.success) {
        this.toastService.success(`Split Bill Slip printed (Original - Copy #1).`);
        window.print();
      }
      return;
    }

    const ord = this.order();
    if (!ord) return;
    const res = this.mock.recordOrderPrint(ord.id, false, 'Billing Staff');
    if (res.success) {
      this.toastService.success(`Tax Invoice printed (Original - Copy #1).`);
      window.print();
    }
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
        this.toastService.info(
          `Admin authorization verified. Printing reprint (Copy #${res.printCount}).`,
        );
        window.print();
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
      this.toastService.info(
        `Admin authorization verified. Printing reprint (Copy #${res.printCount}).`,
      );
      window.print();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.cancelReprintModal();
    }
  }
}
