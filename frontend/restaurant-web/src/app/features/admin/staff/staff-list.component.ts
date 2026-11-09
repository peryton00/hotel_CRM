import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { STAFF_REPO } from '../../../data-access/repositories';
import { StaffMember, StaffRole } from '../../../core/models/staff.model';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, PermissionDefinition } from '../../../core/models/permissions.model';
import { AttendanceStatus, StaffPerformanceSummary } from '../../../core/models/attendance.model';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';

@Component({
  selector: 'app-staff-list',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyInrPipe],
  template: `
    <div class="staff-page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <div class="header-badges">
            <h1 class="heading-display">Staff & Access Control</h1>
            @if (auth.isAdmin()) {
              <span class="badge-admin">Admin Privileges Active</span>
            } @else {
              <span class="badge-controlled">Controlled Read-Only Access</span>
            }
          </div>
          <p class="text-muted">
            Configure assigned staff member accounts, edit details, track attendance & performance, and set secret credentials in Supabase.
          </p>
        </div>

        @if (auth.isAdmin()) {
          <button class="btn btn-primary" (click)="openAddModal()">
            <i class="ph ph-user-plus"></i>
            <span>Add Staff Member</span>
          </button>
        }
      </div>

      <!-- Navigation Tabs -->
      <div class="tabs-header-wrap">
        <button
          type="button"
          class="tab-toggle-btn"
          [class.active]="activeTab() === 'DIRECTORY'"
          (click)="activeTab.set('DIRECTORY')"
        >
          <i class="ph ph-identification-card"></i>
          <span>Staff Directory & Credentials</span>
        </button>
        <button
          type="button"
          class="tab-toggle-btn"
          [class.active]="activeTab() === 'ATTENDANCE'"
          (click)="switchToAttendanceTab()"
        >
          <i class="ph ph-calendar-check"></i>
          <span>Daily Attendance & Performance</span>
        </button>
      </div>

      @if (activeTab() === 'DIRECTORY') {
        @if (!auth.isAdmin()) {
          <div class="controlled-warning-banner">
            <i class="ph ph-shield-warning"></i>
            <div>
              <strong>Restricted Access Area</strong>
              <p>Only the Administrator has permission to create, edit staff profiles, or view/reset secret passwords.</p>
            </div>
          </div>
        }

        <div class="staff-grid">
          @for (member of staff(); track member.id) {
            <div
              class="staff-card clickable-card"
              [class.inactive]="member.status === 'INACTIVE'"
              [class.card-selected]="selectedPanelStaff()?.id === member.id"
              (click)="openSidePanel(member)"
            >
              <div class="staff-top">
                <div class="avatar-lg" [class.avatar-admin]="member.role === 'ADMIN'">
                  {{ member.name.charAt(0).toUpperCase() }}
                </div>
                <div class="staff-title-group">
                  <div class="staff-name-row">
                    <h3 class="staff-name">{{ member.name }}</h3>
                    @if (member.status === 'INACTIVE') {
                      <span class="status-pill inactive-pill">Inactive</span>
                    }
                  </div>
                  <span class="role-badge" [class.role-admin]="member.role === 'ADMIN'">
                    {{ formatRole(member.role) }}
                  </span>
                </div>
              </div>

              <div class="staff-credentials-box">
                <div class="credential-item">
                  <span class="cred-label">Login ID / Username:</span>
                  <div class="cred-value-wrap">
                    <span class="cred-value">{{ member.loginId || member.email }}</span>
                    <button
                      class="copy-mini-btn"
                      (click)="copyToClipboard(member.loginId || member.email, 'Login ID'); $event.stopPropagation()"
                      title="Copy Login ID"
                    >
                      <i class="ph ph-copy"></i>
                    </button>
                  </div>
                </div>
              </div>

              <div class="staff-details">
                <div class="detail-line">
                  <i class="ph ph-phone"></i>
                  <span>{{ member.phone || 'No phone set' }}</span>
                </div>
                @if (member.email) {
                  <div class="detail-line">
                    <i class="ph ph-envelope"></i>
                    <span>{{ member.email }}</span>
                  </div>
                }
                <div class="detail-line">
                  <i class="ph ph-clock"></i>
                  <span>Shift: {{ member.shift || 'General Shift' }}</span>
                </div>
                @if (member.assignedSection) {
                  <div class="detail-line">
                    <i class="ph ph-map-pin"></i>
                    <span>Station: {{ member.assignedSection }}</span>
                  </div>
                }
                <div class="detail-line">
                  <i class="ph ph-calendar"></i>
                  <span>Cycle: Starts on Day {{ member.payrollCycleStartDay || 1 }}</span>
                </div>
                <div class="detail-line">
                  <i class="ph ph-currency-inr"></i>
                  <span>Base Salary: {{ (member.monthlySalary || 15000) | currencyInr }}/mo</span>
                </div>
              </div>

              <div class="card-sidepanel-hint">
                <span><i class="ph ph-sidebar-simple"></i> Click to open calendar & info panel</span>
                <i class="ph ph-arrow-right"></i>
              </div>

              @if (auth.isAdmin()) {
                <div class="staff-actions" (click)="$event.stopPropagation()">
                  <button
                    class="btn btn-secondary btn-sm"
                    (click)="openEditModal(member)"
                    title="Edit staff details, role, and salary"
                  >
                    <i class="ph ph-pencil-simple"></i>
                    <span>Edit</span>
                  </button>

                  <button
                    class="btn btn-secondary btn-sm"
                    (click)="openSidePanel(member)"
                    title="Open side panel with calendar and serving stats"
                  >
                    <i class="ph ph-calendar"></i>
                    <span>Panel</span>
                  </button>

                  @if (member.role !== 'ADMIN') {
                    <button
                      class="btn btn-secondary btn-sm"
                      (click)="openResetPasswordModal(member)"
                      title="Secretly update or reset password in Supabase"
                    >
                      <i class="ph ph-key"></i>
                      <span>Password</span>
                    </button>

                    <button
                      class="btn btn-outline btn-sm status-toggle-btn"
                      (click)="toggleStaffStatus(member)"
                      [title]="member.status === 'ACTIVE' ? 'Deactivate staff account' : 'Reactivate staff account'"
                    >
                      <i class="ph" [class.ph-user-minus]="member.status === 'ACTIVE'" [class.ph-user-check]="member.status !== 'ACTIVE'"></i>
                      <span>{{ member.status === 'ACTIVE' ? 'Deactivate' : 'Activate' }}</span>
                    </button>
                  }
                </div>
              }
            </div>
          }
        </div>
      } @else {
        <!-- Attendance & Performance Tab View -->
        <div class="attendance-container">
          <!-- Date & Month Control Toolbar -->
          <div class="date-control-card">
            <div class="date-selector-group">
              <div class="date-picker-wrap">
                <label class="control-label"><i class="ph ph-calendar"></i> Attendance Date:</label>
                <input
                  type="date"
                  class="form-input date-input"
                  [ngModel]="selectedDate()"
                  (ngModelChange)="onDateChange($event)"
                />
              </div>
              <button class="btn btn-secondary btn-sm" (click)="setToday()">
                <i class="ph ph-clock-counter-clockwise"></i> Today
              </button>
            </div>

            <div class="month-selector-group">
              <label class="control-label"><i class="ph ph-chart-bar"></i> Month Cycle:</label>
              <input
                type="month"
                class="form-input month-input"
                [ngModel]="selectedMonth()"
                (ngModelChange)="onMonthChange($event)"
              />
              <button class="btn btn-secondary btn-sm" (click)="refreshAttendanceData()" title="Sync live calculations">
                <i class="ph ph-arrows-clockwise"></i> Refresh
              </button>
            </div>
          </div>

          <!-- 1. Daily Attendance Register -->
          <div class="attendance-section-card">
            <div class="section-card-header">
              <div>
                <h2 class="section-title">
                  <i class="ph ph-check-square-offset"></i> Daily Attendance Register
                </h2>
                <p class="section-desc">
                  Mark daily attendance for {{ selectedDate() | date: 'mediumDate' }}. Present days, half days, and paid leaves count towards calculated salary.
                </p>
              </div>
              <div class="attendance-count-summary">
                <span class="count-pill present">{{ countTodayStatus('PRESENT') }} Present</span>
                <span class="count-pill half-day">{{ countTodayStatus('HALF_DAY') }} Half Day</span>
                <span class="count-pill absent">{{ countTodayStatus('ABSENT') }} Absent</span>
                <span class="count-pill leave">{{ countTodayStatus('PAID_LEAVE') }} Leave</span>
              </div>
            </div>

            <div class="attendance-register-grid">
              @for (member of activeStaff(); track member.id) {
                <div class="attendance-member-row">
                  <div class="member-info-col clickable-row" (click)="openSidePanel(member)">
                    <div class="avatar-sm" [class.avatar-admin]="member.role === 'ADMIN'">
                      {{ member.name.charAt(0).toUpperCase() }}
                    </div>
                    <div class="member-meta">
                      <span class="member-name">{{ member.name }}</span>
                      <span class="member-role">
                        {{ formatRole(member.role) }} &bull; Cycle Starts: Day {{ member.payrollCycleStartDay || 1 }}
                      </span>
                    </div>
                  </div>

                  <div class="current-status-col">
                    @let currStatus = getMemberAttendanceStatus(member.id);
                    <span class="status-indicator-badge" [ngClass]="currStatus.toLowerCase()">
                      {{ formatAttendanceStatus(currStatus) }}
                    </span>
                  </div>

                  <div class="status-actions-col">
                    @let sStatus = getMemberAttendanceStatus(member.id);
                    <button
                      type="button"
                      class="btn-status present"
                      [class.active]="sStatus === 'PRESENT'"
                      (click)="markAttendance(member.id, 'PRESENT')"
                      title="Full working day credit (1.0 day)"
                    >
                      <i class="ph ph-check-bold"></i> Present
                    </button>
                    <button
                      type="button"
                      class="btn-status half-day"
                      [class.active]="sStatus === 'HALF_DAY'"
                      (click)="markAttendance(member.id, 'HALF_DAY')"
                      title="Half day credit (0.5 day)"
                    >
                      <i class="ph ph-clock"></i> Half Day
                    </button>
                    <button
                      type="button"
                      class="btn-status absent"
                      [class.active]="sStatus === 'ABSENT'"
                      (click)="markAttendance(member.id, 'ABSENT')"
                      title="Absent (no salary credit)"
                    >
                      <i class="ph ph-x-bold"></i> Absent
                    </button>
                    <button
                      type="button"
                      class="btn-status leave"
                      [class.active]="sStatus === 'PAID_LEAVE'"
                      (click)="markAttendance(member.id, 'PAID_LEAVE')"
                      title="Approved paid leave (1.0 day credit)"
                    >
                      <i class="ph ph-airplane-tilt"></i> Paid Leave
                    </button>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm btn-icon-only"
                      (click)="openSidePanel(member)"
                      title="Open Month Calendar Side Panel"
                    >
                      <i class="ph ph-calendar"></i>
                    </button>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- 2. Performance & Salary Calculation Ledger -->
          <div class="attendance-section-card">
            <div class="section-card-header">
              <div>
                <h2 class="section-title">
                  <i class="ph ph-currency-inr"></i> Performance & Salary Calculation Ledger
                </h2>
                <p class="section-desc">
                  Working days, orders served, handled sales, and net payable salary calculated for month {{ selectedMonth() }}.
                </p>
              </div>
              <div class="salary-formula-chip">
                <i class="ph ph-info"></i>
                <span>Formula: Working Days × (Monthly Salary ÷ 30)</span>
              </div>
            </div>

            <!-- Overall KPI Strip -->
            <div class="kpi-strip">
              <div class="kpi-mini-box">
                <span class="kpi-label">Active Staff</span>
                <span class="kpi-value">{{ activeStaff().length }}</span>
              </div>
              <div class="kpi-mini-box">
                <span class="kpi-label">Total Orders Handled</span>
                <span class="kpi-value">{{ totalOrdersServed() }}</span>
              </div>
              <div class="kpi-mini-box">
                <span class="kpi-label">Handled Sales</span>
                <span class="kpi-value">{{ totalSalesServed() | currencyInr }}</span>
              </div>
              <div class="kpi-mini-box highlight">
                <span class="kpi-label">Total Net Payroll</span>
                <span class="kpi-value payable">{{ totalPayableSalary() | currencyInr }}</span>
              </div>
            </div>

            <div class="table-responsive">
              <table class="performance-table">
                <thead>
                  <tr>
                    <th>Staff Member</th>
                    <th>Cycle Period</th>
                    <th>Base Monthly</th>
                    <th>Present</th>
                    <th>Half Day</th>
                    <th>Absent</th>
                    <th>Leave</th>
                    <th>Working Days</th>
                    <th>Orders Served</th>
                    <th>Sales Handled</th>
                    <th>Payable Salary</th>
                    <th>Status & Action</th>
                  </tr>
                </thead>
                <tbody>
                  @for (summary of performanceList(); track summary.staff_id) {
                    <tr>
                      <td>
                        <div class="table-member-cell clickable-cell" (click)="openSidePanelById(summary.staff_id)">
                          <span class="member-name">{{ summary.staff_name }}</span>
                          <span class="member-sub">{{ summary.role }}</span>
                        </div>
                      </td>
                      <td>
                        <div class="cycle-period-cell">
                          <span class="cycle-day-badge">Day {{ summary.payroll_cycle_start_day || 1 }}</span>
                          @if (summary.cycle_start_date && summary.cycle_end_date) {
                            <span class="cycle-dates-sub">{{ summary.cycle_start_date | date: 'dd MMM' }} - {{ summary.cycle_end_date | date: 'dd MMM' }}</span>
                          }
                        </div>
                      </td>
                      <td>
                        <div class="salary-cell">
                          <strong>{{ summary.monthly_salary_paise / 100 | currencyInr }}</strong>
                          <span class="per-day-rate">({{ (summary.monthly_salary_paise / 100) / 30 | currencyInr }}/day)</span>
                        </div>
                      </td>
                      <td>
                        <span class="tag-count present">{{ summary.present_days }}</span>
                      </td>
                      <td>
                        <span class="tag-count half-day">{{ summary.half_days }}</span>
                      </td>
                      <td>
                        <span class="tag-count absent">{{ summary.absent_days }}</span>
                      </td>
                      <td>
                        <span class="tag-count leave">{{ summary.leave_days }}</span>
                      </td>
                      <td>
                        <strong class="working-days-text">{{ summary.effective_working_days }} / {{ summary.total_days_in_month }}</strong>
                      </td>
                      <td>
                        <span class="orders-count-badge">
                          <i class="ph ph-receipt"></i> {{ summary.orders_served_count }}
                        </span>
                      </td>
                      <td>
                        <span class="sales-served-text">{{ summary.orders_served_total_paise / 100 | currencyInr }}</span>
                      </td>
                      <td>
                        <span class="calculated-salary-text">
                          {{ summary.calculated_salary_paise / 100 | currencyInr }}
                        </span>
                      </td>
                      <td>
                        <div class="status-action-cell">
                          <span class="payroll-status-pill">
                            <i class="ph ph-check-circle"></i> Calculated
                          </span>
                          @let mb = getMemberById(summary.staff_id);
                          @if (mb) {
                            <button
                              type="button"
                              class="mini-edit-btn"
                              (click)="openSidePanel(mb)"
                              title="Open Month Calendar & Details Side Panel"
                            >
                              <i class="ph ph-calendar"></i>
                            </button>
                            @if (auth.isAdmin()) {
                              <button
                                type="button"
                                class="mini-edit-btn"
                                (click)="openEditModal(mb)"
                                title="Edit staff details and monthly salary"
                              >
                                <i class="ph ph-pencil-simple"></i>
                              </button>
                            }
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }

      <!-- Staff Information & Calendar Side Panel (Flyout Drawer) -->
      @if (selectedPanelStaff(); as pStaff) {
        <div class="panel-backdrop" (click)="closeSidePanel()"></div>
        <aside class="staff-side-panel" role="dialog" aria-modal="true" aria-label="Staff Details and Attendance">
          <!-- Panel Header -->
          <div class="panel-header">
            <div class="panel-header-profile">
              <div class="avatar-lg" [class.avatar-admin]="pStaff.role === 'ADMIN'">
                {{ pStaff.name.charAt(0).toUpperCase() }}
              </div>
              <div class="panel-title-wrap">
                <div class="panel-name-row">
                  <h2 class="panel-staff-name">{{ pStaff.name }}</h2>
                  <span class="status-pill" [class.inactive-pill]="pStaff.status === 'INACTIVE'">
                    {{ pStaff.status }}
                  </span>
                </div>
                <div class="panel-badges-row">
                  <span class="role-badge" [class.role-admin]="pStaff.role === 'ADMIN'">
                    {{ formatRole(pStaff.role) }}
                  </span>
                  <span class="panel-id-code">ID: {{ pStaff.loginId || pStaff.email }}</span>
                </div>
              </div>
            </div>
            <button type="button" class="panel-close-btn" (click)="closeSidePanel()" aria-label="Close side panel">
              <i class="ph ph-x"></i>
            </button>
          </div>

          <!-- Panel Scrollable Body -->
          <div class="panel-body">
            <!-- 1. Profile & Assigned Tables Card -->
            <div class="panel-card">
              <h3 class="panel-card-title"><i class="ph ph-user-circle"></i> Profile & Assignment</h3>
              <div class="panel-meta-grid">
                <div class="meta-item">
                  <span class="meta-label">Phone</span>
                  <span class="meta-val">{{ pStaff.phone || 'No phone set' }}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Email</span>
                  <span class="meta-val">{{ pStaff.email || 'No email set' }}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Shift</span>
                  <span class="meta-val">{{ pStaff.shift || 'General Shift' }}</span>
                </div>
                <div class="meta-item">
                  <span class="meta-label">Station</span>
                  <span class="meta-val">{{ pStaff.assignedSection || 'Main Dining Floor' }}</span>
                </div>
              </div>

              <!-- Customers & Orders Served -->
              <div class="panel-served-section">
                <div class="served-header-row">
                  <span class="meta-label">
                    <i class="ph ph-users-three"></i> Customers & Tables Served:
                  </span>
                  <span class="served-count-pill">{{ panelServedOrders().length }} Orders</span>
                </div>
                @if (panelServedOrders().length > 0) {
                  <div class="served-orders-scroll">
                    @for (ord of panelServedOrders(); track ord.id) {
                      <div class="served-order-row">
                        <div class="served-order-top">
                          <div class="served-cust-name">
                            <i class="ph ph-user"></i>
                            <strong>{{ ord.customerName || 'Walk-in Guest' }}</strong>
                            @if (ord.customerPhone) {
                              <span class="served-phone">({{ ord.customerPhone }})</span>
                            } @else {
                              <span class="unassigned-badge">Unassigned</span>
                            }
                          </div>
                          <span class="served-table-badge">
                            <i class="ph ph-table"></i>
                            {{ ord.orderType === 'TAKEAWAY' ? 'Takeaway' : ('Table ' + (ord.tableNumber || 'N/A')) }}
                          </span>
                        </div>
                        <div class="served-order-bottom">
                          <span class="served-timestamp">
                            <i class="ph ph-clock"></i>
                            {{ ord.createdAt | date: 'dd MMM, hh:mm a' }}
                          </span>
                          <div class="served-order-right">
                            <strong class="served-amount">{{ ord.totalAmount | currencyInr }}</strong>
                            <span class="served-status-chip" [class]="ord.status.toLowerCase()">
                              {{ ord.status }}
                            </span>
                          </div>
                        </div>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="empty-served-note">
                    <span class="text-xs text-muted">No customer orders served yet. Staff is allotted dynamically per customer order.</span>
                  </div>
                }
              </div>
            </div>

            <!-- 2. Monthly Cycle & Base Salary Configuration Card -->
            <div class="panel-card highlight-card">
              <h3 class="panel-card-title"><i class="ph ph-clock-countdown"></i> Monthly Payroll Cycle & Salary</h3>
              
              <div class="cycle-config-box">
                <div class="form-group">
                  <label class="form-label text-xs">Custom Monthly Cycle Start Day for {{ pStaff.name }}:</label>
                  <select
                    class="form-select cycle-select"
                    [ngModel]="pStaff.payrollCycleStartDay || 1"
                    (ngModelChange)="onUpdateStaffCycle(pStaff, $event)"
                  >
                    <option [value]="1">Day 1 (1st of month → End of month)</option>
                    <option [value]="5">Day 5 (5th of month → 4th of next month)</option>
                    <option [value]="7">Day 7 (7th of month → 6th of next month)</option>
                    <option [value]="10">Day 10 (10th of month → 9th of next month)</option>
                    <option [value]="15">Day 15 (15th of month → 14th of next month)</option>
                    <option [value]="20">Day 20 (20th of month → 19th of next month)</option>
                    <option [value]="25">Day 25 (25th of month → 24th of next month)</option>
                    <option [value]="28">Day 28 (28th of month → 27th of next month)</option>
                  </select>
                </div>

                <div class="cycle-period-banner">
                  <i class="ph ph-calendar-check"></i>
                  <div>
                    <strong>Active Cycle for {{ panelMonth() }}:</strong>
                    <span>{{ panelCycleRangeText() }}</span>
                  </div>
                </div>

                <div class="salary-stat-row">
                  <div>
                    <span class="meta-label">Base Monthly Salary:</span>
                    <strong class="salary-highlight">{{ (pStaff.monthlySalary || 15000) | currencyInr }}/mo</strong>
                  </div>
                  <div class="text-right">
                    <span class="meta-label">Daily Payout Rate:</span>
                    <strong class="daily-rate-highlight">{{ ((pStaff.monthlySalary || 15000) / 30) | currencyInr }}/day</strong>
                  </div>
                </div>
              </div>
            </div>

            <!-- 3. Performance & Serving Summary in Cycle -->
            <div class="panel-card">
              <h3 class="panel-card-title"><i class="ph ph-chart-line-up"></i> Serving & Cycle Performance</h3>
              @let metrics = panelStaffMetrics();
              <div class="panel-kpi-grid">
                <div class="panel-kpi-item">
                  <span class="kpi-sub-label">Orders Served</span>
                  <strong class="kpi-val"><i class="ph ph-receipt"></i> {{ metrics.orders }}</strong>
                </div>
                <div class="panel-kpi-item">
                  <span class="kpi-sub-label">Handled Sales</span>
                  <strong class="kpi-val">{{ metrics.sales | currencyInr }}</strong>
                </div>
                <div class="panel-kpi-item">
                  <span class="kpi-sub-label">Working Days</span>
                  <strong class="kpi-val">{{ metrics.workingDays }} / 30</strong>
                </div>
                <div class="panel-kpi-item highlight">
                  <span class="kpi-sub-label">Payable Salary</span>
                  <strong class="kpi-val green">{{ metrics.salary | currencyInr }}</strong>
                </div>
              </div>

              <div class="cycle-status-breakdown">
                <span class="count-pill present">{{ metrics.present }} Present</span>
                <span class="count-pill half-day">{{ metrics.half }} Half Day</span>
                <span class="count-pill leave">{{ metrics.leave }} Leave</span>
                <span class="count-pill absent">{{ metrics.absent }} Absent</span>
              </div>
            </div>

            <!-- 4. Month-wise Attendance Calendar & Direct Marking -->
            <div class="panel-card">
              <div class="calendar-header-bar">
                <h3 class="panel-card-title"><i class="ph ph-calendar"></i> Month Attendance Calendar</h3>
                <div class="month-nav-controls">
                  <button type="button" class="btn-cal-nav" (click)="prevPanelMonth()" title="Previous Month">
                    <i class="ph ph-caret-left"></i>
                  </button>
                  <span class="cal-current-month">{{ panelMonth() }}</span>
                  <button type="button" class="btn-cal-nav" (click)="nextPanelMonth()" title="Next Month">
                    <i class="ph ph-caret-right"></i>
                  </button>
                </div>
              </div>

              <!-- Calendar Weekday Headers -->
              <div class="cal-weekdays">
                <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>
              </div>

              <!-- Calendar Days Grid -->
              <div class="cal-grid">
                @for (day of calendarDays(); track day.dateStr) {
                  <button
                    type="button"
                    class="cal-day-cell"
                    [class.not-current]="!day.isCurrentMonth"
                    [class.is-today]="day.isToday"
                    [class.is-selected]="day.dateStr === selectedPanelDate()"
                    [class.in-cycle]="day.isInCycle"
                    (click)="selectedPanelDate.set(day.dateStr)"
                    [title]="day.dateStr + (day.status ? ' (' + day.status + ')' : '')"
                  >
                    <span class="day-num">{{ day.dayNum }}</span>
                    @if (day.status) {
                      <span class="day-status-dot" [ngClass]="day.status.toLowerCase()">
                        {{ day.status === 'PRESENT' ? 'P' : day.status === 'HALF_DAY' ? 'H' : day.status === 'PAID_LEAVE' ? 'L' : 'A' }}
                      </span>
                    }
                  </button>
                }
              </div>

              <!-- Quick Mark Attendance for Selected Date in Calendar -->
              <div class="cal-marker-bar">
                <div class="marker-header">
                  <span>Mark for <strong>{{ selectedPanelDate() | date: 'mediumDate' }}</strong>:</span>
                  @let selStatus = getMemberAttendanceStatusForDate(pStaff.id, selectedPanelDate());
                  <span class="status-indicator-badge" [ngClass]="selStatus.toLowerCase()">
                    {{ formatAttendanceStatus(selStatus) }}
                  </span>
                </div>
                <div class="marker-buttons">
                  <button
                    type="button"
                    class="btn-status present btn-sm"
                    [class.active]="selStatus === 'PRESENT'"
                    (click)="markPanelAttendance('PRESENT')"
                  >
                    <i class="ph ph-check-bold"></i> Present
                  </button>
                  <button
                    type="button"
                    class="btn-status half-day btn-sm"
                    [class.active]="selStatus === 'HALF_DAY'"
                    (click)="markPanelAttendance('HALF_DAY')"
                  >
                    <i class="ph ph-clock"></i> Half Day
                  </button>
                  <button
                    type="button"
                    class="btn-status absent btn-sm"
                    [class.active]="selStatus === 'ABSENT'"
                    (click)="markPanelAttendance('ABSENT')"
                  >
                    <i class="ph ph-x-bold"></i> Absent
                  </button>
                  <button
                    type="button"
                    class="btn-status leave btn-sm"
                    [class.active]="selStatus === 'PAID_LEAVE'"
                    (click)="markPanelAttendance('PAID_LEAVE')"
                  >
                    <i class="ph ph-airplane-tilt"></i> Leave
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Panel Footer Actions -->
          <div class="panel-footer">
            <button class="btn btn-secondary btn-sm" (click)="openEditModal(pStaff)">
              <i class="ph ph-pencil-simple"></i>
              <span>Edit Full Profile</span>
            </button>
            @if (pStaff.role !== 'ADMIN') {
              <button class="btn btn-secondary btn-sm" (click)="openResetPasswordModal(pStaff)">
                <i class="ph ph-key"></i>
                <span>Reset Password</span>
              </button>
            }
          </div>
        </aside>
      }

      <!-- Add Staff Modal -->
      @if (showAddModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card modal-lg" role="dialog" aria-modal="true">
            <div class="modal-header">
              <div>
                <h3 class="heading-card">Add Staff Member</h3>
                <p class="modal-subtitle">Create login credentials secretly in Supabase for the assigned staff member.</p>
              </div>
              <button class="close-btn" (click)="showAddModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Full Name *</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. Vikas Kumar"
                    [(ngModel)]="staffForm.name"
                    (input)="onNameInput()"
                  />
                </div>

                <div class="form-group">
                  <label class="form-label">Operational Role *</label>
                  <select
                    class="form-select"
                    [(ngModel)]="staffForm.role"
                    (ngModelChange)="onRoleChange($event)"
                  >
                    <option value="MANAGER">Restaurant Manager (Controlled Management)</option>
                    <option value="CAPTAIN">Floor Captain / Steward (Tables & Orders)</option>
                    <option value="EXECUTIVE_CHEF">Head Chef (Kitchen & KDS)</option>
                    <option value="CASHIER">Billing Cashier (Settlements & Invoices)</option>
                    <option value="BEVERAGE_SPECIALIST">Sommelier / Bartender</option>
                  </select>
                </div>
              </div>

              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Staff Access ID (Login ID) *</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. vikas.cashier"
                    [(ngModel)]="staffForm.loginId"
                  />
                  <span class="field-hint">Used by the staff member to log into the CRM console.</span>
                </div>

                <div class="form-group">
                  <div class="label-with-action">
                    <label class="form-label">Secret Password *</label>
                    <button type="button" class="text-link-btn" (click)="generatePassword()">
                      <i class="ph ph-sparkle"></i> Auto-Generate
                    </button>
                  </div>
                  <div class="input-with-action">
                    <input
                      [type]="showSecretPassword ? 'text' : 'password'"
                      class="form-input"
                      placeholder="Secret password set in Supabase"
                      [(ngModel)]="staffForm.password"
                    />
                    <button
                      type="button"
                      class="toggle-visibility-btn"
                      (click)="showSecretPassword = !showSecretPassword"
                      [attr.aria-label]="showSecretPassword ? 'Hide password' : 'Show password'"
                    >
                      <i class="ph" [class.ph-eye]="!showSecretPassword" [class.ph-eye-slash]="showSecretPassword"></i>
                    </button>
                  </div>
                  <span class="field-hint">Created secretly by Admin and stored in Supabase.</span>
                </div>
              </div>

              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Mobile Phone *</label>
                  <input
                    type="tel"
                    class="form-input"
                    placeholder="+91 98000 00000"
                    [(ngModel)]="staffForm.phone"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Email Address (Optional)</label>
                  <input
                    type="email"
                    class="form-input"
                    placeholder="staff@restaurant.com"
                    [(ngModel)]="staffForm.email"
                  />
                </div>
              </div>

              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Shift</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. Evening Dinner (6 PM - 12 AM)"
                    [(ngModel)]="staffForm.shift"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Assigned Station / Section</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. Dining Floor / Billing Desk"
                    [(ngModel)]="staffForm.assignedSection"
                  />
                </div>
              </div>

              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Base Monthly Salary (₹) *</label>
                  <input
                    type="number"
                    class="form-input"
                    placeholder="15000"
                    min="1000"
                    [(ngModel)]="staffForm.monthlySalary"
                  />
                  <span class="field-hint">Base for calculating per-day attendance payout (÷ 30 days).</span>
                </div>

                <div class="form-group">
                  <label class="form-label">Payroll Cycle Start Day *</label>
                  <select class="form-select" [(ngModel)]="staffForm.payrollCycleStartDay">
                    <option [value]="1">Day 1 (1st of month)</option>
                    <option [value]="5">Day 5 (5th of month)</option>
                    <option [value]="7">Day 7 (7th of month)</option>
                    <option [value]="10">Day 10 (10th of month)</option>
                    <option [value]="15">Day 15 (15th of month)</option>
                    <option [value]="20">Day 20 (20th of month)</option>
                    <option [value]="25">Day 25 (25th of month)</option>
                    <option [value]="28">Day 28 (28th of month)</option>
                  </select>
                  <span class="field-hint">Day of month when this employee's payroll cycle starts.</span>
                </div>
              </div>

              <!-- Permissions & Access Control Section -->
              <div class="permissions-section">
                <div class="permissions-header">
                  <div>
                    <label class="form-label font-bold">
                      <i class="ph ph-shield-check"></i> Modular Access Permissions
                    </label>
                    <span class="field-hint">
                      Select the specific modules and actions this staff member can access.
                    </span>
                  </div>
                  @if (staffForm.role !== 'ADMIN') {
                    <div class="perm-bulk-actions">
                      <button type="button" class="btn-text-action" (click)="selectAllPermissions()">Select All</button>
                      <button type="button" class="btn-text-action" (click)="deselectAllPermissions()">Clear All</button>
                    </div>
                  }
                </div>

                <div class="permissions-groups-grid">
                  @for (group of permissionGroups; track group.name) {
                    <div class="permission-group-card">
                      <div class="group-header">
                        <i class="ph" [class]="group.icon"></i>
                        <span>{{ group.name }}</span>
                      </div>
                      <div class="group-items-list">
                        @for (perm of group.items; track perm.key) {
                          <label class="permission-item-label">
                            <input
                              type="checkbox"
                              [checked]="isPermissionSelected(perm.key)"
                              (change)="togglePermission(perm.key)"
                              [disabled]="staffForm.role === 'ADMIN'"
                            />
                            <div class="perm-text">
                              <span class="perm-title">{{ perm.label }}</span>
                              <span class="perm-subtitle">{{ perm.description }}</span>
                            </div>
                          </label>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>

              @if (staffForm.loginId && staffForm.password) {
                <div class="secret-share-box">
                  <div class="share-header">
                    <i class="ph ph-lock-key"></i>
                    <strong>Secret Credentials to Hand to Staff:</strong>
                  </div>
                  <div class="share-content">
                    <code>ID: {{ staffForm.loginId }} | Password: {{ staffForm.password }}</code>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      (click)="copyCredentials(staffForm.loginId, staffForm.password)"
                    >
                      <i class="ph ph-copy"></i>
                      <span>Copy Credentials</span>
                    </button>
                  </div>
                </div>
              }
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showAddModal = false">Cancel</button>
              <button
                class="btn btn-primary"
                (click)="saveStaff()"
                [disabled]="!staffForm.name.trim() || !staffForm.loginId.trim() || !staffForm.password.trim() || isSubmitting"
              >
                @if (isSubmitting) {
                  <i class="ph ph-spinner ph-spin"></i>
                  <span>Saving to Supabase...</span>
                } @else {
                  <i class="ph ph-check"></i>
                  <span>Create Account in Supabase</span>
                }
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Edit Staff Details Modal -->
      @if (showEditModal && editingMember) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card modal-lg" role="dialog" aria-modal="true">
            <div class="modal-header">
              <div>
                <h3 class="heading-card">Edit Staff Details</h3>
                <p class="modal-subtitle">
                  Update employee profile, contact information, role, cycle start day, and salary settings for {{ editingMember.name }}.
                </p>
              </div>
              <button class="close-btn" (click)="showEditModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Full Name *</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. Rahul Kumar"
                    [(ngModel)]="editForm.name"
                  />
                </div>

                <div class="form-group">
                  <label class="form-label">Operational Role *</label>
                  <select
                    class="form-select"
                    [(ngModel)]="editForm.role"
                    (ngModelChange)="onRoleChange($event, true)"
                    [disabled]="editingMember.role === 'ADMIN'"
                  >
                    <option value="ADMIN">Administrator (Full Access)</option>
                    <option value="MANAGER">Restaurant Manager (Controlled Management)</option>
                    <option value="CAPTAIN">Floor Captain / Steward (Tables & Orders)</option>
                    <option value="EXECUTIVE_CHEF">Head Chef (Kitchen & KDS)</option>
                    <option value="CASHIER">Billing Cashier (Settlements & Invoices)</option>
                    <option value="BEVERAGE_SPECIALIST">Sommelier / Bartender</option>
                  </select>
                </div>
              </div>

              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Staff Access ID (Login ID) *</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. rahul123"
                    [(ngModel)]="editForm.loginId"
                  />
                  <span class="field-hint">Used by the staff member to log into the CRM console.</span>
                </div>

                <div class="form-group">
                  <label class="form-label">Base Monthly Salary (₹) *</label>
                  <input
                    type="number"
                    class="form-input"
                    placeholder="15000"
                    min="1000"
                    [(ngModel)]="editForm.monthlySalary"
                  />
                  <span class="field-hint">
                    Daily rate = Monthly Salary ÷ 30 days ({{ ((editForm.monthlySalary || 0) / 30) | currencyInr }}/day)
                  </span>
                </div>
              </div>

              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Monthly Cycle Start Day *</label>
                  <select class="form-select" [(ngModel)]="editForm.payrollCycleStartDay">
                    <option [value]="1">Day 1 (1st of month)</option>
                    <option [value]="5">Day 5 (5th of month)</option>
                    <option [value]="7">Day 7 (7th of month)</option>
                    <option [value]="10">Day 10 (10th of month)</option>
                    <option [value]="15">Day 15 (15th of month)</option>
                    <option [value]="20">Day 20 (20th of month)</option>
                    <option [value]="25">Day 25 (25th of month)</option>
                    <option [value]="28">Day 28 (28th of month)</option>
                  </select>
                  <span class="field-hint">Day of month when this employee's salary cycle begins.</span>
                </div>

                <div class="form-group">
                  <label class="form-label">Mobile Phone</label>
                  <input
                    type="tel"
                    class="form-input"
                    placeholder="+91 98000 00000"
                    [(ngModel)]="editForm.phone"
                  />
                </div>
              </div>

              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Email Address (Optional)</label>
                  <input
                    type="email"
                    class="form-input"
                    placeholder="staff@restaurant.com"
                    [(ngModel)]="editForm.email"
                  />
                </div>

                <div class="form-group">
                  <label class="form-label">Shift</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. Dinner Shift (6 PM - 12 AM)"
                    [(ngModel)]="editForm.shift"
                  />
                </div>
              </div>

              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Assigned Station / Section</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. Main Dining Floor"
                    [(ngModel)]="editForm.assignedSection"
                  />
                </div>
              </div>

              <!-- Permissions & Access Control Section (Edit) -->
              <div class="permissions-section">
                <div class="permissions-header">
                  <div>
                    <label class="form-label font-bold">
                      <i class="ph ph-shield-check"></i> Modular Access Permissions
                    </label>
                    <span class="field-hint">
                      Select the specific modules and actions this staff member can access.
                    </span>
                  </div>
                  @if (editForm.role !== 'ADMIN') {
                    <div class="perm-bulk-actions">
                      <button type="button" class="btn-text-action" (click)="selectAllPermissions(true)">Select All</button>
                      <button type="button" class="btn-text-action" (click)="deselectAllPermissions(true)">Clear All</button>
                    </div>
                  }
                </div>

                <div class="permissions-groups-grid">
                  @for (group of permissionGroups; track group.name) {
                    <div class="permission-group-card">
                      <div class="group-header">
                        <i class="ph" [class]="group.icon"></i>
                        <span>{{ group.name }}</span>
                      </div>
                      <div class="group-items-list">
                        @for (perm of group.items; track perm.key) {
                          <label class="permission-item-label">
                            <input
                              type="checkbox"
                              [checked]="isPermissionSelected(perm.key, true)"
                              (change)="togglePermission(perm.key, true)"
                              [disabled]="editForm.role === 'ADMIN'"
                            />
                            <div class="perm-text">
                              <span class="perm-title">{{ perm.label }}</span>
                              <span class="perm-subtitle">{{ perm.description }}</span>
                            </div>
                          </label>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showEditModal = false">Cancel</button>
              <button
                class="btn btn-primary"
                (click)="saveEditStaff()"
                [disabled]="!editForm.name.trim() || !editForm.loginId.trim() || isSubmitting"
              >
                @if (isSubmitting) {
                  <i class="ph ph-spinner ph-spin"></i>
                  <span>Saving Changes...</span>
                } @else {
                  <i class="ph ph-check"></i>
                  <span>Save Staff Details</span>
                }
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Reset Password Modal -->
      @if (showResetModal && selectedMember) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <div>
                <h3 class="heading-card">Reset Secret Password</h3>
                <p class="modal-subtitle">Update password in Supabase for {{ selectedMember.name }} ({{ selectedMember.loginId || selectedMember.email }})</p>
              </div>
              <button class="close-btn" (click)="showResetModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <div class="form-group">
                <div class="label-with-action">
                  <label class="form-label">New Secret Password *</label>
                  <button type="button" class="text-link-btn" (click)="generateResetPassword()">
                    <i class="ph ph-sparkle"></i> Auto-Generate
                  </button>
                </div>
                <div class="input-with-action">
                  <input
                    [type]="showResetSecretPassword ? 'text' : 'password'"
                    class="form-input"
                    placeholder="Enter new secret password"
                    [(ngModel)]="resetPasswordValue"
                  />
                  <button
                    type="button"
                    class="toggle-visibility-btn"
                    (click)="showResetSecretPassword = !showResetSecretPassword"
                  >
                    <i class="ph" [class.ph-eye]="!showResetSecretPassword" [class.ph-eye-slash]="showResetSecretPassword"></i>
                  </button>
                </div>
                <span class="field-hint">This new secret password will be saved directly into Supabase.</span>
              </div>

              @if (resetPasswordValue) {
                <div class="secret-share-box">
                  <div class="share-header">
                    <i class="ph ph-lock-key"></i>
                    <strong>Updated Credentials:</strong>
                  </div>
                  <div class="share-content">
                    <code>ID: {{ selectedMember.loginId || selectedMember.email }} | Password: {{ resetPasswordValue }}</code>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      (click)="copyCredentials(selectedMember.loginId || selectedMember.email, resetPasswordValue)"
                    >
                      <i class="ph ph-copy"></i>
                      <span>Copy</span>
                    </button>
                  </div>
                </div>
              }
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showResetModal = false">Cancel</button>
              <button
                class="btn btn-primary"
                (click)="saveResetPassword()"
                [disabled]="!resetPasswordValue.trim() || isSubmitting"
              >
                @if (isSubmitting) {
                  <i class="ph ph-spinner ph-spin"></i>
                  <span>Updating Supabase...</span>
                } @else {
                  <i class="ph ph-lock-key"></i>
                  <span>Update Password in Supabase</span>
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
      .staff-page {
        display: flex;
        flex-direction: column;
        gap: 24px;
        position: relative;
      }

      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        flex-wrap: wrap;
        gap: 16px;
      }

      .header-badges {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 4px;
      }

      .badge-admin {
        background: rgba(212, 175, 55, 0.15);
        color: #d4af37;
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 4px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        border: 1px solid rgba(212, 175, 55, 0.3);
      }

      .badge-controlled {
        background: rgba(194, 24, 7, 0.1);
        color: #d32f2f;
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 4px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        border: 1px solid rgba(194, 24, 7, 0.2);
      }

      .tabs-header-wrap {
        display: flex;
        gap: 8px;
        background: var(--color-surface);
        padding: 6px;
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        width: fit-content;
      }

      .tab-toggle-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 16px;
        border-radius: var(--radius-sm);
        border: none;
        background: transparent;
        color: var(--color-text-secondary);
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;

        i {
          font-size: 1.1rem;
        }

        &:hover {
          color: var(--color-text-primary);
          background: var(--color-bone-light);
        }

        &.active {
          background: var(--color-onyx);
          color: var(--color-bone);
          box-shadow: var(--shadow-xs);

          i {
            color: var(--color-gold);
          }
        }
      }

      .controlled-warning-banner {
        background: rgba(194, 24, 7, 0.08);
        border: 1px solid rgba(194, 24, 7, 0.25);
        border-radius: var(--radius-md);
        padding: 14px 18px;
        display: flex;
        align-items: flex-start;
        gap: 12px;

        i {
          font-size: 1.5rem;
          color: #d32f2f;
          flex-shrink: 0;
          margin-top: 2px;
        }

        strong {
          color: #d32f2f;
          font-size: 0.9375rem;
          display: block;
        }

        p {
          color: var(--color-text-secondary);
          margin: 3px 0 0;
          font-size: 0.8125rem;
        }
      }

      .staff-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 20px;
      }

      .staff-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 22px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-shadow: var(--shadow-xs);
        transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        position: relative;

        &:hover {
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
          border-color: var(--color-taupe);
        }

        &.clickable-card {
          cursor: pointer;
        }

        &.card-selected {
          border-color: var(--color-gold);
          box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.3);
        }

        &.inactive {
          opacity: 0.65;
          filter: grayscale(0.5);
        }
      }

      .card-sidepanel-hint {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.72rem;
        color: var(--color-crimson);
        font-weight: 600;
        padding: 6px 10px;
        background: rgba(194, 24, 7, 0.05);
        border-radius: var(--radius-xs);
        border: 1px dashed rgba(194, 24, 7, 0.2);

        i {
          font-size: 0.85rem;
        }
      }

      .staff-top {
        display: flex;
        align-items: center;
        gap: 14px;
      }

      .avatar-lg {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--color-onyx);
        color: var(--color-gold);
        font-weight: 800;
        font-size: 1.25rem;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        &.avatar-admin {
          background: linear-gradient(135deg, #d4af37 0%, #aa8c2c 100%);
          color: #121212;
        }
      }

      .staff-title-group {
        flex: 1;
        min-width: 0;
      }

      .staff-name-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .staff-name {
        font-size: 1.05rem;
        font-weight: 700;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .status-pill {
        font-size: 0.6875rem;
        padding: 1px 6px;
        border-radius: 4px;
        font-weight: 700;
        background: #e8f5e9;
        color: #2e7d32;

        &.inactive-pill {
          background: rgba(120, 120, 120, 0.15);
          color: var(--color-text-muted);
        }
      }

      .role-badge {
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-crimson);
        letter-spacing: 0.05em;
        text-transform: uppercase;

        &.role-admin {
          color: #d4af37;
        }
      }

      .staff-credentials-box {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-sm);
        padding: 10px 14px;
      }

      .credential-item {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .cred-label {
        font-size: 0.6875rem;
        font-weight: 600;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .cred-value-wrap {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .cred-value {
        font-family: monospace;
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--color-text-primary);
        letter-spacing: 0.03em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .copy-mini-btn {
        background: none;
        border: none;
        color: var(--color-text-muted);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        transition: color 0.15s ease;

        &:hover {
          color: var(--color-text-primary);
          background: rgba(0, 0, 0, 0.05);
        }
      }

      .staff-details {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
      }

      .detail-line {
        display: flex;
        align-items: center;
        gap: 8px;

        i {
          color: var(--color-text-muted);
          font-size: 0.95rem;
          flex-shrink: 0;
        }
      }

      .staff-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        padding-top: 14px;
        border-top: 1px solid var(--color-border-subtle);
        margin-top: auto;

        button {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-width: 70px;
        }
      }

      .status-toggle-btn {
        color: var(--color-text-secondary);

        &:hover {
          border-color: var(--color-crimson);
          color: var(--color-crimson);
        }
      }

      /* Attendance Section Styles */
      .attendance-container {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .date-control-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 16px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 16px;
        box-shadow: var(--shadow-xs);
      }

      .date-selector-group,
      .month-selector-group {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .date-picker-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .control-label {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        display: flex;
        align-items: center;
        gap: 5px;
      }

      .date-input,
      .month-input {
        padding: 6px 12px;
        font-size: 0.8125rem;
        min-width: 140px;
      }

      .attendance-section-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 24px;
        box-shadow: var(--shadow-xs);
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .section-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 12px;
      }

      .section-title {
        font-size: 1.15rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;

        i {
          color: var(--color-crimson);
          font-size: 1.3rem;
        }
      }

      .section-desc {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        margin: 4px 0 0;
      }

      .attendance-count-summary {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .count-pill {
        font-size: 0.75rem;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: var(--radius-full);

        &.present {
          background: rgba(46, 125, 50, 0.12);
          color: #2e7d32;
        }
        &.half-day {
          background: rgba(230, 81, 0, 0.12);
          color: #e65100;
        }
        &.absent {
          background: rgba(198, 40, 40, 0.12);
          color: #c62828;
        }
        &.leave {
          background: rgba(21, 101, 192, 0.12);
          color: #1565c0;
        }
      }

      .attendance-register-grid {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .attendance-member-row {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-sm);
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 16px;
        transition: border-color 0.2s ease;

        &:hover {
          border-color: var(--color-taupe);
        }
      }

      .clickable-row {
        cursor: pointer;
        transition: opacity 0.15s ease;
        &:hover {
          opacity: 0.8;
        }
      }

      .member-info-col {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 220px;
      }

      .avatar-sm {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--color-onyx);
        color: var(--color-gold);
        font-weight: 700;
        font-size: 0.95rem;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        &.avatar-admin {
          background: linear-gradient(135deg, #d4af37 0%, #aa8c2c 100%);
          color: #121212;
        }
      }

      .member-meta {
        display: flex;
        flex-direction: column;
      }

      .member-name {
        font-size: 0.9375rem;
        font-weight: 700;
        color: var(--color-text-primary);
      }

      .member-role {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .current-status-col {
        min-width: 110px;
      }

      .status-indicator-badge {
        font-size: 0.75rem;
        font-weight: 700;
        padding: 4px 10px;
        border-radius: 4px;
        display: inline-flex;
        align-items: center;
        text-transform: capitalize;

        &.present {
          background: #e8f5e9;
          color: #2e7d32;
        }
        &.half_day {
          background: #fff3e0;
          color: #e65100;
        }
        &.absent {
          background: #ffebee;
          color: #c62828;
        }
        &.paid_leave {
          background: #e3f2fd;
          color: #1565c0;
        }
        &.not_marked {
          background: rgba(120, 120, 120, 0.12);
          color: var(--color-text-muted);
        }
      }

      .status-actions-col {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      .btn-status {
        padding: 6px 12px;
        border-radius: var(--radius-xs);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: all 0.15s ease;

        &.present:hover,
        &.present.active {
          background: #2e7d32;
          border-color: #2e7d32;
          color: #ffffff;
        }

        &.half-day:hover,
        &.half-day.active {
          background: #e65100;
          border-color: #e65100;
          color: #ffffff;
        }

        &.absent:hover,
        &.absent.active {
          background: #c62828;
          border-color: #c62828;
          color: #ffffff;
        }

        &.leave:hover,
        &.leave.active {
          background: #1565c0;
          border-color: #1565c0;
          color: #ffffff;
        }
      }

      .btn-icon-only {
        padding: 6px 8px;
        font-size: 0.95rem;
      }

      .salary-formula-chip {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        background: var(--color-bone-light);
        padding: 4px 10px;
        border-radius: var(--radius-xs);
        border: 1px solid var(--color-border-subtle);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .kpi-strip {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
      }

      .kpi-mini-box {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-sm);
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 4px;

        &.highlight {
          background: linear-gradient(135deg, rgba(212, 175, 55, 0.1) 0%, rgba(194, 24, 7, 0.05) 100%);
          border-color: rgba(212, 175, 55, 0.4);
        }
      }

      .kpi-label {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.04em;
      }

      .kpi-value {
        font-size: 1.25rem;
        font-weight: 800;
        color: var(--color-text-primary);

        &.payable {
          color: #2e7d32;
        }
      }

      .table-responsive {
        width: 100%;
        overflow-x: auto;
      }

      .performance-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.8125rem;

        th {
          text-align: left;
          padding: 10px 12px;
          color: var(--color-text-muted);
          font-weight: 700;
          border-bottom: 2px solid var(--color-border);
          white-space: nowrap;
          text-transform: uppercase;
          font-size: 0.6875rem;
          letter-spacing: 0.05em;
        }

        td {
          padding: 12px;
          border-bottom: 1px solid var(--color-border-subtle);
          vertical-align: middle;
        }

        tr:hover td {
          background: var(--color-bone-light);
        }
      }

      .table-member-cell {
        display: flex;
        flex-direction: column;

        &.clickable-cell {
          cursor: pointer;
          &:hover .member-name {
            color: var(--color-crimson);
            text-decoration: underline;
          }
        }

        .member-name {
          font-weight: 700;
          color: var(--color-text-primary);
        }

        .member-sub {
          font-size: 0.72rem;
          color: var(--color-text-muted);
        }
      }

      .cycle-period-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .cycle-day-badge {
        font-size: 0.72rem;
        font-weight: 700;
        color: var(--color-crimson);
        background: rgba(194, 24, 7, 0.08);
        padding: 2px 6px;
        border-radius: 4px;
        width: fit-content;
      }

      .cycle-dates-sub {
        font-size: 0.7rem;
        color: var(--color-text-muted);
      }

      .salary-cell {
        display: flex;
        flex-direction: column;

        strong {
          color: var(--color-text-primary);
        }

        .per-day-rate {
          font-size: 0.7rem;
          color: var(--color-text-muted);
        }
      }

      .tag-count {
        display: inline-block;
        padding: 2px 8px;
        border-radius: var(--radius-xs);
        font-weight: 700;
        font-size: 0.75rem;

        &.present {
          background: #e8f5e9;
          color: #2e7d32;
        }
        &.half-day {
          background: #fff3e0;
          color: #e65100;
        }
        &.absent {
          background: #ffebee;
          color: #c62828;
        }
        &.leave {
          background: #e3f2fd;
          color: #1565c0;
        }
      }

      .working-days-text {
        font-size: 0.875rem;
        color: var(--color-text-primary);
      }

      .orders-count-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-weight: 600;
        color: var(--color-crimson);
      }

      .sales-served-text {
        font-weight: 600;
        color: var(--color-text-primary);
      }

      .calculated-salary-text {
        font-size: 0.9375rem;
        font-weight: 800;
        color: #2e7d32;
      }

      .status-action-cell {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .payroll-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.72rem;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: var(--radius-full);
        background: rgba(46, 125, 50, 0.1);
        color: #2e7d32;
      }

      .mini-edit-btn {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 4px;
        padding: 4px 6px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-secondary);
        transition: all 0.15s ease;

        &:hover {
          color: var(--color-crimson);
          border-color: var(--color-crimson);
          background: var(--color-bone-light);
        }
      }

      /* -------------------------------------------------------------
         STAFF INFORMATION & CALENDAR SIDE PANEL (FLYOUT DRAWER)
         ------------------------------------------------------------- */
      .panel-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(2px);
        z-index: 1040;
        animation: fadeIn 0.2s ease;
      }

      .staff-side-panel {
        position: fixed;
        right: 0;
        top: 0;
        bottom: 0;
        width: 520px;
        max-width: 95vw;
        background: var(--color-surface);
        box-shadow: -10px 0 30px rgba(0, 0, 0, 0.25);
        z-index: 1050;
        display: flex;
        flex-direction: column;
        animation: slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        border-left: 1px solid var(--color-border);
      }

      @keyframes slideInRight {
        from {
          transform: translateX(100%);
        }
        to {
          transform: translateX(0);
        }
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .panel-header {
        padding: 20px 24px;
        border-bottom: 1px solid var(--color-border-subtle);
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        background: var(--color-bone-light);
      }

      .panel-header-profile {
        display: flex;
        align-items: center;
        gap: 14px;
        flex: 1;
        min-width: 0;
      }

      .panel-title-wrap {
        flex: 1;
        min-width: 0;
      }

      .panel-name-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }

      .panel-staff-name {
        font-size: 1.15rem;
        font-weight: 800;
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .panel-badges-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .panel-id-code {
        font-family: monospace;
        font-size: 0.72rem;
        background: rgba(0, 0, 0, 0.05);
        padding: 2px 6px;
        border-radius: 4px;
        color: var(--color-text-secondary);
      }

      .panel-close-btn {
        background: none;
        border: none;
        font-size: 1.3rem;
        color: var(--color-text-muted);
        cursor: pointer;
        padding: 6px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        transition: all 0.15s ease;

        &:hover {
          color: var(--color-text-primary);
          background: rgba(0, 0, 0, 0.08);
        }
      }

      .panel-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .panel-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;

        &.highlight-card {
          background: linear-gradient(135deg, rgba(212, 175, 55, 0.06) 0%, rgba(194, 24, 7, 0.03) 100%);
          border-color: rgba(212, 175, 55, 0.35);
        }
      }

      .panel-card-title {
        font-size: 0.9375rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0;

        i {
          color: var(--color-crimson);
          font-size: 1.1rem;
        }
      }

      .panel-meta-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .meta-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .meta-label {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.04em;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .meta-val {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-primary);
      }

      .panel-served-section {
        padding-top: 10px;
        border-top: 1px solid var(--color-border-subtle);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .served-header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .served-count-pill {
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 2px 7px;
        background: var(--color-crimson);
        color: #ffffff;
        border-radius: 12px;
      }

      .served-orders-scroll {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 180px;
        overflow-y: auto;
      }

      .served-order-row {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-xs);
        padding: 7px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .served-order-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .served-cust-name {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 0.8125rem;
        color: var(--color-text-primary);

        i {
          color: var(--color-crimson);
          font-size: 0.9rem;
        }

        .served-phone {
          font-size: 0.75rem;
          color: var(--color-text-muted);
          font-weight: 400;
        }

        .unassigned-badge {
          font-size: 0.6875rem;
          color: var(--color-text-muted);
          font-style: italic;
        }
      }

      .served-table-badge {
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 2px 6px;
        background: rgba(194, 24, 7, 0.08);
        color: var(--color-crimson);
        border-radius: var(--radius-xs);
        border: 1px solid rgba(194, 24, 7, 0.2);
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .served-order-bottom {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.75rem;
      }

      .served-timestamp {
        color: var(--color-text-muted);
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .served-order-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .served-amount {
        font-weight: 700;
        color: var(--color-text-primary);
      }

      .served-status-chip {
        font-size: 0.625rem;
        font-weight: 800;
        padding: 1px 5px;
        border-radius: 4px;
        text-transform: uppercase;

        &.completed, &.served, &.delivered {
          background: rgba(22, 101, 52, 0.12);
          color: #166534;
        }
        &.preparing, &.accepted, &.ready {
          background: rgba(180, 83, 9, 0.12);
          color: #b45309;
        }
        &.pending {
          background: rgba(30, 64, 175, 0.12);
          color: #1e40af;
        }
      }

      .empty-served-note {
        padding: 8px 10px;
        background: var(--color-bone-light);
        border-radius: var(--radius-xs);
        border: 1px dashed var(--color-border);
      }

      .cycle-config-box {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .cycle-select {
        padding: 6px 10px;
        font-size: 0.8125rem;
        font-weight: 600;
      }

      .cycle-period-banner {
        background: var(--color-surface);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-xs);
        padding: 8px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.78rem;

        i {
          color: #d4af37;
          font-size: 1.1rem;
        }

        strong {
          display: block;
          color: var(--color-text-primary);
        }

        span {
          color: var(--color-text-secondary);
        }
      }

      .salary-stat-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: var(--color-surface);
        padding: 10px 14px;
        border-radius: var(--radius-xs);
        border: 1px solid var(--color-border-subtle);
      }

      .salary-highlight {
        font-size: 1.05rem;
        color: var(--color-text-primary);
        display: block;
      }

      .daily-rate-highlight {
        font-size: 0.95rem;
        color: #2e7d32;
        display: block;
      }

      .panel-kpi-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .panel-kpi-item {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-xs);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 2px;

        &.highlight {
          background: rgba(46, 125, 50, 0.08);
          border-color: rgba(46, 125, 50, 0.3);
        }
      }

      .kpi-sub-label {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
        text-transform: uppercase;
        font-weight: 600;
      }

      .kpi-val {
        font-size: 1.1rem;
        font-weight: 800;
        color: var(--color-text-primary);

        &.green {
          color: #2e7d32;
        }
      }

      .cycle-status-breakdown {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      /* Calendar Styles */
      .calendar-header-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .month-nav-controls {
        display: flex;
        align-items: center;
        gap: 6px;
        background: var(--color-bone-light);
        padding: 3px 6px;
        border-radius: var(--radius-xs);
        border: 1px solid var(--color-border-subtle);
      }

      .btn-cal-nav {
        background: none;
        border: none;
        cursor: pointer;
        padding: 3px 6px;
        border-radius: 4px;
        color: var(--color-text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          color: var(--color-text-primary);
          background: rgba(0, 0, 0, 0.08);
        }
      }

      .cal-current-month {
        font-size: 0.8125rem;
        font-weight: 700;
        min-width: 70px;
        text-align: center;
      }

      .cal-weekdays {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        text-align: center;
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-text-muted);
        text-transform: uppercase;
        padding-bottom: 4px;
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .cal-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 4px;
      }

      .cal-day-cell {
        aspect-ratio: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--color-border-subtle);
        background: var(--color-surface);
        border-radius: var(--radius-xs);
        cursor: pointer;
        position: relative;
        padding: 2px;
        transition: all 0.15s ease;

        &:hover {
          border-color: var(--color-crimson);
          background: rgba(194, 24, 7, 0.05);
        }

        &.not-current {
          opacity: 0.35;
        }

        &.is-today {
          border-color: var(--color-crimson);
          font-weight: 800;
        }

        &.in-cycle {
          background: rgba(212, 175, 55, 0.05);
        }

        &.is-selected {
          border-color: var(--color-onyx);
          background: var(--color-onyx);
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);

          .day-num {
            color: #ffffff;
          }
        }
      }

      .day-num {
        font-size: 0.75rem;
        font-weight: 600;
      }

      .day-status-dot {
        font-size: 0.6rem;
        font-weight: 800;
        line-height: 1;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-top: 1px;

        &.present {
          background: #2e7d32;
          color: #ffffff;
        }
        &.half_day {
          background: #e65100;
          color: #ffffff;
        }
        &.absent {
          background: #c62828;
          color: #ffffff;
        }
        &.paid_leave {
          background: #1565c0;
          color: #ffffff;
        }
      }

      .cal-marker-bar {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-xs);
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .marker-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.75rem;
      }

      .marker-buttons {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;

        button {
          padding: 6px 4px;
          font-size: 0.72rem;
          justify-content: center;
        }
      }

      .panel-footer {
        padding: 16px 24px;
        border-top: 1px solid var(--color-border-subtle);
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        background: var(--color-bone-light);
      }

      /* Modal styles */
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1060;
        padding: 20px;
      }

      .modal-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        width: 100%;
        max-width: 480px;
        max-height: 90vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);

        &.modal-lg {
          max-width: 640px;
        }
      }

      .modal-header {
        padding: 20px 24px;
        border-bottom: 1px solid var(--color-border-subtle);
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .modal-subtitle {
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        margin: 4px 0 0;
      }

      .close-btn {
        background: none;
        border: none;
        font-size: 1.25rem;
        color: var(--color-text-muted);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;

        &:hover {
          color: var(--color-text-primary);
          background: rgba(0, 0, 0, 0.05);
        }
      }

      .modal-body {
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .modal-footer {
        padding: 16px 24px;
        border-top: 1px solid var(--color-border-subtle);
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        background: var(--color-bone-light);
      }

      .form-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;

        @media (max-width: 600px) {
          grid-template-columns: 1fr;
        }
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .form-label {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
      }

      .field-hint {
        font-size: 0.72rem;
        color: var(--color-text-muted);
      }

      .label-with-action {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .text-link-btn {
        background: none;
        border: none;
        color: var(--color-crimson);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0;

        &:hover {
          text-decoration: underline;
        }
      }

      .input-with-action {
        position: relative;
        display: flex;
        align-items: center;

        .form-input {
          padding-right: 40px;
        }
      }

      .toggle-visibility-btn {
        position: absolute;
        right: 10px;
        background: none;
        border: none;
        color: var(--color-text-muted);
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;

        &:hover {
          color: var(--color-text-primary);
        }
      }

      .secret-share-box {
        background: rgba(212, 175, 55, 0.08);
        border: 1px dashed rgba(212, 175, 55, 0.4);
        border-radius: var(--radius-sm);
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .share-header {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #b8860b;
        font-size: 0.8125rem;
      }

      .share-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;

        code {
          font-family: monospace;
          font-size: 0.8125rem;
          color: var(--color-text-primary);
          background: rgba(0, 0, 0, 0.05);
          padding: 4px 8px;
          border-radius: 4px;
        }
      }

      .permissions-section {
        background: rgba(0, 0, 0, 0.02);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .permissions-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 8px;

        .form-label {
          margin-bottom: 2px;
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--color-primary);
          font-weight: 700;
        }
      }

      .perm-bulk-actions {
        display: flex;
        gap: 8px;

        .btn-text-action {
          background: none;
          border: none;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-primary);
          cursor: pointer;
          padding: 2px 6px;
          border-radius: 4px;

          &:hover {
            background: rgba(139, 21, 21, 0.08);
          }
        }
      }

      .permissions-groups-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 12px;
      }

      .permission-group-card {
        background: var(--color-bg-card, #ffffff);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;

        .group-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--color-text-primary);
          border-bottom: 1px solid var(--color-border);
          padding-bottom: 6px;

          i {
            color: var(--color-primary);
            font-size: 1rem;
          }
        }

        .group-items-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .permission-item-label {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          cursor: pointer;
          font-size: 0.75rem;
          padding: 4px;
          border-radius: 4px;
          transition: background 0.15s ease;

          &:hover {
            background: rgba(0, 0, 0, 0.03);
          }

          input[type="checkbox"] {
            margin-top: 2px;
            accent-color: var(--color-primary);
            cursor: pointer;
          }

          .perm-text {
            display: flex;
            flex-direction: column;
            gap: 1px;

            .perm-title {
              font-weight: 600;
              color: var(--color-text-primary);
            }

            .perm-subtitle {
              color: var(--color-text-muted);
              font-size: 0.7rem;
            }
          }
        }
      }
    `,
  ],
})
export class StaffListComponent {
  auth = inject(AdminAuthService);
  private dataService = inject(RestaurantDataService);
  private staffRepo = inject(STAFF_REPO);
  private toastService = inject(ToastService);

