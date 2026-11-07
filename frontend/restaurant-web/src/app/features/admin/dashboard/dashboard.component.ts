import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { calculateFinancialSummary } from '../../../core/utils/financial.utils';
import {
  DateRangeFilter,
  computeDateRange,
  isTimestampInRange,
} from '../../../core/utils/date-range.utils';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, CurrencyInrPipe, StatusBadgeComponent],
  template: `
    <div class="dashboard-page">
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1 class="heading-display">Operations Dashboard</h1>
          <p class="text-muted">
            Overview of sales, active tables, and live order status.
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
          <a routerLink="/admin/orders" class="btn btn-primary">
            <i class="ph ph-receipt"></i>
            <span>Live Orders Board</span>
          </a>
        </div>
      </div>

      <!-- KPI Metric Cards Grid -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Net Revenue</span>
            <div class="kpi-icon revenue"><i class="ph ph-currency-inr"></i></div>
          </div>
          <div class="kpi-value" [class.text-crimson]="totalRevenue() < 0">
            {{ totalRevenue() | currencyInr }}
          </div>
          <div
            class="kpi-footer"
            [class.text-success]="totalRevenue() >= 0"
            [class.text-crimson]="totalRevenue() < 0"
          >
            <i
              class="ph"
              [class.ph-trend-up]="totalRevenue() >= 0"
              [class.ph-trend-down]="totalRevenue() < 0"
            ></i>
            <span>{{ revenueComparisonText() }}</span>
            @if (hasEstimatedSettlements()) {
              <small class="text-muted">(legacy timestamps)</small>
            }
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Total Orders</span>
            <div class="kpi-icon orders"><i class="ph ph-tray"></i></div>
          </div>
          <div class="kpi-value">{{ totalOrdersCount() }}</div>
          <div class="kpi-footer">
            <span class="active-badge">{{ ordersSubtitleText() }}</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Avg Order Value (AOV)</span>
            <div class="kpi-icon aov"><i class="ph ph-receipt"></i></div>
          </div>
          <div class="kpi-value">{{ avgOrderValue() | currencyInr }}</div>
          <div class="kpi-footer text-muted">
            <span>{{ aovSubtitleText() }}</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Active Tables</span>
            <div class="kpi-icon tables"><i class="ph ph-table"></i></div>
          </div>
          <div class="kpi-value">{{ occupiedTablesCount() }} / {{ totalTablesCount() }}</div>
          <div class="kpi-footer">
            <span class="badge badge-gold">{{ tableOccupancyRate() }}% Occupancy</span>
          </div>
        </div>
      </div>

      <!-- Live Order Flow Summary & Quick Actions -->
      <div class="dashboard-mid-grid">
        <!-- Sales Volume Bar Chart (Pure Responsive SVG) -->
        <div class="dashboard-panel chart-panel">
          <div class="panel-header">
            <div class="panel-title-wrap">
              <h2 class="heading-card">{{ chartTitle() }}</h2>
              <span class="text-muted text-xs">{{ chartSubtitle() }}</span>
            </div>
          </div>

          <div class="svg-chart-wrap">
            <svg viewBox="0 0 520 180" class="bar-chart-svg">
              <line x1="40" y1="140" x2="500" y2="140" stroke="#E5DED4" stroke-width="1" />
              <line x1="40" y1="80" x2="500" y2="80" stroke="#F0EAE1" stroke-dasharray="3,3" />
              <line x1="40" y1="20" x2="500" y2="20" stroke="#F0EAE1" stroke-dasharray="3,3" />

              <text x="32" y="143" font-size="10" fill="#A39181" text-anchor="end">0</text>
              <text x="32" y="83" font-size="10" fill="#A39181" text-anchor="end">20k</text>
              <text x="32" y="23" font-size="10" fill="#A39181" text-anchor="end">40k</text>

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
                  />
                  <text
                    [attr.x]="bar.x + 14"
                    y="156"
                    font-size="11"
                    fill="#4a453e"
                    text-anchor="middle"
                  >
                    {{ bar.label }}
                  </text>
                }
              </g>
            </svg>
          </div>
          <div class="chart-legend">
            @for (leg of chartLegend(); track leg.label) {
              <span class="legend-item"
                ><span class="dot" [class]="leg.dotClass"></span> {{ leg.label }}</span
              >
            }
          </div>
        </div>

        <!-- Real-Time Orders Queue Snapshot -->
        <div class="dashboard-panel queue-panel">
          <div class="panel-header">
            <h2 class="heading-card">Active Orders Dispatch</h2>
            <a
              routerLink="/admin/orders"
              class="text-sm text-crimson font-ui"
              style="font-weight: 600;"
              >View All ({{ orders().length }})</a
            >
          </div>

          <div class="queue-list">
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
                  class="btn btn-secondary btn-sm"
                  aria-label="Manage order"
                >
                  <i class="ph ph-arrow-right"></i>
                </a>
              </div>
            } @empty {
              <div class="empty-state">No orders in current filter.</div>
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
              class="text-sm text-crimson font-ui"
              style="font-weight: 600;"
              >Manage Menu</a
            >
          </div>

          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Dish Name</th>
                  <th>Category</th>
                  <th>Orders Count</th>
                  <th>Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                @for (item of popularItems(); track item.name) {
                  <tr>
                    <td>
                      <strong>{{ item.name }}</strong>
                    </td>
                    <td>
                      <span class="badge badge-outline">{{ item.category }}</span>
                    </td>
                    <td>{{ item.ordersCount }} orders</td>
                    <td>
                      <span class="text-price">{{ item.revenue | currencyInr }}</span>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="4" class="text-center py-4 text-muted" style="text-align: center; padding: 20px;">
                      No dish sales recorded in this timeframe.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="dashboard-panel tables-summary-panel">
          <div class="panel-header">
            <h2 class="heading-card">Table Status Distribution</h2>
            <a
              routerLink="/admin/tables"
              class="text-sm text-crimson font-ui"
              style="font-weight: 600;"
              >View Tables</a
            >
          </div>

          <div class="tables-status-grid">
            <div class="status-box available">
              <span class="status-num">{{ availableTablesCount() }}</span>
              <span class="status-label">Available</span>
            </div>
            <div class="status-box occupied">
              <span class="status-num">{{ occupiedTablesCount() }}</span>
              <span class="status-label">Occupied</span>
            </div>
            <div class="status-box reserved">
              <span class="status-num">{{ reservedTablesCount() }}</span>
              <span class="status-label">Reserved</span>
            </div>
            <div class="status-box dirty">
              <span class="status-num">{{ dirtyTablesCount() }}</span>
              <span class="status-label">Cleaning</span>
            </div>
          </div>

          <div class="quick-links-box">
            <div class="quick-title">Quick Operational Actions:</div>
            <div class="quick-actions-row">
              <a routerLink="/admin/tables" class="btn btn-secondary btn-sm"
                ><i class="ph ph-qr-code"></i> Print Table QR</a
              >
              <a routerLink="/admin/billing" class="btn btn-secondary btn-sm"
                ><i class="ph ph-receipt"></i> Generate Invoice</a
              >
              <a routerLink="/admin/coupons" class="btn btn-secondary btn-sm"
                ><i class="ph ph-tag"></i> Create Promo</a
              >
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

      .header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .time-filter {
        display: flex;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        overflow: hidden;
      }

      .filter-btn {
        padding: 8px 14px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        transition: all var(--transition-fast);

        &.active {
          background: var(--color-onyx);
          color: #ffffff;
        }
      }

      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 20px;

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
        border-radius: var(--radius-md);
        padding: 20px;
        box-shadow: var(--shadow-xs);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .kpi-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .kpi-title {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .kpi-icon {
        width: 36px;
        height: 36px;
        border-radius: var(--radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;

        &.revenue {
          background: var(--color-crimson-subtle);
          color: var(--color-crimson);
        }
        &.orders {
          background: var(--color-info-bg);
          color: var(--color-info);
        }
        &.aov {
          background: var(--color-gold-subtle);
          color: #855300;
        }
        &.tables {
          background: var(--color-success-bg);
          color: var(--color-success);
        }
      }

      .kpi-value {
        font-size: 1.875rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--color-text-primary);
      }

      .kpi-footer {
        font-size: 0.75rem;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .text-success {
        color: var(--color-success);
      }
      .active-badge {
        font-weight: 600;
        color: var(--color-info);
      }

      .dashboard-mid-grid,
      .dashboard-bottom-grid {
        display: grid;
        grid-template-columns: 3fr 2fr;
        gap: 24px;

        @media (max-width: 1024px) {
          grid-template-columns: 1fr;
        }
      }

      .dashboard-panel {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 22px;
        box-shadow: var(--shadow-xs);
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
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

      .chart-legend {
        display: flex;
        align-items: center;
        gap: 20px;
        padding-top: 10px;
        border-top: 1px solid var(--color-border-subtle);
        font-size: 0.75rem;
        color: var(--color-text-secondary);
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
          background: #121212;
        }
      }

      .queue-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .queue-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-sm);
        gap: 12px;
      }

      .queue-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .queue-top {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .order-num {
        font-weight: 700;
        font-size: 0.875rem;
      }

      .tbl-badge {
        font-size: 0.75rem;
        font-weight: 600;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        padding: 2px 8px;
        border-radius: var(--radius-xs);

        &.takeaway-badge {
          background: var(--color-warning-bg);
          border-color: rgba(212, 175, 55, 0.4);
          color: var(--color-warning);
        }
      }

      .guest-line {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .divider-dot {
        opacity: 0.5;
      }
      .order-price {
        font-weight: 700;
        color: var(--color-onyx);
      }

      .tables-status-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }

      .status-box {
        padding: 16px;
        border-radius: var(--radius-sm);
        text-align: center;
        border: 1px solid;

        &.available {
          background: var(--color-success-bg);
          border-color: rgba(27, 99, 62, 0.2);
          color: var(--color-success);
        }
        &.occupied {
          background: var(--color-warning-bg);
          border-color: rgba(133, 83, 0, 0.2);
          color: var(--color-warning);
        }
        &.reserved {
          background: var(--color-info-bg);
          border-color: rgba(27, 79, 126, 0.2);
          color: var(--color-info);
        }
        &.dirty {
          background: var(--color-danger-bg);
          border-color: rgba(169, 28, 18, 0.2);
          color: var(--color-danger);
        }
      }

      .status-num {
        display: block;
        font-size: 1.75rem;
        font-weight: 800;
        line-height: 1.1;
      }

      .status-label {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .quick-links-box {
        margin-top: 8px;
        padding-top: 14px;
        border-top: 1px solid var(--color-border-subtle);
      }

      .quick-title {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-muted);
        margin-bottom: 8px;
      }

      .quick-actions-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
    `,
  ],
})
export class AdminDashboardComponent {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;

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
