import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { Reservation, ReservationStatus } from '../../../core/models/reservation.model';
import { Table } from '../../../core/models/table.model';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { SkeletonLoaderComponent } from '../../../shared/components/loading/skeleton-loader.component';
import { LoadingButtonDirective } from '../../../shared/components/loading/loading-button.directive';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-reservation-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    StatusBadgeComponent,
    SkeletonLoaderComponent,
    LoadingButtonDirective,
    EmptyStateComponent,
  ],
  template: `
    <div class="reservations-page">
      <div class="page-header">
        <div>
          <h1 class="heading-display">Table Bookings & Reservations</h1>
          <p class="text-muted">
            Manage guest dinner reservations, VIP seating requests, and floor allocations.
          </p>
        </div>

        <button class="btn btn-primary" (click)="openAddModal()">
          <i class="ph ph-calendar-plus"></i>
          <span>New Reservation</span>
        </button>
      </div>

      <div class="toolbar-card">
        <div class="status-tabs">
          <button
            class="tab-btn"
            [class.active]="selectedStatus() === 'PENDING'"
            (click)="selectedStatus.set('PENDING')"
          >
            <span>Pending Requests</span>
            @if (pendingCount() > 0) {
              <span class="tab-badge-pill tab-badge-warning">{{ pendingCount() }}</span>
            }
          </button>
          <button
            class="tab-btn"
            [class.active]="selectedStatus() === 'CONFIRMED'"
            (click)="selectedStatus.set('CONFIRMED')"
          >
            <span>Confirmed</span>
            @if (confirmedCount() > 0) {
              <span class="tab-badge-pill tab-badge-neutral">{{ confirmedCount() }}</span>
            }
          </button>
          <button
            class="tab-btn"
            [class.active]="selectedStatus() === 'SEATED'"
            (click)="selectedStatus.set('SEATED')"
          >
            Seated
          </button>
          <button
            class="tab-btn"
            [class.active]="selectedStatus() === 'CANCELLED'"
            (click)="selectedStatus.set('CANCELLED')"
          >
            Cancelled
          </button>
          <button
            class="tab-btn"
            [class.active]="selectedStatus() === 'COMPLETED'"
            (click)="selectedStatus.set('COMPLETED')"
          >
            Completed
          </button>
          <button
            class="tab-btn"
            [class.active]="selectedStatus() === 'ALL'"
            (click)="selectedStatus.set('ALL')"
          >
            All Bookings ({{ reservations().length }})
          </button>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Guest Details</th>
              <th>Date & Time</th>
              <th>Party Size</th>
              <th>Table & Section</th>
              <th>Special Requests</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @if (isLoading()) {
              <tr>
                <td colspan="7" style="padding: 0;">
                  <app-skeleton variant="reservation-row" [count]="5" />
                </td>
              </tr>
            } @else {
              @for (res of filteredReservations(); track res.id) {
                <tr>
                  <td>
                    <strong>{{ res.customerName }}</strong>
                    <div class="text-xs text-muted">{{ res.customerPhone }}</div>
                  </td>
                  <td>
                    <div
                      class="reservation-datetime"
                      style="display: flex; flex-direction: column; gap: 2px;"
                    >
                      <span
                        style="font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"
                      >
                        <i class="ph ph-calendar" style="color: var(--color-primary, #ea580c);"></i>
                        {{ res.reservationTime || res.reservationDate | date: 'mediumDate' }}
                      </span>
                      <span
                        class="text-xs text-muted"
                        style="display: inline-flex; align-items: center; gap: 4px;"
                      >
                        <i class="ph ph-clock"></i>
                        {{ res.reservationTime || res.reservationDate | date: 'shortTime' }}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span class="badge badge-outline"
                      ><i class="ph ph-users"></i> {{ res.partySize }} Guests</span
                    >
                  </td>
                  <td>
                    <strong>{{ res.tableNumber || 'Auto Assign' }}</strong>
                    <div class="text-xs text-muted">{{ res.section || 'Main Dining' }}</div>
                  </td>
                  <td>
                    <span class="text-sm text-secondary">{{ res.specialRequests || 'None' }}</span>
                  </td>
                  <td><app-status-badge [status]="res.status"></app-status-badge></td>
                  <td>
                    <div class="actions-cell">
                      @if (res.status === 'PENDING') {
                        <button
                          class="btn btn-primary btn-sm btn-approve-tactile"
                          (click)="openAllocateModal(res)"
                          title="Review, allocate table, and confirm"
                        >
                          <i class="ph ph-check-circle"></i>
                          <span>Approve & Allocate</span>
                        </button>
                        <button
                          class="btn btn-secondary btn-sm btn-decline-tactile"
                          (click)="openCancelModal(res)"
                          title="Reject reservation request"
                        >
                          <i class="ph ph-x"></i>
                          <span>Decline</span>
                        </button>
                      } @else if (res.status === 'CONFIRMED') {
                        <button
                          class="btn btn-secondary btn-sm"
                          (click)="updateStatus(res, 'SEATED')"
                        >
                          Seat Guest
                        </button>
                        <button
                          class="btn btn-ghost-danger btn-sm"
                          (click)="openCancelModal(res)"
                          title="Cancel reservation"
                        >
                          Cancel
                        </button>
                      } @else if (res.status === 'SEATED') {
                        <button
                          class="btn btn-secondary btn-sm"
                          (click)="updateStatus(res, 'COMPLETED')"
                        >
                          Complete
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7" style="padding: 0;">
                    <app-empty-state
                      icon="ph-calendar-x"
                      title="No Reservations Found"
                      message="No table bookings found matching your selected status filter."
                      actionText="New Reservation"
                      actionIcon="ph-calendar-plus"
                      (actionClick)="openAddModal()"
                      [bordered]="false"
                    />
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>

      <!-- Add Reservation Modal -->
      @if (showAddModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card">Create Guest Reservation</h3>
              <button class="close-btn" (click)="showAddModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Customer Name *</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. Shalini Roy"
                    [(ngModel)]="resForm.customerName"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Phone Number *</label>
                  <input
                    type="tel"
                    class="form-input"
                    placeholder="+91 98000 11223"
                    [(ngModel)]="resForm.customerPhone"
                  />
                </div>
              </div>
              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Reservation Date *</label>
                  <input
                    type="date"
                    class="form-input"
                    [min]="minDate"
                    [(ngModel)]="resDate"
                    required
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Reservation Time *</label>
                  <input type="time" class="form-input" [(ngModel)]="resTime" required />
                </div>
              </div>
              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Party Size</label>
                  <input
                    type="number"
                    class="form-input"
                    min="1"
                    max="20"
                    [(ngModel)]="resForm.partySize"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Assign Table</label>
                  <select class="form-select" [(ngModel)]="resForm.tableNumber">
                    @for (t of tables(); track t.id) {
                      <option [value]="t.number">
                        {{ t.number }} ({{ t.section }} - {{ t.capacity }} seats)
                      </option>
                    }
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Special Requests / Occasion</label>
                <textarea
                  class="form-textarea"
                  rows="2"
                  placeholder="e.g. Window booth, birthday cake..."
                  [(ngModel)]="resForm.specialRequests"
                ></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showAddModal = false">Cancel</button>
              <button
                class="btn btn-primary"
                [appLoadingButton]="isSaving()"
                loadingText="Confirming..."
                (click)="saveReservation()"
                [disabled]="
                  isSaving() ||
                  !resForm.customerName?.trim() ||
                  !resForm.customerPhone?.trim() ||
                  !resDate ||
                  !resTime
                "
              >
                Confirm Reservation
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Approve & Allocate Table Modal (Apple-design fluid sheet) -->
      @if (showAllocateModal && allocatingReservation; as res) {
        <div class="modal-overlay" (click)="onBackdropClick($event, 'allocate')">
          <div class="modal-card allocate-modal-card" role="dialog" aria-modal="true">
            <div class="modal-header allocate-modal-header">
              <div>
                <h3 class="heading-card">Approve & Allocate Table</h3>
                <p class="text-xs text-muted">Confirm guest reservation and send live WhatsApp notification.</p>
              </div>
              <button class="close-btn" (click)="showAllocateModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body space-y-4">
              <!-- Guest Details Banner -->
              <div class="guest-preview-box">
                <div class="guest-preview-row">
                  <span class="text-muted">Guest:</span>
                  <strong>{{ res.customerName }} ({{ res.customerPhone }})</strong>
                </div>
                <div class="guest-preview-row">
                  <span class="text-muted">Party Size:</span>
                  <span class="badge badge-outline"><i class="ph ph-users"></i> {{ res.partySize }} Guests</span>
                </div>
                <div class="guest-preview-row">
                  <span class="text-muted">Requested Slot:</span>
                  <strong style="color: var(--color-primary, #ea580c);">
                    <i class="ph ph-calendar"></i> {{ res.reservationTime || res.reservationDate | date: 'mediumDate' }} at {{ res.reservationTime || res.reservationDate | date: 'shortTime' }}
                  </strong>
                </div>
                @if (res.specialRequests) {
                  <div class="guest-preview-row">
                    <span class="text-muted">Special Requests:</span>
                    <span>{{ res.specialRequests }}</span>
                  </div>
                }
              </div>

              <!-- Table Allocation Selector -->
              <div class="form-group">
                <label class="form-label" style="font-weight: 700;">Select Table to Allocate *</label>
                <select class="form-select" [ngModel]="selectedAllocateTableId()" (ngModelChange)="selectedAllocateTableId.set($event)">
                  @for (t of tables(); track t.id) {
                    <option [value]="t.id">
                      {{ t.number }} — {{ t.section }} ({{ t.capacity }} seats) [{{ t.status }}]
                    </option>
                  }
                </select>
                @if (getSelectedTable(); as sel) {
                  @if (sel.capacity < res.partySize) {
                    <div class="warning-callout">
                      <i class="ph ph-warning"></i>
                      <span>Selected table capacity ({{ sel.capacity }}) is less than party size ({{ res.partySize }}).</span>
                    </div>
                  }
                }
              </div>

              <!-- WhatsApp Notification Banner -->
              <div class="wa-preview-card">
                <div class="wa-preview-icon">
                  <i class="ph-fill ph-whatsapp-logo"></i>
                </div>
                <div class="wa-preview-text">
                  <span class="wa-title">Automated WhatsApp Confirmation</span>
                  <p class="wa-desc">
                    Customer will immediately receive confirmation details with Date, Time, and Table <strong>{{ getSelectedTable()?.number || 'Selected' }}</strong> at <strong>{{ res.customerPhone }}</strong>.
                  </p>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showAllocateModal = false">Dismiss</button>
              <button
                class="btn btn-approve-tactile"
                [appLoadingButton]="isSaving()"
                loadingText="Allocating..."
                (click)="confirmAllocation()"
                [disabled]="isSaving() || !selectedAllocateTableId()"
              >
                <i class="ph ph-check-circle"></i>
                <span>Confirm & Send WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Decline / Cancel Confirmation Modal -->
      @if (showCancelModal && cancellingReservation; as res) {
        <div class="modal-overlay" (click)="onBackdropClick($event, 'cancel')">
          <div class="modal-card cancel-modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card" style="color: #dc2626;">Decline / Cancel Reservation</h3>
              <button class="close-btn" (click)="showCancelModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body space-y-3">
              <p style="font-size: 0.875rem;">
                Are you sure you want to decline or cancel the reservation for <strong>{{ res.customerName }}</strong> ({{ res.partySize }} guests)?
              </p>
              <div class="cancel-wa-card">
                <i class="ph ph-whatsapp-logo" style="color: #ea580c; font-size: 1.25rem;"></i>
                <span class="text-xs">
                  An automatic WhatsApp message will be sent to <strong>{{ res.customerPhone }}</strong> politely informing them that the table could not be accommodated.
                </span>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showCancelModal = false">Keep Reservation</button>
              <button
                class="btn btn-danger"
                [appLoadingButton]="isSaving()"
                loadingText="Cancelling..."
                (click)="confirmCancel()"
                [disabled]="isSaving()"
              >
                Decline & Notify
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .reservations-page {
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
      .toolbar-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 14px 20px;
      }
      .status-tabs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .tab-btn {
        padding: 8px 14px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        border-radius: var(--radius-sm);
        transition: all var(--transition-fast);
        display: inline-flex;
        align-items: center;
        gap: 4px;
        &:hover {
          background: var(--color-bone-light);
        }
        &.active {
          background: var(--color-onyx);
          color: #ffffff;
        }
      }
      .tab-badge-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 1px 7px;
        font-size: 0.6875rem;
        font-weight: 700;
        border-radius: 9999px;
        line-height: 1.2;
      }
      .tab-badge-warning {
        background: #f59e0b;
        color: #ffffff;
      }
      .tab-badge-neutral {
        background: var(--color-bone-dark, #e2e8f0);
        color: var(--color-onyx, #0f172a);
      }
      .tab-btn.active .tab-badge-warning {
        background: #ea580c;
        color: #ffffff;
      }
      .tab-btn.active .tab-badge-neutral {
        background: rgba(255, 255, 255, 0.25);
        color: #ffffff;
      }
      .actions-cell {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .btn-approve-tactile {
        background: #059669;
        color: #ffffff;
        border: none;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-weight: 600;
        &:hover {
          background: #047857;
        }
        &:active {
          transform: scale(0.96);
        }
      }
      .btn-decline-tactile {
        color: #dc2626;
        border: 1px solid #fecaca;
        background: #fff;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        &:hover {
          background: #fef2f2;
          color: #b91c1c;
        }
        &:active {
          transform: scale(0.96);
        }
      }
      .btn-ghost-danger {
        background: transparent;
        color: var(--color-danger, #dc2626);
        border: 1px solid transparent;
        &:hover {
          background: #fef2f2;
          border-color: #fecaca;
        }
      }
      .allocate-modal-card {
        max-width: 520px;
        width: 100%;
        border-radius: var(--radius-lg, 18px);
        overflow: hidden;
      }
      .cancel-modal-card {
        max-width: 440px;
        width: 100%;
        border-radius: var(--radius-lg, 18px);
        overflow: hidden;
      }
      .guest-preview-box {
        background: var(--color-bone-light, #f8fafc);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 12px);
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .guest-preview-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.8125rem;
      }
      .wa-preview-card {
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        border-radius: var(--radius-md, 12px);
        padding: 12px 14px;
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }
      .wa-preview-icon {
        color: #059669;
        font-size: 1.5rem;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .wa-title {
        font-weight: 700;
        font-size: 0.8125rem;
        color: #065f46;
        display: block;
      }
      .wa-desc {
        font-size: 0.75rem;
        color: #047857;
        margin: 2px 0 0;
        line-height: 1.4;
      }
      .cancel-wa-card {
        background: #fff7ed;
        border: 1px solid #ffedd5;
        border-radius: var(--radius-md, 12px);
        padding: 10px 12px;
        display: flex;
        gap: 10px;
        align-items: center;
      }
      .warning-callout {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 6px;
        font-size: 0.75rem;
        color: #d97706;
      }
      .form-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .space-y-4 > * + * {
        margin-top: 16px;
      }
      .space-y-3 > * + * {
        margin-top: 12px;
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
    `,
  ],
})
export class ReservationListComponent {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);

  constructor() {
    this.dataService.loadReservations();
  }

  readonly isLoading = computed(
    () => this.dataService.isReservationsLoading() || !this.dataService.reservationsLoaded(),
  );
  readonly isSaving = signal<boolean>(false);

  reservations = this.mock.reservations;
  tables = this.mock.tables;
  selectedStatus = signal<string>('PENDING');

  readonly pendingCount = computed(
    () => this.reservations().filter((r) => r.status === 'PENDING').length,
  );
  readonly confirmedCount = computed(
    () => this.reservations().filter((r) => r.status === 'CONFIRMED').length,
  );

  showAddModal = false;
  resForm: Partial<Reservation> = {};
  resDate = '';
  resTime = '';

  // Allocate table modal state
  showAllocateModal = false;
  allocatingReservation: Reservation | null = null;
  selectedAllocateTableId = signal<string>('');

  // Cancel confirmation modal state
  showCancelModal = false;
  cancellingReservation: Reservation | null = null;

  get minDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  filteredReservations = computed(() => {
    if (this.selectedStatus() === 'ALL') return this.reservations();
    return this.reservations().filter((r) => r.status === this.selectedStatus());
  });

  updateStatus(res: Reservation, status: ReservationStatus): void {
    // 1. Update reservation status and persist to backend
    this.dataService.updateReservationStatus(res.id, status);

    // 2. Seating updates table occupancy consistently
    if (status === 'SEATED') {
      const targetTable = this.mock.tables().find((t) => t.number === res.tableNumber);
      if (targetTable) {
        this.dataService.updateTableStatus(targetTable.id, 'OCCUPIED');
      }
    } else if (status === 'CANCELLED' || status === 'COMPLETED') {
      // Safe release: only mark available if no active order or other seated reservation occupies the table
      const targetTable = this.mock.tables().find((t) => t.number === res.tableNumber);
      if (targetTable && targetTable.status === 'OCCUPIED') {
        const hasActiveOrder = this.mock
          .orders()
          .some(
            (o) =>
              (o.tableNumber === targetTable.number || o.tableId === targetTable.id) &&
              o.status !== 'COMPLETED' &&
              o.status !== 'CANCELLED',
          );
        const hasOtherSeated = this.mock
          .reservations()
          .some(
            (r) => r.id !== res.id && r.tableNumber === targetTable.number && r.status === 'SEATED',
          );
        if (!hasActiveOrder && !hasOtherSeated) {
          this.dataService.updateTableStatus(targetTable.id, 'AVAILABLE');
        }
      }
    }

    this.toastService.success(`Reservation status updated to ${status}`);
  }

  openAddModal(): void {
    this.isSaving.set(false);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const nextHour = String((now.getHours() + 1) % 24).padStart(2, '0');

    this.resForm = {
      customerName: '',
      customerPhone: '',
      partySize: 2,
      tableNumber: this.tables()[0]?.number || 'T-01',
      specialRequests: '',
    };
    this.resDate = `${year}-${month}-${day}`;
    this.resTime = `${nextHour}:00`;
    this.showAddModal = true;
  }

  saveReservation(): void {
    if (this.isSaving()) return;
    if (
      !this.resForm.customerName?.trim() ||
      !this.resForm.customerPhone?.trim() ||
      !this.resDate ||
      !this.resTime
    ) {
      this.toastService.warning('Please fill in all required reservation fields.');
      return;
    }

    if (this.resDate < this.minDate) {
      this.toastService.warning('Reservation date cannot be before today.');
      return;
    }

    const isoDateTime = new Date(`${this.resDate}T${this.resTime}:00`).toISOString();
    if (isNaN(new Date(isoDateTime).getTime())) {
      this.toastService.warning('Invalid reservation date or time.');
      return;
    }

    const targetTable = this.mock.tables().find((t) => t.number === this.resForm.tableNumber);
    if (!targetTable) {
      this.toastService.warning('Selected table does not exist.');
      return;
    }

    // Double booking guard for matching time slot on the same table
    const hasConflict = this.mock
      .reservations()
      .some(
        (r) =>
          r.tableNumber === targetTable.number &&
          (r.status === 'CONFIRMED' || r.status === 'SEATED') &&
          new Date(r.reservationDate).getTime() === new Date(isoDateTime).getTime(),
      );
    if (hasConflict) {
      this.toastService.warning(
        `Table ${targetTable.number} already has a confirmed reservation at that time.`,
      );
      return;
    }

    this.isSaving.set(true);
    try {
      this.mock.createReservation({
        customerName: this.resForm.customerName.trim(),
        customerPhone: this.resForm.customerPhone.trim(),
        partySize: Number(this.resForm.partySize) || 2,
        tableId: targetTable.id,
        tableNumber: targetTable.number,
        reservationTime: isoDateTime,
        reservationDate: isoDateTime,
        specialRequests: this.resForm.specialRequests || '',
        status: 'CONFIRMED',
      });

      this.toastService.success(`Reservation confirmed for ${this.resForm.customerName.trim()}`);
      this.showAddModal = false;
    } finally {
      this.isSaving.set(false);
    }
  }

  openAllocateModal(res: Reservation): void {
    this.allocatingReservation = res;
    // Find matching table: capacity >= partySize and status AVAILABLE
    const matching =
      this.tables().find(
        (t) => t.capacity >= res.partySize && t.status === 'AVAILABLE',
      ) ||
      this.tables().find((t) => t.capacity >= res.partySize) ||
      this.tables()[0];

    this.selectedAllocateTableId.set(matching?.id || '');
    this.showAllocateModal = true;
  }

  getSelectedTable(): Table | undefined {
    return this.tables().find((t) => t.id === this.selectedAllocateTableId());
  }

  confirmAllocation(): void {
    if (!this.allocatingReservation || this.isSaving()) return;
    const targetTable = this.getSelectedTable();
    if (!targetTable) {
      this.toastService.warning('Please select a table to allocate.');
      return;
    }

    const res = this.allocatingReservation;
    this.isSaving.set(true);
    try {
      this.dataService.updateReservationStatus(
        res.id,
        'CONFIRMED',
        targetTable.id,
        targetTable.number,
      );
      this.toastService.success(
        `Reservation confirmed for ${res.customerName} on Table ${targetTable.number}. WhatsApp confirmation dispatched!`,
      );
      this.showAllocateModal = false;
      this.allocatingReservation = null;
    } finally {
      this.isSaving.set(false);
    }
  }

  openCancelModal(res: Reservation): void {
    this.cancellingReservation = res;
    this.showCancelModal = true;
  }

  confirmCancel(): void {
    if (!this.cancellingReservation || this.isSaving()) return;
    const res = this.cancellingReservation;

    this.isSaving.set(true);
    try {
      this.updateStatus(res, 'CANCELLED');
      this.toastService.info(
        `Reservation for ${res.customerName} cancelled. WhatsApp notification dispatched.`,
      );
      this.showCancelModal = false;
      this.cancellingReservation = null;
    } finally {
      this.isSaving.set(false);
    }
  }

  onBackdropClick(event: MouseEvent, modalType: 'add' | 'allocate' | 'cancel' = 'add'): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      if (modalType === 'allocate') {
        this.showAllocateModal = false;
        this.allocatingReservation = null;
      } else if (modalType === 'cancel') {
        this.showCancelModal = false;
        this.cancellingReservation = null;
      } else {
        this.showAddModal = false;
      }
    }
  }
}
