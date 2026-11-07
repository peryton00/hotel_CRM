import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { Restaurant } from '../../../core/models/restaurant.model';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import { ToastService } from '../../../core/services/toast.service';

type SettingsTab = 'general' | 'tax' | 'service' | 'maintenance';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent],
  template: `
    <div class="settings-page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="heading-display">Restaurant Settings</h1>
          <p class="text-muted">
            Configure restaurant brand identity, address, tax rules, and operational preferences.
          </p>
        </div>

        <button class="btn btn-primary" (click)="saveSettings()">
          <i class="ph ph-floppy-disk"></i>
          <span>Save Changes</span>
        </button>
      </div>

      <!-- Settings Navigation Tabs -->
      <div class="settings-tabs-bar">
        <button
          type="button"
          class="settings-tab-btn"
          [class.active]="activeTab === 'general'"
          (click)="activeTab = 'general'"
        >
          <i class="ph ph-storefront"></i>
          <span>Brand & Contact</span>
        </button>
        <button
          type="button"
          class="settings-tab-btn"
          [class.active]="activeTab === 'tax'"
          (click)="activeTab = 'tax'"
        >
          <i class="ph ph-receipt"></i>
          <span>Taxes & Invoicing</span>
        </button>
        <button
          type="button"
          class="settings-tab-btn"
          [class.active]="activeTab === 'service'"
          (click)="activeTab = 'service'"
        >
          <i class="ph ph-cooking-pot"></i>
          <span>Kitchen & Operations</span>
        </button>
        <button
          type="button"
          class="settings-tab-btn"
          [class.active]="activeTab === 'maintenance'"
          (click)="activeTab = 'maintenance'"
        >
          <i class="ph ph-database"></i>
          <span>System & Storage</span>
        </button>
      </div>

      <!-- TAB 1: BRAND PROFILE & CONTACT -->
      @if (activeTab === 'general') {
        <div class="settings-grid">
          <div class="panel-box">
            <h2 class="heading-card">Brand Identity</h2>
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
              <label class="form-label">About / Description</label>
              <textarea
                class="form-textarea"
                rows="3"
                [(ngModel)]="profile.description"
                placeholder="Brief summary of cuisine, concept, and dining experience..."
              ></textarea>
            </div>
          </div>

          <div class="panel-box">
            <h2 class="heading-card">Contact & Address</h2>
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
              <label class="form-label">Street Address</label>
              <input type="text" class="form-input" [(ngModel)]="profile.street" />
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">City</label>
                <input type="text" class="form-input" [(ngModel)]="profile.city" />
              </div>
              <div class="form-group">
                <label class="form-label">State & PIN</label>
                <input type="text" class="form-input" [(ngModel)]="profile.statePin" />
              </div>
            </div>
          </div>
        </div>
      }

      <!-- TAB 2: TAXES & INVOICING -->
      @if (activeTab === 'tax') {
        <div class="settings-grid">
          <div class="panel-box">
            <h2 class="heading-card">Goods & Services Tax (GST)</h2>
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">CGST Rate (%)</label>
                <input type="number" step="0.1" min="0" max="28" class="form-input" [(ngModel)]="profile.cgstRate" />
              </div>
              <div class="form-group">
                <label class="form-label">SGST Rate (%)</label>
                <input type="number" step="0.1" min="0" max="28" class="form-input" [(ngModel)]="profile.sgstRate" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">GST Identification Number (GSTIN)</label>
              <input type="text" class="form-input" [(ngModel)]="profile.gstNumber" />
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Service Charge (%)</label>
                <input type="number" step="0.5" min="0" max="20" class="form-input" [(ngModel)]="profile.serviceChargeRate" />
              </div>
              <div class="form-group">
                <label class="form-label">Default Currency</label>
                <input type="text" class="form-input" value="INR (₹)" disabled />
              </div>
            </div>
          </div>

          <div class="panel-box">
            <h2 class="heading-card">Receipt & Bill Customization</h2>
            <div class="form-group">
              <label class="form-label">Invoice Footer Message</label>
              <textarea
                class="form-textarea"
                rows="3"
                [(ngModel)]="profile.invoiceFooter"
                placeholder="e.g. Thank you for dining with us! Please visit us again."
              ></textarea>
            </div>

            <div class="form-group">
              <label class="form-label">FSSAI License / Registration #</label>
              <input
                type="text"
                class="form-input"
                [(ngModel)]="profile.fssaiNumber"
                placeholder="14-digit FSSAI License Number"
              />
            </div>
          </div>
        </div>
      }

      <!-- TAB 3: KITCHEN & OPERATIONS -->
      @if (activeTab === 'service') {
        <div class="settings-grid">
          <div class="panel-box">
            <h2 class="heading-card">Kitchen Dispatch Rules</h2>
            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Estimated Prep Time (Minutes)</label>
                <input type="number" min="5" max="120" class="form-input" [(ngModel)]="profile.estimatedPrepMinutes" />
              </div>
              <div class="form-group">
                <label class="form-label">Minimum Order Spend (₹)</label>
                <input type="number" min="0" step="50" class="form-input" [(ngModel)]="profile.minOrderAmount" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Dine-In Table Ordering</label>
              <select class="form-select" [(ngModel)]="profile.dineInEnabled">
                <option [ngValue]="true">Enabled (Accept QR code table orders)</option>
                <option [ngValue]="false">Disabled (Pause digital table ordering)</option>
              </select>
            </div>
          </div>

          <div class="panel-box">
            <h2 class="heading-card">Counter & Takeaway Settings</h2>
            <div class="form-group">
              <label class="form-label">Takeaway & Counter Ordering</label>
              <select class="form-select" [(ngModel)]="profile.takeawayEnabled">
                <option [ngValue]="true">Enabled (Accept counter & takeaway orders)</option>
                <option [ngValue]="false">Disabled (Dine-in only)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Pickup Time Buffer (Minutes)</label>
              <input type="number" min="10" max="60" class="form-input" [(ngModel)]="profile.pickupBufferMinutes" />
            </div>
          </div>
        </div>
      }

      <!-- TAB 4: SYSTEM & STORAGE -->
      @if (activeTab === 'maintenance') {
        <div class="settings-grid">
          <!-- Diagnostics -->
          <div class="panel-box">
            <h2 class="heading-card">Live System Status</h2>
            <p class="text-sm text-muted">
              Current state of active records stored in browser cache and local repository.
            </p>

            <div class="storage-metrics-grid">
              <div class="storage-metric-card">
                <span class="metric-num">{{ ordersCount() }}</span>
                <span class="metric-lbl">Total Orders</span>
              </div>
              <div class="storage-metric-card">
                <span class="metric-num">{{ menuCount() }}</span>
                <span class="metric-lbl">Menu Dishes</span>
              </div>
              <div class="storage-metric-card">
                <span class="metric-num">{{ tablesCount() }}</span>
                <span class="metric-lbl">Dining Tables</span>
              </div>
              <div class="storage-metric-card">
                <span class="metric-num">{{ customersCount() }}</span>
                <span class="metric-lbl">Customers</span>
              </div>
            </div>
          </div>

          <!-- Reset Default State -->
          <div class="panel-box danger-box">
            <div class="danger-header">
              <div class="danger-icon"><i class="ph ph-arrows-counter-clockwise"></i></div>
              <div>
                <h3 class="heading-card" style="color: var(--color-danger);">
                  Restore Default Configuration
                </h3>
                <p class="text-sm text-muted">
                  Clears local session cache and restores the standard catalog, table layout, and sample orders.
                </p>
              </div>
            </div>
            <button class="btn btn-danger" (click)="confirmResetOpen = true">
              <i class="ph ph-arrow-counter-clockwise"></i>
              <span>Restore Defaults</span>
            </button>
          </div>
        </div>
      }

      <!-- Confirmation Modal -->
      <app-confirm-modal
        [isOpen]="confirmResetOpen"
        title="Restore Default Configuration"
        message="This will immediately clear all local modifications and restore the default restaurant configuration. Are you sure you want to proceed?"
        confirmText="Restore Defaults"
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

      .settings-tabs-bar {
        display: flex;
        gap: 8px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 6px;
        overflow-x: auto;
      }

      .settings-tab-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 16px;
        border-radius: var(--radius-sm);
        border: none;
        background: transparent;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all var(--transition-fast);
        white-space: nowrap;

        i {
          font-size: 1.1rem;
        }

        &:hover {
          background: var(--color-bone-light);
          color: var(--color-text-primary);
        }

        &.active {
          background: var(--color-onyx);
          color: #ffffff;
        }
      }

      .settings-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;

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

        @media (max-width: 500px) {
          grid-template-columns: 1fr;
        }
      }

      .storage-metrics-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }

      .storage-metric-card {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-sm);
        padding: 14px;
        text-align: center;
      }

      .metric-num {
        display: block;
        font-size: 1.5rem;
        font-weight: 800;
        color: var(--color-crimson);
        line-height: 1.2;
      }

      .metric-lbl {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .danger-box {
        border: 1px solid rgba(180, 35, 24, 0.3);
        background: #fffdfd;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 16px;
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
        flex-shrink: 0;
      }
    `,
  ],
})
export class SettingsComponent implements OnInit {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);

  activeTab: SettingsTab = 'general';
  confirmResetOpen = false;

  ordersCount = () => this.mock.orders().length;
  menuCount = () => this.mock.menuItems().length;
  tablesCount = () => this.mock.tables().length;
  customersCount = () => this.mock.customers().length;

  profile = {
    name: 'GuruKripa Dhaba',
    tagline: 'Artisanal Mughlai & Contemporary Indian Bistro',
    description: 'Traditional tandoori specialties, authentic recipes, and North Indian cuisine.',
    contactPhone: '+91 80 4912 8800',
    contactEmail: 'contact@gurukripadhaba.com',
    street: '14 Heritage Promenade, MG Road',
    city: 'Bengaluru',
    statePin: 'Karnataka - 560001',
    cgstRate: 2.5,
    sgstRate: 2.5,
    serviceChargeRate: 0,
    gstNumber: '29AAAAA0000A1Z5',
    invoiceFooter: 'Thank you for dining with GuruKripa Dhaba! Please visit again.',
    fssaiNumber: '11223344556677',
    estimatedPrepMinutes: 25,
    minOrderAmount: 0,
    dineInEnabled: true,
    takeawayEnabled: true,
    pickupBufferMinutes: 20,
  };

  ngOnInit(): void {
    this.loadCurrentSettings();
  }

  private loadCurrentSettings(): void {
    const res = this.mock.restaurant();
    if (res) {
      this.profile = {
        name: res.name || this.profile.name,
        tagline: res.tagline || this.profile.tagline,
        description: res.description || this.profile.description,
        contactPhone: res.contact?.phone || this.profile.contactPhone,
        contactEmail: res.contact?.email || this.profile.contactEmail,
        street: res.address?.street || this.profile.street,
        city: res.address?.city || this.profile.city,
        statePin: `${res.address?.state || 'Karnataka'} - ${res.address?.zip || '560001'}`,
        cgstRate: res.taxSettings?.cgstRate ?? 2.5,
        sgstRate: res.taxSettings?.sgstRate ?? 2.5,
        serviceChargeRate: res.taxSettings?.serviceChargeRate ?? 0,
        gstNumber: res.taxSettings?.gstNumber || '29AAAAA0000A1Z5',
        invoiceFooter: this.profile.invoiceFooter,
        fssaiNumber: this.profile.fssaiNumber,
        estimatedPrepMinutes: res.orderingSettings?.estimatedPrepMinutes || 25,
        minOrderAmount: res.orderingSettings?.minOrderAmount || 0,
        dineInEnabled: res.orderingSettings?.dineInEnabled !== false,
        takeawayEnabled: res.orderingSettings?.takeawayEnabled !== false,
        pickupBufferMinutes: this.profile.pickupBufferMinutes,
      };
    }
  }

  saveSettings(): void {
    const current = this.mock.restaurant();
    if (current) {
      const parts = this.profile.statePin.split('-').map((s) => s.trim());
      const state = parts[0] || current.address?.state || 'Karnataka';
      const zip = parts[1] || current.address?.zip || '560001';

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
        address: {
          ...current.address,
          street: this.profile.street,
          city: this.profile.city,
          state,
          zip,
        },
        taxSettings: {
          ...current.taxSettings,
          enableGst: true,
          cgstRate: Number(this.profile.cgstRate) || 0,
          sgstRate: Number(this.profile.sgstRate) || 0,
          serviceChargeRate: Number(this.profile.serviceChargeRate) || 0,
          gstNumber: this.profile.gstNumber,
        },
        orderingSettings: {
          ...current.orderingSettings,
          dineInEnabled: this.profile.dineInEnabled,
          takeawayEnabled: this.profile.takeawayEnabled,
          estimatedPrepMinutes: Number(this.profile.estimatedPrepMinutes) || 25,
          minOrderAmount: Number(this.profile.minOrderAmount) || 0,
        },
      };
      this.mock.restaurant.set(updated);
      this.mock.saveLocal('restaurant', updated);
    }
    this.toastService.success('Restaurant configuration saved');
  }

  executeDataReset(): void {
    this.mock.resetAllDemoData();
    this.loadCurrentSettings();
    this.toastService.info('System configuration restored to default state');
    this.confirmResetOpen = false;
  }
}
