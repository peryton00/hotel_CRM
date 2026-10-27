import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { ToastService } from '../../../core/services/toast.service';
import {
  calculateFinancialSummary,
  calculateOrderTypeBreakdown,
  calculateCogsSummary,
  calculateWastageSummary,
  getOrderFulfillmentTimestamp,
  getRefundCompletionTimestamp,
} from '../../../core/utils/financial.utils';
import {
  computeDateRange,
  isTimestampInRange,
  formatLocalDate,
  DateRangePreset,
  DateRangeFilter,
} from '../../../core/utils/date-range.utils';
import { generateIdempotencyKey } from '../../../core/utils/idempotency.util';

export type WastageReasonType =
  'SPOILAGE' | 'EXPIRY' | 'SPILLAGE' | 'PREPARATION_WASTE' | 'QUALITY_REJECTION' | 'OTHER';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyInrPipe],
  template: `
    <div class="reports-page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="heading-display">Reports & Financial Analytics</h1>
          <p class="text-muted">
            Authoritative sales performance, recipe COGS, gross margins, and inventory wastage
            analysis.
          </p>
        </div>

        <div class="header-actions">
          <button class="btn btn-secondary" (click)="openWastageModal()">
            <i class="ph ph-trash"></i>
            <span>Log Wastage</span>
          </button>
          <button class="btn btn-secondary" (click)="exportReport()">
            <i class="ph ph-file-csv"></i>
            <span>Export CSV</span>
          </button>
          <button class="btn btn-primary" (click)="printReport()">
            <i class="ph ph-printer"></i>
            <span>Print Report</span>
          </button>
        </div>
      </div>

      <!-- Filter Controls Toolbar -->
      <div class="filter-toolbar">
        <div class="preset-group">
          <span class="filter-label"><i class="ph ph-calendar"></i> Period:</span>
          <button
            class="preset-btn"
            [class.active]="selectedPreset() === 'today'"
            (click)="setPreset('today')"
          >
            Today
          </button>
          <button
            class="preset-btn"
            [class.active]="selectedPreset() === 'yesterday'"
            (click)="setPreset('yesterday')"
          >
            Yesterday
          </button>
          <button
            class="preset-btn"
            [class.active]="selectedPreset() === 'last_7_days'"
            (click)="setPreset('last_7_days')"
          >
            Last 7 Days
          </button>
          <button
            class="preset-btn"
            [class.active]="selectedPreset() === 'last_30_days'"
            (click)="setPreset('last_30_days')"
          >
            Last 30 Days
          </button>
          <button
            class="preset-btn"
            [class.active]="selectedPreset() === 'this_month'"
            (click)="setPreset('this_month')"
          >
            This Month
          </button>
          <button
            class="preset-btn"
            [class.active]="selectedPreset() === 'previous_month'"
            (click)="setPreset('previous_month')"
          >
            Previous Month
          </button>
          <button
            class="preset-btn"
            [class.active]="selectedPreset() === 'custom'"
            (click)="setPreset('custom')"
          >
            Custom Range
          </button>
          <button
            class="preset-btn"
            [class.active]="selectedPreset() === 'all'"
            (click)="setPreset('all')"
          >
            All Time
          </button>
        </div>

        @if (selectedPreset() === 'custom') {
          <div class="custom-range-inputs">
            <div class="date-input-wrap">
              <label>Start Date</label>
              <input
                type="date"
                [ngModel]="customStart()"
                (ngModelChange)="customStart.set($event)"
              />
            </div>
            <div class="date-input-wrap">
              <label>End Date</label>
              <input type="date" [ngModel]="customEnd()" (ngModelChange)="customEnd.set($event)" />
            </div>
          </div>
        }

        <div class="order-type-group">
          <span class="filter-label"><i class="ph ph-fork-knife"></i> Order Type:</span>
          <button
            class="preset-btn"
            [class.active]="orderTypeFilter() === 'ALL'"
            (click)="orderTypeFilter.set('ALL')"
          >
            All
          </button>
          <button
            class="preset-btn"
            [class.active]="orderTypeFilter() === 'DINE_IN'"
            (click)="orderTypeFilter.set('DINE_IN')"
          >
            Dine-In
          </button>
          <button
            class="preset-btn"
            [class.active]="orderTypeFilter() === 'TAKEAWAY'"
            (click)="orderTypeFilter.set('TAKEAWAY')"
          >
            Takeaway
          </button>
        </div>
      </div>

      <!-- Active Range Badge & Validation Error -->
      @if (!dateRange().isValid) {
        <div class="alert-banner alert-danger">
          <i class="ph ph-warning-circle"></i>
          <span>{{ dateRange().errorMessage || 'Invalid date range selected.' }}</span>
        </div>
      } @else {
        <div class="range-info-bar">
          <span class="range-label"
            >Active Window: <strong>{{ dateRange().label }}</strong></span
          >
          <span class="range-summary-pill"
            >{{ filteredOrders().length }} orders, {{ rangeRefunds().length }} refunds,
            {{ rangeMovements().length }} stock movements</span
          >
        </div>
      }

      <!-- Financial & COGS Metric Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-title">Gross Sales (Billed)</span>
          <span class="kpi-val">{{ grossSales() | currencyInr }}</span>
          <span class="kpi-sub">{{ filteredOrders().length }} orders placed</span>
        </div>

        <div class="kpi-card">
          <span class="kpi-title">Promotional Discounts</span>
          <span class="kpi-val text-crimson">-{{ totalDiscounts() | currencyInr }}</span>
          <span class="kpi-sub">Redeemed promotional discounts</span>
        </div>

        <div class="kpi-card">
          <span class="kpi-title">Net Sales Performance</span>
          <span class="kpi-val text-onyx" style="font-weight: 700;">{{
            netSales() | currencyInr
          }}</span>
          <span class="kpi-sub">Billed sales (net of promotions)</span>
        </div>

        <div class="kpi-card">
          <span class="kpi-title">Collected Revenue</span>
          <span class="kpi-val text-success">{{ collectedRevenue() | currencyInr }}</span>
          <span class="kpi-sub">
            {{ paidOrdersCount() }} settled orders
            @if (hasEstimatedSettlements()) {
              <small class="text-muted">(legacy timestamps)</small>
            }
          </span>
        </div>

        <div class="kpi-card">
          <span class="kpi-title">Completed Refunds</span>
          <span class="kpi-val text-crimson">-{{ totalRefunds() | currencyInr }}</span>
          <span class="kpi-sub">{{ completedRefundsCount() }} recorded refunds</span>
        </div>

        <div class="kpi-card highlight-card">
          <span class="kpi-title">Net Collections</span>
          <span
            class="kpi-val"
            [class.text-success]="netRevenue() >= 0"
            [class.text-crimson]="netRevenue() < 0"
            style="font-weight: 800;"
            >{{ netRevenue() | currencyInr }}</span
          >
          <span class="kpi-sub">
            Collected cash/UPI minus completed refunds
            @if (hasEstimatedSettlements()) {
              <small class="text-muted">(legacy timestamps)</small>
            }
          </span>
        </div>

        <div class="kpi-card">
          <span class="kpi-title">Outstanding Receivables</span>
          <span class="kpi-val text-onyx">{{ outstandingReceivables() | currencyInr }}</span>
          <span class="kpi-sub">Unsettled orders & split shares</span>
        </div>

        <div class="kpi-card">
          <span class="kpi-title">Recipe COGS (Fulfilled)</span>
          <span class="kpi-val text-onyx">{{ cogsSummary().totalCogs | currencyInr }}</span>
          <span class="kpi-sub"
            >{{ cogsSummary().fulfilledPortionsCount }} served/completed portions</span
          >
        </div>

        <div class="kpi-card highlight-gold">
          <span class="kpi-title">Gross Profit</span>
          <span
            class="kpi-val"
            [class.text-success]="cogsSummary().grossProfit >= 0"
            [class.text-crimson]="cogsSummary().grossProfit < 0"
          >
            {{ cogsSummary().grossProfit | currencyInr }}
          </span>
          <span class="kpi-sub">Net Collections minus COGS</span>
        </div>

        <div class="kpi-card highlight-gold">
          <span class="kpi-title">Gross Margin</span>
          <span
            class="kpi-val"
            [class.text-success]="cogsSummary().grossMarginPercentage >= 40"
            [class.text-crimson]="cogsSummary().grossMarginPercentage < 40"
          >
            {{ cogsSummary().grossMarginPercentage }}%
          </span>
          <span class="kpi-sub">(Gross Profit ÷ Net Collections) × 100</span>
        </div>

        <div class="kpi-card highlight-crimson">
          <span class="kpi-title">Inventory Wastage</span>
          <span class="kpi-val text-crimson">{{
            wastageSummary().totalWastageValue | currencyInr
          }}</span>
          <span class="kpi-sub"
            >{{ wastageSummary().totalMovementsCount }} wastage movements recorded</span
          >
        </div>

        <div class="kpi-card">
          <span class="kpi-title">Total GST Collected</span>
          <span class="kpi-val">{{ totalTaxCollected() | currencyInr }}</span>
          <span class="kpi-sub">CGST (2.5%) + SGST (2.5%)</span>
        </div>
      </div>

      <!-- Empty State if no records found -->
      @if (filteredOrders().length === 0 && rangeMovements().length === 0) {
        <div class="empty-state-box">
          <i class="ph ph-calendar-x empty-icon"></i>
          <h3>No Operational Records in Selected Window</h3>
          <p class="text-muted">
            There are no orders, refunds, or inventory movements matching the period
            <strong>{{ dateRange().label }}</strong
            >.
          </p>
          <button class="btn btn-secondary btn-sm" (click)="setPreset('this_month')">
            Reset to This Month
          </button>
        </div>
      }

      <!-- Order Type Breakdown: Dine-In vs Takeaway -->
      <div class="panel-box">
        <div class="panel-header">
          <div>
            <h2 class="heading-card">Order Type Operational Performance</h2>
            <p class="text-muted text-xs">
              Comparison between Dine-In table service and Takeaway counter pickup orders.
            </p>
          </div>
        </div>

        <div class="order-types-grid">
          <div class="order-type-card dine-in-card">
            <div class="ot-head">
              <span class="badge-mode">DINE_IN</span>
              <span class="ot-count">{{ orderTypeBreakdown().dineIn.ordersCount }} Orders</span>
            </div>
            <div class="ot-metric">
              <span class="ot-label">Net Sales Revenue</span>
              <span class="ot-value">{{
                orderTypeBreakdown().dineIn.netRevenue | currencyInr
              }}</span>
            </div>
            <div class="ot-metric">
              <span class="ot-label">Gross Order Value</span>
              <span class="ot-sub">{{ orderTypeBreakdown().dineIn.grossSales | currencyInr }}</span>
            </div>
            <div class="ot-metric">
              <span class="ot-label">Average Bill</span>
              <span class="ot-sub">{{
                orderTypeBreakdown().dineIn.averageOrderValue | currencyInr
              }}</span>
            </div>
          </div>

          <div class="order-type-card takeaway-card">
            <div class="ot-head">
              <span class="badge-mode">TAKEAWAY</span>
              <span class="ot-count">{{ orderTypeBreakdown().takeaway.ordersCount }} Orders</span>
            </div>
            <div class="ot-metric">
              <span class="ot-label">Net Sales Revenue</span>
              <span class="ot-value">{{
                orderTypeBreakdown().takeaway.netRevenue | currencyInr
              }}</span>
            </div>
            <div class="ot-metric">
              <span class="ot-label">Gross Order Value</span>
              <span class="ot-sub">{{
                orderTypeBreakdown().takeaway.grossSales | currencyInr
              }}</span>
            </div>
            <div class="ot-metric">
              <span class="ot-label">Average Bill</span>
              <span class="ot-sub">{{
                orderTypeBreakdown().takeaway.averageOrderValue | currencyInr
              }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- COGS and Dish Margin Breakdown -->
      <div class="panel-box">
        <div class="panel-header">
          <div>
            <h2 class="heading-card">Menu Cost of Goods Sold (COGS) & Profit Margins</h2>
            <p class="text-muted text-xs">
              Based on fulfilled orders (SERVED & COMPLETED) and active ingredient recipe
              specifications.
              <span class="badge-status-estimated" style="margin-left: 6px;">
                <i class="ph ph-info"></i> {{ cogsSummary().costBasisNotice }}
              </span>
              @if (cogsSummary().untrackedOrEstimatedDishesCount > 0) {
                <span class="badge-warning text-xs" style="margin-left: 6px;">
                  <i class="ph ph-warning"></i>
                  {{ cogsSummary().untrackedOrEstimatedDishesCount }} item(s) estimated / missing
                  recipe
                </span>
              }
            </p>
          </div>
          <div class="cogs-quick-stats">
            <span class="stat-pill"
              >COGS: <strong>{{ cogsSummary().totalCogs | currencyInr }}</strong></span
            >
            <span class="stat-pill"
              >Gross Profit: <strong>{{ cogsSummary().grossProfit | currencyInr }}</strong></span
            >
            <span class="stat-pill"
              >Margin: <strong>{{ cogsSummary().grossMarginPercentage }}%</strong></span
            >
          </div>
        </div>

        <div class="table-responsive">
          <table class="report-table">
            <thead>
              <tr>
                <th>Menu Item</th>
                <th>Category</th>
                <th class="text-right">Fulfilled Qty</th>
                <th class="text-right">Unit COGS</th>
                <th class="text-right">Total Revenue</th>
                <th class="text-right">Total COGS</th>
                <th class="text-right">Gross Profit</th>
                <th class="text-right">Margin %</th>
                <th>Cost Reliability</th>
              </tr>
            </thead>
            <tbody>
              @for (item of cogsSummary().itemBreakdown; track item.menuItemId) {
                <tr>
                  <td>
                    <strong>{{ item.name }}</strong>
                  </td>
                  <td>
                    <span class="tag-category">{{ item.category }}</span>
                  </td>
                  <td class="text-right">{{ item.fulfilledQuantity }}</td>
                  <td class="text-right">{{ item.unitCogs | currencyInr }}</td>
                  <td class="text-right">{{ item.revenue | currencyInr }}</td>
                  <td class="text-right">
                    <strong>{{ item.totalCogs | currencyInr }}</strong>
                  </td>
                  <td
                    class="text-right"
                    [class.text-success]="item.grossProfit >= 0"
                    [class.text-crimson]="item.grossProfit < 0"
                  >
                    {{ item.grossProfit | currencyInr }}
                  </td>
                  <td class="text-right font-mono font-bold">{{ item.grossMarginPct }}%</td>
                  <td>
                    @if (item.status === 'VERIFIED') {
                      <span class="badge-status-verified"
                        ><i class="ph ph-check-circle"></i> Verified Recipe</span
                      >
                    } @else if (item.status === 'ESTIMATED_NO_RECIPE') {
                      <span
                        class="badge-status-estimated"
                        title="No recipe found in database; cost estimated at 0"
                        ><i class="ph ph-question"></i> No Recipe</span
                      >
                    } @else {
                      <span
                        class="badge-status-estimated"
                        title="One or more ingredients lack verified purchase cost"
                        ><i class="ph ph-warning"></i> Incomplete Cost</span
                      >
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="9" class="text-center text-muted" style="padding: 24px;">
                    No fulfilled items recorded in the selected window.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Inventory Wastage Analysis Section -->
      <div class="panel-box">
        <div class="panel-header">
          <div>
            <h2 class="heading-card">Auditable Inventory Wastage Analysis</h2>
            <p class="text-muted text-xs">
              Dedicated stock deduction tracking for spoilage, expiration, spillages, and quality
              rejections.
            </p>
          </div>
          <button class="btn btn-secondary btn-sm" (click)="openWastageModal()">
            <i class="ph ph-plus-circle"></i>
            <span>Record Wastage Event</span>
          </button>
        </div>

        <div class="wastage-summary-row">
          <div class="wastage-kpi">
            <span class="wk-label">Total Wastage Cost</span>
            <span class="wk-val text-crimson">{{
              wastageSummary().totalWastageValue | currencyInr
            }}</span>
          </div>
          <div class="wastage-kpi">
            <span class="wk-label">Wastage Events</span>
            <span class="wk-val">{{ wastageSummary().totalMovementsCount }}</span>
          </div>
          <div class="wastage-kpi">
            <span class="wk-label">Wasted Ingredients</span>
            <span class="wk-val">{{ wastageSummary().byIngredient.length }} Items</span>
          </div>
        </div>

        <div class="wastage-tables-grid">
          <!-- By Ingredient -->
          <div class="sub-table-wrap">
            <h3 class="sub-heading">Wastage by Ingredient</h3>
            <table class="report-table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Category</th>
                  <th class="text-right">Quantity</th>
                  <th class="text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                @for (ing of wastageSummary().byIngredient; track ing.ingredientId) {
                  <tr>
                    <td>
                      <strong>{{ ing.ingredientName }}</strong>
                    </td>
                    <td>
                      <span class="tag-category">{{ ing.category }}</span>
                    </td>
                    <td class="text-right">{{ ing.quantity }} {{ ing.unit }}</td>
                    <td class="text-right text-crimson">
                      <strong>{{ ing.totalValue | currencyInr }}</strong>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="4" class="text-center text-muted" style="padding: 16px;">
                      No ingredient wastage recorded in this timeframe.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- By Reason -->
          <div class="sub-table-wrap">
            <h3 class="sub-heading">Wastage by Operational Reason</h3>
            <table class="report-table">
              <thead>
                <tr>
                  <th>Reason</th>
                  <th class="text-right">Events</th>
                  <th class="text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                @for (rs of wastageSummary().byReason; track rs.reason) {
                  <tr>
                    <td>
                      <strong>{{ formatReasonLabel(rs.reason) }}</strong>
                    </td>
                    <td class="text-right">{{ rs.movementCount }}</td>
                    <td class="text-right text-crimson">
                      <strong>{{ rs.totalValue | currencyInr }}</strong>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="3" class="text-center text-muted" style="padding: 16px;">
                      No wastage reasons recorded.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Category Breakdown & Payment Methods -->
      <div class="reports-grid">
        <div class="panel-box">
          <h2 class="heading-card">Culinary Category Revenue Share</h2>
          <div class="cat-progress-list">
            @for (cat of categoryBreakdown(); track cat.name) {
              <div class="cat-bar-item">
                <div class="cat-info">
                  <span>{{ cat.name }} ({{ cat.quantity }} sold)</span>
                  <strong>{{ cat.percentage }}% ({{ cat.amount | currencyInr }})</strong>
                </div>
                <div class="bar-track">
                  <div class="bar-fill {{ cat.colorClass }}" [style.width.%]="cat.percentage"></div>
                </div>
              </div>
            } @empty {
              <div class="empty-state-text text-muted" style="padding: 24px; text-align: center;">
                No culinary category sales recorded in selected period.
              </div>
            }
          </div>
        </div>

        <div class="panel-box">
          <h2 class="heading-card">Payment Mode Settlement</h2>
          <div class="payment-modes-list">
            @for (mode of paymentBreakdown(); track mode.name) {
              <div class="mode-item">
                <div class="mode-left">
                  <i class="ph {{ mode.icon }} mode-icon"></i>
                  <div>
                    <strong>{{ mode.name }}</strong>
                    <div class="text-xs text-muted">
                      {{ mode.subtitle }} ({{ mode.count }} settled)
                    </div>
                  </div>
                </div>
                <div class="mode-right">
                  <span class="pct">{{ mode.percentage }}%</span>
                  <span class="amt">{{ mode.amount | currencyInr }}</span>
                </div>
              </div>
            } @empty {
              <div class="empty-state-text text-muted" style="padding: 24px; text-align: center;">
                No settled payments recorded in selected period.
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Log Wastage Modal -->
      @if (showWastageModal()) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card">
            <div class="modal-header">
              <div class="modal-title-wrap">
                <div class="badge-icon-crimson"><i class="ph ph-trash"></i></div>
                <div>
                  <h3 class="heading-card" style="margin: 0;">Record Inventory Wastage</h3>
                  <p class="text-muted text-xs" style="margin: 0;">
                    Authoritative stock deduction with audit logging
                  </p>
                </div>
              </div>
              <button class="close-btn" (click)="closeWastageModal()">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              @if (wastageError()) {
                <div class="alert-banner alert-danger">
                  <i class="ph ph-warning-circle"></i>
                  <span>{{ wastageError() }}</span>
                </div>
              }

              <div class="form-group">
                <label class="form-label"
                  >Select Ingredient <span class="text-crimson">*</span></label
                >
                <select
                  class="form-select"
                  [ngModel]="selectedIngredientId()"
                  (ngModelChange)="onIngredientChange($event)"
                >
                  <option value="">-- Choose an Ingredient --</option>
                  @for (ing of activeIngredients(); track ing.id) {
                    <option [value]="ing.id">
                      {{ ing.name }} (Current: {{ ing.currentStock }} {{ ing.unit }})
                    </option>
                  }
                </select>
                @if (selectedIngredient()) {
                  <div class="available-stock-hint">
                    <span
                      >Available to waste:
                      <strong
                        >{{ availableStockForSelected() }} {{ selectedIngredient()?.unit }}</strong
                      ></span
                    >
                    <span class="text-muted text-xs"
                      >(Unreserved stock protecting active guest orders)</span
                    >
                  </div>
                }
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label class="form-label"
                    >Wasted Quantity <span class="text-crimson">*</span></label
                  >
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    class="form-input"
                    [ngModel]="wastageQty()"
                    (ngModelChange)="wastageQty.set($event)"
                    placeholder="e.g. 1.5"
                  />
                </div>

                <div class="form-group flex-1">
                  <label class="form-label">Unit</label>
                  <input
                    type="text"
                    class="form-input"
                    [value]="selectedIngredient()?.unit || 'kg'"
                    readonly
                  />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Wastage Reason <span class="text-crimson">*</span></label>
                <select
                  class="form-select"
                  [ngModel]="wastageReason()"
                  (ngModelChange)="wastageReason.set($event)"
                >
                  <option value="SPOILAGE">Spoilage / Rotting</option>
                  <option value="EXPIRY">Expired Shelf Life</option>
                  <option value="SPILLAGE">Kitchen Spillage / Breakage</option>
                  <option value="PREPARATION_WASTE">Preparation / Trimming Excess</option>
                  <option value="QUALITY_REJECTION">Quality / Texture Rejection</option>
                  <option value="OTHER">Other / Operational Waste</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">Notes & Incident Description</label>
                <textarea
                  class="form-textarea"
                  [ngModel]="wastageNotes()"
                  (ngModelChange)="wastageNotes.set($event)"
                  placeholder="Provide brief context for culinary audit..."
                ></textarea>
              </div>

              <div class="form-group">
                <label class="form-label">Recorded By Staff</label>
                <input
                  type="text"
                  class="form-input"
                  [ngModel]="wastageStaffName()"
                  (ngModelChange)="wastageStaffName.set($event)"
                  placeholder="Chef / Inventory Manager"
                />
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="closeWastageModal()">Cancel</button>
              <button
                class="btn btn-primary"
                (click)="submitWastage()"
                [disabled]="isSubmittingWastage()"
              >
                <i class="ph ph-check"></i>
                <span>{{
                  isSubmittingWastage() ? 'Recording...' : 'Confirm Wastage Deduction'
                }}</span>
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .reports-page {
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
      .header-actions {
        display: flex;
        gap: 12px;
      }

      .filter-toolbar {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: var(--radius-md, 8px);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .preset-group,
      .order-type-group {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .filter-label {
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--color-text-secondary, #4b5563);
        display: flex;
        align-items: center;
        gap: 4px;
        margin-right: 6px;
      }

      .preset-btn {
        padding: 6px 12px;
        font-size: 0.8125rem;
        font-weight: 600;
        background: var(--color-bone-light, #f9fafb);
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: var(--radius-sm, 6px);
        color: var(--color-text-primary, #111827);
        cursor: pointer;
        transition: all var(--transition-fast, 0.15s ease);

        &:hover {
          background: #f3f4f6;
          border-color: #d1d5db;
        }

        &.active {
          background: var(--color-onyx, #1f2937);
          color: #ffffff;
          border-color: var(--color-onyx, #1f2937);
        }
      }

      .custom-range-inputs {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        padding-top: 8px;
        border-top: 1px dashed var(--color-border, #e5e7eb);
      }

      .date-input-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;

        label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-text-muted, #6b7280);
        }

        input[type='date'] {
          padding: 6px 10px;
          font-size: 0.8125rem;
          border: 1px solid var(--color-border, #d1d5db);
          border-radius: 4px;
          background: #ffffff;
        }
      }

      .alert-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 6px;
        font-size: 0.875rem;

        &.alert-danger {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
        }
      }

      .range-info-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 14px;
        background: rgba(184, 134, 11, 0.08);
        border: 1px solid rgba(184, 134, 11, 0.2);
        border-radius: 6px;
        font-size: 0.8125rem;
      }

      .range-summary-pill {
        font-weight: 600;
        color: var(--color-text-secondary, #4b5563);
      }

      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 14px;

        @media (max-width: 1200px) {
          grid-template-columns: repeat(3, 1fr);
        }
        @media (max-width: 800px) {
          grid-template-columns: repeat(2, 1fr);
        }
        @media (max-width: 500px) {
          grid-template-columns: 1fr;
        }
      }

      .kpi-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: var(--radius-md, 8px);
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 4px;

        &.highlight-card {
          border-color: #10b981;
          background: #f0fdf4;
        }

        &.highlight-gold {
          border-color: #d97706;
          background: #fffbeb;
        }

        &.highlight-crimson {
          border-color: #ef4444;
          background: #fef2f2;
        }
      }

      .kpi-title {
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-text-muted, #6b7280);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .kpi-val {
        font-size: 1.5rem;
        font-weight: 800;
      }
      .kpi-sub {
        font-size: 0.75rem;
        color: var(--color-text-muted, #6b7280);
      }
      .text-success {
        color: #059669;
      }
      .text-crimson {
        color: #dc2626;
      }
      .text-onyx {
        color: #111827;
      }

      .empty-state-box {
        background: var(--color-surface, #ffffff);
        border: 1px dashed var(--color-border, #d1d5db);
        border-radius: var(--radius-md, 8px);
        padding: 40px 20px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;

        .empty-icon {
          font-size: 2.5rem;
          color: var(--color-text-muted, #9ca3af);
        }
      }

      .panel-box {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: var(--radius-md, 8px);
        padding: 22px;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 12px;
      }

      .cogs-quick-stats {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .stat-pill {
        font-size: 0.8125rem;
        background: var(--color-bone-light, #f9fafb);
        border: 1px solid var(--color-border, #e5e7eb);
        padding: 4px 10px;
        border-radius: 6px;
      }

      .order-types-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        @media (max-width: 600px) {
          grid-template-columns: 1fr;
        }
      }

      .order-type-card {
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: var(--radius-sm, 6px);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: var(--color-bone-light, #f9fafb);

        .ot-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .ot-count {
          font-weight: 700;
          font-size: 0.875rem;
        }

        .ot-metric {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.8125rem;
        }

        .ot-value {
          font-size: 1.125rem;
          font-weight: 800;
          color: #059669;
        }

        .ot-sub {
          font-weight: 600;
          color: var(--color-text-primary, #111827);
        }
      }

      .badge-mode {
        font-size: 0.6875rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        padding: 2px 6px;
        border-radius: 4px;
        background: #e5e7eb;
        color: #374151;
      }

      .badge-warning {
        background: #fef3c7;
        color: #92400e;
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .table-responsive {
        overflow-x: auto;
      }

      .report-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8125rem;

        th,
        td {
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid var(--color-border-subtle, #f3f4f6);
        }

        th {
          font-weight: 700;
          color: var(--color-text-secondary, #4b5563);
          background: var(--color-bone-light, #f9fafb);
        }

        .text-right {
          text-align: right;
        }
      }

      .tag-category {
        font-size: 0.75rem;
        padding: 2px 6px;
        background: #f3f4f6;
        border-radius: 4px;
        color: #4b5563;
      }

      .badge-status-verified {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: #059669;
        font-size: 0.75rem;
        font-weight: 600;
      }

      .badge-status-estimated {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: #d97706;
        font-size: 0.75rem;
        font-weight: 600;
      }

      .wastage-summary-row {
        display: flex;
        gap: 20px;
        padding: 12px 16px;
        background: #fef2f2;
        border: 1px solid #fee2e2;
        border-radius: 6px;
      }

      .wastage-kpi {
        display: flex;
        flex-direction: column;
        gap: 2px;
        .wk-label {
          font-size: 0.75rem;
          color: #991b1b;
          font-weight: 700;
          text-transform: uppercase;
        }
        .wk-val {
          font-size: 1.25rem;
          font-weight: 800;
        }
      }

      .wastage-tables-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        @media (max-width: 800px) {
          grid-template-columns: 1fr;
        }
      }

      .sub-table-wrap {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .sub-heading {
        font-size: 0.875rem;
        font-weight: 700;
        margin: 0;
      }

      .reports-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
        @media (max-width: 900px) {
          grid-template-columns: 1fr;
        }
      }

      .cat-progress-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .cat-bar-item {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .cat-info {
        display: flex;
        justify-content: space-between;
        font-size: 0.8125rem;
      }

      .bar-track {
        height: 8px;
        background: var(--color-bone, #e5e7eb);
        border-radius: var(--radius-full, 9999px);
        overflow: hidden;
      }

      .bar-fill {
        height: 100%;
        border-radius: var(--radius-full, 9999px);
        &.crimson {
          background: #c21807;
        }
        &.dark {
          background: #1f2937;
        }
        &.gold {
          background: #d4af37;
        }
        &.taupe {
          background: #8b7355;
        }
      }

      .payment-modes-list {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .mode-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px;
        background: var(--color-bone-light, #f9fafb);
        border-radius: var(--radius-sm, 6px);
        border: 1px solid var(--color-border-subtle, #f3f4f6);
      }

      .mode-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .mode-icon {
        font-size: 1.5rem;
        color: var(--color-onyx, #1f2937);
      }
      .mode-right {
        text-align: right;
      }
      .pct {
        font-size: 1.125rem;
        font-weight: 800;
        display: block;
      }
      .amt {
        font-size: 0.75rem;
        color: var(--color-text-muted, #6b7280);
      }

      /* Modal Styles */
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }

      .modal-card {
        background: #ffffff;
        border-radius: 8px;
        max-width: 500px;
        width: 100%;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
        overflow: hidden;
      }

      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #e5e7eb;
      }

      .modal-title-wrap {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .badge-icon-crimson {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #fee2e2;
        color: #dc2626;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
      }

      .close-btn {
        background: transparent;
        border: none;
        font-size: 1.25rem;
        color: #6b7280;
        cursor: pointer;
      }

      .modal-body {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .form-row {
        display: flex;
        gap: 12px;
      }

      .flex-1 {
        flex: 1;
      }

      .form-label {
        font-size: 0.8125rem;
        font-weight: 700;
        color: #374151;
      }

      .form-input,
      .form-select,
      .form-textarea {
        padding: 8px 12px;
        font-size: 0.875rem;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        outline: none;
        &:focus {
          border-color: #1f2937;
        }
      }

      .form-textarea {
        resize: vertical;
        min-height: 60px;
      }

      .available-stock-hint {
        font-size: 0.75rem;
        color: #059669;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 14px 20px;
        background: #f9fafb;
        border-top: 1px solid #e5e7eb;
      }

      @media print {
        .header-actions,
        .filter-toolbar,
        .modal-overlay,
        .btn {
          display: none !important;
        }
        .reports-page {
          gap: 10px;
        }
        .panel-box,
        .kpi-card {
          box-shadow: none !important;
          border-color: #ccc !important;
        }
      }
    `,
  ],
})
export class ReportsComponent {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);

  orders = this.mock.orders;
  categories = this.mock.categories;
  menuItems = this.mock.menuItems;

  // Filter Signals
  selectedPreset = signal<DateRangePreset>('this_month');
  customStart = signal<string>('');
  customEnd = signal<string>('');
  orderTypeFilter = signal<'ALL' | 'DINE_IN' | 'TAKEAWAY'>('ALL');

  // Computed Date Range
  dateRange = computed(() => {
    return computeDateRange(this.selectedPreset(), this.customStart(), this.customEnd());
  });

  // Range & Type Filtered Orders
  filteredOrders = computed(() => {
    const dr = this.dateRange();
    const ot = this.orderTypeFilter();
    return this.orders().filter((o) => {
      const inDate = isTimestampInRange(o.createdAt, dr);
      const inType = ot === 'ALL' || o.orderType === ot;
      return inDate && inType;
    });
  });

  // Range Filtered Child Records
  rangeSplitBills = computed(() => {
    const ordIds = new Set(this.filteredOrders().map((o) => o.id));
    return this.mock.splitBills().filter((b) => ordIds.has(b.orderId));
  });

  rangeRefunds = computed(() => {
    const dr = this.dateRange();
    return this.mock.refunds().filter((r) => {
      const ts = getRefundCompletionTimestamp(r) || r.createdAt;
      return isTimestampInRange(ts, dr);
    });
  });

  rangeMovements = computed(() => {
    const dr = this.dateRange();
    return this.mock.stockMovements().filter((m) => isTimestampInRange(m.timestamp, dr));
  });

  // Applicable orders for financial reporting (respecting order type filter)
  applicableOrders = computed(() => {
    const ot = this.orderTypeFilter();
    return ot === 'ALL' ? this.orders() : this.orders().filter((o) => o.orderType === ot);
  });

  // Authoritative Financial Summary
  financialSummary = computed(() => {
    return calculateFinancialSummary(
      this.applicableOrders(),
      this.mock.splitBills(),
      this.mock.refunds(),
      this.dateRange(),
    );
  });

  grossSales = computed(() => this.financialSummary().grossSales);
  totalDiscounts = computed(() => this.financialSummary().totalDiscounts);
  netSales = computed(() => this.financialSummary().netSales);
  collectedRevenue = computed(() => this.financialSummary().collectedRevenue);
  totalRefunds = computed(() => this.financialSummary().totalRefunds);
  completedRefundsCount = computed(() => this.financialSummary().completedRefundsCount);
  netCollections = computed(() => this.financialSummary().netCollections);
  netRevenue = computed(() => this.financialSummary().netRevenue);
  outstandingReceivables = computed(() => this.financialSummary().outstandingReceivables);
  fulfilledOrdersCount = computed(() => this.financialSummary().fulfilledOrdersCount);
  totalTaxCollected = computed(() => this.financialSummary().totalTax);
  paidOrdersCount = computed(() => this.financialSummary().paidOrdersCount);
  averageOrderValue = computed(() => this.financialSummary().averageOrderValue);
  hasEstimatedSettlements = computed(() => this.financialSummary().hasEstimatedSettlements);

  outstandingSplitBalance = computed(() => {
    const unpaidSplits = this.mock.splitBills().filter((b) => b.paymentStatus === 'UNPAID');
    return Math.round(unpaidSplits.reduce((acc, curr) => acc + curr.totalAmount, 0) * 100) / 100;
  });

  // Order Type Breakdown
  orderTypeBreakdown = computed(() => {
    return calculateOrderTypeBreakdown(
      this.orders(),
      this.mock.splitBills(),
      this.mock.refunds(),
      this.dateRange(),
    );
  });

  // Orders eligible for COGS: fulfilled in the active date window (attributed by fulfillment timestamp)
  cogsEligibleOrders = computed(() => {
    const dr = this.dateRange();
    const ot = this.orderTypeFilter();
    const allMovements = this.mock.stockMovements();
    return this.orders().filter((o) => {
      if (o.status !== 'SERVED' && o.status !== 'COMPLETED') return false;
      const inType = ot === 'ALL' || o.orderType === ot;
      if (!inType) return false;
      const fulfillmentTs = getOrderFulfillmentTimestamp(o, allMovements);
      return fulfillmentTs ? isTimestampInRange(fulfillmentTs, dr) : false;
    });
  });

  cogsSplitBills = computed(() => {
    const ordIds = new Set(this.cogsEligibleOrders().map((o) => o.id));
    return this.mock.splitBills().filter((b) => ordIds.has(b.orderId));
  });

  // COGS & Gross Profit Summary (uses authoritative fulfillment date attribution)
  cogsSummary = computed(() => {
    return calculateCogsSummary(
      this.cogsEligibleOrders(),
      this.mock.recipes(),
      this.mock.ingredients(),
      this.cogsSplitBills(),
      this.rangeRefunds(),
      this.mock.stockMovements(),
      this.dateRange(),
    );
  });

  // Wastage Summary
  wastageSummary = computed(() => {
    return calculateWastageSummary(this.rangeMovements(), this.mock.ingredients());
  });

  // Category Breakdown
  categoryBreakdown = computed(() => {
    const validOrders = this.filteredOrders().filter((o) => o.status !== 'CANCELLED');
    const catMap = new Map<string, { name: string; amount: number; quantity: number }>();

    for (const ord of validOrders) {
      for (const item of ord.items) {
        const menuItem = this.menuItems().find((m) => m.id === item.menuItemId);
        let categoryName = 'Other Dishes';
        let categoryId = 'other';

        if (menuItem) {
          const cat = this.categories().find((c) => c.id === menuItem.categoryId);
          if (cat) {
            categoryName = cat.name;
            categoryId = cat.id;
          }
        }

        const existing = catMap.get(categoryId) || { name: categoryName, amount: 0, quantity: 0 };
        existing.amount += item.itemTotal;
        existing.quantity += item.quantity;
        catMap.set(categoryId, existing);
      }
    }

    const totalSales = Array.from(catMap.values()).reduce((sum, c) => sum + c.amount, 0);
    const colorClasses = ['crimson', 'dark', 'gold', 'taupe'];

    return Array.from(catMap.values())
      .map((c, index) => ({
        name: c.name,
        amount: c.amount,
        quantity: c.quantity,
        percentage: totalSales > 0 ? Math.round((c.amount / totalSales) * 100) : 0,
        colorClass: colorClasses[index % colorClasses.length],
      }))
      .sort((a, b) => b.amount - a.amount);
  });

  // Payment Breakdown
  paymentBreakdown = computed(() => {
    const modeMap = new Map<
      string,
      { name: string; subtitle: string; icon: string; amount: number; count: number }
    >();

    for (const ord of this.filteredOrders()) {
      if (ord.isSplit) {
        const paidSplits = this.rangeSplitBills().filter(
          (b) =>
            b.orderId === ord.id && (b.paymentStatus === 'PAID' || b.paymentStatus === 'REFUNDED'),
        );
        for (const split of paidSplits) {
          const method = (split.paymentMethod || 'UPI').toUpperCase();
          const existing = modeMap.get(method) || this.getPaymentModeMeta(method);
          existing.amount += split.totalAmount;
          existing.count += 1;
          modeMap.set(method, existing);
        }
      } else if (ord.paymentStatus === 'PAID' || ord.paymentStatus === 'REFUNDED') {
        const method = (ord.paymentMethod || 'UPI').toUpperCase();
        const existing = modeMap.get(method) || this.getPaymentModeMeta(method);
        existing.amount += ord.totalAmount;
        existing.count += 1;
        modeMap.set(method, existing);
      }
    }

    const totalPaid = Array.from(modeMap.values()).reduce((sum, m) => sum + m.amount, 0);

    return Array.from(modeMap.values())
      .map((m) => ({
        ...m,
        percentage: totalPaid > 0 ? Math.round((m.amount / totalPaid) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  });

  // Wastage Modal State
  showWastageModal = signal<boolean>(false);
  selectedIngredientId = signal<string>('');
  wastageQty = signal<number | null>(null);
  wastageReason = signal<WastageReasonType>('SPOILAGE');
  wastageNotes = signal<string>('');
  wastageStaffName = signal<string>('Kitchen Admin');
  wastageError = signal<string>('');
  isSubmittingWastage = signal<boolean>(false);

  activeIngredients = computed(() => {
    return this.mock.ingredients().filter((i) => i.isActive);
  });

  selectedIngredient = computed(() => {
    const id = this.selectedIngredientId();
    if (!id) return null;
    return this.activeIngredients().find((i) => i.id === id) || null;
  });

  availableStockForSelected = computed(() => {
    const ing = this.selectedIngredient();
    if (!ing) return 0;
    const activeRes = this.mock
      .stockReservations()
      .filter((r) => r.ingredientId === ing.id)
      .reduce((sum, r) => sum + r.quantity, 0);
    return Math.max(0, Math.round((ing.currentStock - activeRes) * 1000) / 1000);
  });

  setPreset(preset: DateRangePreset): void {
    this.selectedPreset.set(preset);
  }

  openWastageModal(): void {
    this.selectedIngredientId.set('');
    this.wastageQty.set(null);
    this.wastageReason.set('SPOILAGE');
    this.wastageNotes.set('');
    this.wastageStaffName.set('Kitchen Admin');
    this.wastageError.set('');
    this.isSubmittingWastage.set(false);
    this.showWastageModal.set(true);
  }

  closeWastageModal(): void {
    this.showWastageModal.set(false);
    this.wastageError.set('');
  }

  onIngredientChange(id: string): void {
    this.selectedIngredientId.set(id);
    this.wastageError.set('');
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.closeWastageModal();
    }
  }

  submitWastage(): void {
    const ing = this.selectedIngredient();
    if (!ing) {
      this.wastageError.set('Please select an ingredient.');
      return;
    }

    const qty = this.wastageQty();
    if (qty === null || isNaN(qty) || qty <= 0) {
      this.wastageError.set('Please specify a positive wastage quantity.');
      return;
    }

    const avail = this.availableStockForSelected();
    if (qty > avail) {
      this.wastageError.set(
        `Insufficient available unreserved stock. Current available is ${avail} ${ing.unit}.`,
      );
      return;
    }

    this.isSubmittingWastage.set(true);
    this.wastageError.set('');

    const note = this.wastageNotes().trim();
    const reasonText = note ? `${this.wastageReason()} - ${note}` : this.wastageReason();

    const res = this.mock.recordWastage({
      ingredientId: ing.id,
      quantity: qty,
      unit: ing.unit,
      reason: reasonText,
      staffName: this.wastageStaffName().trim() || 'Kitchen Admin',
      idempotencyKey: generateIdempotencyKey('wastage'),
    });

    this.isSubmittingWastage.set(false);

    if (!res.success) {
      this.wastageError.set(res.error || 'Failed to record wastage');
      return;
    }

    this.toastService.success(`Wastage logged: ${qty} ${ing.unit} of ${ing.name} deducted.`);
    this.closeWastageModal();
  }

  formatReasonLabel(reason: string): string {
    switch (reason) {
      case 'SPOILAGE':
        return 'Spoilage / Rotting';
      case 'EXPIRY':
        return 'Expired Shelf Life';
      case 'SPILLAGE':
        return 'Kitchen Spillage / Breakage';
      case 'PREPARATION_WASTE':
        return 'Preparation / Trimming Excess';
      case 'QUALITY_REJECTION':
        return 'Quality / Texture Rejection';
      case 'OTHER':
        return 'Other Operational Waste';
      default:
        return reason;
    }
  }

  private getPaymentModeMeta(method: string): {
    name: string;
    subtitle: string;
    icon: string;
    amount: number;
    count: number;
  } {
    let name = 'UPI / QR Scan';
    let subtitle = 'PhonePe, GPay, Paytm, BHIM';
    let icon = 'ph-qr-code';

    if (method === 'CASH') {
      name = 'Cash Settlement';
      subtitle = 'Physical currency tender';
      icon = 'ph-money';
    } else if (method === 'CARD') {
      name = 'Credit / Debit Card';
      subtitle = 'POS terminal swipe/tap';
      icon = 'ph-credit-card';
    }

    return { name, subtitle, icon, amount: 0, count: 0 };
  }

  exportReport(): void {
    const csvContent =
      'data:text/csv;charset=utf-8,Metric,Value\n' +
      `Date Range Window,"${this.dateRange().label}"\n` +
      `Gross Sales,${this.grossSales()}\n` +
      `Promotional Discounts,${this.totalDiscounts()}\n` +
      `Net Sales,${this.netSales()}\n` +
      `Collected Revenue,${this.collectedRevenue()}\n` +
      `Completed Refunds,${this.totalRefunds()}\n` +
      `Net Collections,${this.netCollections()}\n` +
      `Outstanding Receivables,${this.outstandingReceivables()}\n` +
      `Fulfilled Orders Count,${this.fulfilledOrdersCount()}\n` +
      `Settled Orders Count,${this.paidOrdersCount()}\n` +
      `Recipe COGS,${this.cogsSummary().totalCogs}\n` +
      `Gross Profit,${this.cogsSummary().grossProfit}\n` +
      `Gross Margin Pct,${this.cogsSummary().grossMarginPercentage}%\n` +
      `Inventory Wastage Value,${this.wastageSummary().totalWastageValue}\n` +
      `Total Taxes,${this.totalTaxCollected()}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `TheRoyalSpice_Sales_Report_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.toastService.success('Exported Sales & COGS Report to CSV');
  }

  printReport(): void {
    window.print();
  }
}
