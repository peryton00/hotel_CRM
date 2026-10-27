import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { Reservation, ReservationStatus } from '../../../core/models/reservation.model';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-reservation-list',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent],
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
            [class.active]="selectedStatus() === 'ALL'"
            (click)="selectedStatus.set('ALL')"
          >
            All Bookings ({{ reservations().length }})
          </button>
          <button
            class="tab-btn"
            [class.active]="selectedStatus() === 'CONFIRMED'"
            (click)="selectedStatus.set('CONFIRMED')"
          >
            Confirmed
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
            [class.active]="selectedStatus() === 'COMPLETED'"
            (click)="selectedStatus.set('COMPLETED')"
          >
            Completed
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
            @for (res of filteredReservations(); track res.id) {
              <tr>
                <td>
                  <strong>{{ res.customerName }}</strong>
                  <div class="text-xs text-muted">{{ res.customerPhone }}</div>
                </td>
                <td>{{ res.reservationDate | date: 'medium' }}</td>
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
                    @if (res.status === 'CONFIRMED') {
                      <button
                        class="btn btn-secondary btn-sm"
                        (click)="updateStatus(res, 'SEATED')"
                      >
                        Seat Guest
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
                <td
                  colspan="7"
                  class="text-center"
                  style="padding: 32px; color: var(--color-text-muted);"
                >
                  No reservations found for selected filter.
                </td>
              </tr>
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
                  <input type="date" class="form-input" [(ngModel)]="resDate" required />
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
                (click)="saveReservation()"
                [disabled]="
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
        &:hover {
          background: var(--color-bone-light);
        }
        &.active {
          background: var(--color-onyx);
          color: #ffffff;
        }
      }
      .actions-cell {
        display: flex;
        gap: 6px;
      }
      .form-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
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

  reservations = this.mock.reservations;
  tables = this.mock.tables;
  selectedStatus = signal<string>('ALL');

  showAddModal = false;
  resForm: Partial<Reservation> = {};
  resDate = '';
  resTime = '';

  filteredReservations = computed(() => {
    if (this.selectedStatus() === 'ALL') return this.reservations();
    return this.reservations().filter((r) => r.status === this.selectedStatus());
  });

  updateStatus(res: Reservation, status: ReservationStatus): void {
    // 1. Update reservation status
    const updated = this.mock.reservations().map((r) => (r.id === res.id ? { ...r, status } : r));
    this.mock.reservations.set(updated);
    this.mock.saveLocal('reservations', updated);

    // 2. Seating updates table occupancy consistently
    if (status === 'SEATED') {
      const targetTable = this.mock.tables().find((t) => t.number === res.tableNumber);
      if (targetTable) {
        const updatedTables = this.mock
          .tables()
          .map((t) => (t.id === targetTable.id ? { ...t, status: 'OCCUPIED' as const } : t));
        this.mock.tables.set(updatedTables);
        this.mock.saveLocal('tables', updatedTables);
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
          const updatedTables = this.mock
            .tables()
            .map((t) => (t.id === targetTable.id ? { ...t, status: 'AVAILABLE' as const } : t));
          this.mock.tables.set(updatedTables);
          this.mock.saveLocal('tables', updatedTables);
        }
      }
    }

    this.toastService.success(`Reservation status updated to ${status}`);
  }

  openAddModal(): void {
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
    if (
      !this.resForm.customerName?.trim() ||
      !this.resForm.customerPhone?.trim() ||
      !this.resDate ||
      !this.resTime
    ) {
      this.toastService.warning('Please fill in all required reservation fields.');
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

    const newRes: Reservation = {
      id: `res-${Date.now().toString().slice(-4)}`,
      customerName: this.resForm.customerName.trim(),
      customerPhone: this.resForm.customerPhone.trim(),
      partySize: Number(this.resForm.partySize) || 2,
      tableNumber: targetTable.number,
      reservationDate: isoDateTime,
      specialRequests: this.resForm.specialRequests || '',
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
    };

    const updated = [newRes, ...this.mock.reservations()];
    this.mock.reservations.set(updated);
    this.mock.saveLocal('reservations', updated);

    this.toastService.success(`Reservation confirmed for ${newRes.customerName}`);
    this.showAddModal = false;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.showAddModal = false;
    }
  }
}
