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
            Real-time overview of restaurant dining, active tables, and service dispatch.
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
                      <span
                        class="tbl-badge takeaway-badge"
                        style="background: rgba(212, 175, 55, 0.15); border-color: rgba(212, 175, 55, 0.4); color: #8b6508;"
                        ><i class="ph ph-bag"></i> Takeaway</span
                      >
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
            <h2 class="heading-card">Top Selling Royal Specialities</h2>
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
    return this.timeframeOrders().slice(0, 4);
  });

  revenueComparisonText = computed(() => {
    const tf = this.selectedTimeframe();
    if (tf === 'today') return '+14.2% from yesterday';
    if (tf === 'week') return '+22.5% from last week';
    return '+38.4% YoY all-time growth';
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
    if (tf === 'today') return 'Per table bill today';
    if (tf === 'week') return 'Weekly average spend';
    return 'Lifetime average dining bill';
  });

  chartTitle = computed(() => {
    const tf = this.selectedTimeframe();
    if (tf === 'today') return 'Hourly Dining Revenue (₹)';
    if (tf === 'week') return 'Daily Dining Revenue (₹)';
    return 'Monthly Dining Revenue (₹)';
  });

  chartSubtitle = computed(() => {
    const tf = this.selectedTimeframe();
    if (tf === 'today') return 'Peak Awadhi lunch & dinner rush trends';
    if (tf === 'week') return 'Monday to Sunday dining volume';
    return 'Historical Awadhi bistro dining growth';
  });

  chartBars = computed(() => {
    const tf = this.selectedTimeframe();
    if (tf === 'today') {
      return [
        { label: '12 PM', x: 65, y: 115, height: 25, color: '#C21807', opacity: 0.8 },
        { label: '01 PM', x: 125, y: 55, height: 85, color: '#C21807', opacity: 1 },
        { label: '02 PM', x: 185, y: 32, height: 108, color: '#C21807', opacity: 1 },
        { label: '03 PM', x: 245, y: 104, height: 36, color: '#C21807', opacity: 0.8 },
        { label: '07 PM', x: 305, y: 78, height: 62, color: '#121212', opacity: 0.85 },
        { label: '08 PM', x: 365, y: 8, height: 132, color: '#D4AF37', opacity: 1 },
        { label: '09 PM', x: 425, y: 42, height: 98, color: '#121212', opacity: 0.85 },
      ];
    }
    if (tf === 'week') {
      return [
        { label: 'Mon', x: 65, y: 85, height: 55, color: '#C21807', opacity: 0.8 },
        { label: 'Tue', x: 125, y: 75, height: 65, color: '#C21807', opacity: 0.85 },
        { label: 'Wed', x: 185, y: 60, height: 80, color: '#C21807', opacity: 0.9 },
        { label: 'Thu', x: 245, y: 50, height: 90, color: '#C21807', opacity: 0.95 },
        { label: 'Fri', x: 305, y: 25, height: 115, color: '#121212', opacity: 0.9 },
        { label: 'Sat', x: 365, y: 10, height: 130, color: '#D4AF37', opacity: 1 },
        { label: 'Sun', x: 425, y: 18, height: 122, color: '#D4AF37', opacity: 0.95 },
      ];
    }
    return [
      { label: 'May', x: 65, y: 95, height: 45, color: '#C21807', opacity: 0.8 },
      { label: 'Jun', x: 125, y: 80, height: 60, color: '#C21807', opacity: 0.85 },
      { label: 'Jul', x: 185, y: 65, height: 75, color: '#C21807', opacity: 0.9 },
      { label: 'Aug', x: 245, y: 45, height: 95, color: '#121212', opacity: 0.85 },
      { label: 'Sep', x: 305, y: 30, height: 110, color: '#121212', opacity: 0.9 },
      { label: 'Oct', x: 365, y: 12, height: 128, color: '#D4AF37', opacity: 1 },
      { label: 'Nov', x: 425, y: 22, height: 118, color: '#D4AF37', opacity: 0.95 },
    ];
  });

  chartLegend = computed(() => {
    const tf = this.selectedTimeframe();
    if (tf === 'today') {
      return [
        { dotClass: 'crimson', label: 'Lunch Rush' },
        { dotClass: 'gold', label: 'Peak Dinner (08 PM)' },
        { dotClass: 'dark', label: 'Late Evening' },
      ];
    }
    if (tf === 'week') {
      return [
        { dotClass: 'crimson', label: 'Weekday Dining' },
        { dotClass: 'gold', label: 'Weekend Peak (Sat)' },
        { dotClass: 'dark', label: 'Sunday Brunch' },
      ];
    }
    return [
      { dotClass: 'crimson', label: 'Q2 Volume' },
      { dotClass: 'dark', label: 'Q3 Growth' },
      { dotClass: 'gold', label: 'Festive High (Oct)' },
    ];
  });

  popularItems = signal([
    { name: 'Awadhi Gosht Dum Biryani', ordersCount: 42, revenue: 27090, category: 'Biryani' },
    { name: 'Bhatti Ka Galouti Kebab', ordersCount: 38, revenue: 23750, category: 'Kebabs' },
    {
      name: "Dal Makhani 'The Royal Reserve'",
      ordersCount: 54,
      revenue: 22950,
      category: 'Gravies',
    },
    { name: 'Murgh Malai Kebab', ordersCount: 32, revenue: 15840, category: 'Kebabs' },
    { name: 'Shahi Tukda Brioche', ordersCount: 29, revenue: 9425, category: 'Desserts' },
  ]);
}
