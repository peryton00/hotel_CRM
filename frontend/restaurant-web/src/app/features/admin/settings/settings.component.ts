import { Component, inject, signal, OnInit, effect, HostListener, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { Restaurant } from '../../../core/models/restaurant.model';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import { ToastService } from '../../../core/services/toast.service';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import {
  ThermalPrinterService,
  SystemPrinterInfo,
} from '../../../core/services/thermal-printer.service';
import { EscPosPrinterConfig } from '../../../core/utils/escpos.util';
import { AuditLogEntry } from '../../../core/models/audit.model';

type SettingsTab = 'general' | 'tax' | 'printer' | 'service' | 'maintenance' | 'security';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, ConfirmModalComponent],
  template: `
    <div class="settings-page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <div class="header-badges">
            <span class="status-pill">
              <span class="status-dot"></span>
              POS Terminal: Active
            </span>
            <span class="status-pill">
              <i class="ph ph-receipt"></i>
              GST Active (5.0%)
            </span>
            @if (isDirty()) {
              <span class="status-pill warning-pill">
                <span class="status-dot warning-dot"></span>
                Unsaved Edits
              </span>
            }
          </div>
          <h1 class="heading-display">Restaurant Settings</h1>
          <p class="text-muted">
            Brand identity, ESC/POS receipt printers, tax compliance, and kitchen operations.
          </p>
        </div>

        @if (activeTab !== 'security') {
          <div class="header-actions-group">
            @if (isDirty()) {
              <button
                type="button"
                class="btn btn-secondary dirty-reset-btn"
                (click)="resetChanges()"
                title="Discard uncommitted edits and revert to saved settings"
              >
                <i class="ph ph-arrow-u-up-left"></i>
                <span>Reset Edits</span>
              </button>
            }
            <button
              class="btn btn-primary save-btn"
              [class.btn-faded]="!isDirty()"
              [disabled]="!isDirty()"
              (click)="saveSettings()"
              [title]="isDirty() ? 'Save current modifications' : 'All settings up to date'"
            >
              <i class="ph ph-floppy-disk"></i>
              <span>Save Changes</span>
            </button>
          </div>
        }
      </div>

      <!-- Settings Navigation Tabs -->
      <div class="settings-tabs-bar" role="tablist">
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
          [class.active]="activeTab === 'printer'"
          (click)="activeTab = 'printer'"
        >
          <i class="ph ph-printer"></i>
          <span>Thermal Printer</span>
          <span class="tab-chip">ESC/POS</span>
        </button>
        <button
          type="button"
          class="settings-tab-btn"
          [class.active]="activeTab === 'service'"
          (click)="activeTab = 'service'"
        >
          <i class="ph ph-cooking-pot"></i>
          <span>Kitchen & Ops</span>
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
        @if (auth.isAdmin()) {
          <button
            type="button"
            class="settings-tab-btn"
            [class.active]="activeTab === 'security'"
            (click)="activeTab = 'security'"
          >
            <i class="ph ph-shield-check"></i>
            <span>Admin Security</span>
          </button>
        }
      </div>

      <!-- TAB 1: BRAND PROFILE & CONTACT -->
      @if (activeTab === 'general') {
        <div class="settings-grid">
          <div class="panel-box">
            <div class="panel-header-row">
              <div class="panel-title-group">
                <div class="panel-icon-wrap">
                  <i class="ph ph-storefront"></i>
                </div>
                <div class="panel-title-text">
                  <h2 class="heading-card">Brand Identity</h2>
                  <p class="panel-subtitle">
                    Public restaurant name, menu banner details, and concept description.
                  </p>
                </div>
              </div>
              <span class="panel-badge">Public Display</span>
            </div>

            <div class="form-group">
              <label class="form-label">Establishment Name *</label>
              <div class="input-with-icon">
                <i class="ph ph-buildings field-icon"></i>
                <input type="text" class="form-input has-icon" [(ngModel)]="profile.name" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Tagline / Culinary Subtitle</label>
              <div class="input-with-icon">
                <i class="ph ph-sparkle field-icon"></i>
                <input type="text" class="form-input has-icon" [(ngModel)]="profile.tagline" />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Concept Description</label>
              <textarea class="form-textarea" rows="3" [(ngModel)]="profile.description"></textarea>
              <span class="field-hint"
                >Appears on the digital QR ordering welcome screen and customer receipt
                header.</span
              >
            </div>
          </div>

          <div class="panel-box">
            <div class="panel-header-row">
              <div class="panel-title-group">
                <div class="panel-icon-wrap">
                  <i class="ph ph-map-pin"></i>
                </div>
                <div class="panel-title-text">
                  <h2 class="heading-card">Contact & Location</h2>
                  <p class="panel-subtitle">
                    Physical address and official customer support contact lines.
                  </p>
                </div>
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Contact Phone</label>
                <div class="input-with-icon">
                  <i class="ph ph-phone field-icon"></i>
                  <input
                    type="text"
                    class="form-input has-icon"
                    [(ngModel)]="profile.contactPhone"
                  />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Support Email</label>
                <div class="input-with-icon">
                  <i class="ph ph-envelope field-icon"></i>
                  <input
                    type="email"
                    class="form-input has-icon"
                    [(ngModel)]="profile.contactEmail"
                  />
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Customer Mobile Menu Website (QR Target Hosted Link)</label>
              <div class="input-with-icon">
                <i class="ph ph-globe field-icon"></i>
                <input
                  type="url"
                  class="form-input has-icon"
                  [(ngModel)]="profile.customerMenuUrl"
                  placeholder="https://gurukripadhaba-menu.vercel.app"
                />
              </div>
              <span class="field-hint">
                Public hosted URL embedded into table QR codes and standees for customer mobile
                ordering.
              </span>
            </div>

            <div class="form-group">
              <label class="form-label">Street Address</label>
              <div class="input-with-icon">
                <i class="ph ph-navigation-arrow field-icon"></i>
                <input type="text" class="form-input has-icon" [(ngModel)]="profile.street" />
              </div>
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
            <div class="panel-header-row">
              <div class="panel-title-group">
                <div class="panel-icon-wrap">
                  <i class="ph ph-receipt"></i>
                </div>
                <div class="panel-title-text">
                  <h2 class="heading-card">Goods & Services Tax (GST)</h2>
                  <p class="panel-subtitle">
                    Standard Indian GST tax brackets applied at POS checkout.
                  </p>
                </div>
              </div>
              <span class="panel-badge">Tax Slab: 5.0%</span>
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">CGST Rate</label>
                <div class="input-with-suffix">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="28"
                    class="form-input has-suffix"
                    [(ngModel)]="profile.cgstRate"
                  />
                  <span class="field-suffix">%</span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">SGST Rate</label>
                <div class="input-with-suffix">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="28"
                    class="form-input has-suffix"
                    [(ngModel)]="profile.sgstRate"
                  />
                  <span class="field-suffix">%</span>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">GST Identification Number (GSTIN)</label>
              <div class="input-with-icon">
                <i class="ph ph-identification-card field-icon"></i>
                <input
                  type="text"
                  class="form-input has-icon font-mono uppercase"
                  [(ngModel)]="profile.gstNumber"
                />
              </div>
              <span class="field-hint"
                >15-digit statutory GSTIN displayed on customer bills and B2B reports.</span
              >
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Service Charge</label>
                <div class="input-with-suffix">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="20"
                    class="form-input has-suffix"
                    [(ngModel)]="profile.serviceChargeRate"
                  />
                  <span class="field-suffix">%</span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Default Currency</label>
                <input type="text" class="form-input disabled-input" value="INR (₹)" disabled />
              </div>
            </div>
          </div>

          <div class="panel-box">
            <div class="panel-header-row">
              <div class="panel-title-group">
                <div class="panel-icon-wrap">
                  <i class="ph ph-article"></i>
                </div>
                <div class="panel-title-text">
                  <h2 class="heading-card">Receipt & Bill Customization</h2>
                  <p class="panel-subtitle">
                    Mandated licenses and customized guest checkout notes.
                  </p>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">FSSAI License / Registration #</label>
              <div class="input-with-icon">
                <i class="ph ph-shield-check field-icon"></i>
                <input
                  type="text"
                  class="form-input has-icon font-mono"
                  [(ngModel)]="profile.fssaiNumber"
                  placeholder="14-digit FSSAI License Number"
                />
              </div>
              <span class="field-hint"
                >Mandated food safety license number printed on physical receipts.</span
              >
            </div>

            <div class="form-group">
              <label class="form-label">Invoice Footer Message</label>
              <textarea
                class="form-textarea"
                rows="3"
                [(ngModel)]="profile.invoiceFooter"
                placeholder="e.g. Thank you for dining with us! Please visit us again."
              ></textarea>
              <span class="field-hint"
                >Printed at the bottom of customer receipts before the QR code.</span
              >
            </div>
          </div>
        </div>
      }

      <!-- TAB 3: HARDWARE & THERMAL PRINTER (ESC/POS) -->
      @if (activeTab === 'printer') {
        <div class="settings-grid">
          <div class="panel-box">
            <div class="panel-header-row">
              <div class="panel-title-group">
                <div class="panel-icon-wrap">
                  <i class="ph ph-printer"></i>
                </div>
                <div class="panel-title-text">
                  <h2 class="heading-card">Hardware Receipt Printer (ESC/POS)</h2>
                  <p class="panel-subtitle">
                    Raw spooling to USB thermal printers or Network LAN sockets.
                  </p>
                </div>
              </div>
              <span class="panel-badge highlight">Raw Protocol</span>
            </div>

            <div class="form-group">
              <label class="form-label">Printer Interface Target</label>
              <div class="radio-cards-cluster">
                <label class="radio-card" [class.selected]="printerConfig().target === 'WINDOWS'">
                  <input
                    type="radio"
                    name="printerTarget"
                    value="WINDOWS"
                    [checked]="printerConfig().target === 'WINDOWS'"
                    (change)="updatePrinterConfig('target', 'WINDOWS')"
                  />
                  <div class="radio-card-content">
                    <i class="ph ph-usb"></i>
                    <div>
                      <strong>Windows / USB Thermal Printer (Tauri Native)</strong>
                      <span>Direct raw spooling via Windows printer driver</span>
                    </div>
                  </div>
                </label>

                <label class="radio-card" [class.selected]="printerConfig().target === 'NETWORK'">
                  <input
                    type="radio"
                    name="printerTarget"
                    value="NETWORK"
                    [checked]="printerConfig().target === 'NETWORK'"
                    (change)="updatePrinterConfig('target', 'NETWORK')"
                  />
                  <div class="radio-card-content">
                    <i class="ph ph-wifi-high"></i>
                    <div>
                      <strong>Network / Ethernet Printer (TCP Port 9100)</strong>
                      <span>Direct socket connection across local LAN</span>
                    </div>
                  </div>
                </label>

                <label class="radio-card" [class.selected]="printerConfig().target === 'BROWSER'">
                  <input
                    type="radio"
                    name="printerTarget"
                    value="BROWSER"
                    [checked]="printerConfig().target === 'BROWSER'"
                    (change)="updatePrinterConfig('target', 'BROWSER')"
                  />
                  <div class="radio-card-content">
                    <i class="ph ph-browser"></i>
                    <div>
                      <strong>Standard Browser Print Dialog</strong>
                      <span>Operating system print preview window (fallback)</span>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            @if (printerConfig().target === 'WINDOWS') {
              <div class="form-group">
                <div class="label-with-action">
                  <label class="form-label">Select Installed Windows Thermal Printer</label>
                  <button
                    type="button"
                    class="btn-text"
                    (click)="loadSystemPrinters()"
                    [disabled]="isLoadingPrinters()"
                  >
                    <i class="ph ph-arrows-clockwise" [class.ph-spin]="isLoadingPrinters()"></i>
                    <span>Refresh</span>
                  </button>
                </div>
                <select
                  class="form-select"
                  [ngModel]="printerConfig().printerName"
                  (ngModelChange)="updatePrinterConfig('printerName', $event)"
                >
                  <option value="">-- Use System Default Printer --</option>
                  @for (p of availablePrinters(); track p.name) {
                    <option [value]="p.name">
                      {{ p.name }} {{ p.is_default ? '(Default)' : '' }}
                      {{ p.port_name ? '[' + p.port_name + ']' : '' }}
                    </option>
                  }
                </select>
                <span class="field-hint">
                  Detected {{ availablePrinters().length }} printer(s) installed on this
                  workstation.
                </span>
              </div>
            }

            @if (printerConfig().target === 'NETWORK') {
              <div class="form-group">
                <label class="form-label">Printer IP Address & Port (Port 9100)</label>
                <input
                  type="text"
                  class="form-input font-mono"
                  placeholder="e.g. 192.168.1.100:9100"
                  [ngModel]="printerConfig().networkAddress"
                  (ngModelChange)="updatePrinterConfig('networkAddress', $event)"
                />
                <span class="field-hint">
                  Standard ESC/POS thermal printers listen for raw socket print jobs on TCP port
                  9100.
                </span>
              </div>
            }
          </div>

          <div class="panel-box">
            <div class="panel-header-row">
              <div class="panel-title-group">
                <div class="panel-icon-wrap">
                  <i class="ph ph-sliders"></i>
                </div>
                <div class="panel-title-text">
                  <h2 class="heading-card">Formatting & Mechanics</h2>
                  <p class="panel-subtitle">
                    Paper roll width, automatic cutting, and drawer kick pulses.
                  </p>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Receipt Paper Width</label>
              <div class="segmented-control">
                <button
                  type="button"
                  class="seg-btn"
                  [class.active]="printerConfig().paperWidth === '80mm'"
                  (click)="updatePrinterConfig('paperWidth', '80mm')"
                >
                  <strong>80mm (Standard POS)</strong>
                  <span>48 characters per line</span>
                </button>
                <button
                  type="button"
                  class="seg-btn"
                  [class.active]="printerConfig().paperWidth === '58mm'"
                  (click)="updatePrinterConfig('paperWidth', '58mm')"
                >
                  <strong>58mm (Compact POS)</strong>
                  <span>32 characters per line</span>
                </button>
              </div>
            </div>

            <div class="form-check-group">
              <label class="form-checkbox-label">
                <input
                  type="checkbox"
                  [checked]="printerConfig().autoCut"
                  (change)="updatePrinterConfig('autoCut', $any($event.target).checked)"
                />
                <div class="checkbox-text">
                  <strong>Automatic Paper Cutting</strong>
                  <span class="text-xs text-muted"
                    >Sends ESC/POS cut sequence (GS V A 3) at receipt completion.</span
                  >
                </div>
              </label>

              <label class="form-checkbox-label">
                <input
                  type="checkbox"
                  [checked]="printerConfig().openCashDrawer"
                  (change)="updatePrinterConfig('openCashDrawer', $any($event.target).checked)"
                />
                <div class="checkbox-text">
                  <strong>Open Cash Drawer (Kick Pulse)</strong>
                  <span class="text-xs text-muted"
                    >Sends drawer pulse (ESC p 0) to trigger connected cash drawer.</span
                  >
                </div>
              </label>
            </div>

            <div class="printer-test-cluster">
              <div class="cluster-info">
                <strong>Verify Hardware Communication</strong>
                <p class="text-xs text-muted">
                  Send an instant test slip with alignment, font scale, and auto-cut.
                </p>
              </div>
              <button
                type="button"
                class="btn btn-secondary"
                (click)="testThermalPrint()"
                [disabled]="isTestingPrint()"
              >
                @if (isTestingPrint()) {
                  <i class="ph ph-spinner ph-spin"></i>
                  <span>Printing...</span>
                } @else {
                  <i class="ph ph-printer"></i>
                  <span>Test Print Slip</span>
                }
              </button>
            </div>
          </div>
        </div>
      }

      <!-- TAB 4: KITCHEN & OPERATIONS -->
      @if (activeTab === 'service') {
        <div class="settings-grid">
          <div class="panel-box">
            <div class="panel-header-row">
              <div class="panel-title-group">
                <div class="panel-icon-wrap">
                  <i class="ph ph-cooking-pot"></i>
                </div>
                <div class="panel-title-text">
                  <h2 class="heading-card">Kitchen Dispatch Rules</h2>
                  <p class="panel-subtitle">Preparation pacing and digital table ordering rules.</p>
                </div>
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-group">
                <label class="form-label">Estimated Prep Time</label>
                <div class="input-with-suffix">
                  <input
                    type="number"
                    min="5"
                    max="120"
                    class="form-input has-suffix"
                    [(ngModel)]="profile.estimatedPrepMinutes"
                  />
                  <span class="field-suffix">mins</span>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Minimum Order Spend</label>
                <div class="input-with-suffix">
                  <input
                    type="number"
                    min="0"
                    step="50"
                    class="form-input has-suffix"
                    [(ngModel)]="profile.minOrderAmount"
                  />
                  <span class="field-suffix">₹</span>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Dine-In Table Ordering</label>
              <select class="form-select" [(ngModel)]="profile.dineInEnabled">
                <option [ngValue]="true">Enabled (Accept QR code table orders)</option>
                <option [ngValue]="false">Disabled (Pause digital table ordering)</option>
              </select>
              <span class="field-hint"
                >When disabled, customers scanning table QR codes see menu in view-only mode.</span
              >
            </div>
          </div>

          <div class="panel-box">
            <div class="panel-header-row">
              <div class="panel-title-group">
                <div class="panel-icon-wrap">
                  <i class="ph ph-bag"></i>
                </div>
                <div class="panel-title-text">
                  <h2 class="heading-card">Counter & Takeaway Pacing</h2>
                  <p class="panel-subtitle">Pickup buffers and counter order workflows.</p>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Takeaway & Counter Ordering</label>
              <select class="form-select" [(ngModel)]="profile.takeawayEnabled">
                <option [ngValue]="true">Enabled (Accept counter & takeaway orders)</option>
                <option [ngValue]="false">Disabled (Dine-in only)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Pickup Time Buffer</label>
              <div class="input-with-suffix">
                <input
                  type="number"
                  min="5"
                  max="60"
                  class="form-input has-suffix"
                  [(ngModel)]="profile.pickupBufferMinutes"
                />
                <span class="field-suffix">mins</span>
              </div>
              <span class="field-hint"
                >Buffer time added to takeaway order preparation estimates.</span
              >
            </div>
          </div>
        </div>
      }

      <!-- TAB 5: SYSTEM & STORAGE -->
      @if (activeTab === 'maintenance') {
        <div class="settings-grid maintenance-layout">
          <!-- 1. Live Infrastructure & Core System Health -->
          <div class="panel-box full-width-panel">
            <div class="panel-header-row">
              <div class="panel-title-group">
                <div class="panel-icon-wrap primary-icon-wrap">
                  <i class="ph ph-heartbeat"></i>
                </div>
                <div class="panel-title-text">
                  <h2 class="heading-card">Live Infrastructure & System Health</h2>
                  <p class="panel-subtitle">
                    Real-time connectivity, health telemetry, and round-trip latency across POS
                    engines.
                  </p>
                </div>
              </div>
              <div class="panel-header-actions">
                @if (lastCheckedTime()) {
                  <span class="last-check-text">
                    Checked {{ lastCheckedTime() | date: 'HH:mm:ss' }}
                  </span>
                }
                <button
                  type="button"
                  class="btn btn-secondary btn-sm refresh-diagnostics-btn"
                  (click)="checkSystemHealth()"
                  [disabled]="isCheckingHealth()"
                >
                  <i class="ph ph-arrows-clockwise" [class.ph-spin]="isCheckingHealth()"></i>
                  <span>{{ isCheckingHealth() ? 'Pinging...' : 'Refresh Status' }}</span>
                </button>
              </div>
            </div>

            <!-- 3 System Status Cards Grid -->
            <div class="system-status-cards">
              <!-- Card 1: Local Backend -->
              <div
                class="system-status-card"
                [class.status-card-online]="systemStatuses().localBackend.online"
                [class.status-card-offline]="!systemStatuses().localBackend.online"
              >
                <div class="system-status-card-header">
                  <div class="system-target-info">
                    <span class="system-type-tag">Local Engine</span>
                    <h3 class="system-target-name">Local POS Backend</h3>
                  </div>
                  <span
                    class="system-status-pill"
                    [class.pill-online]="systemStatuses().localBackend.online"
                    [class.pill-offline]="!systemStatuses().localBackend.online"
                  >
                    <span
                      class="status-pulse-dot"
                      [class.dot-online]="systemStatuses().localBackend.online"
                      [class.dot-offline]="!systemStatuses().localBackend.online"
                    ></span>
                    {{ systemStatuses().localBackend.statusText }}
                  </span>
                </div>
                <div class="system-status-card-body">
                  <div class="system-endpoint-row">
                    <i class="ph ph-desktop"></i>
                    <code>{{ systemStatuses().localBackend.url }}</code>
                  </div>
                  <p class="system-status-desc">{{ systemStatuses().localBackend.details }}</p>
                </div>
                <div class="system-status-card-footer">
                  <span class="system-latency-label">Response Latency</span>
                  <span
                    class="system-latency-val"
                    [class.latency-good]="
                      systemStatuses().localBackend.latencyMs > 0 &&
                      systemStatuses().localBackend.latencyMs < 100
                    "
                  >
                    {{
                      systemStatuses().localBackend.latencyMs
                        ? systemStatuses().localBackend.latencyMs + ' ms'
                        : 'N/A'
                    }}
                  </span>
                </div>
              </div>

              <!-- Card 2: Live Backend -->
              <div
                class="system-status-card"
                [class.status-card-online]="systemStatuses().liveBackend.online"
                [class.status-card-offline]="!systemStatuses().liveBackend.online"
              >
                <div class="system-status-card-header">
                  <div class="system-target-info">
                    <span class="system-type-tag">Cloud Gateway</span>
                    <h3 class="system-target-name">Live Cloud Backend</h3>
                  </div>
                  <span
                    class="system-status-pill"
                    [class.pill-online]="systemStatuses().liveBackend.online"
                    [class.pill-offline]="!systemStatuses().liveBackend.online"
                  >
                    <span
                      class="status-pulse-dot"
                      [class.dot-online]="systemStatuses().liveBackend.online"
                      [class.dot-offline]="!systemStatuses().liveBackend.online"
                    ></span>
                    {{ systemStatuses().liveBackend.statusText }}
                  </span>
                </div>
                <div class="system-status-card-body">
                  <div class="system-endpoint-row">
                    <i class="ph ph-cloud"></i>
                    <code>{{ systemStatuses().liveBackend.url }}</code>
                  </div>
                  <p class="system-status-desc">{{ systemStatuses().liveBackend.details }}</p>
                </div>
                <div class="system-status-card-footer">
                  <span class="system-latency-label">Response Latency</span>
                  <span
                    class="system-latency-val"
                    [class.latency-good]="
                      systemStatuses().liveBackend.latencyMs > 0 &&
                      systemStatuses().liveBackend.latencyMs < 500
                    "
                  >
                    {{
                      systemStatuses().liveBackend.latencyMs
                        ? systemStatuses().liveBackend.latencyMs + ' ms'
                        : 'N/A'
                    }}
                  </span>
                </div>
              </div>

              <!-- Card 3: Database -->
              <div
                class="system-status-card"
                [class.status-card-online]="systemStatuses().database.online"
                [class.status-card-offline]="!systemStatuses().database.online"
              >
                <div class="system-status-card-header">
                  <div class="system-target-info">
                    <span class="system-type-tag">PostgreSQL Relational DB</span>
                    <h3 class="system-target-name">Supabase Database</h3>
                  </div>
                  <span
                    class="system-status-pill"
                    [class.pill-online]="systemStatuses().database.online"
                    [class.pill-offline]="!systemStatuses().database.online"
                  >
                    <span
                      class="status-pulse-dot"
                      [class.dot-online]="systemStatuses().database.online"
                      [class.dot-offline]="!systemStatuses().database.online"
                    ></span>
                    {{ systemStatuses().database.statusText }}
                  </span>
                </div>
                <div class="system-status-card-body">
                  <div class="system-endpoint-row">
                    <i class="ph ph-database"></i>
                    <code>{{ systemStatuses().database.url }}</code>
                  </div>
                  <p class="system-status-desc">{{ systemStatuses().database.details }}</p>
                </div>
                <div class="system-status-card-footer">
                  <span class="system-latency-label">Response Latency</span>
                  <span
                    class="system-latency-val"
                    [class.latency-good]="
                      systemStatuses().database.latencyMs > 0 &&
                      systemStatuses().database.latencyMs < 300
                    "
                  >
                    {{
                      systemStatuses().database.latencyMs
                        ? systemStatuses().database.latencyMs + ' ms'
                        : 'N/A'
                    }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. System & Transaction Audit Logs -->
          <div class="panel-box full-width-panel">
            <div class="panel-header-row">
              <div class="panel-title-group">
                <div class="panel-icon-wrap primary-icon-wrap">
                  <i class="ph ph-clipboard-text"></i>
                </div>
                <div class="panel-title-text">
                  <h2 class="heading-card">System & Transaction Audit Logs</h2>
                  <p class="panel-subtitle">
                    Immutable event ledger tracking administrative overrides, orders, bill
                    settlements, and operational states.
                  </p>
                </div>
              </div>
              <div class="audit-toolbar-actions">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  (click)="exportAuditLogs()"
                  title="Export audit log report as JSON"
                >
                  <i class="ph ph-download-simple"></i>
                  <span>Export Logs</span>
                </button>
              </div>
            </div>

            <!-- Audit Filtering & Search Controls -->
            <div class="audit-filter-controls">
              <div class="audit-filter-chips">
                @for (
                  cat of ['ALL', 'AUTH', 'ORDER', 'RECEIPT', 'INVOICE', 'COUPON', 'SYSTEM'];
                  track cat
                ) {
                  <button
                    type="button"
                    class="audit-chip"
                    [class.active]="auditCategoryFilter() === cat"
                    (click)="setAuditCategory(cat)"
                  >
                    {{ cat }}
                  </button>
                }
              </div>
              <div class="audit-search-wrap">
                <i class="ph ph-magnifying-glass input-icon"></i>
                <input
                  type="text"
                  class="form-input with-icon"
                  placeholder="Search logs by actor, action, notes, or entity ID..."
                  [ngModel]="auditSearchText()"
                  (ngModelChange)="onAuditSearchChange($event)"
                />
              </div>
              <span class="audit-count-badge"> {{ filteredAuditLogs().length }} entries </span>
            </div>

            <!-- Audit Feed List with Incremental Pagination (20 initial, +10 load more) -->
            <div class="audit-feed-wrapper">
              @if (filteredAuditLogs().length > 0) {
                <div class="audit-feed-list">
                  @for (entry of paginatedAuditLogs(); track entry.id) {
                    <div class="audit-feed-row">
                      <div class="audit-timestamp-cell">
                        <span class="audit-time">{{ entry.timestamp | date: 'HH:mm:ss' }}</span>
                        <span class="audit-date">{{ entry.timestamp | date: 'mediumDate' }}</span>
                      </div>
                      <div class="audit-action-cell">
                        <span class="audit-action-tag" [attr.data-action]="entry.action">
                          {{ entry.action.replaceAll('_', ' ') }}
                        </span>
                        <span class="audit-entity-label">
                          {{ entry.entityType }}: <code>{{ entry.entityId.slice(0, 14) }}</code>
                        </span>
                      </div>
                      <div class="audit-notes-cell">
                        <p class="audit-notes-text">
                          {{ entry.notes || 'Routine operation event recorded.' }}
                        </p>
                      </div>
                      <div class="audit-actor-cell">
                        <span class="actor-role-pill" [attr.data-role]="entry.actorRole">
                          {{ entry.actorRole }}
                        </span>
                        <span class="actor-name-text">{{
                          entry.actorLabel || 'Authorized User'
                        }}</span>
                      </div>
                    </div>
                  }

                  <!-- Pagination Control (Load 10 by 10) -->
                  <div class="audit-pagination-bar" [class.all-loaded]="!hasMoreAuditLogs()">
                    <span class="pagination-info">
                      Showing <strong>{{ paginatedAuditLogs().length }}</strong> of
                      <strong>{{ filteredAuditLogs().length }}</strong> records
                    </span>
                    @if (hasMoreAuditLogs()) {
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm load-more-btn"
                        (click)="loadMoreAuditLogs()"
                      >
                        <i class="ph ph-arrow-down"></i>
                        <span>Load 10 More</span>
                      </button>
                    } @else if (filteredAuditLogs().length > 20) {
                      <span class="all-loaded-tag">
                        <i class="ph ph-check-circle"></i>
                        All {{ filteredAuditLogs().length }} entries loaded
                      </span>
                    }
                  </div>
                </div>
              } @else {
                <div class="empty-audit-state">
                  <i class="ph ph-clock-counter-clockwise"></i>
                  <p>No audit events match the selected filter criteria.</p>
                </div>
              }
            </div>
          </div>

          <!-- 3. Local Storage Diagnostics -->
          <div class="panel-box">
            <div class="panel-header-row">
              <div class="panel-title-group">
                <div class="panel-icon-wrap">
                  <i class="ph ph-database"></i>
                </div>
                <div class="panel-title-text">
                  <h2 class="heading-card">Local Storage Diagnostics</h2>
                  <p class="panel-subtitle">
                    Zero-latency offline data snapshots cached in browser memory.
                  </p>
                </div>
              </div>
              <span class="panel-badge success">Synchronized</span>
            </div>

            <div class="storage-metrics-grid">
              <div class="storage-metric-card">
                <span class="metric-num">{{ ordersCount() }}</span>
                <span class="metric-lbl">Cached Orders</span>
              </div>
              <div class="storage-metric-card">
                <span class="metric-num">{{ menuCount() }}</span>
                <span class="metric-lbl">Menu Items</span>
              </div>
              <div class="storage-metric-card">
                <span class="metric-num">{{ tablesCount() }}</span>
                <span class="metric-lbl">Dining Tables</span>
              </div>
              <div class="storage-metric-card">
                <span class="metric-num">{{ customersCount() }}</span>
                <span class="metric-lbl">Profiles Saved</span>
              </div>
            </div>
          </div>

          <!-- 4. Reset Demo State -->
          <div class="panel-box danger-box">
            <div class="panel-header-row">
              <div class="panel-title-group">
                <div class="panel-icon-wrap danger-icon-wrap">
                  <i class="ph ph-warning-octagon"></i>
                </div>
                <div class="panel-title-text">
                  <h2 class="heading-card danger-title">Reset Demo State</h2>
                  <p class="panel-subtitle">Clear local modifications and re-seed defaults.</p>
                </div>
              </div>
              <span class="panel-badge danger">Destructive</span>
            </div>

            <p class="text-sm text-secondary">
              Clears local session cache and restores the standard catalog, table layout, and sample
              orders to factory demo state.
            </p>

            <div class="action-footer">
              <button class="btn btn-danger" (click)="confirmResetOpen = true">
                <i class="ph ph-arrow-counter-clockwise"></i>
                <span>Restore Defaults</span>
              </button>
            </div>
          </div>
        </div>
      }

      <!-- TAB 6: ADMIN SECURITY (PASSWORD CHANGE) -->
      @if (activeTab === 'security') {
        <div class="settings-grid">
          <div class="panel-box security-box">
            <div class="panel-header-row">
              <div class="panel-title-group">
                <div class="panel-icon-wrap warning-icon-wrap">
                  <i class="ph ph-shield-check"></i>
                </div>
                <div class="panel-title-text">
                  <h2 class="heading-card">Master Admin Credentials</h2>
                  <p class="panel-subtitle">
                    Authorize bills, reprint duplicates, modify paid orders, and change system
                    settings.
                  </p>
                </div>
              </div>
              <span class="panel-badge warning">High Privilege</span>
            </div>

            <div class="security-banner">
              <i class="ph ph-info"></i>
              <div>
                <strong>Single Password Security</strong>
                <span
                  >Changing this updates the master admin credentials across local storage and the
                  cloud database.</span
                >
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Current Admin Password (Optional)</label>
              <div class="input-with-action">
                <input
                  [type]="showCurrentPwd ? 'text' : 'password'"
                  class="form-input"
                  placeholder="Enter current password if set"
                  [(ngModel)]="pwdForm.currentPassword"
                />
                <button
                  type="button"
                  class="toggle-visibility-btn"
                  (click)="showCurrentPwd = !showCurrentPwd"
                  [attr.aria-label]="showCurrentPwd ? 'Hide password' : 'Show password'"
                >
                  <i
                    class="ph"
                    [class.ph-eye]="!showCurrentPwd"
                    [class.ph-eye-slash]="showCurrentPwd"
                  ></i>
                </button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">New Admin Password *</label>
              <div class="input-with-action">
                <input
                  [type]="showNewPwd ? 'text' : 'password'"
                  class="form-input"
                  placeholder="Enter new password (min. 4 characters)"
                  [(ngModel)]="pwdForm.newPassword"
                />
                <button
                  type="button"
                  class="toggle-visibility-btn"
                  (click)="showNewPwd = !showNewPwd"
                  [attr.aria-label]="showNewPwd ? 'Hide password' : 'Show password'"
                >
                  <i class="ph" [class.ph-eye]="!showNewPwd" [class.ph-eye-slash]="showNewPwd"></i>
                </button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Confirm New Password *</label>
              <div class="input-with-action">
                <input
                  [type]="showConfirmPwd ? 'text' : 'password'"
                  class="form-input"
                  placeholder="Re-enter new password"
                  [(ngModel)]="pwdForm.confirmPassword"
                />
                <button
                  type="button"
                  class="toggle-visibility-btn"
                  (click)="showConfirmPwd = !showConfirmPwd"
                  [attr.aria-label]="showConfirmPwd ? 'Hide password' : 'Show password'"
                >
                  <i
                    class="ph"
                    [class.ph-eye]="!showConfirmPwd"
                    [class.ph-eye-slash]="showConfirmPwd"
                  ></i>
                </button>
              </div>
              @if (
                pwdForm.newPassword &&
                pwdForm.confirmPassword &&
                pwdForm.newPassword !== pwdForm.confirmPassword
              ) {
                <span class="field-error-text">Passwords do not match</span>
              }
            </div>

            <div class="action-footer">
              <button
                type="button"
                class="btn btn-primary"
                (click)="updateAdminPassword()"
                [disabled]="
                  isUpdatingPassword ||
                  !pwdForm.newPassword ||
                  pwdForm.newPassword !== pwdForm.confirmPassword ||
                  pwdForm.newPassword.length < 4
                "
              >
                @if (isUpdatingPassword) {
                  <i class="ph ph-spinner ph-spin"></i>
                  <span>Updating Password...</span>
                } @else {
                  <i class="ph ph-shield-check"></i>
                  <span>Update Admin Password</span>
                }
              </button>
            </div>
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

      <!-- Customized System Popup: Unsaved Changes -->
      @if (unsavedModalOpen) {
        <div class="modal-overlay" (click)="onUnsavedBackdropClick($event)">
          <div class="modal-card unsaved-modal-card" role="dialog" aria-modal="true">
            <div class="unsaved-modal-header">
              <div class="unsaved-modal-icon">
                <i class="ph ph-warning-circle"></i>
              </div>
              <div class="unsaved-modal-text">
                <h3 class="unsaved-modal-title">Unsaved Changes</h3>
                <p class="unsaved-modal-desc">
                  You have unsaved changes in restaurant settings. Would you like to save your
                  modifications or reset them before leaving?
                </p>
              </div>
            </div>

            <div class="unsaved-modal-actions">
              <button type="button" class="btn btn-secondary" (click)="dismissUnsavedModal(false)">
                <span>Stay on Page</span>
              </button>
              <button
                type="button"
                class="btn btn-secondary dirty-reset-btn"
                (click)="resolveUnsavedModal('reset')"
              >
                <i class="ph ph-arrow-u-up-left"></i>
                <span>Reset & Leave</span>
              </button>
              <button type="button" class="btn btn-primary" (click)="resolveUnsavedModal('save')">
                <i class="ph ph-floppy-disk"></i>
                <span>Save & Leave</span>
              </button>
            </div>
          </div>
        </div>
      }
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

      .header-badges {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 10px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-full);
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--color-text-secondary);
      }

      .status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
      }

      .header-actions-group {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .dirty-reset-btn {
        border-color: rgba(220, 38, 38, 0.3);
        color: var(--color-danger);

        &:hover {
          background: rgba(220, 38, 38, 0.08);
          border-color: var(--color-danger);
        }
      }

      .warning-pill {
        background: #fffbeb !important;
        border-color: #fde68a !important;
        color: #b45309 !important;
      }

      .warning-dot {
        background: #f59e0b !important;
        box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.25) !important;
      }

      .settings-tabs-bar {
        display: flex;
        gap: 4px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 5px;
        overflow-x: auto;
        box-shadow: var(--shadow-xs);
      }

      .settings-tab-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: var(--radius-sm);
        border: none;
        background: transparent;
        color: var(--color-text-secondary);
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        transition: all var(--transition-fast);

        i {
          font-size: 1.0625rem;
        }

        &:hover {
          color: var(--color-text-primary);
          background: var(--color-bone-light);
        }

        &.active {
          background: var(--color-primary);
          color: white;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);

          i {
            color: white;
          }
        }
      }

      .tab-chip {
        font-size: 0.6875rem;
        padding: 1px 6px;
        border-radius: var(--radius-full);
        background: rgba(0, 0, 0, 0.08);
        font-weight: 700;
      }

      .settings-tab-btn.active .tab-chip {
        background: rgba(255, 255, 255, 0.25);
        color: white;
      }

      .settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(440px, 1fr));
        gap: 20px;

        @media (max-width: 600px) {
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
        box-shadow: var(--shadow-sm);
      }

      .panel-header-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .panel-title-group {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }

      .panel-icon-wrap {
        width: 36px;
        height: 36px;
        border-radius: var(--radius-sm);
        background: rgba(194, 65, 12, 0.1);
        color: var(--color-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1875rem;
        flex-shrink: 0;
      }

      .danger-icon-wrap {
        background: rgba(220, 38, 38, 0.12);
        color: var(--color-danger);
      }

      .warning-icon-wrap {
        background: rgba(245, 158, 11, 0.12);
        color: #d97706;
      }

      .panel-title-text {
        h2 {
          font-size: 0.9375rem;
          font-weight: 700;
          color: var(--color-text-primary);
          letter-spacing: -0.01em;
          margin: 0;
        }

        .panel-subtitle {
          font-size: 0.75rem;
          color: var(--color-text-muted);
          margin-top: 2px;
        }
      }

      .panel-badge {
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: var(--radius-xs);
        background: var(--color-bone-light);
        color: var(--color-text-secondary);
        border: 1px solid var(--color-border);
        white-space: nowrap;

        &.highlight {
          background: rgba(194, 65, 12, 0.1);
          color: var(--color-primary);
          border-color: rgba(194, 65, 12, 0.25);
        }

        &.success {
          background: #ecfdf5;
          color: #059669;
          border-color: #a7f3d0;
        }

        &.danger {
          background: #fef2f2;
          color: #dc2626;
          border-color: #fecaca;
        }

        &.warning {
          background: #fffbeb;
          color: #b45309;
          border-color: #fde68a;
        }
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .form-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;

        @media (max-width: 500px) {
          grid-template-columns: 1fr;
        }
      }

      .form-label {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-text-secondary);
      }

      .input-with-icon {
        position: relative;
        display: flex;
        align-items: center;

        .field-icon {
          position: absolute;
          left: 12px;
          color: var(--color-text-muted);
          font-size: 1rem;
          pointer-events: none;
        }

        .form-input.has-icon {
          padding-left: 36px;
        }
      }

      .input-with-suffix {
        position: relative;
        display: flex;
        align-items: center;

        .form-input.has-suffix {
          padding-right: 38px;
        }

        .field-suffix {
          position: absolute;
          right: 12px;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--color-text-muted);
          pointer-events: none;
        }
      }

      .disabled-input {
        opacity: 0.75;
        background: var(--color-bone-light);
        cursor: not-allowed;
      }

      .label-with-action {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .btn-text {
        background: none;
        border: none;
        color: var(--color-primary);
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 0;

        &:hover:not(:disabled) {
          text-decoration: underline;
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      .field-hint {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
        margin-top: 2px;
      }

      /* Radio Cards Cluster */
      .radio-cards-cluster {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .radio-card {
        display: flex;
        align-items: center;
        padding: 12px 14px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all var(--transition-fast);
        background: var(--color-surface);

        input[type='radio'] {
          margin-right: 12px;
          accent-color: var(--color-primary);
          cursor: pointer;
        }

        &:hover {
          border-color: var(--color-primary);
          background: rgba(194, 65, 12, 0.03);
        }

        &.selected {
          border-color: var(--color-primary);
          background: rgba(194, 65, 12, 0.06);
        }
      }

      .radio-card-content {
        display: flex;
        align-items: center;
        gap: 12px;

        i {
          font-size: 1.375rem;
          color: var(--color-primary);
        }

        strong {
          display: block;
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--color-text-primary);
        }

        span {
          display: block;
          font-size: 0.6875rem;
          color: var(--color-text-muted);
        }
      }

      /* Segmented Control */
      .segmented-control {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        background: var(--color-bone-light);
        padding: 4px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
      }

      .seg-btn {
        padding: 8px 10px;
        border: none;
        border-radius: var(--radius-xs);
        background: transparent;
        cursor: pointer;
        text-align: center;
        transition: all var(--transition-fast);

        strong {
          display: block;
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--color-text-secondary);
        }

        span {
          display: block;
          font-size: 0.6875rem;
          color: var(--color-text-muted);
        }

        &.active {
          background: var(--color-surface);
          box-shadow: var(--shadow-xs);
          border: 1px solid var(--color-border);

          strong {
            color: var(--color-primary);
          }
        }
      }

      /* Checkbox & Test Cluster */
      .form-check-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 4px;
      }

      .form-checkbox-label {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        cursor: pointer;

        input[type='checkbox'] {
          margin-top: 2px;
          accent-color: var(--color-primary);
          cursor: pointer;
        }
      }

      .checkbox-text {
        display: flex;
        flex-direction: column;

        strong {
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--color-text-primary);
        }
      }

      .printer-test-cluster {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        background: var(--color-bone-light);
        border: 1px dashed var(--color-border);
        border-radius: var(--radius-sm);
        gap: 16px;
        margin-top: 8px;
      }

      .cluster-info {
        strong {
          display: block;
          font-size: 0.8125rem;
          color: var(--color-text-primary);
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
        font-family: var(--font-mono, monospace);
        color: var(--color-primary);
        line-height: 1.2;
      }

      .metric-lbl {
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-top: 2px;
      }

      .danger-box {
        border-color: rgba(220, 38, 38, 0.3);
        background: var(--color-surface);
      }

      .danger-title {
        color: var(--color-danger);
      }

      .security-box {
        max-width: 640px;
        width: 100%;
        margin: 0 auto;
      }

      .security-banner {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        background: rgba(59, 130, 246, 0.06);
        border: 1px solid rgba(59, 130, 246, 0.2);
        border-radius: var(--radius-sm);
        padding: 12px 14px;
        color: var(--color-text-secondary);

        i {
          font-size: 1.25rem;
          color: #2563eb;
          flex-shrink: 0;
          margin-top: 2px;
        }

        strong {
          display: block;
          font-size: 0.8125rem;
          color: var(--color-text-primary);
          margin-bottom: 2px;
        }

        span {
          font-size: 0.75rem;
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

      .field-error-text {
        font-size: 0.75rem;
        color: var(--color-danger, #dc2626);
        font-weight: 500;
        margin-top: 4px;
        display: block;
      }

      .action-footer {
        display: flex;
        justify-content: flex-end;
        padding-top: 8px;
      }

      /* Faded Save Button when Unchanged */
      .save-btn.btn-faded,
      .save-btn:disabled {
        opacity: 0.42 !important;
        cursor: not-allowed !important;
        filter: grayscale(0.2) !important;
        box-shadow: none !important;
        pointer-events: auto !important;
      }

      /* Customized Unsaved Changes Modal */
      .unsaved-modal-card {
        max-width: 480px;
        width: 100%;
        padding: 24px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg, 0 10px 25px -5px rgba(0, 0, 0, 0.2));
        display: flex;
        flex-direction: column;
        gap: 20px;
        animation: unsavedModalIn 0.18s ease-out;
      }

      @keyframes unsavedModalIn {
        from {
          opacity: 0;
          transform: scale(0.97) translateY(-6px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      .unsaved-modal-header {
        display: flex;
        align-items: flex-start;
        gap: 14px;
      }

      .unsaved-modal-icon {
        width: 42px;
        height: 42px;
        border-radius: var(--radius-sm);
        background: #fffbeb;
        color: #d97706;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.375rem;
        flex-shrink: 0;
      }

      .unsaved-modal-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .unsaved-modal-title {
        font-size: 1.0625rem;
        font-weight: 700;
        color: var(--color-text-primary);
        margin: 0;
      }

      .unsaved-modal-desc {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        line-height: 1.45;
        margin: 0;
      }

      .unsaved-modal-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }

      /* Maintenance & System Storage Tab Styles */
      .maintenance-layout {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      .full-width-panel {
        width: 100%;
      }

      .primary-icon-wrap {
        background: rgba(234, 88, 12, 0.1);
        color: var(--color-primary);
      }

      .panel-header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .last-check-text {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
        font-weight: 500;
      }

      .refresh-diagnostics-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      /* 3-card System Status Grid */
      .system-status-cards {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-top: 16px;
      }

      @media (max-width: 900px) {
        .system-status-cards {
          grid-template-columns: 1fr;
        }
      }

      .system-status-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 16px 18px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 14px;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease,
          border-color 0.15s ease;
      }

      .system-status-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
      }

      .status-card-online {
        border-left: 4px solid #16a34a;
      }

      .status-card-offline {
        border-left: 4px solid #ea580c;
      }

      .system-status-card-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .system-target-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .system-type-tag {
        font-size: 0.6875rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-tertiary, #9ca3af);
      }

      .system-target-name {
        font-size: 0.9375rem;
        font-weight: 700;
        color: var(--color-text-primary);
        margin: 0;
      }

      .system-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 9999px;
      }

      .pill-online {
        background: #f0fdf4;
        color: #166534;
        border: 1px solid #bbf7d0;
      }

      .pill-offline {
        background: #fff7ed;
        color: #9a3412;
        border: 1px solid #fed7aa;
      }

      .status-pulse-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
      }

      .dot-online {
        background-color: #16a34a;
        box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.7);
        animation: status-pulse-online 2s infinite cubic-bezier(0.66, 0, 0, 1);
      }

      .dot-offline {
        background-color: #ea580c;
        box-shadow: 0 0 0 0 rgba(234, 88, 12, 0.7);
        animation: status-pulse-offline 2s infinite cubic-bezier(0.66, 0, 0, 1);
      }

      @keyframes status-pulse-online {
        0% {
          transform: scale(0.95);
          box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.7);
        }
        70% {
          transform: scale(1);
          box-shadow: 0 0 0 6px rgba(22, 163, 74, 0);
        }
        100% {
          transform: scale(0.95);
          box-shadow: 0 0 0 0 rgba(22, 163, 74, 0);
        }
      }

      @keyframes status-pulse-offline {
        0% {
          transform: scale(0.95);
          box-shadow: 0 0 0 0 rgba(234, 88, 12, 0.7);
        }
        70% {
          transform: scale(1);
          box-shadow: 0 0 0 6px rgba(234, 88, 12, 0);
        }
        100% {
          transform: scale(0.95);
          box-shadow: 0 0 0 0 rgba(234, 88, 12, 0);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .dot-online,
        .dot-offline {
          animation: none !important;
        }
      }

      .system-status-card-body {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .system-endpoint-row {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
      }

      .system-endpoint-row code {
        font-family: monospace;
        font-size: 0.75rem;
        background: var(--color-bg, #f3f4f6);
        padding: 2px 6px;
        border-radius: 4px;
        word-break: break-all;
      }

      .system-status-desc {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        margin: 0;
        line-height: 1.4;
      }

      .system-status-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-top: 1px dashed var(--color-border);
        padding-top: 10px;
        font-size: 0.75rem;
      }

      .system-latency-label {
        color: var(--color-text-secondary);
      }

      .system-latency-val {
        font-weight: 700;
        color: var(--color-text-primary);
        font-family: monospace;
      }

      .system-latency-val.latency-good {
        color: #16a34a;
      }

      /* Audit Logs Toolbar & Feed */
      .audit-toolbar-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .audit-filter-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 16px;
        margin-bottom: 12px;
      }

      .audit-filter-chips {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .audit-chip {
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text-secondary);
        font-size: 0.75rem;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .audit-chip:hover {
        background: var(--color-bg, #f3f4f6);
        color: var(--color-text-primary);
      }

      .audit-chip.active {
        background: var(--color-primary);
        color: #ffffff;
        border-color: var(--color-primary);
      }

      .audit-search-wrap {
        position: relative;
        flex: 1;
        max-width: 400px;
      }

      .audit-search-wrap .input-icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--color-text-secondary);
        font-size: 0.875rem;
      }

      .audit-search-wrap .form-input.with-icon {
        padding-left: 32px;
        font-size: 0.8125rem;
        height: 32px;
      }

      .audit-count-badge {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
        font-weight: 500;
      }

      /* Audit Feed */
      .audit-feed-wrapper {
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        max-height: 420px;
        overflow-y: auto;
      }

      .audit-feed-list {
        display: flex;
        flex-direction: column;
      }

      .audit-feed-row {
        display: grid;
        grid-template-columns: 100px 170px 1fr 140px;
        gap: 14px;
        align-items: center;
        padding: 10px 16px;
        border-bottom: 1px solid var(--color-border);
        font-size: 0.8125rem;
        transition: background 0.12s ease;
      }

      .audit-feed-row:last-child {
        border-bottom: none;
      }

      .audit-feed-row:hover {
        background: var(--color-bg-hover, #f9fafb);
      }

      @media (max-width: 800px) {
        .audit-feed-row {
          grid-template-columns: 1fr;
          gap: 6px;
        }
      }

      .audit-timestamp-cell {
        display: flex;
        flex-direction: column;
      }

      .audit-time {
        font-weight: 700;
        font-family: monospace;
        color: var(--color-text-primary);
      }

      .audit-date {
        font-size: 0.6875rem;
        color: var(--color-text-secondary);
      }

      .audit-action-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .audit-action-tag {
        font-weight: 600;
        color: var(--color-primary);
        font-size: 0.75rem;
        letter-spacing: 0.02em;
      }

      .audit-entity-label {
        font-size: 0.6875rem;
        color: var(--color-text-secondary);
      }

      .audit-entity-label code {
        font-family: monospace;
        background: var(--color-bg, #f3f4f6);
        padding: 1px 4px;
        border-radius: 3px;
      }

      .audit-notes-cell {
        color: var(--color-text-secondary);
      }

      .audit-notes-text {
        margin: 0;
        line-height: 1.4;
      }

      .audit-actor-cell {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 2px;
      }

      .actor-role-pill {
        font-size: 0.6875rem;
        font-weight: 700;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
        background: #f3f4f6;
        color: #374151;
      }

      .actor-role-pill[data-role='admin'] {
        background: #eff6ff;
        color: #1d4ed8;
      }

      .actor-role-pill[data-role='staff'],
      .actor-role-pill[data-role='waiter'] {
        background: #f0fdf4;
        color: #15803d;
      }

      .actor-role-pill[data-role='system'] {
        background: #fdf2f8;
        color: #9d174d;
      }

      .actor-name-text {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
      }

      .empty-audit-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 40px 16px;
        color: var(--color-text-secondary);
      }

      .empty-audit-state i {
        font-size: 2rem;
      }

      /* Audit Pagination Controls */
      .audit-pagination-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 18px;
        background: var(--color-bg, #f9fafb);
        border-top: 1px solid var(--color-border);
        font-size: 0.8125rem;
        transition: background 0.15s ease;
      }

      .audit-pagination-bar.all-loaded {
        justify-content: center;
        gap: 12px;
      }

      .pagination-info {
        color: var(--color-text-secondary);
      }

      .pagination-info strong {
        color: var(--color-text-primary);
      }

      .load-more-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
        cursor: pointer;
        transition:
          transform 0.1s ease,
          box-shadow 0.15s ease;
      }

      .load-more-btn:active {
        transform: translateY(1px);
      }

      .all-loaded-tag {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.75rem;
        color: #16a34a;
        font-weight: 600;
      }

      /* Dynamic Semantic Action Colors */
      .audit-action-tag[data-action*='LOGIN'] {
        color: #0284c7;
      }

      .audit-action-tag[data-action*='LOGOUT'] {
        color: #64748b;
      }

      .audit-action-tag[data-action*='RECEIPT'] {
        color: #0d9488;
      }

      .audit-action-tag[data-action*='INVOICE'] {
        color: #7c3aed;
      }

      .audit-action-tag[data-action*='ORDER'] {
        color: #ea580c;
      }

      .audit-action-tag[data-action*='COUPON'] {
        color: #db2777;
      }
    `,
  ],
})
export class SettingsComponent implements OnInit {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);
  private http = inject(HttpClient);
  auth = inject(AdminAuthService);
  thermalPrinter = inject(ThermalPrinterService);

  // Live Infrastructure Telemetry State
  isCheckingHealth = signal<boolean>(false);
  lastCheckedTime = signal<Date | null>(null);

  systemStatuses = signal<{
    localBackend: {
      online: boolean;
      statusText: string;
      url: string;
      details: string;
      latencyMs: number;
    };
    liveBackend: {
      online: boolean;
      statusText: string;
      url: string;
      details: string;
      latencyMs: number;
    };
    database: {
      online: boolean;
      statusText: string;
      url: string;
      details: string;
      latencyMs: number;
    };
  }>({
    localBackend: {
      online: false,
      statusText: 'Standby / Checking...',
      url: 'http://127.0.0.1:3000',
      details: 'Querying local Axum POS engine...',
      latencyMs: 0,
    },
    liveBackend: {
      online: false,
      statusText: 'Connecting...',
      url: 'https://hotel-crm-api-vpxu.onrender.com',
      details: 'Checking cloud microservice availability...',
      latencyMs: 0,
    },
    database: {
      online: false,
      statusText: 'Connecting...',
      url: 'https://umpwjosivlpknjskpzdl.supabase.co',
      details: 'Verifying PostgreSQL PostgREST endpoint...',
      latencyMs: 0,
    },
  });

  // Audit Logs State & Incremental Pagination (20 initial, +10 load more)
  auditCategoryFilter = signal<string>('ALL');
  auditSearchText = signal<string>('');
  auditDisplayLimit = signal<number>(20);
  auditLogs = this.mock.auditLogs;

  filteredAuditLogs = computed(() => {
    const filter = this.auditCategoryFilter();
    const query = this.auditSearchText().toLowerCase().trim();
    const logs = this.auditLogs();

    return logs.filter((log) => {
      const matchesCategory =
        filter === 'ALL' ||
        (filter === 'AUTH' &&
          (log.action === 'USER_LOGIN' ||
            log.action === 'USER_LOGOUT' ||
            log.entityType === 'SESSION')) ||
        (filter === 'RECEIPT' &&
          (log.action.includes('RECEIPT') ||
            log.action.includes('KOT') ||
            log.entityType === 'RECEIPT')) ||
        (filter === 'ORDER' && (log.action.includes('ORDER') || log.entityType === 'ORDER')) ||
        (filter === 'INVOICE' &&
          (log.action.includes('INVOICE') || log.entityType === 'INVOICE')) ||
        (filter === 'COUPON' &&
          (log.action.includes('COUPON') || log.entityType.startsWith('COUPON'))) ||
        (filter === 'SYSTEM' &&
          (log.actorRole === 'SYSTEM' ||
            log.entityType === 'SYSTEM' ||
            log.action.includes('PHONE')));

      if (!matchesCategory) return false;
      if (!query) return true;

      return (
        log.actorLabel?.toLowerCase().includes(query) ||
        log.action?.toLowerCase().includes(query) ||
        log.notes?.toLowerCase().includes(query) ||
        log.entityId?.toLowerCase().includes(query) ||
        log.entityType?.toLowerCase().includes(query)
      );
    });
  });

  paginatedAuditLogs = computed(() => {
    return this.filteredAuditLogs().slice(0, this.auditDisplayLimit());
  });

  hasMoreAuditLogs = computed(() => {
    return this.auditDisplayLimit() < this.filteredAuditLogs().length;
  });

  loadMoreAuditLogs(): void {
    this.auditDisplayLimit.update((current) => current + 10);
  }

  setAuditCategory(cat: string): void {
    this.auditCategoryFilter.set(cat);
    this.auditDisplayLimit.set(20);
  }

  onAuditSearchChange(text: string): void {
    this.auditSearchText.set(text);
    this.auditDisplayLimit.set(20);
  }

  activeTab: SettingsTab = 'general';
  confirmResetOpen = false;
  savedProfileJson = '';

  isDirty(): boolean {
    return Boolean(this.savedProfileJson && JSON.stringify(this.profile) !== this.savedProfileJson);
  }

  resetChanges(): void {
    if (this.savedProfileJson) {
      this.profile = JSON.parse(this.savedProfileJson);
      this.toastService.info('Unsaved changes discarded');
    }
  }

  unsavedModalOpen = false;
  private pendingNavigationResolver: ((allow: boolean) => void) | null = null;

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.isDirty()) {
      event.preventDefault();
    }
  }

  canDeactivate(): Promise<boolean> | boolean {
    if (!this.isDirty()) {
      return true;
    }
    this.unsavedModalOpen = true;
    return new Promise<boolean>((resolve) => {
      this.pendingNavigationResolver = resolve;
    });
  }

  dismissUnsavedModal(allow: boolean = false): void {
    this.unsavedModalOpen = false;
    if (this.pendingNavigationResolver) {
      this.pendingNavigationResolver(allow);
      this.pendingNavigationResolver = null;
    }
  }

  resolveUnsavedModal(action: 'save' | 'reset'): void {
    if (action === 'save') {
      this.saveSettings();
      this.dismissUnsavedModal(true);
    } else {
      this.resetChanges();
      this.dismissUnsavedModal(true);
    }
  }

  onUnsavedBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.dismissUnsavedModal(false);
    }
  }

  // Thermal Printer state
  printerConfig = this.thermalPrinter.config;
  availablePrinters = signal<SystemPrinterInfo[]>([]);
  isLoadingPrinters = signal<boolean>(false);
  isTestingPrint = signal<boolean>(false);

  // Admin Security Password state
  showCurrentPwd = false;
  showNewPwd = false;
  showConfirmPwd = false;
  isUpdatingPassword = false;

  pwdForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };

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
    customerMenuUrl: 'https://gurukripadhaba-menu.vercel.app',
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

  constructor() {
    effect(() => {
      const res = this.mock.restaurant();
      if (res) {
        this.loadCurrentSettings(res);
      }
    });
  }

  ngOnInit(): void {
    this.loadCurrentSettings();
    this.loadSystemPrinters();
    this.checkSystemHealth();
  }

  loadSystemPrinters(): void {
    this.isLoadingPrinters.set(true);
    this.thermalPrinter.getSystemPrinters().subscribe({
      next: (list) => {
        this.availablePrinters.set(list);
        this.isLoadingPrinters.set(false);
        // Default to system default printer if not yet selected
        if (!this.printerConfig().printerName) {
          const def = list.find((p) => p.is_default);
          if (def) {
            this.thermalPrinter.saveConfig({ printerName: def.name });
          }
        }
      },
      error: () => this.isLoadingPrinters.set(false),
    });
  }

  updatePrinterConfig(field: keyof EscPosPrinterConfig, value: any): void {
    this.thermalPrinter.saveConfig({ [field]: value });
  }

  testThermalPrint(): void {
    this.isTestingPrint.set(true);
    this.thermalPrinter.testPrint(this.profile.name).subscribe({
      next: (res) => {
        this.isTestingPrint.set(false);
        if (res.success) {
          this.toastService.success(`Test receipt sent to printer: ${res.message}`);
        } else {
          this.toastService.warning(`Printer response: ${res.message}`);
        }
      },
      error: (err) => {
        this.isTestingPrint.set(false);
        this.toastService.error(`Could not reach thermal printer: ${err?.message || 'Error'}`);
      },
    });
  }

  private loadCurrentSettings(customRes?: Restaurant | null): void {
    const res = customRes || this.mock.restaurant();
    if (res) {
      this.profile = {
        name: res.name || this.profile.name,
        tagline:
          res.tagline !== undefined && res.tagline !== null ? res.tagline : this.profile.tagline,
        description:
          res.description !== undefined && res.description !== null
            ? res.description
            : this.profile.description,
        contactPhone: res.contact?.phone || this.profile.contactPhone,
        contactEmail: res.contact?.email || this.profile.contactEmail,
        customerMenuUrl:
          localStorage.getItem('hotel_crm_customer_menu_url') ||
          res.contact?.website ||
          environment.customerMenuUrl ||
          'https://gurukripadhaba-menu.vercel.app',
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
      this.savedProfileJson = JSON.stringify(this.profile);
    }
  }

  saveSettings(): void {
    const cleanMenuUrl = (
      this.profile.customerMenuUrl ||
      environment.customerMenuUrl ||
      'https://gurukripadhaba-menu.vercel.app'
    ).trim();
    localStorage.setItem('hotel_crm_customer_menu_url', cleanMenuUrl);

    const current = this.mock.restaurant();
    const parts = this.profile.statePin.split('-').map((s) => s.trim());
    const state = parts[0] || current?.address?.state || 'Karnataka';
    const zip = parts[1] || current?.address?.zip || '560001';

    const updated: Restaurant = {
      id: current?.id || 'rest-001',
      slug: current?.slug || 'gurukripa-dhaba',
      name: this.profile.name.trim(),
      tagline: this.profile.tagline?.trim() || '',
      description: this.profile.description?.trim() || '',
      coverImage: current?.coverImage || '',
      logoUrl: current?.logoUrl || '',
      cuisine: current?.cuisine || ['North Indian', 'Mughlai'],
      rating: current?.rating || 4.8,
      reviewCount: current?.reviewCount || 120,
      openingHours: current?.openingHours || [],
      currency: current?.currency || 'INR',
      currencySymbol: current?.currencySymbol || '₹',
      contact: {
        phone: this.profile.contactPhone,
        email: this.profile.contactEmail,
        website: cleanMenuUrl,
      },
      address: {
        ...current?.address,
        street: this.profile.street,
        city: this.profile.city,
        state,
        zip,
      },
      taxSettings: {
        ...current?.taxSettings,
        enableGst: true,
        cgstRate: Number(this.profile.cgstRate) || 0,
        sgstRate: Number(this.profile.sgstRate) || 0,
        serviceChargeRate: Number(this.profile.serviceChargeRate) || 0,
        gstNumber: this.profile.gstNumber,
      },
      orderingSettings: {
        ...current?.orderingSettings,
        dineInEnabled: this.profile.dineInEnabled,
        takeawayEnabled: this.profile.takeawayEnabled,
        estimatedPrepMinutes: Number(this.profile.estimatedPrepMinutes) || 25,
        minOrderAmount: Number(this.profile.minOrderAmount) || 0,
      },
    };

    this.mock.updateRestaurantSettings(updated).subscribe({
      next: () => {
        this.savedProfileJson = JSON.stringify(this.profile);
        this.toastService.success('Restaurant and printer settings saved');
      },
      error: () => {
        this.savedProfileJson = JSON.stringify(this.profile);
        this.toastService.success('Restaurant settings saved locally');
      },
    });
  }

  updateAdminPassword(): void {
    if (this.pwdForm.newPassword !== this.pwdForm.confirmPassword) {
      this.toastService.error('New passwords do not match.');
      return;
    }
    if (this.pwdForm.newPassword.length < 4) {
      this.toastService.error('Password must be at least 4 characters long.');
      return;
    }

    this.isUpdatingPassword = true;
    this.auth
      .changeAdminPassword(this.pwdForm.newPassword, this.pwdForm.currentPassword)
      .subscribe({
        next: (res) => {
          this.isUpdatingPassword = false;
          if (res.success) {
            this.toastService.success('Admin master password updated successfully.');
            this.pwdForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
          } else {
            this.toastService.error(res.message || 'Failed to update admin password.');
          }
        },
        error: (err) => {
          this.isUpdatingPassword = false;
          this.toastService.error(err?.message || 'Error updating password.');
        },
      });
  }

  checkSystemHealth(): void {
    this.isCheckingHealth.set(true);

    // 1. Check Local POS Backend
    const t0Local = performance.now();
    this.http
      .get<{ status: string }>('http://127.0.0.1:3000/api/v1/health')
      .pipe(
        timeout(2000),
        catchError(() => of(null)),
      )
      .subscribe((res) => {
        const t1 = performance.now();
        const duration = Math.round(t1 - t0Local);
        const isOk = Boolean(res && (res as any).status === 'ok');

        this.systemStatuses.update((curr) => ({
          ...curr,
          localBackend: {
            online: isOk,
            statusText: isOk ? 'Online (Axum)' : 'Standby / Client Mode',
            url: 'http://127.0.0.1:3000/api/v1/health',
            details: isOk
              ? 'Local microservice engine online and processing requests.'
              : 'Local port 3000 daemon not running. Running in standalone client mode.',
            latencyMs: isOk ? duration : 0,
          },
        }));
      });

    // 2. Check Live Cloud Backend
    const t0Cloud = performance.now();
    this.http
      .get<{ status: string }>('https://hotel-crm-api-vpxu.onrender.com/health')
      .pipe(
        timeout(5000),
        catchError(() => of(null)),
      )
      .subscribe((res) => {
        const t1 = performance.now();
        const duration = Math.round(t1 - t0Cloud);
        const isOk = Boolean(res && (res as any).status === 'ok');

        this.systemStatuses.update((curr) => ({
          ...curr,
          liveBackend: {
            online: isOk,
            statusText: isOk ? 'Healthy / Active' : 'Standby / Sleep',
            url: 'https://hotel-crm-api-vpxu.onrender.com/health',
            details: isOk
              ? 'Render cloud service active & responding with zero errors.'
              : 'Render free-tier instance sleeping or spinning up.',
            latencyMs: isOk ? duration : 0,
          },
        }));
      });

    // 3. Check Supabase PostgreSQL Database
    const t0Db = performance.now();
    const headers = new HttpHeaders({
      apikey: environment.supabaseAnonKey,
      Authorization: `Bearer ${environment.supabaseAnonKey}`,
    });

    this.http
      .get<any[]>(`${environment.supabaseUrl}/rest/v1/restaurants?select=id&limit=1`, { headers })
      .pipe(
        timeout(4000),
        catchError(() => of(null)),
      )
      .subscribe((res) => {
        const t1 = performance.now();
        const duration = Math.round(t1 - t0Db);
        const isOk = Array.isArray(res);

        this.systemStatuses.update((curr) => ({
          ...curr,
          database: {
            online: isOk,
            statusText: isOk ? 'Connected (PostgreSQL)' : 'Unreachable',
            url: environment.supabaseUrl,
            details: isOk
              ? 'PostgreSQL cloud database connected & accepting operational queries.'
              : 'PostgreSQL PostgREST endpoint timed out. Verify network connection.',
            latencyMs: isOk ? duration : 0,
          },
        }));

        this.lastCheckedTime.set(new Date());
        this.isCheckingHealth.set(false);
      });
  }

  exportAuditLogs(): void {
    const logs = this.filteredAuditLogs();
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gurukripa_pos_audit_logs_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toastService.success(`Exported ${logs.length} audit log entries.`);
  }

  executeDataReset(): void {
    this.mock.resetAllDemoData();
    this.loadCurrentSettings();
    this.toastService.info('System configuration restored to default state');
    this.confirmResetOpen = false;
  }
}
