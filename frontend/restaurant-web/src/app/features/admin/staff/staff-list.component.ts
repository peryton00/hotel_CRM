import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MockDataService } from '../../../data-access/mock/mock-data.service';
import { StaffMember, StaffRole } from '../../../core/models/staff.model';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-staff-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="staff-page">
      <div class="page-header">
        <div>
          <h1 class="heading-display">Staff & Operational Crew</h1>
          <p class="text-muted">
            Manage restaurant managers, head chefs, floor captains, and cashier personnel.
          </p>
        </div>

        <button class="btn btn-primary" (click)="openAddModal()">
          <i class="ph ph-user-plus"></i>
          <span>Add Staff Member</span>
        </button>
      </div>

      <div class="staff-grid">
        @for (member of staff(); track member.id) {
          <div class="staff-card">
            <div class="staff-top">
              <div class="avatar-lg">{{ member.name.charAt(0) }}</div>
              <div>
                <h3 class="staff-name">{{ member.name }}</h3>
                <span class="role-badge">{{ member.role.replace('_', ' ') }}</span>
              </div>
            </div>

            <div class="staff-details">
              <div class="detail-line">
                <i class="ph ph-phone"></i>
                <span>{{ member.phone }}</span>
              </div>
              <div class="detail-line">
                <i class="ph ph-envelope"></i>
                <span>{{ member.email }}</span>
              </div>
              <div class="detail-line">
                <i class="ph ph-clock"></i>
                <span>Shift: {{ member.shift }}</span>
              </div>
              @if (member.assignedSection) {
                <div class="detail-line">
                  <i class="ph ph-map-pin"></i>
                  <span>Station: {{ member.assignedSection }}</span>
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Add Staff Modal -->
      @if (showAddModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card">Add Crew Member</h3>
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
                    placeholder="e.g. Chef Vikas Kumar"
                    [(ngModel)]="staffForm.name"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Operational Role</label>
                  <select class="form-select" [(ngModel)]="staffForm.role">
                    <option value="EXECUTIVE_CHEF">Executive Chef</option>
                    <option value="MANAGER">Restaurant Manager</option>
                    <option value="CAPTAIN">Floor Captain</option>
                    <option value="BEVERAGE_SPECIALIST">Sommelier / Bartender</option>
                    <option value="CASHIER">Cashier & Billing</option>
                  </select>
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
                  <label class="form-label">Email Address</label>
                  <input
                    type="email"
                    class="form-input"
                    placeholder="staff@royalspice.dining"
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
                    placeholder="e.g. Evening Dinner"
                    [(ngModel)]="staffForm.shift"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Assigned Station / Section</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. Tandoori Station"
                    [(ngModel)]="staffForm.assignedSection"
                  />
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showAddModal = false">Cancel</button>
              <button
                class="btn btn-primary"
                (click)="saveStaff()"
                [disabled]="!staffForm.name?.trim() || !staffForm.phone?.trim()"
              >
                Save Staff Member
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
        gap: 20px;
      }
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        flex-wrap: wrap;
        gap: 16px;
      }

      .staff-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 20px;
      }

      .staff-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-shadow: var(--shadow-xs);
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
      }
      .staff-name {
        font-size: 1.05rem;
        font-weight: 700;
        margin-bottom: 2px;
      }
      .role-badge {
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-crimson);
        letter-spacing: 0.05em;
      }

      .staff-details {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
      }
      .detail-line {
        display: flex;
        align-items: center;
        gap: 8px;
        i {
          color: var(--color-taupe);
          font-size: 1rem;
        }
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
export class StaffListComponent {
  private mock = inject(MockDataService);
  private toastService = inject(ToastService);

  staff = this.mock.staffMembers;
  showAddModal = false;
  staffForm: Partial<StaffMember> = {};

  openAddModal(): void {
    this.staffForm = {
      name: '',
      role: 'CAPTAIN' as StaffRole,
      phone: '',
      email: '',
      shift: 'Dinner Shift (6 PM - 12 AM)',
      assignedSection: 'Main Dining Floor',
    };
    this.showAddModal = true;
  }

  saveStaff(): void {
    if (!this.staffForm.name?.trim() || !this.staffForm.phone?.trim()) return;

    const newStaff: StaffMember = {
      id: `stf-${Date.now().toString().slice(-4)}`,
      name: this.staffForm.name.trim(),
      role: this.staffForm.role || 'CAPTAIN',
      phone: this.staffForm.phone.trim(),
      email: this.staffForm.email?.trim() || 'staff@royalspice.dining',
      shift: this.staffForm.shift || 'General Shift',
      status: 'ACTIVE',
      assignedSection: this.staffForm.assignedSection || 'Floor',
    };

    const updated = [...this.mock.staffMembers(), newStaff];
    this.mock.staffMembers.set(updated);
    this.mock.saveLocal('staff', updated);

    this.toastService.success(`Added ${newStaff.name} to staff registry`);
    this.showAddModal = false;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.showAddModal = false;
    }
  }
}
