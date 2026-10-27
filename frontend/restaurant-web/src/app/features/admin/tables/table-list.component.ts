import { Component, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { Table, TableStatus, TableSection } from '../../../core/models/table.model';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-table-list',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent, ConfirmModalComponent],
  template: `
    <div class="tables-page">
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1 class="heading-display">Dining Tables & QR Tokens</h1>
          <p class="text-muted">
            Generate instant digital table tokens, configure seating sections, and monitor
            occupancy.
          </p>
        </div>

        <button class="btn btn-primary" (click)="openAddTableModal()">
          <i class="ph ph-plus-circle"></i>
          <span>Add Dining Table</span>
        </button>
      </div>

      <!-- Section Filter Toolbar -->
      <div class="toolbar-card">
        <div class="tabs-group">
          <button
            class="tab-btn"
            [class.active]="selectedSection() === 'ALL'"
            (click)="selectedSection.set('ALL')"
          >
            All Sections ({{ tables().length }})
          </button>
          <button
            class="tab-btn"
            [class.active]="selectedSection() === 'Main Dining'"
            (click)="selectedSection.set('Main Dining')"
          >
            Main Dining
          </button>
          <button
            class="tab-btn"
            [class.active]="selectedSection() === 'Terrace Garden'"
            (click)="selectedSection.set('Terrace Garden')"
          >
            Terrace Garden
          </button>
          <button
            class="tab-btn"
            [class.active]="selectedSection() === 'Private Lounge'"
            (click)="selectedSection.set('Private Lounge')"
          >
            Private Lounge
          </button>
          <button
            class="tab-btn"
            [class.active]="selectedSection() === 'Bar'"
            (click)="selectedSection.set('Bar')"
          >
            Bar
          </button>
        </div>

        <div class="status-summary-pills">
          <span class="status-pill available">{{ countByStatus('AVAILABLE') }} Available</span>
          <span class="status-pill occupied">{{ countByStatus('OCCUPIED') }} Occupied</span>
          <span class="status-pill reserved">{{ countByStatus('RESERVED') }} Reserved</span>
          <span class="status-pill dirty">{{ countByStatus('DIRTY') }} Cleaning</span>
        </div>
      </div>

      <!-- Table Cards Grid -->
      <div class="tables-grid">
        @for (tbl of filteredTables(); track tbl.id) {
          <div class="table-card" [class.disabled-order]="!tbl.orderingEnabled">
            <div class="table-card-top">
              <div class="table-num-wrap">
                <span class="table-number">{{ tbl.number }}</span>
                <span class="table-capacity"
                  ><i class="ph ph-users"></i> {{ tbl.capacity }} Seats</span
                >
              </div>
              <app-status-badge [status]="tbl.status"></app-status-badge>
            </div>

            <div class="table-section-tag">
              <i class="ph ph-map-pin"></i>
              <span>{{ tbl.section }}</span>
            </div>

            <div class="table-token-box">
              <span class="token-label">QR Token:</span>
              <code class="token-code">{{ tbl.qrToken }}</code>
            </div>

            <!-- Table Status Selector -->
            <div class="status-select-wrap">
              <label class="text-xs text-muted" [attr.for]="'status-' + tbl.id"
                >Change Status:</label
              >
              <select
                [id]="'status-' + tbl.id"
                class="form-select status-dropdown"
                [ngModel]="tbl.status"
                (ngModelChange)="onStatusChange(tbl.id, $event)"
              >
                <option value="AVAILABLE">Available</option>
                <option value="OCCUPIED">Occupied</option>
                <option value="RESERVED">Reserved</option>
                <option value="DIRTY">Cleaning</option>
              </select>
            </div>

            <!-- Card Actions -->
            <div class="table-card-actions">
              <button
                class="btn btn-secondary btn-sm"
                (click)="openQrModal(tbl)"
                title="View & Print QR"
              >
                <i class="ph ph-qr-code"></i>
                <span>QR Code</span>
              </button>

              <a
                [href]="tbl.qrUrl"
                target="_blank"
                class="btn btn-secondary btn-sm"
                title="Open Customer Menu Route"
              >
                <i class="ph ph-arrow-square-out"></i>
              </a>

              <button
                class="btn btn-secondary btn-sm"
                (click)="toggleOrdering(tbl)"
                [title]="tbl.orderingEnabled ? 'Disable Ordering' : 'Enable Ordering'"
              >
                <i
                  class="ph"
                  [class.ph-lock]="tbl.orderingEnabled"
                  [class.ph-lock-open]="!tbl.orderingEnabled"
                ></i>
              </button>

              <button
                class="btn btn-secondary btn-sm btn-icon-danger"
                (click)="confirmDeleteTable(tbl)"
                title="Delete Table"
              >
                <i class="ph ph-trash"></i>
              </button>
            </div>
          </div>
        }
      </div>

      <!-- Add Table Modal -->
      @if (showAddModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card">Add Dining Table</h3>
              <button class="close-btn" (click)="showAddModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Table Number / Label *</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. T-13 or Rooftop-01"
                    [(ngModel)]="newTableNumber"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Seating Capacity *</label>
                  <input
                    type="number"
                    class="form-input"
                    min="1"
                    max="20"
                    [(ngModel)]="newTableCapacity"
                  />
                </div>
              </div>
              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Dining Section *</label>
                  <select class="form-select" [(ngModel)]="newTableSection">
                    <option value="Main Dining">Main Dining</option>
                    <option value="Terrace Garden">Terrace Garden</option>
                    <option value="Private Lounge">Private Lounge</option>
                    <option value="Bar">Bar</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Initial Status</label>
                  <select class="form-select" [(ngModel)]="newTableStatus">
                    <option value="AVAILABLE">Available</option>
                    <option value="OCCUPIED">Occupied</option>
                    <option value="RESERVED">Reserved</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showAddModal = false">Cancel</button>
              <button
                class="btn btn-primary"
                (click)="saveNewTable()"
                [disabled]="!newTableNumber.trim() || newTableCapacity < 1"
              >
                Create Table & QR
              </button>
            </div>
          </div>
        </div>
      }

      <!-- QR Code Preview & Print Modal -->
      @if (activeQrTable) {
        <div class="modal-overlay qr-modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card qr-preview-card" role="dialog" aria-modal="true">
            <div class="modal-header no-print">
              <h3 class="heading-card">Table {{ activeQrTable.number }} QR Standee</h3>
              <button class="close-btn" (click)="activeQrTable = null">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <!-- Print-Ready Standee Tent Card -->
            <div class="qr-standee" #printContainer>
              <div class="standee-header">
                <div class="standee-crest"><i class="ph ph-crown"></i></div>
                <div class="standee-brand">{{ restaurant()?.name || 'GuruKripa Dhaba' }}</div>
                <div class="standee-sub">Artisanal Awadhi Bistro</div>
              </div>

              <div class="qr-image-container">
                @if (qrDataUrl) {
                  <img [src]="qrDataUrl" alt="Table QR Code" class="qr-canvas-img" />
                } @else {
                  <div class="qr-loading">Generating QR...</div>
                }
              </div>

              <div class="standee-footer">
                <div class="standee-table-num">TABLE {{ activeQrTable.number }}</div>
                <div class="standee-inst">
                  Scan with smartphone camera to view menu & place your order
                </div>
                <div class="standee-url">{{ activeQrTable.qrUrl }}</div>
              </div>
            </div>

            <div class="modal-footer no-print">
              <button class="btn btn-secondary" (click)="downloadQrImage()">
                <i class="ph ph-download-simple"></i>
                <span>Download PNG</span>
              </button>
              <button class="btn btn-primary" (click)="printQrStandee()">
                <i class="ph ph-printer"></i>
                <span>Print Table Tent</span>
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Delete Confirmation Modal -->
      <app-confirm-modal
        [isOpen]="!!tableToDelete"
        title="Remove Dining Table"
        [message]="
          'Are you sure you want to delete ' +
          tableToDelete?.number +
          '? Active table QR tokens will be invalidated.'
        "
        confirmText="Delete Table"
        (confirm)="executeDeleteTable()"
        (cancel)="tableToDelete = null"
      ></app-confirm-modal>
    </div>
  `,
  styles: [
    `
      .tables-page {
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
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }

      .tabs-group {
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

      .status-summary-pills {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .status-pill {
        font-size: 0.75rem;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: var(--radius-full);

        &.available {
          background: var(--color-success-bg);
          color: var(--color-success);
        }
        &.occupied {
          background: var(--color-warning-bg);
          color: var(--color-warning);
        }
        &.reserved {
          background: var(--color-info-bg);
          color: var(--color-info);
        }
        &.dirty {
          background: var(--color-danger-bg);
          color: var(--color-danger);
        }
      }

      .tables-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 20px;
      }

      .table-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 18px;
        box-shadow: var(--shadow-xs);
        display: flex;
        flex-direction: column;
        gap: 12px;
        transition: all var(--transition-fast);

        &:hover {
          border-color: var(--color-taupe);
          box-shadow: var(--shadow-sm);
        }

        &.disabled-order {
          opacity: 0.7;
          background: var(--color-bone-light);
        }
      }

      .table-card-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }

      .table-num-wrap {
        display: flex;
        flex-direction: column;
      }

      .table-number {
        font-size: 1.5rem;
        font-weight: 800;
        letter-spacing: -0.02em;
      }

      .table-capacity {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .table-section-tag {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
      }

      .table-token-box {
        background: var(--color-bone);
        padding: 6px 10px;
        border-radius: var(--radius-xs);
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.75rem;
      }

      .token-label {
        color: var(--color-text-muted);
      }
      .token-code {
        font-weight: 700;
        color: var(--color-crimson);
      }

      .status-select-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .status-dropdown {
        padding: 6px 10px;
        font-size: 0.8125rem;
      }

      .table-card-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        padding-top: 12px;
        border-top: 1px solid var(--color-border-subtle);

        button,
        a {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }
      }

      .btn-icon-danger:hover {
        background: var(--color-danger-bg);
        color: var(--color-danger);
        border-color: var(--color-danger);
      }

      .qr-preview-card {
        max-width: 440px;
        text-align: center;
      }

      .qr-standee {
        background: #ffffff;
        padding: 32px 24px;
        border-radius: var(--radius-sm);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      .standee-crest {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--color-onyx);
        color: var(--color-gold);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        margin: 0 auto 8px;
      }

      .standee-brand {
        font-family: var(--font-display);
        font-size: 1.35rem;
        font-weight: 700;
      }

      .standee-sub {
        font-size: 0.75rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-taupe);
      }

      .qr-image-container {
        width: 200px;
        height: 200px;
        background: #f9f9f9;
        border: 1px solid #e5ded4;
        border-radius: 8px;
        padding: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .qr-canvas-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .standee-table-num {
        font-size: 1.5rem;
        font-weight: 900;
        letter-spacing: 0.05em;
        color: var(--color-crimson);
        margin-bottom: 4px;
      }

      .standee-inst {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        max-width: 260px;
        line-height: 1.4;
        margin: 0 auto 6px;
      }

      .standee-url {
        font-size: 0.6875rem;
        color: var(--color-taupe);
        font-family: monospace;
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
      .form-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .close-btn {
        font-size: 1.25rem;
        color: var(--color-text-muted);
        &:hover {
          color: var(--color-onyx);
        }
      }

      @media print {
        .page-header,
        .toolbar-card,
        .tables-grid,
        .no-print,
        .modal-header,
        .modal-footer {
          display: none !important;
        }

        .qr-modal-overlay {
          position: static !important;
          background: transparent !important;
          display: block !important;
          padding: 0 !important;
          margin: 0 !important;
          width: 100% !important;
          height: auto !important;
          overflow: visible !important;
        }

        .qr-preview-card {
          box-shadow: none !important;
          border: none !important;
          padding: 0 !important;
          margin: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          background: transparent !important;
        }

        .qr-standee {
          display: block !important;
          margin: 10mm auto !important;
          width: 90mm !important;
          max-width: 90mm !important;
          border: 2px solid #121212 !important;
          box-shadow: none !important;
          page-break-inside: avoid;
          break-inside: avoid;
          background: #ffffff !important;
          padding: 24px 20px !important;
        }
      }
    `,
  ],
})
export class TableListComponent {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);

  tables = this.mock.tables;
  restaurant = this.mock.restaurant;
  selectedSection = signal<string>('ALL');

  showAddModal = false;
  newTableNumber = '';
  newTableCapacity = 4;
  newTableSection: TableSection = 'Main Dining';
  newTableStatus: TableStatus = 'AVAILABLE';

  tableToDelete: Table | null = null;
  activeQrTable: Table | null = null;
  qrDataUrl: string | null = null;

  filteredTables = computed(() => {
    if (this.selectedSection() === 'ALL') return this.tables();
    return this.tables().filter((t) => t.section === this.selectedSection());
  });

  countByStatus(status: TableStatus): number {
    return this.tables().filter((t) => t.status === status).length;
  }

  onStatusChange(tableId: string, status: TableStatus): void {
    const res = this.mock.updateTableStatus(tableId, status);
    if (!res.success) {
      this.toastService.warning(res.error || 'Cannot update table status');
      // Force signal re-emission so dropdown resets to authoritative stored status
      this.mock.tables.set([...this.mock.tables()]);
      return;
    }
    this.toastService.success(`Table status updated to ${status}`);
  }

  toggleOrdering(table: Table): void {
    const newState = !table.orderingEnabled;
    const updated = this.mock
      .tables()
      .map((t) => (t.id === table.id ? { ...t, orderingEnabled: newState } : t));
    this.mock.tables.set(updated);
    this.mock.saveLocal('tables', updated);
    this.toastService.info(
      `Ordering ${newState ? 'enabled' : 'disabled'} for Table ${table.number}`,
    );
  }

  openAddTableModal(): void {
    const nextNum = `T-${(this.tables().length + 1).toString().padStart(2, '0')}`;
    this.newTableNumber = nextNum;
    this.newTableCapacity = 4;
    this.newTableSection = 'Main Dining';
    this.newTableStatus = 'AVAILABLE';
    this.showAddModal = true;
  }

  saveNewTable(): void {
    if (!this.newTableNumber.trim() || this.newTableCapacity < 1) return;

    const token = `tbl-${this.newTableNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const newTbl: Table = {
      id: `tbl-${Date.now().toString().slice(-4)}`,
      number: this.newTableNumber.trim(),
      capacity: this.newTableCapacity,
      section: this.newTableSection,
      status: this.newTableStatus,
      qrToken: token,
      qrUrl: `/menu/gurukripa-dhaba/table/${token}`,
      orderingEnabled: true,
    };

    const updated = [...this.mock.tables(), newTbl];
    this.mock.tables.set(updated);
    this.mock.saveLocal('tables', updated);

    this.toastService.success(`Created ${newTbl.number} with QR Token`);
    this.showAddModal = false;
  }

  confirmDeleteTable(table: Table): void {
    this.tableToDelete = table;
  }

  executeDeleteTable(): void {
    if (!this.tableToDelete) return;
    const id = this.tableToDelete.id;
    const num = this.tableToDelete.number;
    const updated = this.mock.tables().filter((t) => t.id !== id);
    this.mock.tables.set(updated);
    this.mock.saveLocal('tables', updated);

    this.toastService.success(`Table ${num} removed`);
    this.tableToDelete = null;
  }

  async openQrModal(table: Table): Promise<void> {
    this.activeQrTable = table;
    this.qrDataUrl = null;
    const fullUrl = `${window.location.origin}${table.qrUrl}`;

    try {
      this.qrDataUrl = await QRCode.toDataURL(fullUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#121212',
          light: '#FFFFFF',
        },
      });
    } catch (e) {
      console.error('QR generation failed', e);
    }
  }

  downloadQrImage(): void {
    if (!this.qrDataUrl || !this.activeQrTable) return;
    const link = document.createElement('a');
    link.download = `RoyalSpice_Table_${this.activeQrTable.number}_QR.png`;
    link.href = this.qrDataUrl;
    link.click();
    this.toastService.success(`Downloaded QR PNG for Table ${this.activeQrTable.number}`);
  }

  printQrStandee(): void {
    window.print();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.showAddModal = false;
      this.activeQrTable = null;
    }
  }
}