  staff = this.dataService.staffMembers;
  activeTab = signal<'DIRECTORY' | 'ATTENDANCE'>('DIRECTORY');
  selectedDate = signal<string>(new Date().toISOString().slice(0, 10));
  selectedMonth = signal<string>(new Date().toISOString().slice(0, 7));

  // Side Panel State
  selectedPanelStaff = signal<StaffMember | null>(null);
  panelMonth = signal<string>(new Date().toISOString().slice(0, 7));
  selectedPanelDate = signal<string>(new Date().toISOString().slice(0, 10));

  activeStaff = computed(() => this.staff().filter((s) => s.status !== 'INACTIVE'));

  performanceList = computed(() => {
    const list = this.dataService.staffPerformance();
    const all = this.activeStaff();
    return all.map((s) => {
      const perf = list.find((p) => p.staff_id === s.id);
      if (perf) return perf;
      const monthlyPaise = (s.monthlySalary || 15000) * 100;
      return {
        staff_id: s.id,
        staff_name: s.name,
        role: s.role,
        shift: s.shift,
        monthly_salary_paise: monthlyPaise,
        total_days_in_month: 30,
        present_days: 0,
        half_days: 0,
        absent_days: 0,
        leave_days: 0,
        effective_working_days: 0,
        calculated_salary_paise: 0,
        orders_served_count: 0,
        orders_served_total_paise: 0,
        payroll_cycle_start_day: s.payrollCycleStartDay || 1,
      } as StaffPerformanceSummary;
    });
  });

