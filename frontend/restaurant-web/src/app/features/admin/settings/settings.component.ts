import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { Restaurant } from '../../../core/models/restaurant.model';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent],
  template: `
    <div class="settings-page">
      <div class="page-header">
        <div>
          <h1 class="heading-display">Restaurant Settings</h1>
          <p class="text-muted">
            Configure restaurant brand identity, address, GST tax rules, and manage demo data.
          </p>
        </div>

        <button class="btn btn-primary" (click)="saveSettings()">
          <i class="ph ph-floppy-disk"></i>
          <span>Save Changes</span>
        </button>
      </div>

      <div class="settings-grid">
        <!-- Brand & Address -->
        <div class="panel-box">
          <h2 class="heading-card">Brand Profile & Contact</h2>

          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">Restaurant Name</label>
              <input type="text" class="form-input" [(ngModel)]="profile.name" />
            </div>
            <div class="form-group">
              <label class="form-label">Brand Tagline</label>
              <input type="text" class="form-input" [(ngModel)]="profile.tagline" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Story / Editorial Description</label>
            <textarea class="form-textarea" rows="2" [(ngModel)]="profile.description"></textarea>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">Contact Phone</label>
              <input type="text" class="form-input" [(ngModel)]="profile.contactPhone" />
            </div>
            <div class="form-group">
              <label class="form-label">Support Email</label>
              <input type="email" class="form-input" [(ngModel)]="profile.contactEmail" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Flagship Street Address</label>
            <input type="text" class="form-input" [(ngModel)]="profile.street" />
          </div>
        </div>

        <!-- Tax & Operations -->
        <div class="panel-box">
          <h2 class="heading-card">Tax Settings & Ordering Rules</h2>

          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">CGST Rate (%)</label>
              <input type="number" step="0.1" class="form-input" [(ngModel)]="profile.cgstRate" />
            </div>
            <div class="form-group">
              <label class="form-label">SGST Rate (%)</label>
              <input type="number" step="0.1" class="form-input" [(ngModel)]="profile.sgstRate" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">GST Identification Number (GSTIN)</label>
            <input type="text" class="form-input" [(ngModel)]="profile.gstNumber" />
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">Default Currency</label>
              <input type="text" class="form-input" value="INR (₹)" disabled />
            </div>
            <div class="form-group">
              <label class="form-label">Estimated Prep Time (Mins)</label>
              <input type="number" class="form-input" [(ngModel)]="profile.estimatedPrepMinutes" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Takeaway & Counter Ordering</label>
            <select class="form-select" [(ngModel)]="profile.takeawayEnabled">
              <option [ngValue]="true">Enabled (Accept counter & takeaway orders)</option>
              <option [ngValue]="false">Disabled (Dine-in only)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Demo Mock Data Reset Safe Box -->
      <div class="panel-box danger-box">
        <div class="danger-header">
          <div class="danger-icon"><i class="ph ph-arrows-counter-clockwise"></i></div>
          <div>
            <h3 class="heading-card" style="color: var(--color-danger);">
              Reset Mock Application Dataset
            </h3>
            <p class="text-sm text-muted">
              Clears all local browser mutations (custom tables, modified orders, created coupons)
              and re-seeds from the pristine JSON files.
            </p>
          </div>
        </div>
        <button class="btn btn-danger" (click)="confirmResetOpen = true">
          <i class="ph ph-arrow-counter-clockwise"></i>
          <span>Reset All Demo Data</span>
        </button>
      </div>

      <!-- Confirmation Modal -->
      <app-confirm-modal
        [isOpen]="confirmResetOpen"
        title="Confirm Reset of Mock Data"
        message="This will immediately clear all session modifications and restore the clean initial restaurant dataset. This cannot be undone."
        confirmText="Reset Now"
        (confirm)="executeDataReset()"
        (cancel)="confirmResetOpen = false"
      ></app-confirm-modal>
    </div>
  `,
  styles: [
    `
      .settings-page {
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

      .settings-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
        @media (max-width: 900px) {
          grid-template-columns: 1fr;
        }
      }

      .panel-box {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 22px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .form-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }

      .danger-box {
        border: 1px solid rgba(180, 35, 24, 0.3);
        background: #fffdfd;
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
      }

      .danger-header {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .danger-icon {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--color-danger-bg);
        color: var(--color-danger);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
      }
    `,
  ],
})
export class SettingsComponent implements OnInit {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);

  confirmResetOpen = false;

  profile = {
    name: 'GuruKripa Dhaba',
    tagline: 'Artisanal Mughlai & Contemporary Indian Bistro',
    description:
      'Authentic royal recipes, charcoal tandoori marvels, and modern culinary interpretations.',
    contactPhone: '+91 80 4912 8800',
    contactEmail: 'concierge@royalspice.dining',
    street: '14 Heritage Promenade, MG Road, Bengaluru',
    cgstRate: 2.5,
    sgstRate: 2.5,
    gstNumber: '29AAAAA0000A1Z5',
    estimatedPrepMinutes: 25,
    takeawayEnabled: true,
  };

  ngOnInit(): void {
    const res = this.mock.restaurant();
    if (res) {
      this.profile = {
        name: res.name || this.profile.name,
        tagline: res.tagline || this.profile.tagline,
        description: res.description || this.profile.description,
        contactPhone: res.contact?.phone || this.profile.contactPhone,
        contactEmail: res.contact?.email || this.profile.contactEmail,
        street: res.address?.street || this.profile.street,
        cgstRate: res.taxSettings?.cgstRate || 2.5,
        sgstRate: res.taxSettings?.sgstRate || 2.5,
        gstNumber: res.taxSettings?.gstNumber || '29AAAAA0000A1Z5',
        estimatedPrepMinutes: res.orderingSettings?.estimatedPrepMinutes || 25,
        takeawayEnabled: res.orderingSettings?.takeawayEnabled !== false,
      };
    }
  }

  saveSettings(): void {
    const current = this.mock.restaurant();
    if (current) {
      const updated: Restaurant = {
        ...current,
        name: this.profile.name,
        tagline: this.profile.tagline,
        description: this.profile.description,
        contact: {
          ...current.contact,
          phone: this.profile.contactPhone,
          email: this.profile.contactEmail,
        },
        address: { ...current.address, street: this.profile.street },
        taxSettings: {
          ...current.taxSettings,
          cgstRate: this.profile.cgstRate,
          sgstRate: this.profile.sgstRate,
          gstNumber: this.profile.gstNumber,
        },
        orderingSettings: {
          ...current.orderingSettings,
          estimatedPrepMinutes: this.profile.estimatedPrepMinutes,
          takeawayEnabled: this.profile.takeawayEnabled,
        },
      };
      this.mock.restaurant.set(updated);
      this.mock.saveLocal('restaurant', updated);
    }
    this.toastService.success('Restaurant profile & tax settings saved');
  }

  executeDataReset(): void {
    this.mock.resetAllDemoData();
    this.toastService.info('All mock demo datasets restored to initial state');
    this.confirmResetOpen = false;
  }
}
