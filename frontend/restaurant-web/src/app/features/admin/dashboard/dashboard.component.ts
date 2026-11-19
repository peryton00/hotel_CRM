import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { SkeletonLoaderComponent } from '../../../shared/components/loading/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { calculateFinancialSummary } from '../../../core/utils/financial.utils';
import {
  DateRangeFilter,
  computeDateRange,
  isTimestampInRange,
} from '../../../core/utils/date-range.utils';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    CurrencyInrPipe,
    StatusBadgeComponent,
    SkeletonLoaderComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="dashboard-page">
      <!-- Page Header -->
      <div class="page-header">
        <div class="page-title-block">
          <div class="page-title-row">
            <h1 class="heading-display">Operations Dashboard</h1>
            <span class="live-status-pill">
              <span class="pulse-dot"></span>
              <span>Floor Active</span>
            </span>
          </div>
          <p class="text-muted">
            Overview of sales velocity, active dining tables, and live order status.
          </p>
        </div>

        <div class="header-actions">
          <div class="time-filter">
            <button
              class="filter-btn"
              [class.active]="selectedTimeframe() === 'today'"
              (click)="selectedTimeframe.set('today')"
            >
              Today
            </button>
            <button
              class="filter-btn"
              [class.active]="selectedTimeframe() === 'week'"
              (click)="selectedTimeframe.set('week')"
            >
              This Week
            </button>
            <button
              class="filter-btn"
              [class.active]="selectedTimeframe() === 'all'"
              (click)="selectedTimeframe.set('all')"
            >
              All Time
            </button>
          </div>
          <a routerLink="/admin/orders" class="btn btn-primary btn-queue-action">
            <i class="ph ph-receipt"></i>
            <span>Live Orders Board</span>
            @if (activeOrdersCount() > 0) {
              <span class="queue-counter-badge">{{ activeOrdersCount() }}</span>
            }
          </a>
        </div>
      </div>

      <!-- KPI Metric Cards Grid -->
      <div class="kpi-grid">
        <div class="kpi-card card-revenue">
          <div class="kpi-header">
            <span class="kpi-title">Net Revenue</span>
            <div class="kpi-icon revenue"><i class="ph ph-currency-inr"></i></div>
          </div>
          <div class="kpi-value" [class.text-crimson]="totalRevenue() < 0">
            @if (isOrdersLoading()) {
              <app-skeleton variant="text" width="110px" height="2rem" />
            } @else {
              {{ totalRevenue() | currencyInr }}
            }
          </div>
          <div
            class="kpi-footer"
            [class.text-success]="totalRevenue() >= 0"
            [class.text-crimson]="totalRevenue() < 0"
          >
            @if (isOrdersLoading()) {
              <app-skeleton variant="text" width="85px" height="0.875rem" />
            } @else {
              <i
                class="ph"
                [class.ph-trend-up]="totalRevenue() >= 0"
                [class.ph-trend-down]="totalRevenue() < 0"
              ></i>
              <span>{{ revenueComparisonText() }}</span>
              @if (hasEstimatedSettlements()) {
                <small class="text-muted">(legacy timestamps)</small>
              }
            }
          </div>
        </div>

        <div class="kpi-card card-orders">
          <div class="kpi-header">
            <span class="kpi-title">Total Orders</span>
            <div class="kpi-icon orders"><i class="ph ph-tray"></i></div>
          </div>
          <div class="kpi-value">
            @if (isOrdersLoading()) {
              <app-skeleton variant="text" width="55px" height="2rem" />
            } @else {
              {{ totalOrdersCount() }}
            }
          </div>
          <div class="kpi-footer">
            @if (isOrdersLoading()) {
              <app-skeleton variant="text" width="70px" height="0.875rem" />
            } @else {
              <span class="active-badge">
                <span class="active-ping-dot"></span>
                {{ ordersSubtitleText() }}
              </span>
            }
          </div>
        </div>

        <div class="kpi-card card-aov">
          <div class="kpi-header">
            <span class="kpi-title">Avg Order Value (AOV)</span>
            <div class="kpi-icon aov"><i class="ph ph-receipt"></i></div>
          </div>
          <div class="kpi-value">
            @if (isOrdersLoading()) {
              <app-skeleton variant="text" width="90px" height="2rem" />
            } @else {
              {{ avgOrderValue() | currencyInr }}
            }
          </div>
          <div class="kpi-footer text-muted">
            @if (isOrdersLoading()) {
              <app-skeleton variant="text" width="80px" height="0.875rem" />
            } @else {
              <span>{{ aovSubtitleText() }}</span>
            }
          </div>
        </div>

        <div class="kpi-card card-tables">
          <div class="kpi-header">
            <span class="kpi-title">Active Tables</span>
            <div class="kpi-icon tables"><i class="ph ph-table"></i></div>
          </div>
          <div class="kpi-value">
            @if (isTablesLoading()) {
              <app-skeleton variant="text" width="75px" height="2rem" />
            } @else {
              {{ occupiedTablesCount() }} <span class="kpi-denom">/ {{ totalTablesCount() }}</span>
            }
          </div>
          <div class="kpi-footer">
            @if (isTablesLoading()) {
              <app-skeleton variant="text" width="95px" height="0.875rem" />
            } @else {
              <div class="occupancy-meter">
                <div class="meter-bar">
                  <div class="meter-fill" [style.width.%]="tableOccupancyRate()"></div>
                </div>
                <span class="meter-label">{{ tableOccupancyRate() }}% Occupancy</span>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Live Order Flow Summary & Quick Actions -->
      <div class="dashboard-mid-grid">
        <!-- Sales Volume Bar Chart (Pure Responsive SVG) -->
        @if (isOrdersLoading()) {
          <app-skeleton variant="chart" />
        } @else {
          <div class="dashboard-panel chart-panel">
            <div class="panel-header">
              <div class="panel-title-wrap">
                <h2 class="heading-card">{{ chartTitle() }}</h2>
                <span class="text-muted text-xs">{{ chartSubtitle() }}</span>
              </div>
              <div class="chart-legend-inline">
                @for (leg of chartLegend(); track leg.label) {
                  <span class="legend-item"
                    ><span class="dot" [class]="leg.dotClass"></span> {{ leg.label }}</span
                  >
                }
              </div>
            </div>

            <div class="svg-chart-wrap">
              <svg viewBox="0 0 520 180" class="bar-chart-svg">
                <line x1="40" y1="140" x2="500" y2="140" class="chart-grid-line" stroke-width="1" />
                <line x1="40" y1="80" x2="500" y2="80" class="chart-grid-line dashed" stroke-dasharray="3,3" />
                <line x1="40" y1="20" x2="500" y2="20" stroke="transparent" />

                <text x="32" y="143" font-size="10" class="chart-axis-text" text-anchor="end">0</text>
                <text x="32" y="83" font-size="10" class="chart-axis-text" text-anchor="end">20k</text>
                <text x="32" y="23" font-size="10" class="chart-axis-text" text-anchor="end">40k</text>

                <!-- Bars -->
                <g class="bars-group">
                  @for (bar of chartBars(); track bar.label) {
                    <rect
                      [attr.x]="bar.x"
                      [attr.y]="bar.y"
                      width="28"
                      [attr.height]="bar.height"
                      rx="4"
                      [attr.fill]="bar.color"
                      [attr.opacity]="bar.opacity"
                      class="chart-bar-rect"
                    />
                    <text
                      [attr.x]="bar.x + 14"
                      y="156"
                      font-size="11"
                      class="chart-bar-label"
                      text-anchor="middle"
                    >
                      {{ bar.label }}
                    </text>
                  }
                </g>
              </svg>
            </div>
          </div>
        }

        <!-- Real-Time Orders Queue Snapshot -->
        <div class="dashboard-panel queue-panel">
          <div class="panel-header">
            <div class="panel-header-left">
              <span class="panel-pulse-dot"></span>
              <h2 class="heading-card">Active Orders Dispatch</h2>
            </div>
            <a
              routerLink="/admin/orders"
              class="panel-action-link"
              >View All @if (!isOrdersLoading()) { ({{ orders().length }}) }</a
            >
          </div>

          <div class="queue-list">
            @if (isOrdersLoading()) {
              <app-skeleton variant="table-row" [count]="4" />
            } @else {
              @for (order of recentOrders(); track order.id) {
                <div class="queue-item">
                  <div class="queue-info">
                    <div class="queue-top">
                      <span class="order-num">{{ order.orderNumber }}</span>
                      @if (order.orderType === 'TAKEAWAY') {
                        <span class="tbl-badge takeaway-badge">
                          <i class="ph ph-bag"></i> Takeaway
                        </span>
                      } @else {
                        <span class="tbl-badge">Table {{ order.tableNumber }}</span>
                      }
                      <app-status-badge [status]="order.status"></app-status-badge>
                    </div>
                    <div class="guest-line">
                      <span>{{ order.customerName }}</span>
                      <span class="divider-dot">•</span>
                      <span>{{ order.items.length }} dishes</span>
                      <span class="divider-dot">•</span>
                      <span class="order-price">{{ order.totalAmount | currencyInr }}</span>
                    </div>
                  </div>
                  <a
                    [routerLink]="['/admin/orders', order.id]"
                    class="btn btn-secondary btn-sm queue-open-btn"
                    aria-label="Manage order"
                  >
                    <i class="ph ph-arrow-right"></i>
                  </a>
                </div>
              } @empty {
                <app-empty-state
                  [compact]="true"
                  [bordered]="false"
                  icon="ph-tray"
                  title="No Active Orders"
                  message="Live dining and takeaway orders will appear here automatically."
                />
              }
            }
          </div>
        </div>
      </div>

      <!-- Bottom Grid: Popular Dishes & Table Summary -->
      <div class="dashboard-bottom-grid">
        <div class="dashboard-panel">
          <div class="panel-header">
            <h2 class="heading-card">Top Selling Dishes</h2>
            <a
              routerLink="/admin/menu"
              class="panel-action-link"
              >Manage Menu</a
            >
          </div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Dish Name</th>
                  <th>Category</th>
                  <th class="text-right">Orders Count</th>
                  <th class="text-right">Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                @if (isOrdersLoading() || isMenuLoading()) {
                  <tr>
                    <td colspan="4" class="p-0">
                      <app-skeleton variant="table-row" [count]="4" />
                    </td>
                  </tr>
                } @else {
                  @for (item of popularItems(); track item.name; let idx = $index) {
                    <tr>
                      <td>
                        <div class="dish-name-cell">
                          <span class="dish-rank-badge" [class.rank-gold]="idx === 0" [class.rank-silver]="idx === 1" [class.rank-bronze]="idx === 2">{{ idx + 1 }}</span>
                          <strong>{{ item.name }}</strong>
                        </div>
                      </td>
                      <td>
                        <span class="badge badge-outline">{{ item.category }}</span>
                      </td>
                      <td class="text-right font-mono">{{ item.ordersCount }} orders</td>
                      <td class="text-right">
                        <span class="text-price font-mono font-bold">{{ item.revenue | currencyInr }}</span>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="4" class="p-0">
                        <app-empty-state
                          [compact]="true"
                          [bordered]="false"
                          icon="ph-cooking-pot"
                          title="No Dish Sales Recorded"
                          message="Dishes will rank here as dining orders are completed."
                        />
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="dashboard-panel tables-summary-panel">
          <div class="panel-header">
            <h2 class="heading-card">Table Status</h2>
            <a
              routerLink="/admin/tables"
              class="panel-action-link"
              title="Open Floor Map"
              ><span>Manage Tables</span> <i class="ph ph-arrow-up-right"></i
            ></a>
          </div>

          <div class="floor-capacity-meter">
            <div class="meter-meta">
              <span class="meter-title">Floor Utilization</span>
              <span class="meter-stat">
                <strong>{{ occupiedTablesCount() }}</strong> / {{ totalTablesCount() }} Seated ({{ tableOccupancyRate() }}%)
              </span>
            </div>
            <div class="capacity-bar-track">
              <div class="capacity-seg seg-occupied" [style.width.%]="tableOccupiedPercent()" [title]="'Occupied: ' + occupiedTablesCount()"></div>
              <div class="capacity-seg seg-reserved" [style.width.%]="tableReservedPercent()" [title]="'Reserved: ' + reservedTablesCount()"></div>
              <div class="capacity-seg seg-dirty" [style.width.%]="tableDirtyPercent()" [title]="'Cleaning: ' + dirtyTablesCount()"></div>
              <div class="capacity-seg seg-available" [style.width.%]="tableAvailablePercent()" [title]="'Available: ' + availableTablesCount()"></div>
            </div>
          </div>

          <div class="tables-status-grid">
            <div class="status-box available">
              <i class="ph ph-chair status-icon"></i>
              <span class="status-num">
                @if (isTablesLoading()) {
                  <app-skeleton variant="text" width="28px" height="1.5rem" />
                } @else {
                  {{ availableTablesCount() }}
                }
              </span>
              <span class="status-label">Available</span>
            </div>

            <div class="status-box occupied">
              <i class="ph ph-users status-icon"></i>
              <span class="status-num">
                @if (isTablesLoading()) {
                  <app-skeleton variant="text" width="28px" height="1.5rem" />
                } @else {
                  {{ occupiedTablesCount() }}
                }
              </span>
              <span class="status-label">Occupied</span>
            </div>

            <div class="status-box reserved">
              <i class="ph ph-calendar-check status-icon"></i>
              <span class="status-num">
                @if (isTablesLoading()) {
                  <app-skeleton variant="text" width="28px" height="1.5rem" />
                } @else {
                  {{ reservedTablesCount() }}
                }
              </span>
              <span class="status-label">Reserved</span>
            </div>

            <div class="status-box dirty">
              <i class="ph ph-broom status-icon"></i>
              <span class="status-num">
                @if (isTablesLoading()) {
                  <app-skeleton variant="text" width="28px" height="1.5rem" />
                } @else {
                  {{ dirtyTablesCount() }}
                }
              </span>
              <span class="status-label">Cleaning</span>
            </div>
          </div>

          <div class="quick-links-box">
            <div class="quick-actions-row">
              <a routerLink="/admin/tables" class="action-btn">
                <i class="ph ph-qr-code"></i>
                <span>Table QR</span>
              </a>
              <a routerLink="/admin/billing" class="action-btn">
                <i class="ph ph-receipt"></i>
                <span>POS Invoice</span>
              </a>
              <a routerLink="/admin/coupons" class="action-btn">
                <i class="ph ph-tag"></i>
                <span>Coupons</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .dashboard-page {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        flex-wrap: wrap;
        gap: 16px;
      }

      .page-title-block {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .page-title-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .live-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 10px;
        border-radius: var(--radius-full);
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.3);
        color: #16a34a;

        .pulse-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 6px #22c55e;
          animation: pulseGlow 1.8s infinite;
        }
      }

      .theme-dark .live-status-pill,
      [data-theme='dark'] .live-status-pill {
        background: rgba(34, 197, 94, 0.15);
        border-color: rgba(34, 197, 94, 0.4);
        color: #4ade80;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .time-filter {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 3px;
      }

      .filter-btn {
        padding: 6px 14px;
        border-radius: 6px;
        font-size: 0.78rem;
        font-weight: 600;
        border: none;
        background: transparent;
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all var(--transition-fast);

        &:hover {
          color: var(--color-text);
          background: rgba(0, 0, 0, 0.04);
        }

        &.active {
          background: var(--color-onyx);
          color: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        }
      }

      .theme-dark .filter-btn,
      [data-theme='dark'] .filter-btn {
        &:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        &.active {
          background: rgba(255, 255, 255, 0.15);
          color: #ffffff;
        }
      }

      .btn-queue-action {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border-radius: 8px;
        font-weight: 600;

        .queue-counter-badge {
          background: #ffffff;
          color: var(--color-crimson, #c21807);
          font-size: 0.7rem;
          font-weight: 800;
          padding: 1px 6px;
          border-radius: 9999px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }
      }

      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 18px;

        @media (max-width: 1100px) {
          grid-template-columns: repeat(2, 1fr);
        }

        @media (max-width: 600px) {
          grid-template-columns: 1fr;
        }
      }

      .kpi-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        padding: 18px 20px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        display: flex;
        flex-direction: column;
        gap: 8px;
        transition: all var(--transition-fast);

        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.07);
          border-color: rgba(212, 175, 55, 0.4);
        }
      }

      .kpi-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .kpi-title {
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .kpi-icon {
        width: 34px;
        height: 34px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.15rem;

        &.revenue {
          background: rgba(245, 158, 11, 0.12);
          color: #d97706;
        }
        &.orders {
          background: rgba(59, 130, 246, 0.12);
          color: #2563eb;
        }
        &.aov {
          background: rgba(16, 185, 129, 0.12);
          color: #059669;
        }
        &.tables {
          background: rgba(139, 92, 246, 0.12);
          color: #7c3aed;
        }
      }

      .kpi-value {
        font-size: 1.85rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--color-text);
        line-height: 1.15;
        font-family: var(--font-display, inherit);
      }

      .kpi-denom {
        font-size: 1.1rem;
        font-weight: 500;
        color: var(--color-text-muted);
      }

      .kpi-footer {
        font-size: 0.75rem;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .text-success {
        color: #16a34a;
      }

      .active-badge {
        font-weight: 600;
        color: #2563eb;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }

      .active-ping-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #3b82f6;
        animation: pulseGlow 1.5s infinite;
      }

      .occupancy-meter {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
      }

      .meter-bar {
        flex: 1;
        height: 6px;
        background: rgba(0, 0, 0, 0.06);
        border-radius: 9999px;
        overflow: hidden;
      }

      .theme-dark .meter-bar,
      [data-theme='dark'] .meter-bar {
        background: rgba(255, 255, 255, 0.1);
      }

      .meter-fill {
        height: 100%;
        background: linear-gradient(90deg, #f59e0b, #d97706);
        border-radius: 9999px;
        transition: width 0.3s ease;
      }

      .meter-label {
        font-size: 0.72rem;
        font-weight: 700;
        color: #d97706;
      }

      .theme-dark .meter-label,
      [data-theme='dark'] .meter-label {
        color: #fbbf24;
      }

      .dashboard-mid-grid,
      .dashboard-bottom-grid {
        display: grid;
        grid-template-columns: 3fr 2fr;
        gap: 20px;

        @media (max-width: 1024px) {
          grid-template-columns: 1fr;
        }
      }

      .dashboard-panel {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .panel-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .panel-pulse-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #22c55e;
        animation: pulseGlow 1.8s infinite;
      }

      .panel-action-link {
        font-size: 0.8125rem;
        font-weight: 600;
        color: #d97706;
        text-decoration: none;
        transition: color var(--transition-fast);

        &:hover {
          color: #b45309;
          text-decoration: underline;
        }
      }

      .theme-dark .panel-action-link,
      [data-theme='dark'] .panel-action-link {
        color: #fbbf24;
        &:hover {
          color: #fde68a;
        }
      }

      .chart-legend-inline {
        display: flex;
        align-items: center;
        gap: 16px;
        font-size: 0.75rem;
        color: var(--color-text-secondary);
      }

      .svg-chart-wrap {
        width: 100%;
        height: 180px;
      }

      .bar-chart-svg {
        width: 100%;
        height: 100%;
        overflow: visible;
      }

      .chart-grid-line {
        stroke: #e2e8f0;

        &.dashed {
          stroke: #f1f5f9;
        }
      }

      .chart-axis-text {
        fill: #94a3b8;
      }

      .chart-bar-label {
        fill: var(--color-text-secondary);
        font-weight: 600;
      }

      .theme-dark .chart-grid-line,
      [data-theme='dark'] .chart-grid-line {
        stroke: rgba(255, 255, 255, 0.08);

        &.dashed {
          stroke: rgba(255, 255, 255, 0.04);
        }
      }

      .theme-dark .chart-axis-text,
      [data-theme='dark'] .chart-axis-text {
        fill: #64748b;
      }

      .theme-dark .chart-bar-label,
      [data-theme='dark'] .chart-bar-label {
        fill: #94a3b8;
      }

      .legend-item {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        &.crimson {
          background: #c21807;
        }
        &.gold {
          background: #d4af37;
        }
        &.dark {
          background: #94a3b8;
        }
      }

      .queue-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .queue-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: rgba(0, 0, 0, 0.02);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        gap: 12px;
        transition: all var(--transition-fast);

        &:hover {
          background: rgba(0, 0, 0, 0.04);
          border-color: rgba(212, 175, 55, 0.4);
        }
      }

      .theme-dark .queue-item,
      [data-theme='dark'] .queue-item {
        background: rgba(255, 255, 255, 0.03);

        &:hover {
          background: rgba(255, 255, 255, 0.06);
        }
      }

      .queue-info {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .queue-top {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .order-num {
        font-weight: 700;
        font-size: 0.85rem;
        color: var(--color-text);
      }

      .tbl-badge {
        font-size: 0.72rem;
        font-weight: 600;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        padding: 1px 7px;
        border-radius: 4px;

        &.takeaway-badge {
          background: rgba(245, 158, 11, 0.1);
          border-color: rgba(245, 158, 11, 0.3);
          color: #d97706;
        }
      }

      .guest-line {
        font-size: 0.78rem;
        color: var(--color-text-secondary);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .divider-dot {
        opacity: 0.4;
      }

      .order-price {
        font-weight: 700;
        color: var(--color-text);
      }

      .queue-open-btn {
        width: 32px;
        height: 32px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
      }

      .dish-name-cell {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .dish-rank-badge {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        font-size: 0.68rem;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.05);
        color: var(--color-text-muted);

        &.rank-gold {
          background: rgba(245, 158, 11, 0.2);
          color: #d97706;
        }
        &.rank-silver {
          background: rgba(148, 163, 184, 0.2);
          color: #475569;
        }
        &.rank-bronze {
          background: rgba(180, 83, 9, 0.15);
          color: #92400e;
        }
      }

      .tables-summary-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .floor-capacity-meter {
        padding: 2px 0;
      }

      .meter-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.78rem;
        margin-bottom: 6px;
      }

      .meter-title {
        font-weight: 600;
        color: #64748b;
      }

      .meter-stat {
        font-size: 0.78rem;
        color: #334155;

        strong {
          font-weight: 700;
          color: #d97706;
        }
      }

      .capacity-bar-track {
        height: 7px;
        border-radius: 999px;
        background: #e2e8f0;
        display: flex;
        overflow: hidden;
        gap: 2px;
      }

      .capacity-seg {
        height: 100%;
        transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);

        &.seg-occupied {
          background: #f59e0b;
        }
        &.seg-reserved {
          background: #6366f1;
        }
        &.seg-dirty {
          background: #ef4444;
        }
        &.seg-available {
          background: #10b981;
        }
      }

      .tables-status-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        margin-top: 2px;

        @media (max-width: 600px) {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      .status-box {
        padding: 10px 4px;
        border-radius: 10px;
        text-align: center;
        border: 1px solid;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

        &:hover {
          transform: translateY(-1px);
        }

        .status-icon {
          font-size: 1.15rem;
          line-height: 1;
        }

        .status-num {
          display: block;
          font-size: 1.35rem;
          font-weight: 800;
          line-height: 1.1;
          font-family: monospace;
        }

        .status-label {
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        &.available {
          background: #ecfdf5;
          border-color: #a7f3d0;
          color: #047857;
        }
        &.occupied {
          background: #fffbeb;
          border-color: #fde68a;
          color: #b45309;
        }
        &.reserved {
          background: #eef2ff;
          border-color: #c7d2fe;
          color: #4338ca;
        }
        &.dirty {
          background: #fef2f2;
          border-color: #fecaca;
          color: #b91c1c;
        }
      }

      .quick-links-box {
        margin-top: 4px;
        padding-top: 10px;
        border-top: 1px solid var(--color-border);
      }

      .quick-actions-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        width: 100%;
      }

      .action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 6px;
        border-radius: 8px;
        text-decoration: none;
        font-size: 0.75rem;
        font-weight: 600;
        text-align: center;
        white-space: nowrap;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        color: #1e293b;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

        i {
          font-size: 0.95rem;
          color: #d97706;
          flex-shrink: 0;
        }

        &:hover {
          border-color: #d97706;
          background: #ffffff;
          color: #d97706;
          transform: translateY(-1px);
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.05);
        }
      }

      .theme-dark,
      [data-theme='dark'] {
        .meter-title {
          color: #94a3b8;
        }

        .meter-stat {
          color: #f1f5f9;

          strong {
            color: #fbbf24;
          }
        }

        .capacity-bar-track {
          background: rgba(255, 255, 255, 0.12);
        }

        .status-box {
          &.available {
            background: rgba(16, 185, 129, 0.14);
            border-color: rgba(52, 211, 153, 0.35);
            color: #34d399;
          }
          &.occupied {
            background: rgba(245, 158, 11, 0.14);
            border-color: rgba(251, 191, 36, 0.35);
            color: #fbbf24;
          }
          &.reserved {
            background: rgba(99, 102, 241, 0.14);
            border-color: rgba(165, 180, 252, 0.35);
            color: #a5b4fc;
          }
          &.dirty {
            background: rgba(239, 68, 68, 0.14);
            border-color: rgba(248, 113, 113, 0.35);
            color: #f87171;
          }
        }

        .action-btn {
          background: #1a1e27;
          border-color: rgba(255, 255, 255, 0.14);
          color: #f1f5f9;

          i {
            color: #fbbf24;
          }

          &:hover {
            border-color: #fbbf24;
            background: #232834;
            color: #fbbf24;
            box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
          }
        }
      }
    `,
  ],
})
export class AdminDashboardComponent {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;

  readonly isOrdersLoading = computed(
    () => this.dataService.isOrdersLoading() || !this.dataService.ordersLoaded()
  );
  readonly isTablesLoading = computed(
    () => this.dataService.isTablesLoading() || !this.dataService.tablesLoaded()
  );
  readonly isMenuLoading = computed(
    () => this.dataService.isMenuLoading() || !this.dataService.menuLoaded()
  );
  readonly isLoading = computed(() => this.isOrdersLoading() || this.isTablesLoading());

  selectedTimeframe = signal<'today' | 'week' | 'all'>('today');

  orders = this.mock.orders;
  tables = this.mock.tables;

  dashboardDateRange = computed<DateRangeFilter>(() => {
    const tf = this.selectedTimeframe();
    if (tf === 'today') return computeDateRange('today');
    if (tf === 'week') return computeDateRange('last_7_days');
    return computeDateRange('all');
  });

  timeframeOrders = computed(() => {
    const dr = this.dashboardDateRange();
    return this.orders().filter((o) => isTimestampInRange(o.createdAt, dr));
  });

  financialSummary = computed(() => {
    return calculateFinancialSummary(
      this.orders(),
      this.mock.splitBills(),
      this.mock.refunds(),
      this.dashboardDateRange(),
    );
  });

  netRevenue = computed(() => this.financialSummary().netRevenue);
  netCollections = computed(() => this.financialSummary().netCollections);
  collectedRevenue = computed(() => this.financialSummary().collectedRevenue);
  grossSales = computed(() => this.financialSummary().grossSales);
  netSales = computed(() => this.financialSummary().netSales);
  totalRefunds = computed(() => this.financialSummary().totalRefunds);
  totalRevenue = computed(() => this.financialSummary().netRevenue);
  outstandingReceivables = computed(() => this.financialSummary().outstandingReceivables);
  fulfilledOrdersCount = computed(() => this.financialSummary().fulfilledOrdersCount);
  hasEstimatedSettlements = computed(() => this.financialSummary().hasEstimatedSettlements);

  totalOrdersCount = computed(() => this.timeframeOrders().length);

  activeOrdersCount = computed(() => {
    return this.timeframeOrders().filter((o) =>
      ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status),
    ).length;
  });

  avgOrderValue = computed(() => {
    return this.financialSummary().averageOrderValue;
  });

  totalTablesCount = computed(() => this.tables().length);

  occupiedTablesCount = computed(() => {
    return this.tables().filter((t) => t.status === 'OCCUPIED').length;
  });

  availableTablesCount = computed(() => {
    return this.tables().filter((t) => t.status === 'AVAILABLE').length;
  });

  reservedTablesCount = computed(() => {
    return this.tables().filter((t) => t.status === 'RESERVED').length;
  });

  dirtyTablesCount = computed(() => {
    return this.tables().filter((t) => t.status === 'DIRTY').length;
  });

  tableOccupancyRate = computed(() => {
    const total = this.totalTablesCount();
    return total > 0 ? Math.round((this.occupiedTablesCount() / total) * 100) : 0;
  });

  tableOccupiedPercent = computed(() => {
    const total = this.totalTablesCount();
    return total > 0 ? (this.occupiedTablesCount() / total) * 100 : 0;
  });

  tableReservedPercent = computed(() => {
    const total = this.totalTablesCount();
    return total > 0 ? (this.reservedTablesCount() / total) * 100 : 0;
  });

  tableDirtyPercent = computed(() => {
    const total = this.totalTablesCount();
    return total > 0 ? (this.dirtyTablesCount() / total) * 100 : 0;
  });

  tableAvailablePercent = computed(() => {
    const total = this.totalTablesCount();
    return total > 0 ? (this.availableTablesCount() / total) * 100 : 0;
  });

  recentOrders = computed(() => {
    const active = this.orders().filter((o) =>
      ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DISPATCHED'].includes(o.status),
    );
    return active.length > 0 ? active.slice(0, 5) : this.timeframeOrders().slice(0, 4);
  });

  revenueComparisonText = computed(() => {
    const tf = this.selectedTimeframe();
    const count = this.fulfilledOrdersCount();
    if (tf === 'today') return `${count} order${count === 1 ? '' : 's'} fulfilled today`;
    if (tf === 'week') return `${count} order${count === 1 ? '' : 's'} fulfilled this week`;
    return `${count} order${count === 1 ? '' : 's'} fulfilled all-time`;
  });

  ordersSubtitleText = computed(() => {
    const tf = this.selectedTimeframe();
    const active = this.activeOrdersCount();
    if (tf === 'today') return `${active} Active in kitchen today`;
    if (tf === 'week') return `${active} Active • This week`;
    return `${active} Active • All time`;
  });

  aovSubtitleText = computed(() => {
    const tf = this.selectedTimeframe();
    if (tf === 'today') return 'Average spend per order today';
    if (tf === 'week') return 'Average spend per order this week';
    return 'Lifetime average spend per order';
  });

  chartTitle = computed(() => {
    const tf = this.selectedTimeframe();
    if (tf === 'today') return 'Hourly Sales Volume (₹)';
    if (tf === 'week') return 'Daily Sales Volume (₹)';
    return 'Monthly Sales Volume (₹)';
  });

  chartSubtitle = computed(() => {
    const tf = this.selectedTimeframe();
    if (tf === 'today') return 'Real-time sales distribution across service hours';
    if (tf === 'week') return 'Sales distribution Monday through Sunday';
    return 'Sales distribution across calendar months';
  });

  chartBars = computed(() => {
    const tf = this.selectedTimeframe();
    const orders = this.timeframeOrders().filter((o) => o.status !== 'CANCELLED');

    if (tf === 'today') {
      const slots = [
        { label: '11 AM', hour: 11 },
        { label: '01 PM', hour: 13 },
        { label: '03 PM', hour: 15 },
        { label: '05 PM', hour: 17 },
        { label: '07 PM', hour: 19 },
        { label: '08 PM', hour: 20 },
        { label: '09 PM', hour: 21 },
        { label: '10 PM', hour: 22 },
      ];
      const revenues = slots.map((s) => {
        const sum = orders
          .filter((o) => {
            const h = new Date(o.createdAt).getHours();
            return Math.abs(h - s.hour) <= 1;
          })
          .reduce((acc, o) => acc + (o.totalAmount || 0), 0);
        return { label: s.label, amount: sum };
      });
      const maxAmount = Math.max(...revenues.map((r) => r.amount), 5000);
      return revenues.map((r, i) => {
        const h = r.amount > 0 ? Math.max(8, Math.round((r.amount / maxAmount) * 115)) : 4;
        return {
          label: r.label,
          amount: r.amount,
          x: 55 + i * 55,
          y: 140 - h,
          height: h,
          color: r.amount > 0 ? (r.amount === maxAmount ? '#D4AF37' : '#C21807') : '#E5DED4',
          opacity: r.amount > 0 ? 1 : 0.6,
        };
      });
    }

    if (tf === 'week') {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dayIndices = [1, 2, 3, 4, 5, 6, 0];
      const revenues = dayIndices.map((dIdx, idx) => {
        const sum = orders
          .filter((o) => new Date(o.createdAt).getDay() === dIdx)
          .reduce((acc, o) => acc + (o.totalAmount || 0), 0);
        return { label: days[idx], amount: sum };
      });
      const maxAmount = Math.max(...revenues.map((r) => r.amount), 10000);
      return revenues.map((r, i) => {
        const h = r.amount > 0 ? Math.max(8, Math.round((r.amount / maxAmount) * 115)) : 4;
        return {
          label: r.label,
          amount: r.amount,
          x: 55 + i * 60,
          y: 140 - h,
          height: h,
          color: r.amount > 0 ? (r.amount === maxAmount ? '#D4AF37' : '#C21807') : '#E5DED4',
          opacity: r.amount > 0 ? 1 : 0.6,
        };
      });
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const monthsToShow: number[] = [];
    for (let offset = 6; offset >= 0; offset--) {
      monthsToShow.push((currentMonth - offset + 12) % 12);
    }
    const revenues = monthsToShow.map((mIdx) => {
      const sum = orders
        .filter((o) => new Date(o.createdAt).getMonth() === mIdx)
        .reduce((acc, o) => acc + (o.totalAmount || 0), 0);
      return { label: monthNames[mIdx], amount: sum };
    });
    const maxAmount = Math.max(...revenues.map((r) => r.amount), 10000);
    return revenues.map((r, i) => {
      const h = r.amount > 0 ? Math.max(8, Math.round((r.amount / maxAmount) * 115)) : 4;
      return {
        label: r.label,
        amount: r.amount,
        x: 55 + i * 60,
        y: 140 - h,
        height: h,
        color: r.amount > 0 ? (r.amount === maxAmount ? '#D4AF37' : '#C21807') : '#E5DED4',
        opacity: r.amount > 0 ? 1 : 0.6,
      };
    });
  });

  chartLegend = computed(() => {
    const bars = this.chartBars();
    const peak = bars.find((b) => b.color === '#D4AF37' && (b as any).amount > 0);
    const hasData = bars.some((b) => (b as any).amount > 0);
    if (!hasData) {
      return [{ dotClass: 'dark', label: 'No sales recorded in this period' }];
    }
    return [
      { dotClass: 'crimson', label: 'Recorded Revenue' },
      { dotClass: 'gold', label: peak ? `Peak Period (${peak.label})` : 'Peak Sales' },
    ];
  });

  popularItems = computed(() => {
    const orders = this.timeframeOrders();
    const map = new Map<string, { name: string; category: string; ordersCount: number; revenue: number }>();
    const menu = this.mock.menuItems();

    for (const ord of orders) {
      if (ord.status === 'CANCELLED') continue;
      for (const it of ord.items) {
        const itemKey = it.name;
        const entry = map.get(itemKey) || {
          name: it.name,
          category: 'Dishes',
          ordersCount: 0,
          revenue: 0,
        };
        entry.ordersCount += it.quantity;
        entry.revenue += it.itemTotal;
        map.set(itemKey, entry);
      }
    }

    for (const val of map.values()) {
      const match = menu.find((m) => m.name.toLowerCase() === val.name.toLowerCase());
      if (match && (match as any).categoryName) {
        val.category = (match as any).categoryName;
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  });
}