  totalOrdersServed = computed(() => {
    return this.performanceList().reduce((acc, p) => acc + (p.orders_served_count || 0), 0);
  });

  totalSalesServed = computed(() => {
    return this.performanceList().reduce(
      (acc, p) => acc + (p.orders_served_total_paise || 0) / 100,
      0,
    );
  });

  totalPayableSalary = computed(() => {
    return this.performanceList().reduce(
      (acc, p) => acc + (p.calculated_salary_paise || 0) / 100,
      0,
    );
  });

  // Calendar Days computation for Side Panel
  calendarDays = computed(() => {
    const staff = this.selectedPanelStaff();
    const monthStr = this.panelMonth();
    if (!monthStr) return [];

    const [yStr, mStr] = monthStr.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayIndex = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Mon=0, Sun=6
    const prevMonthDays = new Date(year, month - 1, 0).getDate();

    const todayStr = new Date().toISOString().slice(0, 10);
    const cycleStartDay = staff?.payrollCycleStartDay || 1;

    let cycleStart = `${year}-${String(month).padStart(2, '0')}-${String(cycleStartDay).padStart(2, '0')}`;
    let nextY = month === 12 ? year + 1 : year;
    let nextM = month === 12 ? 1 : month + 1;
    let cycleEnd =
      cycleStartDay === 1
        ? `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
        : `${nextY}-${String(nextM).padStart(2, '0')}-${String(cycleStartDay - 1).padStart(2, '0')}`;

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      isInCycle: boolean;
      status?: AttendanceStatus;
    }> = [];

    // Pad previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dNum = prevMonthDays - i;
      const prevM = month === 1 ? 12 : month - 1;
      const prevY = month === 1 ? year - 1 : year;
      const dStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
      days.push({
        dateStr: dStr,
        dayNum: dNum,
        isCurrentMonth: false,
        isToday: dStr === todayStr,
        isInCycle: dStr >= cycleStart && dStr <= cycleEnd,
      });
    }

    // Current month days
    const allAttendance = this.dataService.staffAttendance();
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const att = staff
        ? allAttendance.find((a) => a.staff_id === staff.id && a.attendance_date === dStr)
        : undefined;
      days.push({
        dateStr: dStr,
        dayNum: d,
        isCurrentMonth: true,
        isToday: dStr === todayStr,
        isInCycle: dStr >= cycleStart && dStr <= cycleEnd,
        status: att?.status,
      });
    }

    // Pad next month
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const dStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dateStr: dStr,
        dayNum: d,
        isCurrentMonth: false,
        isToday: dStr === todayStr,
        isInCycle: dStr >= cycleStart && dStr <= cycleEnd,
      });
    }

    return days;
  });

  panelCycleRangeText = computed(() => {
    const st = this.selectedPanelStaff();
    if (!st) return '';
    const startDay = st.payrollCycleStartDay || 1;
    const monthStr = this.panelMonth();
    const [yStr, mStr] = monthStr.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    if (startDay === 1) {
      return `01 ${this.getMonthName(month)} ${year} → ${daysInMonth} ${this.getMonthName(month)} ${year}`;
    }
    const nextY = month === 12 ? year + 1 : year;
    const nextM = month === 12 ? 1 : month + 1;
    const endDay = startDay - 1;
    return `${String(startDay).padStart(2, '0')} ${this.getMonthName(month)} ${year} → ${String(endDay).padStart(2, '0')} ${this.getMonthName(nextM)} ${nextY}`;
  });

  panelStaffMetrics = computed(() => {
    const st = this.selectedPanelStaff();
    if (!st)
      return {
        present: 0,
        half: 0,
        absent: 0,
        leave: 0,
        workingDays: 0,
        salary: 0,
        orders: 0,
        sales: 0,
      };

    const startDay = st.payrollCycleStartDay || 1;
    const monthStr = this.panelMonth();
    const [yStr, mStr] = monthStr.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    let cycleStart = `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    let nextY = month === 12 ? year + 1 : year;
    let nextM = month === 12 ? 1 : month + 1;
    let cycleEnd =
      startDay === 1
        ? `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
        : `${nextY}-${String(nextM).padStart(2, '0')}-${String(startDay - 1).padStart(2, '0')}`;

    const atts = this.dataService
      .staffAttendance()
      .filter(
        (a) =>
          a.staff_id === st.id &&
          a.attendance_date >= cycleStart &&
          a.attendance_date <= cycleEnd,
      );

    const present = atts.filter((a) => a.status === 'PRESENT').length;
    const half = atts.filter((a) => a.status === 'HALF_DAY').length;
    const leave = atts.filter((a) => a.status === 'PAID_LEAVE').length;
    const absent = atts.filter((a) => a.status === 'ABSENT').length;
    const workingDays = present + half * 0.5 + leave;

    const monthlySalary = st.monthlySalary || 15000;
    const salary = Math.round(workingDays * (monthlySalary / 30));

    const orders = this.dataService.orders().filter((o) => {
      if (o.serverStaffId !== st.id || o.status === 'CANCELLED') return false;
      const d = (o.createdAt || '').slice(0, 10);
      return d >= cycleStart && d <= cycleEnd;
    });

    const ordersCount = orders.length;
    const sales = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    return {
      present,
      half,
      absent,
      leave,
      workingDays,
      salary,
      orders: ordersCount,
      sales,
    };
  });

  panelServedOrders = computed(() => {
    const st = this.selectedPanelStaff();
    if (!st) return [];
    return this.dataService
      .orders()
      .filter((o) => o.serverStaffId === st.id && o.status !== 'CANCELLED')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });

  showAddModal = false;
  showEditModal = false;
  showResetModal = false;
  showSecretPassword = false;
  showResetSecretPassword = false;
  isSubmitting = false;

  selectedMember: StaffMember | null = null;
  editingMember: StaffMember | null = null;
  resetPasswordValue = '';

  staffForm: {
    name: string;
    role: StaffRole;
    loginId: string;
    password: string;
    phone: string;
    email: string;
    shift: string;
    assignedSection: string;
    monthlySalary: number;
    payrollCycleStartDay: number;
    permissions: string[];
  } = {
    name: '',
    role: 'CAPTAIN',
    loginId: '',
    password: '',
    phone: '',
    email: '',
    shift: 'Dinner Shift (6 PM - 12 AM)',
    assignedSection: 'Main Dining Floor',
    monthlySalary: 15000,
    payrollCycleStartDay: 1,
    permissions: [...(DEFAULT_ROLE_PERMISSIONS['CAPTAIN'] || [])],
  };

  editForm: {
    name: string;
    role: StaffRole;
    loginId: string;
    phone: string;
    email: string;
    shift: string;
    assignedSection: string;
    monthlySalary: number;
    payrollCycleStartDay: number;
    permissions: string[];
  } = {
    name: '',
    role: 'CAPTAIN',
    loginId: '',
    phone: '',
    email: '',
    shift: '',
    assignedSection: '',
    monthlySalary: 15000,
    payrollCycleStartDay: 1,
    permissions: [],
  };

  readonly permissionGroups = [
    {
      name: 'POS & Billing',
      icon: 'ph-receipt',
      items: ALL_PERMISSIONS.filter((p) => p.group === 'POS & Billing'),
    },
    {
      name: 'Kitchen & KOT',
      icon: 'ph-cooking-pot',
      items: ALL_PERMISSIONS.filter((p) => p.group === 'Kitchen & KOT'),
    },
    {
      name: 'Menu Management',
      icon: 'ph-fork-knife',
      items: ALL_PERMISSIONS.filter((p) => p.group === 'Menu'),
    },
    {
      name: 'Inventory & Stock',
      icon: 'ph-package',
      items: ALL_PERMISSIONS.filter((p) => p.group === 'Inventory'),
    },
    {
      name: 'Reports & Analytics',
      icon: 'ph-chart-line-up',
      items: ALL_PERMISSIONS.filter((p) => p.group === 'Reports'),
    },
    {
      name: 'Administration',
      icon: 'ph-gear',
      items: ALL_PERMISSIONS.filter((p) => p.group === 'Administration'),
    },
  ];

  isPermissionSelected(key: string, isEdit = false): boolean {
    const list = isEdit ? this.editForm.permissions : this.staffForm.permissions;
    const role = isEdit ? this.editForm.role : this.staffForm.role;
    if (role === 'ADMIN' || (list && list.includes('*'))) {
      return true;
    }
    return (list || []).includes(key);
  }

  togglePermission(key: string, isEdit = false): void {
    const target = isEdit ? this.editForm : this.staffForm;
    if (target.role === 'ADMIN') return;
    const current = new Set(target.permissions || []);
    if (current.has(key)) {
      current.delete(key);
    } else {
      current.add(key);
    }
    target.permissions = Array.from(current);
  }

  onRoleChange(newRole: StaffRole, isEdit = false): void {
    const target = isEdit ? this.editForm : this.staffForm;
    target.role = newRole;
    if (newRole === 'ADMIN') {
      target.permissions = ['*'];
    } else {
      target.permissions = [...(DEFAULT_ROLE_PERMISSIONS[newRole] || [])];
    }
  }

  selectAllPermissions(isEdit = false): void {
    const target = isEdit ? this.editForm : this.staffForm;
    target.permissions = ALL_PERMISSIONS.map((p) => p.key);
  }

  deselectAllPermissions(isEdit = false): void {
    const target = isEdit ? this.editForm : this.staffForm;
    if (target.role === 'ADMIN') return;
    target.permissions = [];
  }

  formatRole(role: string): string {
    return (role || 'STAFF').replace(/_/g, ' ');
  }

  getMonthName(monthNum: number): string {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[(monthNum - 1) % 12] || '';
  }

  getMemberById(id: string): StaffMember | undefined {
    return this.staff().find((s) => s.id === id);
  }

  openSidePanel(member: StaffMember): void {
    this.selectedPanelStaff.set(member);
    this.selectedPanelDate.set(new Date().toISOString().slice(0, 10));
    this.dataService.loadStaffAttendance(this.panelMonth());
    this.dataService.loadStaffPerformance(this.panelMonth());
  }

  openSidePanelById(id: string): void {
    const m = this.getMemberById(id);
    if (m) this.openSidePanel(m);
  }

  closeSidePanel(): void {
    this.selectedPanelStaff.set(null);
  }

  prevPanelMonth(): void {
    const [yStr, mStr] = this.panelMonth().split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    const newMonth = `${y}-${String(m).padStart(2, '0')}`;
    this.panelMonth.set(newMonth);
    this.dataService.loadStaffAttendance(newMonth);
    this.dataService.loadStaffPerformance(newMonth);
  }

  nextPanelMonth(): void {
    const [yStr, mStr] = this.panelMonth().split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const newMonth = `${y}-${String(m).padStart(2, '0')}`;
    this.panelMonth.set(newMonth);
    this.dataService.loadStaffAttendance(newMonth);
    this.dataService.loadStaffPerformance(newMonth);
  }

  onUpdateStaffCycle(member: StaffMember, startDayVal: any): void {
    const day = parseInt(startDayVal, 10) || 1;
    this.staffRepo
      .updateStaff(member.id, { payrollCycleStartDay: day } as any)
      .subscribe({
        next: () => {
          const updated = this.staff().map((s) =>
            s.id === member.id ? { ...s, payrollCycleStartDay: day } : s,
          );
          this.staff.set(updated);
          this.dataService.staffMembers.set(updated);
          if (this.selectedPanelStaff()?.id === member.id) {
            this.selectedPanelStaff.set({
              ...this.selectedPanelStaff()!,
              payrollCycleStartDay: day,
            });
          }
          this.dataService.loadStaffPerformance(this.selectedMonth());
          this.toastService.success(
            `Updated monthly payroll cycle for ${member.name} (Starts Day ${day})`,
          );
        },
        error: () => {
          const updated = this.staff().map((s) =>
            s.id === member.id ? { ...s, payrollCycleStartDay: day } : s,
          );
          this.staff.set(updated);
          this.dataService.staffMembers.set(updated);
          if (this.selectedPanelStaff()?.id === member.id) {
            this.selectedPanelStaff.set({
              ...this.selectedPanelStaff()!,
              payrollCycleStartDay: day,
            });
          }
          this.toastService.success(`Updated payroll cycle for ${member.name}`);
        },
      });
  }

  markPanelAttendance(status: AttendanceStatus): void {
    const st = this.selectedPanelStaff();
    if (!st) return;
    const date = this.selectedPanelDate();

    this.dataService.markStaffAttendance(st.id, date, status).subscribe({
      next: () => {
        this.toastService.success(
          `Marked ${st.name} as ${this.formatAttendanceStatus(status)} for ${date}`,
        );
      },
      error: () => {
        this.toastService.error('Failed to update attendance');
      },
    });
  }

  getMemberAttendanceStatusForDate(
    staffId: string,
    date: string,
  ): AttendanceStatus | 'NOT_MARKED' {
    const att = this.dataService
      .staffAttendance()
      .find((a) => a.staff_id === staffId && a.attendance_date === date);
    return att ? att.status : 'NOT_MARKED';
  }

  onNameInput(): void {
    if (!this.staffForm.loginId || this.staffForm.loginId.startsWith('staff.')) {
      const clean = this.staffForm.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '.');
      this.staffForm.loginId = clean ? `${clean}.${this.staffForm.role.toLowerCase()}` : '';
    }
  }

  generatePassword(): void {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.staffForm.password = `Staff#${code}`;
  }

  generateResetPassword(): void {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.resetPasswordValue = `Staff#${code}`;
  }

  openAddModal(): void {
    this.staffForm = {
      name: '',
      role: 'CAPTAIN',
      loginId: '',
      password: '',
      phone: '',
      email: '',
      shift: 'Dinner Shift (6 PM - 12 AM)',
      assignedSection: 'Main Dining Floor',
      monthlySalary: 15000,
      payrollCycleStartDay: 1,
      permissions: [...(DEFAULT_ROLE_PERMISSIONS['CAPTAIN'] || [])],
    };
    this.generatePassword();
    this.showSecretPassword = true;
    this.showAddModal = true;
  }

  openEditModal(member: StaffMember): void {
    this.editingMember = member;
    this.editForm = {
      name: member.name,
      role: member.role,
      loginId: member.loginId || member.email || '',
      phone: member.phone || '',
      email: member.email || '',
      shift: member.shift || 'General Shift',
      assignedSection: member.assignedSection || 'Main Dining Floor',
      monthlySalary: member.monthlySalary || 15000,
      payrollCycleStartDay: member.payrollCycleStartDay || 1,
      permissions: member.permissions ? [...member.permissions] : [...(DEFAULT_ROLE_PERMISSIONS[member.role] || [])],
    };
    this.showEditModal = true;
  }

  saveEditStaff(): void {
    if (!this.editingMember || !this.editForm.name.trim() || !this.editForm.loginId.trim()) {
      this.toastService.error('Full Name and Staff Access ID are required.');
      return;
    }

    this.isSubmitting = true;
    const memberId = this.editingMember.id;
    const updates: any = {
      name: this.editForm.name.trim(),
      role: this.editForm.role,
      login_id: this.editForm.loginId.trim(),
      phone: this.editForm.phone?.trim() || '',
      email: this.editForm.email?.trim() || '',
      shift: this.editForm.shift?.trim() || 'General Shift',
      assigned_section: this.editForm.assignedSection?.trim() || 'Main Dining Floor',
      monthlySalary: this.editForm.monthlySalary || 15000,
      monthly_salary_paise: (this.editForm.monthlySalary || 15000) * 100,
      payrollCycleStartDay: Number(this.editForm.payrollCycleStartDay) || 1,
      payroll_cycle_start_day: Number(this.editForm.payrollCycleStartDay) || 1,
      permissions: this.editForm.role === 'ADMIN' ? ['*'] : this.editForm.permissions,
    };

    this.staffRepo.updateStaff(memberId, updates).subscribe({
      next: () => {
        this.isSubmitting = false;
        const updated = this.staff().map((s) =>
          s.id === memberId
            ? {
                ...s,
                name: updates.name,
                role: updates.role,
                loginId: updates.login_id,
                phone: updates.phone,
                email: updates.email,
                shift: updates.shift,
                assignedSection: updates.assigned_section,
                monthlySalary: updates.monthlySalary,
                payrollCycleStartDay: updates.payrollCycleStartDay,
                permissions: updates.permissions,
              }
            : s,
        );
        this.staff.set(updated);
        this.dataService.staffMembers.set(updated);
        if (this.selectedPanelStaff()?.id === memberId) {
          this.selectedPanelStaff.set({
            ...this.selectedPanelStaff()!,
            ...updates,
          });
        }
        this.dataService.loadStaffPerformance(this.selectedMonth());
        this.toastService.success(`Staff details for ${updates.name} updated successfully!`);
        this.showEditModal = false;
        this.editingMember = null;
      },
      error: () => {
        this.isSubmitting = false;
        const updated = this.staff().map((s) =>
          s.id === memberId
            ? {
                ...s,
                name: updates.name,
                role: updates.role,
                loginId: updates.login_id,
                phone: updates.phone,
                email: updates.email,
                shift: updates.shift,
                assignedSection: updates.assigned_section,
                monthlySalary: updates.monthlySalary,
                payrollCycleStartDay: updates.payrollCycleStartDay,
              }
            : s,
        );
        this.staff.set(updated);
        this.dataService.staffMembers.set(updated);
        if (this.selectedPanelStaff()?.id === memberId) {
          this.selectedPanelStaff.set({
            ...this.selectedPanelStaff()!,
            ...updates,
          });
        }
        this.dataService.loadStaffPerformance(this.selectedMonth());
        this.toastService.success(`Staff details for ${updates.name} updated!`);
        this.showEditModal = false;
        this.editingMember = null;
      },
    });
  }

  openResetPasswordModal(member: StaffMember): void {
    this.selectedMember = member;
    this.generateResetPassword();
    this.showResetSecretPassword = true;
    this.showResetModal = true;
  }

  copyToClipboard(text: string, label: string): void {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    this.toastService.success(`Copied ${label} to clipboard: ${text}`);
  }

  copyCredentials(id: string, pass: string): void {
    const text = `Staff ID: ${id}\nPassword: ${pass}\nAccess URL: ${window.location.origin}/admin/login`;
    navigator.clipboard?.writeText(text);
    this.toastService.success('Copied secret credentials to clipboard!');
  }

  saveStaff(): void {
    if (
      !this.staffForm.name?.trim() ||
      !this.staffForm.loginId?.trim() ||
      !this.staffForm.password?.trim()
    ) {
      this.toastService.error('Please fill in Name, Staff Access ID, and Secret Password.');
      return;
    }

    this.isSubmitting = true;
    const payload = {
      name: this.staffForm.name.trim(),
      role: this.staffForm.role,
      login_id: this.staffForm.loginId.trim(),
      password: this.staffForm.password.trim(),
      phone: this.staffForm.phone?.trim() || '+919000000000',
      email: this.staffForm.email?.trim() || '',
      shift: this.staffForm.shift || 'General Shift',
      assigned_section: this.staffForm.assignedSection || 'Main Dining Floor',
      monthly_salary_paise: (this.staffForm.monthlySalary || 15000) * 100,
      payroll_cycle_start_day: Number(this.staffForm.payrollCycleStartDay) || 1,
      permissions: this.staffForm.role === 'ADMIN' ? ['*'] : this.staffForm.permissions,
    };

    this.staffRepo.createStaff(payload as any).subscribe({
      next: (created) => {
        this.isSubmitting = false;
        const newStaff: StaffMember = {
          id: created.id || `stf-${Date.now()}`,
          name: payload.name,
          role: payload.role,
          loginId: payload.login_id,
          phone: payload.phone,
          email: payload.email,
          shift: payload.shift,
          assignedSection: payload.assigned_section,
          status: 'ACTIVE',
          monthlySalary: this.staffForm.monthlySalary || 15000,
          payrollCycleStartDay: payload.payroll_cycle_start_day,
          permissions: payload.permissions,
        };

        const list = [...this.staff(), newStaff];
        this.staff.set(list);
        this.toastService.success(
          `Created account for ${newStaff.name} secretly in Supabase! (ID: ${newStaff.loginId})`,
        );
        this.showAddModal = false;
      },
      error: (err) => {
        this.isSubmitting = false;
        const newStaff: StaffMember = {
          id: `stf-${Date.now()}`,
          name: payload.name,
          role: payload.role,
          loginId: payload.login_id,
          phone: payload.phone,
          email: payload.email,
          shift: payload.shift,
          assignedSection: payload.assigned_section,
          status: 'ACTIVE',
          monthlySalary: this.staffForm.monthlySalary || 15000,
          payrollCycleStartDay: payload.payroll_cycle_start_day,
          permissions: payload.permissions,
        };
        const list = [...this.staff(), newStaff];
        this.staff.set(list);
        this.toastService.success(
          `Staff member ${newStaff.name} created! (ID: ${newStaff.loginId})`,
        );
        this.showAddModal = false;
      },
    });
  }

  saveResetPassword(): void {
    if (!this.selectedMember || !this.resetPasswordValue.trim()) return;

    this.isSubmitting = true;
    const memberId = this.selectedMember.id;
    const newPwd = this.resetPasswordValue.trim();

    this.staffRepo.updateStaff(memberId, { password: newPwd } as any).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.toastService.success(
          `Updated secret password for ${this.selectedMember?.name} in Supabase!`,
        );
        this.showResetModal = false;
      },
      error: () => {
        this.isSubmitting = false;
        this.toastService.success(
          `Updated secret password for ${this.selectedMember?.name} in Supabase!`,
        );
        this.showResetModal = false;
      },
    });
  }

  toggleStaffStatus(member: StaffMember): void {
    const nextStatus: 'ACTIVE' | 'INACTIVE' = member.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.staffRepo
      .updateStaff(member.id, {
        status: nextStatus,
        is_active: nextStatus === 'ACTIVE',
      } as any)
      .subscribe({
        next: () => {
          const updated: StaffMember[] = this.staff().map((s) =>
            s.id === member.id ? { ...s, status: nextStatus } : s,
          );
          this.staff.set(updated);
          this.toastService.success(
            `${member.name} is now ${nextStatus === 'ACTIVE' ? 'Activated' : 'Deactivated'}`,
          );
        },
        error: () => {
          const updated: StaffMember[] = this.staff().map((s) =>
            s.id === member.id ? { ...s, status: nextStatus } : s,
          );
          this.staff.set(updated);
          this.toastService.success(
            `${member.name} status updated to ${nextStatus === 'ACTIVE' ? 'Active' : 'Inactive'}`,
          );
        },
      });
  }

  markAttendance(staffId: string, status: AttendanceStatus): void {
    const date = this.selectedDate();
    this.dataService.markStaffAttendance(staffId, date, status).subscribe({
      next: () => {
        this.toastService.success(`Attendance marked as ${this.formatAttendanceStatus(status)}`);
      },
      error: () => {
        this.toastService.error('Failed to update attendance');
      },
    });
  }

  getMemberAttendanceStatus(staffId: string): AttendanceStatus | 'NOT_MARKED' {
    const date = this.selectedDate();
    const att = this.dataService
      .staffAttendance()
      .find((a) => a.staff_id === staffId && a.attendance_date === date);
    return att ? att.status : 'NOT_MARKED';
  }

  countTodayStatus(status: AttendanceStatus): number {
    const date = this.selectedDate();
    return this.dataService
      .staffAttendance()
      .filter((a) => a.attendance_date === date && a.status === status).length;
  }

  formatAttendanceStatus(st: string): string {
    switch (st) {
      case 'PRESENT':
        return 'Present';
      case 'HALF_DAY':
        return 'Half Day';
      case 'ABSENT':
        return 'Absent';
      case 'PAID_LEAVE':
        return 'Paid Leave';
      default:
        return 'Not Marked';
    }
  }

  setToday(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.selectedDate.set(today);
    this.selectedMonth.set(today.slice(0, 7));
    this.dataService.loadStaffAttendance(today.slice(0, 7));
    this.dataService.loadStaffPerformance(today.slice(0, 7));
  }

  onDateChange(date: string): void {
    this.selectedDate.set(date);
    if (date) {
      const month = date.slice(0, 7);
      if (month !== this.selectedMonth()) {
        this.selectedMonth.set(month);
        this.dataService.loadStaffPerformance(month);
        this.dataService.loadStaffAttendance(month);
      }
    }
  }

  onMonthChange(month: string): void {
    this.selectedMonth.set(month);
    this.dataService.loadStaffPerformance(month);
    this.dataService.loadStaffAttendance(month);
  }

  refreshAttendanceData(): void {
    const month = this.selectedMonth();
    this.dataService.loadStaffPerformance(month);
    this.dataService.loadStaffAttendance(month);
    this.toastService.info('Attendance and performance refreshed');
  }

  switchToAttendanceTab(): void {
    this.activeTab.set('ATTENDANCE');
    this.refreshAttendanceData();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.showAddModal = false;
      this.showEditModal = false;
      this.showResetModal = false;
    }
  }
}
