import { Component, inject, signal, OnInit, effect, HostListener, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
import { WhatsAppBridgeService } from '../../../core/services/whatsapp-bridge.service';

type SettingsTab =
  'general' | 'tax' | 'printer' | 'whatsapp' | 'service' | 'maintenance' | 'security' | 'reset';

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
            @if (isDirty()) {
              <span class="status-pill warning-pill pulse-soft">
                <span class="status-dot warning-dot"></span>
                Unsaved Changes
              </span>
            }
          </div>
          <h1 class="heading-display">Restaurant Settings</h1>
          <p class="text-muted">
            Manage restaurant profile, hardware, ordering channels, and system configuration.
          </p>
        </div>

        @if (activeTab !== 'security' && activeTab !== 'reset') {
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

      <!-- Quick Search / Option Navigator Bar -->
      <div class="settings-search-bar">
        <div class="search-input-wrap">
          <i class="ph ph-magnifying-glass search-icon"></i>
          <input
            type="text"
            class="form-input search-input"
            placeholder="Search settings..."
            [ngModel]="settingsSearchQuery()"
            (ngModelChange)="settingsSearchQuery.set($event)"
          />
          <div class="search-tools-right">
            @if (settingsSearchQuery()) {
              <button
                type="button"
                class="search-clear-btn"
                (click)="settingsSearchQuery.set('')"
                title="Clear search filter"
              >
                <i class="ph ph-x"></i>
              </button>
            }
          </div>
        </div>
      </div>

      <!-- Settings Master-Detail Layout -->
      <div class="settings-layout">
        <!-- Sidebar Navigation Rail -->
        <aside class="settings-sidebar" role="tablist" aria-label="Settings categories">
          @for (group of groupedNavItems(); track group.category) {
            <div class="sidebar-category-group">
              <span class="sidebar-category-heading">{{ group.category }}</span>
              <div class="sidebar-nav-items">
                @for (item of group.items; track item.id) {
                  <button
                    type="button"
                    class="sidebar-nav-btn"
                    [attr.data-tab]="item.id"
                    [class.active]="activeTab === item.id"
                    [class.search-matched]="settingsSearchQuery() && item.matchesSearch"
                    [class.dimmed]="settingsSearchQuery() && !item.matchesSearch"
                    (click)="switchTab(item.id)"
                  >
                    <div class="nav-btn-icon-box">
                      <i class="ph" [class]="item.icon"></i>
                    </div>
                    <span class="nav-btn-label">{{ item.label }}</span>
                    @if (item.badge) {
                      <span
                        class="tab-chip"
                        [class.badge-live]="item.badge === 'LIVE'"
                        [class.badge-free]="item.badge === 'FREE'"
                        [class.badge-reset]="item.badge === 'RESET'"
                        [class.badge-escpos]="item.badge === 'ESC/POS'"
                      >
                        @if (item.badge === 'LIVE') {
                          <span class="pulse-live-dot"></span>
                        }
                        {{ item.badge }}
                      </span>
                    }
                    <i class="ph ph-caret-right nav-chevron"></i>
                  </button>
                }
              </div>
            </div>
          }
        </aside>

        <!-- Right Content Pane -->
        <main class="settings-content-pane">
          <!-- TAB 1: BRAND PROFILE & CONTACT -->
          @if (activeTab === 'general') {
            <div class="settings-grid">
              <div class="panel-box apple-card">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap icon-blue">
                      <i class="ph ph-storefront"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">Brand Identity</h2>
                      <p class="panel-subtitle">
                        Public restaurant name, menu banner details, and concept description.
                      </p>
                    </div>
                  </div>
                  <span class="panel-badge highlight-blue">Public Display</span>
                </div>

                <div class="form-group">
                  <label class="form-label">Establishment Name *</label>
                  <div class="input-with-icon">
                    <i class="ph ph-buildings field-icon"></i>
                    <input
                      type="text"
                      class="form-input has-icon"
                      [(ngModel)]="profile.name"
                      placeholder="e.g. Gurukripa Dhaba"
                    />
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Tagline / Culinary Subtitle</label>
                  <div class="input-with-icon">
                    <i class="ph ph-sparkle field-icon"></i>
                    <input
                      type="text"
                      class="form-input has-icon"
                      [(ngModel)]="profile.tagline"
                      placeholder="e.g. Authentic North Indian & Tandoor"
                    />
                  </div>
                </div>

                <div class="form-group">
                  <div class="label-with-action">
                    <label class="form-label">Concept Description</label>
                    <span class="char-count-text">{{ profile.description.length || 0 }} chars</span>
                  </div>
                  <textarea
                    class="form-textarea"
                    rows="3"
                    [(ngModel)]="profile.description"
                    placeholder="Short description of your cuisine, heritage, and dining experience..."
                  ></textarea>
                  <span class="field-hint">
                    Appears on the digital QR ordering welcome screen and customer receipt header.
                  </span>
                </div>
              </div>

              <!-- Dedicated Google Review & Public Presence Card -->
              <div class="panel-box apple-card google-review-panel">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap google-icon-wrap">
                      <i class="ph ph-star-fill"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">Google Reviews &amp; Online Presence</h2>
                      <p class="panel-subtitle">
                        Direct Google review shortlink and customer QR mobile menu hosting URL.
                      </p>
                    </div>
                  </div>
                  <span class="panel-badge highlight-google">
                    <i class="ph ph-star-fill"></i> Public Reputation
                  </span>
                </div>

                <div class="form-group">
                  <div class="label-with-action">
                    <label class="form-label">Google Review Redirect URL</label>
                    @if (profile.googleReviewUrl) {
                      <button
                        type="button"
                        class="apple-action-pill"
                        (click)="testGoogleReviewLink()"
                        title="Verify link in a new browser tab"
                      >
                        <i class="ph ph-arrow-square-out"></i>
                        <span>Test Live Link</span>
                      </button>
                    }
                  </div>
                  <div class="input-with-icon">
                    <i class="ph ph-google-logo field-icon google-color"></i>
                    <input
                      type="url"
                      class="form-input has-icon"
                      [(ngModel)]="profile.googleReviewUrl"
                      placeholder="https://g.page/r/.../review or https://search.google.com/local/writereview?placeid=..."
                    />
                  </div>
                  <span class="field-hint">
                    When customers tap "Review us on Google" on their bill confirmation screen or
                    scan the feedback QR, they are automatically forwarded to this link.
                  </span>
                </div>

                <!-- Apple Callout Guide for Google Review Link -->
                <div class="apple-callout-guide">
                  <div class="guide-lead">
                    <div class="guide-badge-icon">
                      <i class="ph ph-google-logo"></i>
                    </div>
                    <div class="guide-text-wrap">
                      <div class="guide-title-line">
                        <strong class="guide-title">Direct Review Link Guide</strong>
                        <span class="guide-badge-subtle">Google Maps</span>
                      </div>
                      <div class="guide-flow-inline">
                        <span class="flow-step">1. Open Google Maps</span>
                        <i class="ph ph-caret-right flow-arrow"></i>
                        <span class="flow-step">2. Search {{ profile.name || 'Restaurant' }}</span>
                        <i class="ph ph-caret-right flow-arrow"></i>
                        <span class="flow-step">3. Tap "Ask for reviews"</span>
                        <i class="ph ph-caret-right flow-arrow"></i>
                        <span class="flow-step">4. Paste shortlink above</span>
                      </div>
                    </div>
                  </div>
                  <a
                    href="https://www.google.com/maps"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="apple-action-pill open-maps-btn"
                    title="Open Google Maps in a new tab"
                  >
                    <i class="ph ph-arrow-square-out"></i>
                    <span>Open Maps</span>
                  </a>
                </div>

                <div class="form-group pt-2 border-t">
                  <div class="label-with-action">
                    <label class="form-label"
                      >Customer Mobile Menu Website (QR Target Hosted Link)</label
                    >
                    <div class="header-actions-inline">
                      <button
                        type="button"
                        class="apple-action-pill"
                        (click)="copyMenuUrl()"
                        title="Copy customer menu URL"
                      >
                        <i class="ph ph-copy"></i>
                        <span>Copy URL</span>
                      </button>
                      <button
                        type="button"
                        class="apple-action-pill"
                        (click)="openMenuUrl()"
                        title="Open customer menu in new tab"
                      >
                        <i class="ph ph-arrow-square-out"></i>
                        <span>Preview Menu</span>
                      </button>
                    </div>
                  </div>
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
                    Public hosted URL embedded into dining table QR codes and standees for mobile
                    ordering.
                  </span>
                </div>
              </div>

              <!-- Contact & Location Card -->
              <div class="panel-box apple-card">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap icon-teal">
                      <i class="ph ph-map-pin"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">Contact &amp; Location</h2>
                      <p class="panel-subtitle">
                        Physical address and official customer support contact lines.
                      </p>
                    </div>
                  </div>
                  <span class="panel-badge">Venue Details</span>
                </div>

                <div class="form-row-2">
                  <div class="form-group">
                    <label class="form-label">Contact Phone</label>
                    <div class="input-with-icon">
                      <i class="ph ph-phone field-icon"></i>
                      <input
                        type="tel"
                        class="form-input has-icon"
                        [(ngModel)]="profile.contactPhone"
                        placeholder="+91 98765 43210"
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
                        placeholder="contact@restaurant.com"
                      />
                    </div>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">Street Address</label>
                  <div class="input-with-icon">
                    <i class="ph ph-navigation-arrow field-icon"></i>
                    <input
                      type="text"
                      class="form-input has-icon"
                      [(ngModel)]="profile.street"
                      placeholder="Plot No., Main Road, Landmark"
                    />
                  </div>
                </div>

                <div class="form-row-2">
                  <div class="form-group">
                    <label class="form-label">City</label>
                    <input
                      type="text"
                      class="form-input"
                      [(ngModel)]="profile.city"
                      placeholder="e.g. Bhopal"
                    />
                  </div>
                  <div class="form-group">
                    <label class="form-label">State &amp; PIN</label>
                    <input
                      type="text"
                      class="form-input"
                      [(ngModel)]="profile.statePin"
                      placeholder="e.g. Madhya Pradesh - 462001"
                    />
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- TAB 2: TAXES & INVOICING -->
          @if (activeTab === 'tax') {
            <div class="settings-grid">
              <!-- CARD 1: GOODS & SERVICES TAX (GST) -->
              <div class="panel-box apple-card">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap icon-emerald">
                      <i class="ph ph-receipt"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">Goods & Services Tax (GST)</h2>
                      <p class="panel-subtitle">
                        Standard Indian GST tax brackets and service charge applied at checkout.
                      </p>
                    </div>
                  </div>
                  <span class="panel-badge highlight-emerald"
                    >Tax Slab: {{ profile.cgstRate + profile.sgstRate | number: '1.1-1' }}%</span
                  >
                </div>

                <!-- Apple Quick Tax Bracket Presets -->
                <div class="apple-presets-strip">
                  <span class="preset-label">Standard Presets:</span>
                  <div class="preset-buttons">
                    <button
                      type="button"
                      class="preset-pill"
                      [class.active]="isGstPresetActive(2.5, 2.5)"
                      (click)="setGstPreset(2.5, 2.5)"
                    >
                      5.0% Dining (2.5+2.5)
                    </button>
                    <button
                      type="button"
                      class="preset-pill"
                      [class.active]="isGstPresetActive(6.0, 6.0)"
                      (click)="setGstPreset(6.0, 6.0)"
                    >
                      12.0% Composite (6+6)
                    </button>
                    <button
                      type="button"
                      class="preset-pill"
                      [class.active]="isGstPresetActive(9.0, 9.0)"
                      (click)="setGstPreset(9.0, 9.0)"
                    >
                      18.0% Luxury / Bar (9+9)
                    </button>
                    <button
                      type="button"
                      class="preset-pill"
                      [class.active]="isGstPresetActive(0, 0)"
                      (click)="setGstPreset(0, 0)"
                    >
                      0% Exempt
                    </button>
                  </div>
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
                  <div class="label-with-action">
                    <label class="form-label">GST Identification Number (GSTIN)</label>
                    @if (profile.gstNumber && profile.gstNumber.trim().length === 15) {
                      <span class="valid-pill"
                        ><i class="ph ph-check-circle"></i> Valid 15-Digit Format</span
                      >
                    } @else {
                      <span class="warn-pill">15 Characters Required</span>
                    }
                  </div>
                  <div class="input-with-icon">
                    <i class="ph ph-identification-card field-icon"></i>
                    <input
                      type="text"
                      class="form-input has-icon font-mono uppercase"
                      [(ngModel)]="profile.gstNumber"
                      placeholder="e.g. 29AAAAA0000A1Z5"
                      maxlength="15"
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
                    <div class="input-with-icon">
                      <i class="ph ph-lock-key field-icon"></i>
                      <input
                        type="text"
                        class="form-input has-icon disabled-input"
                        value="INR (₹) - Indian Rupee"
                        disabled
                      />
                    </div>
                  </div>
                </div>

                <!-- Apple Live Tax Math Breakdown Callout -->
                <div class="tax-math-callout">
                  <div class="math-callout-header">
                    <i class="ph ph-calculator"></i>
                    <span>Live Checkout Calculation (On ₹1,000 Dining Order)</span>
                  </div>
                  <div class="math-breakdown-row">
                    <div class="math-chip">
                      <span class="chip-label">Subtotal</span>
                      <span class="chip-val">₹1,000.00</span>
                    </div>
                    <span class="math-op">+</span>
                    <div class="math-chip">
                      <span class="chip-label">CGST ({{ profile.cgstRate }}%)</span>
                      <span class="chip-val"
                        >₹{{ (1000 * profile.cgstRate) / 100 | number: '1.2-2' }}</span
                      >
                    </div>
                    <span class="math-op">+</span>
                    <div class="math-chip">
                      <span class="chip-label">SGST ({{ profile.sgstRate }}%)</span>
                      <span class="chip-val"
                        >₹{{ (1000 * profile.sgstRate) / 100 | number: '1.2-2' }}</span
                      >
                    </div>
                    @if (profile.serviceChargeRate > 0) {
                      <span class="math-op">+</span>
                      <div class="math-chip">
                        <span class="chip-label">Service ({{ profile.serviceChargeRate }}%)</span>
                        <span class="chip-val"
                          >₹{{ (1000 * profile.serviceChargeRate) / 100 | number: '1.2-2' }}</span
                        >
                      </div>
                    }
                    <span class="math-op">=</span>
                    <div class="math-chip highlight-chip">
                      <span class="chip-label">Total Payable</span>
                      <span class="chip-val text-brand"
                        >₹{{
                          1000 +
                            (1000 *
                              (profile.cgstRate + profile.sgstRate + profile.serviceChargeRate)) /
                              100 | number: '1.2-2'
                        }}</span
                      >
                    </div>
                  </div>
                </div>
              </div>

              <!-- CARD 2: RECEIPT & BILL CUSTOMIZATION -->
              <div class="panel-box apple-card">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap icon-indigo">
                      <i class="ph ph-article"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">Receipt & Bill Customization</h2>
                      <p class="panel-subtitle">
                        Mandated licenses, FSSAI compliance, and customized guest checkout notes.
                      </p>
                    </div>
                  </div>
                  <span class="panel-badge highlight-indigo">Receipt Compliance</span>
                </div>

                <div class="form-group">
                  <div class="label-with-action">
                    <label class="form-label">FSSAI License / Registration #</label>
                    @if (profile.fssaiNumber && profile.fssaiNumber.trim().length === 14) {
                      <span class="valid-pill"
                        ><i class="ph ph-check-circle"></i> 14 Digits Valid</span
                      >
                    } @else {
                      <span class="field-hint">14 Digits Mandated</span>
                    }
                  </div>
                  <div class="input-with-icon">
                    <i class="ph ph-shield-check field-icon"></i>
                    <input
                      type="text"
                      class="form-input has-icon font-mono"
                      [(ngModel)]="profile.fssaiNumber"
                      placeholder="e.g. 11223344556677"
                      maxlength="14"
                    />
                  </div>
                  <span class="field-hint"
                    >Mandated food safety license number printed on physical receipts.</span
                  >
                </div>

                <div class="form-group">
                  <div class="label-with-action">
                    <label class="form-label">Invoice Footer Message</label>
                    <span class="char-count-text"
                      >{{ profile.invoiceFooter ? profile.invoiceFooter.length : 0 }} chars</span
                    >
                  </div>
                  <textarea
                    class="form-textarea"
                    rows="3"
                    [(ngModel)]="profile.invoiceFooter"
                    placeholder="e.g. Thank you for dining with us! Please visit us again."
                  ></textarea>

                  <!-- Apple Quick Footer Preset Pills -->
                  <div class="footer-presets-row">
                    <span class="preset-label">Quick Inserts:</span>
                    <button
                      type="button"
                      class="insert-pill"
                      (click)="
                        setFooterPreset(
                          'Thank you for dining with GuruKripa Dhaba! Please visit again.'
                        )
                      "
                    >
                      "Thank you for dining with us!"
                    </button>
                    <button
                      type="button"
                      class="insert-pill"
                      (click)="
                        setFooterPreset('Feedback? Scan the QR code below to review us on Google!')
                      "
                    >
                      "Scan QR for Google Review"
                    </button>
                    <button
                      type="button"
                      class="insert-pill"
                      (click)="
                        setFooterPreset('Service charge is discretionary. Tips are welcome.')
                      "
                    >
                      "Tips are discretionary"
                    </button>
                  </div>
                </div>

                <!-- Apple Thermal Monospace Bill Footer Preview -->
                <div class="thermal-bill-preview">
                  <div class="bill-preview-header">
                    <i class="ph ph-printer"></i>
                    <span>Live Thermal Receipt Footer Preview</span>
                  </div>
                  <div class="bill-paper-tape font-mono">
                    <div class="dashed-line">----------------------------------------</div>
                    <div class="tape-row flex-between">
                      <span>FSSAI Lic:</span>
                      <strong>{{ profile.fssaiNumber || '11223344556677' }}</strong>
                    </div>
                    <div class="tape-row flex-between">
                      <span>GSTIN:</span>
                      <strong>{{ profile.gstNumber || '29AAAAA0000A1Z5' }}</strong>
                    </div>
                    <div class="dashed-line">----------------------------------------</div>
                    <div class="tape-center italic-msg">
                      "{{
                        profile.invoiceFooter ||
                          'Thank you for dining with us! Please visit us again.'
                      }}"
                    </div>
                    <div class="tape-center qr-placeholder">[ QR CODE - SCAN TO PAY / REVIEW ]</div>
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- TAB 3: HARDWARE & THERMAL PRINTER (ESC/POS) -->
          @if (activeTab === 'printer') {
            <div class="settings-grid">
              <!-- PRINTER TARGET & DRIVER CARD -->
              <div class="panel-box apple-card">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap icon-purple">
                      <i class="ph ph-printer"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">Hardware Receipt Printer (ESC/POS)</h2>
                      <p class="panel-subtitle">
                        Direct raw spooling to USB thermal printers or Network LAN sockets.
                      </p>
                    </div>
                  </div>
                  <span class="panel-badge highlight-purple">
                    @if (printerConfig().target === 'WINDOWS') {
                      <i class="ph ph-usb"></i> Tauri Native Spooling
                    } @else if (printerConfig().target === 'NETWORK') {
                      <i class="ph ph-wifi-high"></i> TCP Port 9100 Socket
                    } @else {
                      <i class="ph ph-browser"></i> Web Print Dialog
                    }
                  </span>
                </div>

                <!-- Interface Selector Cards Cluster -->
                <div class="form-group">
                  <label class="form-label">Printer Interface Target</label>
                  <div class="radio-cards-cluster">
                    <label
                      class="radio-card apple-radio-card"
                      [class.selected]="printerConfig().target === 'WINDOWS'"
                    >
                      <input
                        type="radio"
                        name="printerTarget"
                        value="WINDOWS"
                        [checked]="printerConfig().target === 'WINDOWS'"
                        (change)="updatePrinterConfig('target', 'WINDOWS')"
                      />
                      <div class="radio-card-content">
                        <div class="radio-icon-box emerald-box">
                          <i class="ph ph-usb"></i>
                        </div>
                        <div class="radio-card-text">
                          <div class="radio-title-row">
                            <strong>Windows / USB Thermal Printer (Tauri Native)</strong>
                            <span class="tech-tag tag-emerald">RECOMMENDED</span>
                          </div>
                          <span
                            >Direct raw spooling via Windows printer driver with auto-cut &amp;
                            drawer kick</span
                          >
                        </div>
                        <div class="radio-check-indicator">
                          <i class="ph ph-check-circle"></i>
                        </div>
                      </div>
                    </label>

                    <label
                      class="radio-card apple-radio-card"
                      [class.selected]="printerConfig().target === 'NETWORK'"
                    >
                      <input
                        type="radio"
                        name="printerTarget"
                        value="NETWORK"
                        [checked]="printerConfig().target === 'NETWORK'"
                        (change)="updatePrinterConfig('target', 'NETWORK')"
                      />
                      <div class="radio-card-content">
                        <div class="radio-icon-box sky-box">
                          <i class="ph ph-wifi-high"></i>
                        </div>
                        <div class="radio-card-text">
                          <div class="radio-title-row">
                            <strong>Network / Ethernet Printer (TCP Port 9100)</strong>
                            <span class="tech-tag tag-sky">LAN SOCKET</span>
                          </div>
                          <span>Direct raw TCP socket connection across local network subnet</span>
                        </div>
                        <div class="radio-check-indicator">
                          <i class="ph ph-check-circle"></i>
                        </div>
                      </div>
                    </label>

                    <label
                      class="radio-card apple-radio-card"
                      [class.selected]="printerConfig().target === 'BROWSER'"
                    >
                      <input
                        type="radio"
                        name="printerTarget"
                        value="BROWSER"
                        [checked]="printerConfig().target === 'BROWSER'"
                        (change)="updatePrinterConfig('target', 'BROWSER')"
                      />
                      <div class="radio-card-content">
                        <div class="radio-icon-box amber-box">
                          <i class="ph ph-browser"></i>
                        </div>
                        <div class="radio-card-text">
                          <div class="radio-title-row">
                            <strong>Standard Browser Print Dialog</strong>
                            <span class="tech-tag tag-amber">FALLBACK</span>
                          </div>
                          <span
                            >Operating system print preview window (no auto-cut or drawer
                            kick)</span
                          >
                        </div>
                        <div class="radio-check-indicator">
                          <i class="ph ph-check-circle"></i>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                <!-- Windows Installed Thermal Printer Selection -->
                @if (printerConfig().target === 'WINDOWS') {
                  <div class="printer-device-box apple-hardware-card">
                    <div class="label-with-action">
                      <div class="printer-label-wrap">
                        <div class="device-icon-disc">
                          <i class="ph ph-printer"></i>
                        </div>
                        <div>
                          <label class="form-label mb-0" for="winThermalSelect">
                            Installed Spooler Printer
                          </label>
                          <span class="device-hint-sub"
                            >Windows print spooler raw direct pass-through</span
                          >
                        </div>
                      </div>
                      <button
                        type="button"
                        class="apple-action-pill refresh-hardware-btn"
                        (click)="loadSystemPrinters()"
                        [disabled]="isLoadingPrinters()"
                        title="Re-query Windows print spooler for new USB devices"
                      >
                        <i class="ph ph-arrows-clockwise" [class.ph-spin]="isLoadingPrinters()"></i>
                        <span>{{ isLoadingPrinters() ? 'Detecting...' : 'Rescan Devices' }}</span>
                      </button>
                    </div>

                    <div class="input-with-icon select-hardware-wrap">
                      <i class="ph ph-device-tablet-speaker field-icon"></i>
                      <select
                        id="winThermalSelect"
                        class="form-select has-icon font-mono-select"
                        [ngModel]="printerConfig().printerName"
                        (ngModelChange)="updatePrinterConfig('printerName', $event)"
                      >
                        <option value="">-- Use System Default Printer --</option>
                        @for (p of availablePrinters(); track p.name) {
                          <option [value]="p.name">
                            {{ p.name }} {{ p.is_default ? '★ (Default)' : '' }}
                            {{ cleanPortName(p.port_name) }}
                          </option>
                        }
                      </select>
                    </div>

                    <div class="printer-hardware-telemetry">
                      <div class="telemetry-left">
                        <span class="dot-live"></span>
                        <span class="status-summary">
                          {{ availablePrinters().length }} driver{{
                            availablePrinters().length === 1 ? '' : 's'
                          }}
                          ready
                        </span>
                      </div>
                      <div class="telemetry-right">
                        <span class="active-spool-text">
                          Spooling to:
                          <strong>{{ printerConfig().printerName || 'System Default' }}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                }

                <!-- Network Thermal Socket Configuration -->
                @if (printerConfig().target === 'NETWORK') {
                  <div class="printer-device-box">
                    <label class="form-label">Printer IP Address &amp; Port (TCP 9100)</label>
                    <div class="input-with-icon">
                      <i class="ph ph-globe field-icon"></i>
                      <input
                        type="text"
                        class="form-input has-icon font-mono"
                        placeholder="e.g. 192.168.1.100:9100"
                        [ngModel]="printerConfig().networkAddress"
                        (ngModelChange)="updatePrinterConfig('networkAddress', $event)"
                      />
                    </div>
                    <span class="field-hint">
                      Standard ESC/POS thermal printers (Epson, POS-80, TVS) listen for raw socket
                      print jobs on TCP port 9100.
                    </span>
                  </div>
                }
              </div>

              <!-- FORMATTING, MECHANICS & LIVE EMULATION CARD -->
              <div class="panel-box apple-card">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap icon-amber">
                      <i class="ph ph-sliders"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">Formatting &amp; Mechanics</h2>
                      <p class="panel-subtitle">
                        Paper roll width, automatic cutting, and drawer kick pulses.
                      </p>
                    </div>
                  </div>
                  <span class="panel-badge highlight-amber">Hardware Mechanics</span>
                </div>

                <!-- Receipt Paper Width Segmented Picker -->
                <div class="form-group">
                  <label class="form-label">Receipt Paper Roll Width</label>
                  <div class="segmented-control apple-segmented-control">
                    <button
                      type="button"
                      class="seg-btn"
                      [class.active]="printerConfig().paperWidth === '80mm'"
                      (click)="updatePrinterConfig('paperWidth', '80mm')"
                    >
                      <i class="ph ph-receipt"></i>
                      <div class="seg-text">
                        <strong>80mm (Standard POS)</strong>
                        <span>48 characters per line • 3.15 inch roll</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      class="seg-btn"
                      [class.active]="printerConfig().paperWidth === '58mm'"
                      (click)="updatePrinterConfig('paperWidth', '58mm')"
                    >
                      <i class="ph ph-receipt"></i>
                      <div class="seg-text">
                        <strong>58mm (Compact POS)</strong>
                        <span>32 characters per line • 2.28 inch roll</span>
                      </div>
                    </button>
                  </div>
                </div>

                <!-- Apple Switch Tiles for Mechanics -->
                <div class="apple-switches-grid">
                  <label class="apple-switch-tile">
                    <div class="switch-tile-left">
                      <div class="tile-icon-box">
                        <i class="ph ph-scissors"></i>
                      </div>
                      <div class="tile-meta">
                        <div class="tile-title-row">
                          <strong>Automatic Paper Cutting</strong>
                          <code class="hex-badge">GS V A 3</code>
                        </div>
                        <span class="tile-subtitle">
                          Sends raw ESC/POS partial cut command at bill receipt end
                        </span>
                      </div>
                    </div>
                    <div class="apple-switch">
                      <input
                        type="checkbox"
                        [checked]="printerConfig().autoCut"
                        (change)="updatePrinterConfig('autoCut', $any($event.target).checked)"
                      />
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="apple-switch-tile">
                    <div class="switch-tile-left">
                      <div class="tile-icon-box">
                        <i class="ph ph-vault"></i>
                      </div>
                      <div class="tile-meta">
                        <div class="tile-title-row">
                          <strong>Open Cash Drawer (Kick Pulse)</strong>
                          <code class="hex-badge">ESC p 0</code>
                        </div>
                        <span class="tile-subtitle">
                          Triggers RJ11/RJ12 24V solenoid pulse to cash drawer on bill settlement
                        </span>
                      </div>
                    </div>
                    <div class="apple-switch">
                      <input
                        type="checkbox"
                        [checked]="printerConfig().openCashDrawer"
                        (change)="
                          updatePrinterConfig('openCashDrawer', $any($event.target).checked)
                        "
                      />
                      <span class="switch-slider"></span>
                    </div>
                  </label>
                </div>

                <!-- Hardware Communication Verification Slate -->
                <div class="printer-test-cluster apple-test-slate">
                  <div class="cluster-info">
                    <div class="test-slate-title">
                      <i class="ph ph-check-circle"></i>
                      <strong>Verify Hardware Communication</strong>
                    </div>
                    <p class="text-xs text-muted">
                      Send an instant test slip to verify character alignment, font scaling, barcode
                      rendering, and cutter mechanics.
                    </p>
                  </div>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm test-print-btn"
                    (click)="testThermalPrint()"
                    [disabled]="isTestingPrint()"
                  >
                    @if (isTestingPrint()) {
                      <i class="ph ph-spinner ph-spin"></i>
                      <span>Printing Test...</span>
                    } @else {
                      <i class="ph ph-printer"></i>
                      <span>Send Test Slip</span>
                    }
                  </button>
                </div>

                <!-- Live Monospace Paper Tape Emulation -->
                <div
                  class="thermal-bill-preview tape-emulation-box"
                  [class.compact-tape]="printerConfig().paperWidth === '58mm'"
                >
                  <div class="bill-preview-header">
                    <div class="flex items-center gap-2">
                      <i class="ph ph-receipt"></i>
                      <span>Hardware Paper Tape Emulation ({{ printerConfig().paperWidth }})</span>
                    </div>
                    <span class="badge-tape-width">{{
                      printerConfig().paperWidth === '80mm' ? '48 Chars Width' : '32 Chars Width'
                    }}</span>
                  </div>
                  <div class="bill-paper-tape font-mono">
                    <div class="tape-center font-bold">
                      *** {{ profile.name || 'GURUKRIPA DHABA' }} ***
                    </div>
                    <div class="tape-center text-xs">HARDWARE PRINTER TEST SLIP</div>
                    <div class="dashed-line">----------------------------------------</div>
                    <div class="tape-row flex-between text-xs">
                      <span>PAPER ROLL:</span>
                      <strong>{{ printerConfig().paperWidth }}</strong>
                    </div>
                    <div class="tape-row flex-between text-xs">
                      <span>TARGET MODE:</span>
                      <strong>{{ printerConfig().target }}</strong>
                    </div>
                    <div class="tape-row flex-between text-xs">
                      <span>AUTO-CUT:</span>
                      <strong>{{ printerConfig().autoCut ? 'ENABLED (GS V)' : 'DISABLED' }}</strong>
                    </div>
                    <div class="tape-row flex-between text-xs">
                      <span>DRAWER KICK:</span>
                      <strong>{{
                        printerConfig().openCashDrawer ? 'ENABLED (ESC p)' : 'DISABLED'
                      }}</strong>
                    </div>
                    <div class="dashed-line">----------------------------------------</div>
                    <div class="tape-center italic-msg text-xs">
                      [ESC/POS TEST SUCCESSFUL • READY TO PRINT BILLS]
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- TAB: WHATSAPP GATEWAY -->
          @if (activeTab === 'whatsapp') {
            <div class="settings-grid">
              <div class="panel-box apple-card">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap icon-green">
                      <i class="ph ph-whatsapp-logo"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">WhatsApp Gateway</h2>
                      <p class="panel-subtitle">
                        Direct bill dispatch to customer WhatsApp numbers without external API fees.
                      </p>
                    </div>
                  </div>
                  <div class="panel-actions">
                    @if (whatsAppBridge.connectionStatus() === 'CONNECTED') {
                      <span class="panel-badge badge-connected">
                        <span class="status-pulse-dot dot-online"></span> Connected
                      </span>
                    } @else if (whatsAppBridge.connectionStatus() === 'SCAN_QR') {
                      <span class="panel-badge badge-scan">
                        <span class="status-pulse-dot dot-warning"></span> Scan Required
                      </span>
                    } @else {
                      <span class="panel-badge badge-offline">
                        <span class="status-pulse-dot dot-offline"></span> Disconnected
                      </span>
                    }
                  </div>
                </div>

                <!-- Apple Glass Connected Card -->
                @if (whatsAppBridge.connectionStatus() === 'CONNECTED') {
                  <div class="wa-connected-card">
                    <div class="wa-device-meta">
                      <div class="wa-avatar-disc">
                        <i class="ph ph-device-mobile-speaker"></i>
                      </div>
                      <div class="wa-conn-details">
                        <div class="wa-title-row">
                          <h3 class="wa-conn-title">
                            {{ whatsAppBridge.connectedName() || 'Restaurant Device' }}
                          </h3>
                          <span class="wa-verified-pill"
                            ><i class="ph ph-check-circle"></i> Active</span
                          >
                        </div>
                        <p class="wa-conn-phone">+{{ whatsAppBridge.connectedPhone() }}</p>
                        <p class="wa-conn-hint">
                          Customer bills and digital invoices will dispatch automatically in the
                          background.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm pill-btn"
                      (click)="disconnectWhatsApp()"
                      title="Disconnect linked WhatsApp device"
                    >
                      <i class="ph ph-sign-out"></i>
                      <span>Unlink Device</span>
                    </button>
                  </div>
                } @else {
                  <!-- QR Pairing Presentation -->
                  <div class="wa-pairing-container">
                    <div class="wa-qr-box">
                      @if (whatsAppBridge.qrCodeDataUrl()) {
                        <img
                          [src]="whatsAppBridge.qrCodeDataUrl()"
                          alt="WhatsApp Pairing QR Code"
                          class="wa-qr-img"
                        />
                      } @else {
                        <div class="wa-qr-placeholder">
                          <i
                            class="ph ph-spinner ph-spin"
                            style="font-size: 2rem; color: #16a34a;"
                          ></i>
                          <p class="text-xs text-muted">Generating QR code...</p>
                        </div>
                      }
                    </div>

                    <div class="wa-instructions">
                      <h4 class="font-bold">Link Restaurant WhatsApp</h4>
                      <ol class="wa-steps-list">
                        <li>Open <strong>WhatsApp</strong> on your restaurant business phone.</li>
                        <li>
                          Tap <strong>Settings</strong> or <strong>Menu (⋮)</strong> &gt;
                          <strong>Linked Devices</strong>.
                        </li>
                        <li>Tap <strong>Link a Device</strong> and scan this QR code.</li>
                        <li>Your session stays connected on this terminal automatically.</li>
                      </ol>
                    </div>
                  </div>
                }
              </div>

              <!-- Panel 2: WhatsApp Notification Templates -->
              <div class="panel-box apple-card wa-templates-card">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap icon-purple">
                      <i class="ph ph-chat-text"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">WhatsApp Notification Templates</h2>
                      <p class="panel-subtitle">
                        Customize automatic WhatsApp messages sent to customers for reservations.
                      </p>
                    </div>
                  </div>
                  <div class="panel-actions">
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm pill-btn"
                      (click)="revertCurrentTemplateToDefault()"
                      title="Revert current template to factory default"
                    >
                      <i class="ph ph-arrow-counter-clockwise"></i>
                      <span>Reset to Default</span>
                    </button>
                  </div>
                </div>

                <!-- Template Category Tabs -->
                <div class="wa-template-tabs">
                  <button
                    type="button"
                    class="wa-tpl-tab-btn"
                    [class.active]="activeWaTemplateTab === 'pending'"
                    (click)="activeWaTemplateTab = 'pending'"
                  >
                    <i class="ph ph-clock"></i>
                    <span>Reservation Pending</span>
                  </button>
                  <button
                    type="button"
                    class="wa-tpl-tab-btn"
                    [class.active]="activeWaTemplateTab === 'confirmed'"
                    (click)="activeWaTemplateTab = 'confirmed'"
                  >
                    <i class="ph ph-check-circle"></i>
                    <span>Reservation Confirmed</span>
                  </button>
                  <button
                    type="button"
                    class="wa-tpl-tab-btn"
                    [class.active]="activeWaTemplateTab === 'cancelled'"
                    (click)="activeWaTemplateTab = 'cancelled'"
                  >
                    <i class="ph ph-x-circle"></i>
                    <span>Reservation Cancelled</span>
                  </button>
                </div>

                <!-- Template Customizer & Live Phone Simulator Grid -->
                <div class="wa-template-editor-grid">
                  <!-- Left: Editor & Dynamic Placeholder Chips -->
                  <div class="wa-editor-pane">
                    <div class="wa-token-chips-wrapper">
                      <span class="text-xs font-semibold text-muted">Insert Dynamic Field:</span>
                      <div class="wa-tokens-row">
                        <button
                          type="button"
                          class="wa-token-chip"
                          (click)="insertToken('{customer_name}')"
                          title="Inserts customer's name"
                        >
                          + &#123;customer_name&#125;
                        </button>
                        <button
                          type="button"
                          class="wa-token-chip"
                          (click)="insertToken('{restaurant_name}')"
                          title="Inserts restaurant name"
                        >
                          + &#123;restaurant_name&#125;
                        </button>
                        <button
                          type="button"
                          class="wa-token-chip"
                          (click)="insertToken('{date}')"
                          title="Inserts reservation date"
                        >
                          + &#123;date&#125;
                        </button>
                        <button
                          type="button"
                          class="wa-token-chip"
                          (click)="insertToken('{time}')"
                          title="Inserts reservation time"
                        >
                          + &#123;time&#125;
                        </button>
                        <button
                          type="button"
                          class="wa-token-chip"
                          (click)="insertToken('{guests}')"
                          title="Inserts number of guests"
                        >
                          + &#123;guests&#125;
                        </button>
                        @if (activeWaTemplateTab === 'confirmed') {
                          <button
                            type="button"
                            class="wa-token-chip highlight-chip"
                            (click)="insertToken('{table_number}')"
                            title="Inserts allocated table number"
                          >
                            + &#123;table_number&#125;
                          </button>
                          <button
                            type="button"
                            class="wa-token-chip highlight-chip"
                            (click)="insertToken('{section}')"
                            title="Inserts allocated dining section"
                          >
                            + &#123;section&#125;
                          </button>
                        }
                      </div>
                    </div>

                    <!-- Textarea Editor -->
                    <div class="form-group" style="margin-top: 12px;">
                      <label class="form-label text-xs font-semibold">
                        Message Template Body
                        @if (activeWaTemplateTab === 'pending') {
                          (Sent immediately when customer submits request)
                        } @else if (activeWaTemplateTab === 'confirmed') {
                          (Sent when manager approves and assigns a table)
                        } @else {
                          (Sent when manager declines or cancels request)
                        }
                      </label>
                      <textarea
                        class="form-textarea wa-template-textarea"
                        rows="7"
                        [(ngModel)]="profile.whatsappTemplates[activeWaTemplateTab]"
                        placeholder="Type WhatsApp message template..."
                      ></textarea>
                      <span class="text-xs text-muted" style="margin-top: 4px; display: block;">
                        Supports standard WhatsApp formatting: *bold*, _italics_, ~strikethrough~,
                        and emojis.
                      </span>
                    </div>
                  </div>

                  <!-- Right: Live Apple-style Phone Mockup -->
                  <div class="wa-preview-pane">
                    <div class="wa-phone-mockup">
                      <!-- Phone status header -->
                      <div class="wa-mockup-header">
                        <div class="wa-header-avatar">
                          <i class="ph ph-buildings"></i>
                        </div>
                        <div class="wa-header-info">
                          <span class="wa-header-name">{{
                            profile.name || 'GuruKripa Dhaba'
                          }}</span>
                          <span class="wa-header-status">Online (Verified Business)</span>
                        </div>
                      </div>

                      <!-- Phone screen bubble container -->
                      <div class="wa-mockup-body">
                        <div class="wa-date-chip">Today</div>
                        <div class="wa-bubble-sent">
                          <div class="wa-bubble-content">{{ getSimulatedPreviewText() }}</div>
                          <div class="wa-bubble-meta">
                            <span class="wa-time-str">12:30 PM</span>
                            <i class="ph ph-checks wa-checks"></i>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- TAB 4: KITCHEN & OPERATIONS -->
          @if (activeTab === 'service') {
            <div class="settings-grid">
              <!-- Panel 1: Kitchen Dispatch & Dine-In Table Ordering -->
              <div class="panel-box apple-card">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap icon-amber">
                      <i class="ph ph-cooking-pot"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">Kitchen Dispatch Rules</h2>
                      <p class="panel-subtitle">
                        Preparation pacing and digital table ordering rules.
                      </p>
                    </div>
                  </div>
                  <span
                    class="panel-badge"
                    [class.success]="profile.dineInEnabled"
                    [class.warning]="!profile.dineInEnabled"
                  >
                    {{ profile.dineInEnabled ? 'Dine-In Active' : 'Dine-In Paused' }}
                  </span>
                </div>

                <!-- Apple Channel Switch Card: Dine-In Table Ordering -->
                <div class="apple-channel-card" [class.is-enabled]="profile.dineInEnabled">
                  <div class="channel-card-left">
                    <div class="channel-icon-disc" [class.active-disc]="profile.dineInEnabled">
                      <i class="ph ph-fork-knife"></i>
                    </div>
                    <div class="channel-card-meta">
                      <div class="channel-title-row">
                        <strong class="channel-title">Dine-In QR Table Ordering</strong>
                        <span
                          class="channel-status-pill"
                          [class.active-pill]="profile.dineInEnabled"
                        >
                          <span class="dot-indicator"></span>
                          {{
                            profile.dineInEnabled
                              ? 'ACCEPTING LIVE ORDERS'
                              : 'PAUSED • CATALOG ONLY'
                          }}
                        </span>
                      </div>
                      <p class="channel-desc">
                        When enabled, guests scanning table QR codes can place food orders directly
                        into the kitchen queue. When paused, the customer menu operates in
                        browse-only view mode.
                      </p>
                    </div>
                  </div>
                  <div class="apple-switch">
                    <input
                      type="checkbox"
                      [checked]="profile.dineInEnabled"
                      (change)="profile.dineInEnabled = $any($event.target).checked"
                    />
                    <span class="switch-slider"></span>
                  </div>
                </div>

                <!-- Pacing Parameters: Prep Time & Min Spend -->
                <div class="form-row-2" style="margin-top: 16px;">
                  <div class="form-group">
                    <label class="form-label">
                      <i class="ph ph-timer"></i>
                      Estimated Prep Time
                    </label>
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
                    <!-- Tactile Preset Chips -->
                    <div class="quick-preset-chips">
                      @for (mins of [15, 20, 25, 35, 45]; track mins) {
                        <button
                          type="button"
                          class="preset-chip"
                          [class.active]="profile.estimatedPrepMinutes === mins"
                          (click)="setPrepTimePreset(mins)"
                        >
                          {{ mins }}m
                        </button>
                      }
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label">
                      <i class="ph ph-currency-inr"></i>
                      Minimum Order Spend
                    </label>
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
                    <!-- Tactile Preset Chips -->
                    <div class="quick-preset-chips">
                      <button
                        type="button"
                        class="preset-chip"
                        [class.active]="!profile.minOrderAmount || profile.minOrderAmount === 0"
                        (click)="setMinSpendPreset(0)"
                      >
                        No Min
                      </button>
                      @for (amt of [100, 250, 500]; track amt) {
                        <button
                          type="button"
                          class="preset-chip"
                          [class.active]="profile.minOrderAmount === amt"
                          (click)="setMinSpendPreset(amt)"
                        >
                          ₹{{ amt }}
                        </button>
                      }
                    </div>
                  </div>
                </div>
              </div>

              <!-- Panel 2: Counter & Takeaway Pacing -->
              <div class="panel-box apple-card">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap icon-teal">
                      <i class="ph ph-bag"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">Counter &amp; Takeaway Pacing</h2>
                      <p class="panel-subtitle">Pickup buffers and counter order workflows.</p>
                    </div>
                  </div>
                  <span
                    class="panel-badge"
                    [class.success]="profile.takeawayEnabled"
                    [class.subtle]="!profile.takeawayEnabled"
                  >
                    {{ profile.takeawayEnabled ? 'Takeaway Active' : 'Takeaway Off' }}
                  </span>
                </div>

                <!-- Apple Channel Switch Card: Takeaway & Counter -->
                <div class="apple-channel-card" [class.is-enabled]="profile.takeawayEnabled">
                  <div class="channel-card-left">
                    <div
                      class="channel-icon-disc teal-disc"
                      [class.active-disc]="profile.takeawayEnabled"
                    >
                      <i class="ph ph-bag"></i>
                    </div>
                    <div class="channel-card-meta">
                      <div class="channel-title-row">
                        <strong class="channel-title">Takeaway &amp; Counter Ordering</strong>
                        <span
                          class="channel-status-pill"
                          [class.active-pill]="profile.takeawayEnabled"
                        >
                          <span class="dot-indicator"></span>
                          {{
                            profile.takeawayEnabled ? 'ACTIVE CHANNEL' : 'DISABLED (DINE-IN ONLY)'
                          }}
                        </span>
                      </div>
                      <p class="channel-desc">
                        Allows front-desk counter staff and mobile users to place takeaway orders.
                        When disabled, the entire portal operates exclusively in table dine-in mode.
                      </p>
                    </div>
                  </div>
                  <div class="apple-switch">
                    <input
                      type="checkbox"
                      [checked]="profile.takeawayEnabled"
                      (change)="profile.takeawayEnabled = $any($event.target).checked"
                    />
                    <span class="switch-slider"></span>
                  </div>
                </div>

                <!-- Pickup Buffer with Preset Pills -->
                <div class="form-group" style="margin-top: 16px;">
                  <label class="form-label">
                    <i class="ph ph-hourglass-simple"></i>
                    Pickup Time Buffer
                  </label>
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
                    >Added to kitchen prep estimate so takeaway guests arrive when food is fresh off
                    the stove.</span
                  >

                  <div class="quick-preset-chips">
                    @for (
                      item of [
                        { mins: 5, label: '+5m Express' },
                        { mins: 10, label: '+10m Standard' },
                        { mins: 15, label: '+15m Rush Hour' },
                        { mins: 30, label: '+30m Peak Weekend' },
                      ];
                      track item.mins
                    ) {
                      <button
                        type="button"
                        class="preset-chip"
                        [class.active]="profile.pickupBufferMinutes === item.mins"
                        (click)="setPickupBufferPreset(item.mins)"
                      >
                        {{ item.label }}
                      </button>
                    }
                  </div>
                </div>

                <!-- Live Guest Experience Summary Slate -->
                <div class="apple-impact-slate">
                  <div class="impact-header">
                    <div class="flex items-center gap-2">
                      <i class="ph ph-device-mobile"></i>
                      <strong>Live Guest Experience Summary</strong>
                    </div>
                    <span class="impact-badge-chip">CUSTOMER VIEW</span>
                  </div>
                  <div class="impact-grid">
                    <div class="impact-item">
                      <span class="impact-lbl">Dine-In Behavior</span>
                      <strong
                        class="impact-val"
                        [class.text-emerald]="profile.dineInEnabled"
                        [class.text-amber]="!profile.dineInEnabled"
                      >
                        {{
                          profile.dineInEnabled ? 'Instant Mobile Ordering' : 'Catalog View Only'
                        }}
                      </strong>
                    </div>
                    <div class="impact-item">
                      <span class="impact-lbl">Guest Kitchen Prep ETA</span>
                      <strong class="impact-val"
                        >~{{ profile.estimatedPrepMinutes || 20 }} Mins</strong
                      >
                    </div>
                    <div class="impact-item">
                      <span class="impact-lbl">Min Cart Value</span>
                      <strong class="impact-val">
                        {{
                          profile.minOrderAmount && profile.minOrderAmount > 0
                            ? '₹' + profile.minOrderAmount
                            : 'Zero Minimum'
                        }}
                      </strong>
                    </div>
                    <div class="impact-item">
                      <span class="impact-lbl">Takeaway Pickup Ready</span>
                      <strong class="impact-val">
                        {{
                          profile.takeawayEnabled
                            ? '~' +
                              ((profile.estimatedPrepMinutes || 20) +
                                (profile.pickupBufferMinutes || 10)) +
                              ' Mins'
                            : 'Disabled'
                        }}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- TAB 5: SYSTEM & RECOVERY RESET (STANDARD SOFTWARE ARCHITECTURE) -->
          @if (activeTab === 'maintenance') {
            <div class="settings-grid maintenance-layout">
              <!-- Control Strip: Apple Telemetry Banner & Quick Diagnostic Run -->
              <div class="system-overview-banner apple-telemetry-banner">
                <div class="system-hero-info">
                  <div class="system-brand-mark apple-pulse-mark">
                    <i class="ph ph-heartbeat"></i>
                  </div>
                  <div class="system-hero-text">
                    <div class="system-title-row">
                      <h3 class="system-title">System Health &amp; Diagnostics</h3>
                      <span
                        class="apple-platform-status-pill"
                        [class.is-all-online]="
                          systemStatuses().localBackend.online &&
                          systemStatuses().liveBackend.online &&
                          systemStatuses().database.online
                        "
                      >
                        <span class="dot-indicator"></span>
                        {{
                          systemStatuses().localBackend.online &&
                          systemStatuses().liveBackend.online &&
                          systemStatuses().database.online
                            ? 'All Systems Online'
                            : 'Check Diagnostics'
                        }}
                      </span>
                    </div>
                    <p class="system-desc">
                      Real-time connectivity, latency benchmarks, and local storage diagnostics.
                    </p>
                  </div>
                </div>
                <div class="system-hero-actions">
                  @if (lastCheckedTime()) {
                    <span class="last-check-text">
                      <i class="ph ph-clock"></i>
                      {{ lastCheckedTime() | date: 'HH:mm:ss' }}
                    </span>
                  }
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm refresh-diagnostics-btn pill-btn"
                    (click)="checkSystemHealth()"
                    [disabled]="isCheckingHealth()"
                    title="Check all service endpoints"
                  >
                    <i class="ph ph-arrows-clockwise" [class.ph-spin]="isCheckingHealth()"></i>
                    <span>{{ isCheckingHealth() ? 'Pinging...' : 'Run Diagnostics' }}</span>
                  </button>
                </div>
              </div>

              <!-- 1. Live Infrastructure & Core System Health -->
              <div class="panel-box full-width-panel apple-card">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap icon-blue">
                      <i class="ph ph-cpu"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">Service Endpoints</h2>
                      <p class="panel-subtitle">Real-time status and response latency.</p>
                    </div>
                  </div>
                  <div class="panel-header-actions">
                    <span class="panel-badge highlight-blue">
                      <i class="ph ph-shield-check"></i> Monitored
                    </span>
                  </div>
                </div>

                <!-- 3 System Status Cards Grid -->
                <div class="system-status-cards">
                  <!-- Card 1: Local Engine -->
                  <div
                    class="system-status-card apple-status-card"
                    [class.status-card-online]="systemStatuses().localBackend.online"
                    [class.status-card-offline]="!systemStatuses().localBackend.online"
                  >
                    <div class="system-status-card-header">
                      <div class="system-target-info">
                        <span class="system-type-tag">Core Engine</span>
                        <h3 class="system-target-name">Local Engine</h3>
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

                    <p class="system-status-desc">{{ systemStatuses().localBackend.details }}</p>

                    <div class="system-status-card-footer">
                      <div class="latency-meta-row">
                        <span class="system-latency-label">Response Latency</span>
                        <span
                          class="system-latency-val"
                          [class.latency-good]="
                            systemStatuses().localBackend.latencyMs > 0 &&
                            systemStatuses().localBackend.latencyMs < 100
                          "
                          [class.latency-fair]="
                            systemStatuses().localBackend.latencyMs >= 100 &&
                            systemStatuses().localBackend.latencyMs < 300
                          "
                          [class.latency-slow]="systemStatuses().localBackend.latencyMs >= 300"
                        >
                          {{
                            systemStatuses().localBackend.latencyMs
                              ? systemStatuses().localBackend.latencyMs + ' ms'
                              : 'Offline'
                          }}
                        </span>
                      </div>
                      <div class="latency-gauge-track">
                        <div
                          class="latency-meter-bar"
                          [class.latency-good]="
                            systemStatuses().localBackend.latencyMs > 0 &&
                            systemStatuses().localBackend.latencyMs < 100
                          "
                          [class.latency-fair]="
                            systemStatuses().localBackend.latencyMs >= 100 &&
                            systemStatuses().localBackend.latencyMs < 300
                          "
                          [class.latency-slow]="systemStatuses().localBackend.latencyMs >= 300"
                          [style.width.%]="
                            systemStatuses().localBackend.latencyMs
                              ? systemStatuses().localBackend.latencyMs > 500
                                ? 100
                                : systemStatuses().localBackend.latencyMs / 5
                              : 8
                          "
                        ></div>
                      </div>
                    </div>
                  </div>

                  <!-- Card 2: Cloud Gateway -->
                  <div
                    class="system-status-card apple-status-card"
                    [class.status-card-online]="systemStatuses().liveBackend.online"
                    [class.status-card-offline]="!systemStatuses().liveBackend.online"
                  >
                    <div class="system-status-card-header">
                      <div class="system-target-info">
                        <span class="system-type-tag">API Gateway</span>
                        <h3 class="system-target-name">Cloud Gateway</h3>
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
                      <p class="system-status-desc">{{ systemStatuses().liveBackend.details }}</p>
                    </div>
                  </div>

                  <!-- Card 3: Database -->
                  <div
                    class="system-status-card apple-status-card"
                    [class.status-card-online]="systemStatuses().database.online"
                    [class.status-card-offline]="!systemStatuses().database.online"
                  >
                    <div class="system-status-card-header">
                      <div class="system-target-info">
                        <span class="system-type-tag">Storage</span>
                        <h3 class="system-target-name">Database</h3>
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
                      <p class="system-status-desc">{{ systemStatuses().database.details }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 2. Local Storage Diagnostics & Offline Cache -->
              <div class="panel-box full-width-panel apple-card">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap icon-teal">
                      <i class="ph ph-database"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">Local Storage Diagnostics &amp; Cache</h2>
                      <p class="panel-subtitle">
                        Zero-latency offline data snapshots cached in browser memory for instant UI
                        rendering.
                      </p>
                    </div>
                  </div>
                  <span class="panel-badge highlight-blue">
                    <i class="ph ph-check-circle"></i> Synchronized
                  </span>
                </div>

                <div class="storage-metrics-grid">
                  <div class="storage-metric-card apple-metric-card">
                    <div class="metric-icon-disc">
                      <i class="ph ph-receipt"></i>
                    </div>
                    <div class="metric-meta">
                      <span class="metric-num">{{ ordersCount() }}</span>
                      <span class="metric-lbl">Cached Orders</span>
                    </div>
                  </div>
                  <div class="storage-metric-card apple-metric-card">
                    <div class="metric-icon-disc">
                      <i class="ph ph-fork-knife"></i>
                    </div>
                    <div class="metric-meta">
                      <span class="metric-num">{{ menuCount() }}</span>
                      <span class="metric-lbl">Menu Items</span>
                    </div>
                  </div>
                  <div class="storage-metric-card apple-metric-card">
                    <div class="metric-icon-disc">
                      <i class="ph ph-table"></i>
                    </div>
                    <div class="metric-meta">
                      <span class="metric-num">{{ tablesCount() }}</span>
                      <span class="metric-lbl">Dining Tables</span>
                    </div>
                  </div>
                  <div class="storage-metric-card apple-metric-card">
                    <div class="metric-icon-disc">
                      <i class="ph ph-users"></i>
                    </div>
                    <div class="metric-meta">
                      <span class="metric-num">{{ customersCount() }}</span>
                      <span class="metric-lbl">Profiles Saved</span>
                    </div>
                  </div>
                </div>

                <!-- Storage Cache Quick Maintenance Toolbar -->
                <div class="storage-panel-actions">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm apple-action-pill"
                    (click)="clearLocalCache()"
                    title="Purge volatile local storage cache and force a fresh authoritative pull from the server"
                  >
                    <i class="ph ph-arrows-clockwise"></i>
                    <span>Flush Cache &amp; Re-sync</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm apple-action-pill"
                    (click)="exportStorageSnapshot()"
                    title="Export snapshot of active cached tables, orders, and telemetry"
                  >
                    <i class="ph ph-download-simple"></i>
                    <span>Export Diagnostic Backup</span>
                  </button>
                </div>
              </div>

              <!-- 3. System & Transaction Audit Logs -->
              <div class="panel-box full-width-panel apple-card">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap primary-icon-wrap">
                      <i class="ph ph-clipboard-text"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">System &amp; Transaction Audit Logs</h2>
                      <p class="panel-subtitle">
                        Immutable event ledger tracking administrative overrides, orders, bill
                        settlements, and operational states.
                      </p>
                    </div>
                  </div>
                  <div class="audit-toolbar-actions">
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm apple-action-pill"
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
                        <div class="audit-feed-row apple-audit-row">
                          <div class="audit-timestamp-cell">
                            <span class="audit-time">{{ entry.timestamp | date: 'HH:mm:ss' }}</span>
                            <span class="audit-date">{{
                              entry.timestamp | date: 'mediumDate'
                            }}</span>
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
                            class="btn btn-secondary btn-sm load-more-btn apple-action-pill"
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

              <!-- 4. Quick Transition to Dedicated Recovery & Reset Center -->
              <div
                class="panel-box full-width-panel system-reset-callout-card apple-card apple-reset-callout"
              >
                <div class="callout-left">
                  <div class="callout-icon-box">
                    <i class="ph ph-shield-warning"></i>
                  </div>
                  <div>
                    <h3 class="callout-title">System Recovery &amp; Factory Reset</h3>
                    <p class="callout-desc">
                      Shift seating resets, offline cache clearing, and system factory restore
                      options.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  class="btn btn-secondary btn-sm apple-action-pill"
                  (click)="switchTab('reset')"
                >
                  <span>Open Reset Center</span>
                  <i class="ph ph-arrow-right"></i>
                </button>
              </div>
            </div>
          }

          <!-- TAB 6: DEDICATED RECOVERY & FACTORY RESET CENTER -->
          @if (activeTab === 'reset') {
            <div class="settings-grid maintenance-layout">
              <!-- Recovery Hub Hero Control Strip -->
              <div class="apple-card hero-recovery-panel">
                <div class="hero-recovery-main">
                  <div class="hero-squircle-icon">
                    <i class="ph ph-arrow-counter-clockwise"></i>
                  </div>
                  <div class="hero-recovery-content">
                    <h2 class="hero-panel-heading">Reset &amp; System Recovery</h2>
                    <p class="hero-panel-sub">
                      Reset table seating for a new shift, flush local storage cache, or restore
                      factory defaults.
                    </p>
                  </div>
                </div>
                <div class="hero-recovery-actions">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm pill-btn apple-action-pill"
                    (click)="exportStorageSnapshot()"
                    title="Export backup JSON of current tables, orders, and configuration"
                  >
                    <i class="ph ph-download-simple"></i>
                    <span>Export Backup</span>
                  </button>
                </div>
              </div>

              <!-- 3 Clean Recovery Tiers Grid -->
              <div class="panel-box apple-card full-width-panel recovery-center-panel">
                <div class="recovery-tiers-grid">
                  <!-- Tier 1: Flush Offline Cache -->
                  <div class="recovery-action-card tier-cache">
                    <div class="recovery-card-top">
                      <div class="recovery-icon-circle cache">
                        <i class="ph ph-arrows-clockwise"></i>
                      </div>
                      <div class="recovery-meta">
                        <div class="recovery-header-line">
                          <h3 class="recovery-title">Flush Offline Cache</h3>
                          <span class="tier-pill pill-cache">Safe</span>
                        </div>
                        <p class="recovery-desc">
                          Purges volatile browser memory and pulls fresh records from the server
                          database. All orders and menu items remain safe.
                        </p>
                      </div>
                    </div>
                    <div class="recovery-footer-btn">
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm apple-action-pill"
                        (click)="clearLocalCache()"
                      >
                        <i class="ph ph-cloud-arrow-down"></i>
                        <span>Flush Cache &amp; Re-sync</span>
                      </button>
                    </div>
                  </div>

                  <!-- Tier 2: Reset Dining Floor for New Shift -->
                  <div class="recovery-action-card tier-shift">
                    <div class="recovery-card-top">
                      <div class="recovery-icon-circle shift">
                        <i class="ph ph-armchair"></i>
                      </div>
                      <div class="recovery-meta">
                        <div class="recovery-header-line">
                          <h3 class="recovery-title">Shift Seating Reset</h3>
                          <span class="tier-pill pill-shift">Shift</span>
                        </div>
                        <p class="recovery-desc">
                          Sets all dining floor tables to Available status for the next service
                          shift. Menu items and past invoices are untouched.
                        </p>
                      </div>
                    </div>
                    <div class="recovery-footer-btn">
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm apple-action-pill"
                        (click)="confirmShiftResetOpen = true"
                      >
                        <i class="ph ph-armchair"></i>
                        <span>Reset Seating...</span>
                      </button>
                    </div>
                  </div>

                  <!-- Tier 3: Factory Restore (Destructive) -->
                  <div class="recovery-action-card tier-danger">
                    <div class="recovery-card-top">
                      <div class="recovery-icon-circle danger">
                        <i class="ph ph-warning-octagon"></i>
                      </div>
                      <div class="recovery-meta">
                        <div class="recovery-header-line">
                          <h3 class="recovery-title text-danger">Factory Reset</h3>
                          <span class="tier-pill pill-danger">Destructive</span>
                        </div>
                        <p class="recovery-desc">
                          Restores initial catalog, default 8-table layout, and wipes demo tickets.
                          Server connection &amp; admin login remain safe.
                        </p>
                      </div>
                    </div>
                    <div class="recovery-footer-btn">
                      <button
                        type="button"
                        class="btn btn-danger btn-sm"
                        (click)="confirmResetOpen = true"
                      >
                        <i class="ph ph-arrow-counter-clockwise"></i>
                        <span>Restore Factory Defaults...</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- TAB 7: ADMIN SECURITY (CREDENTIALS & AUDIT GOVERNANCE) -->
          @if (activeTab === 'security') {
            <div class="settings-grid security-split-layout">
              <!-- Left Column: Master Admin Credentials -->
              <div class="panel-box apple-card security-box">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap icon-amber">
                      <i class="ph ph-key"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">Master Admin Password</h2>
                      <p class="panel-subtitle">
                        Protects bill cancellations, duplicate reprints, discounts, and settings.
                      </p>
                    </div>
                  </div>
                  <span class="panel-badge warning">Admin</span>
                </div>

                <div class="form-group">
                  <label class="form-label">Current Admin Password</label>
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
                  <span class="field-hint">Leave blank if no previous password was set.</span>
                </div>

                <div class="form-group">
                  <div class="label-with-meta">
                    <label class="form-label">New Admin Password *</label>
                    @if (pwdForm.newPassword) {
                      <span
                        class="strength-pill"
                        [class.weak]="getPasswordStrengthScore(pwdForm.newPassword) === 1"
                        [class.fair]="getPasswordStrengthScore(pwdForm.newPassword) === 2"
                        [class.good]="getPasswordStrengthScore(pwdForm.newPassword) === 3"
                        [class.strong]="getPasswordStrengthScore(pwdForm.newPassword) === 4"
                      >
                        {{ getPasswordStrengthLabel(pwdForm.newPassword) }}
                      </span>
                    }
                  </div>
                  <div class="input-with-action">
                    <input
                      [type]="showNewPwd ? 'text' : 'password'"
                      class="form-input"
                      placeholder="Min. 4 characters"
                      [(ngModel)]="pwdForm.newPassword"
                    />
                    <button
                      type="button"
                      class="toggle-visibility-btn"
                      (click)="showNewPwd = !showNewPwd"
                      [attr.aria-label]="showNewPwd ? 'Hide password' : 'Show password'"
                    >
                      <i
                        class="ph"
                        [class.ph-eye]="!showNewPwd"
                        [class.ph-eye-slash]="showNewPwd"
                      ></i>
                    </button>
                  </div>
                  @if (pwdForm.newPassword) {
                    <div class="password-meter-track">
                      <div
                        class="meter-segment"
                        [class.active]="getPasswordStrengthScore(pwdForm.newPassword) >= 1"
                        [class.weak]="getPasswordStrengthScore(pwdForm.newPassword) === 1"
                      ></div>
                      <div
                        class="meter-segment"
                        [class.active]="getPasswordStrengthScore(pwdForm.newPassword) >= 2"
                        [class.fair]="getPasswordStrengthScore(pwdForm.newPassword) === 2"
                      ></div>
                      <div
                        class="meter-segment"
                        [class.active]="getPasswordStrengthScore(pwdForm.newPassword) >= 3"
                        [class.good]="getPasswordStrengthScore(pwdForm.newPassword) === 3"
                      ></div>
                      <div
                        class="meter-segment"
                        [class.active]="getPasswordStrengthScore(pwdForm.newPassword) >= 4"
                        [class.strong]="getPasswordStrengthScore(pwdForm.newPassword) === 4"
                      ></div>
                    </div>
                  }
                </div>

                <div class="form-group">
                  <div class="label-with-meta">
                    <label class="form-label">Confirm New Password *</label>
                    @if (pwdForm.newPassword && pwdForm.confirmPassword) {
                      @if (pwdForm.newPassword === pwdForm.confirmPassword) {
                        <span class="match-pill match-ok"><i class="ph ph-check"></i> Match</span>
                      } @else {
                        <span class="match-pill match-bad"
                          ><i class="ph ph-x"></i> Do not match</span
                        >
                      }
                    }
                  </div>
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
                    <span class="field-error-text">Passwords do not match.</span>
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
                      <span>Saving...</span>
                    } @else {
                      <i class="ph ph-shield-check"></i>
                      <span>Save Password</span>
                    }
                  </button>
                </div>
              </div>

              <!-- Right Column: Protected Operations & Security Governance Matrix -->
              <div class="panel-box apple-card security-ops-box">
                <div class="panel-header-row">
                  <div class="panel-title-group">
                    <div class="panel-icon-wrap icon-purple">
                      <i class="ph ph-shield-check"></i>
                    </div>
                    <div class="panel-title-text">
                      <h2 class="heading-card">Protected Operations</h2>
                      <p class="panel-subtitle">Actions that require admin confirmation.</p>
                    </div>
                  </div>
                  <span class="panel-badge info-badge">Policy</span>
                </div>

                <div class="security-operations-list">
                  <div class="op-item">
                    <div class="op-icon-wrap op-danger">
                      <i class="ph ph-x-circle"></i>
                    </div>
                    <div class="op-meta">
                      <span class="op-title">Bill Voids</span>
                      <span class="op-desc">Cancelling or voiding a completed customer bill.</span>
                    </div>
                  </div>

                  <div class="op-item">
                    <div class="op-icon-wrap op-warning">
                      <i class="ph ph-printer"></i>
                    </div>
                    <div class="op-meta">
                      <span class="op-title">Duplicate Thermal Reprints</span>
                      <span class="op-desc">Reprinting previously finalized thermal receipts.</span>
                    </div>
                  </div>

                  <div class="op-item">
                    <div class="op-icon-wrap op-info">
                      <i class="ph ph-tag"></i>
                    </div>
                    <div class="op-meta">
                      <span class="op-title">Discount Overrides</span>
                      <span class="op-desc">Custom order discounts exceeding 20%.</span>
                    </div>
                  </div>

                  <div class="op-item">
                    <div class="op-icon-wrap op-success">
                      <i class="ph ph-armchair"></i>
                    </div>
                    <div class="op-meta">
                      <span class="op-title">Shift Table Reset</span>
                      <span class="op-desc">Ending cashier shifts and clearing floor seating.</span>
                    </div>
                  </div>
                </div>

                <div class="security-advisory-footer">
                  <i class="ph ph-lock-key"></i>
                  <span>Sessions remain authorized for 15 minutes of inactivity.</span>
                </div>
              </div>
            </div>
          }
        </main>
      </div>

      <!-- Confirmation Modal: Factory Reset -->
      <app-confirm-modal
        [isOpen]="confirmResetOpen"
        title="Master Factory Reset"
        message="This action will permanently wipe local orders, reset dining table arrangements to default, restore baseline menu items, and re-seed the standard demo state. This cannot be undone. Are you sure you want to proceed?"
        confirmText="Initiate Factory Reset"
        (confirm)="executeDataReset()"
        (cancel)="confirmResetOpen = false"
      ></app-confirm-modal>

      <!-- Confirmation Modal: Shift Reset -->
      <app-confirm-modal
        [isOpen]="confirmShiftResetOpen"
        title="Reset Floor Tables for New Shift"
        message="This will release all dining tables to AVAILABLE status and close any open seating sessions for a new operating shift. Menu items, pricing, settings, and staff accounts will remain untouched. Proceed?"
        confirmText="Reset Shift Tables"
        (confirm)="executeShiftReset()"
        (cancel)="confirmShiftResetOpen = false"
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
        padding: 4px 11px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-full);
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);

        &.terminal-active {
          border-color: rgba(16, 185, 129, 0.25);
          background: rgba(16, 185, 129, 0.06);
          color: #059669;
        }
      }

      .status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.25);
      }

      .pulse-soft {
        animation: pulseSoft 2.5s infinite ease-in-out;
      }

      @keyframes pulseSoft {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.85;
          transform: scale(0.98);
        }
      }

      .header-actions-group {
        display: flex;
        align-items: center;
        gap: 8px;

        .save-btn {
          border-radius: var(--radius-md);
          font-weight: 600;
          transition:
            transform 0.15s ease,
            background 0.15s ease;

          &:not(:disabled):active {
            transform: scale(0.98);
          }
        }
      }

      .dirty-reset-btn {
        border-color: rgba(220, 38, 38, 0.3);
        color: var(--color-danger);

        &:hover {
          background: rgba(220, 38, 38, 0.08);
          border-color: var(--color-danger);
        }

        &:active {
          transform: scale(0.98);
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

      .settings-search-bar {
        position: relative;
        margin-bottom: 4px;
      }

      .search-input-wrap {
        position: relative;
        display: flex;
        align-items: center;

        .search-icon {
          position: absolute;
          left: 14px;
          color: var(--color-text-muted);
          font-size: 1.125rem;
          pointer-events: none;
        }

        .search-input {
          padding-left: 42px;
          padding-right: 52px;
          height: 44px;
          border-radius: var(--radius-md);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          font-size: 0.875rem;
          color: var(--color-text-primary);
          transition: all var(--transition-fast);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);

          &:focus {
            border-color: var(--color-primary);
            box-shadow: 0 0 0 3px rgba(194, 65, 12, 0.12);
          }
        }

        .search-tools-right {
          position: absolute;
          right: 12px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .search-clear-btn {
          background: transparent;
          border: none;
          color: var(--color-text-muted);
          font-size: 1rem;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;

          &:hover {
            color: var(--color-text-primary);
          }
        }
      }

      .settings-layout {
        display: grid;
        grid-template-columns: 290px 1fr;
        gap: 24px;
        align-items: flex-start;

        @media (max-width: 960px) {
          grid-template-columns: 1fr;
        }
      }

      .settings-sidebar {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-shadow:
          0 1px 3px rgba(0, 0, 0, 0.04),
          0 4px 12px -2px rgba(0, 0, 0, 0.02);
        position: sticky;
        top: calc(var(--topbar-height, 68px) + 20px);
        max-height: calc(100vh - var(--topbar-height, 68px) - 36px);
        overflow-y: auto;
        z-index: 40;

        @media (max-width: 960px) {
          position: static;
          max-height: none;
          overflow-y: visible;
        }
      }

      .sidebar-category-group {
        display: flex;
        flex-direction: column;
        gap: 4px;

        &:not(:last-child) {
          padding-bottom: 12px;
          border-bottom: 1px solid var(--color-border-subtle);
        }
      }

      .sidebar-category-heading {
        font-size: 0.625rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-text-muted);
        padding: 4px 10px;
        opacity: 0.75;
      }

      .sidebar-nav-items {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .sidebar-nav-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 10px;
        border-radius: 9px;
        border: 1px solid transparent;
        background: transparent;
        text-align: left;
        cursor: pointer;
        transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
        width: 100%;
        user-select: none;

        &:hover {
          background: rgba(0, 0, 0, 0.035);

          .nav-chevron {
            opacity: 0.5;
            transform: translateX(0);
          }
        }

        &:active {
          transform: scale(0.985);
        }

        // Apple squircle icon accents per tab
        &[data-tab='general'] .nav-btn-icon-box {
          background: rgba(249, 115, 22, 0.12);
          color: #ea580c;
        }
        &[data-tab='tax'] .nav-btn-icon-box {
          background: rgba(16, 185, 129, 0.12);
          color: #059669;
        }
        &[data-tab='service'] .nav-btn-icon-box {
          background: rgba(245, 158, 11, 0.12);
          color: #d97706;
        }
        &[data-tab='printer'] .nav-btn-icon-box {
          background: rgba(139, 92, 246, 0.12);
          color: #7c3aed;
        }
        &[data-tab='whatsapp'] .nav-btn-icon-box {
          background: rgba(34, 197, 94, 0.12);
          color: #16a34a;
        }
        &[data-tab='maintenance'] .nav-btn-icon-box {
          background: rgba(14, 165, 233, 0.12);
          color: #0284c7;
        }
        &[data-tab='security'] .nav-btn-icon-box {
          background: rgba(99, 102, 241, 0.12);
          color: #4f46e5;
        }
        &[data-tab='reset'] .nav-btn-icon-box {
          background: rgba(239, 68, 68, 0.12);
          color: #dc2626;
        }

        &.active {
          background: rgba(194, 65, 12, 0.08);
          border-color: rgba(194, 65, 12, 0.22);
          box-shadow: 0 1px 3px rgba(194, 65, 12, 0.06);

          .nav-btn-icon-box {
            background: var(--color-primary) !important;
            color: #ffffff !important;
            box-shadow: 0 2px 6px rgba(194, 65, 12, 0.3);
          }

          .nav-btn-label {
            color: var(--color-primary);
            font-weight: 700;
          }

          .nav-chevron {
            opacity: 0.8;
            color: var(--color-primary);
            transform: translateX(0);
          }
        }

        &.search-matched:not(.active) {
          border-color: rgba(245, 158, 11, 0.4);
          background: rgba(245, 158, 11, 0.06);
        }

        &.dimmed {
          opacity: 0.35;
        }
      }

      .nav-btn-icon-box {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.04);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.0625rem;
        flex-shrink: 0;
        transition: all 0.18s ease;
      }

      .nav-btn-label {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        letter-spacing: -0.01em;
      }

      .nav-chevron {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        opacity: 0;
        transform: translateX(-3px);
        transition: all 0.15s ease;
        flex-shrink: 0;
      }

      .tab-chip {
        font-size: 0.625rem;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: var(--radius-full);
        background: rgba(0, 0, 0, 0.06);
        color: var(--color-text-muted);
        letter-spacing: 0.04em;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;

        &.badge-live {
          background: rgba(14, 165, 233, 0.12);
          color: #0284c7;
          border: 1px solid rgba(14, 165, 233, 0.25);

          .pulse-live-dot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: #22c55e;
            box-shadow: 0 0 6px #22c55e;
            display: inline-block;
          }
        }

        &.badge-free {
          background: rgba(34, 197, 94, 0.12);
          color: #16a34a;
          border: 1px solid rgba(34, 197, 94, 0.25);
        }

        &.badge-reset {
          background: rgba(239, 68, 68, 0.12);
          color: #dc2626;
          border: 1px solid rgba(239, 68, 68, 0.25);
        }

        &.badge-escpos {
          background: rgba(139, 92, 246, 0.12);
          color: #7c3aed;
          border: 1px solid rgba(139, 92, 246, 0.25);
        }
      }

      .settings-content-pane {
        display: flex;
        flex-direction: column;
        gap: 20px;
        min-width: 0;
      }

      .apple-card {
        border-radius: var(--radius-md);
        box-shadow:
          0 1px 3px rgba(0, 0, 0, 0.04),
          0 4px 12px -2px rgba(0, 0, 0, 0.02);
      }

      .icon-blue {
        background: rgba(59, 130, 246, 0.1) !important;
        color: #2563eb !important;
      }

      .icon-teal {
        background: rgba(13, 148, 136, 0.1) !important;
        color: #0d9488 !important;
      }

      .highlight-blue {
        background: rgba(59, 130, 246, 0.1) !important;
        color: #2563eb !important;
        border-color: rgba(59, 130, 246, 0.25) !important;
      }

      .highlight-google {
        background: rgba(234, 67, 53, 0.1) !important;
        color: #ea4335 !important;
        border-color: rgba(234, 67, 53, 0.25) !important;
      }

      .char-count-text {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
        font-weight: 600;
      }

      .apple-action-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: var(--radius-full);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        color: var(--color-text-primary);
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background: var(--color-bone-light);
          border-color: var(--color-border-strong);
        }

        &:active {
          transform: scale(0.96);
        }
      }

      /* Apple Callout Guide for Google Review Link */
      .apple-callout-guide {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 10px 14px;
        border-radius: 10px;
        background: linear-gradient(
          135deg,
          rgba(245, 158, 11, 0.06) 0%,
          rgba(245, 158, 11, 0.02) 100%
        );
        border: 1px solid rgba(245, 158, 11, 0.2);

        @media (max-width: 768px) {
          flex-direction: column;
          align-items: flex-start;
        }

        .guide-lead {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex: 1;

          .guide-badge-icon {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: rgba(245, 158, 11, 0.12);
            color: #d97706;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.1rem;
            flex-shrink: 0;
          }

          .guide-text-wrap {
            display: flex;
            flex-direction: column;
            gap: 3px;
            min-width: 0;

            .guide-title-line {
              display: flex;
              align-items: center;
              gap: 8px;

              .guide-title {
                font-size: 0.8125rem;
                font-weight: 700;
                color: var(--color-text-primary);
              }

              .guide-badge-subtle {
                font-size: 0.625rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                padding: 1px 6px;
                border-radius: 4px;
                background: rgba(245, 158, 11, 0.14);
                color: #b45309;
              }
            }

            .guide-flow-inline {
              display: flex;
              align-items: center;
              flex-wrap: wrap;
              gap: 5px;
              font-size: 0.75rem;
              color: var(--color-text-secondary);

              .flow-step {
                font-weight: 500;
              }

              .flow-arrow {
                font-size: 0.6875rem;
                color: var(--color-text-muted);
              }
            }
          }
        }

        .open-maps-btn {
          flex-shrink: 0;
          text-decoration: none;
        }
      }

      .icon-emerald {
        background: rgba(16, 185, 129, 0.1) !important;
        color: #059669 !important;
      }

      .icon-indigo {
        background: rgba(99, 102, 241, 0.1) !important;
        color: #4f46e5 !important;
      }

      .highlight-emerald {
        background: rgba(16, 185, 129, 0.1) !important;
        color: #059669 !important;
        border-color: rgba(16, 185, 129, 0.25) !important;
      }

      .highlight-indigo {
        background: rgba(99, 102, 241, 0.1) !important;
        color: #4f46e5 !important;
        border-color: rgba(99, 102, 241, 0.25) !important;
      }

      /* Apple Quick Tax Bracket Presets */
      .apple-presets-strip {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        background: var(--color-bone-light, #f8fafc);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        flex-wrap: wrap;

        .preset-label {
          font-size: 0.6875rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--color-text-muted);
          white-space: nowrap;
        }

        .preset-buttons {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .preset-pill {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: var(--radius-full);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text-secondary);
          cursor: pointer;
          transition: all 0.15s ease;

          &:hover {
            border-color: rgba(16, 185, 129, 0.4);
            color: var(--color-text-primary);
          }

          &.active {
            background: #10b981;
            border-color: #10b981;
            color: #ffffff;
            box-shadow: 0 1px 4px rgba(16, 185, 129, 0.3);
          }

          &:active {
            transform: scale(0.96);
          }
        }
      }

      .valid-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.6875rem;
        font-weight: 700;
        color: #059669;
        background: rgba(16, 185, 129, 0.1);
        padding: 2px 8px;
        border-radius: 9999px;
        border: 1px solid rgba(16, 185, 129, 0.2);
      }

      .warn-pill {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
        font-weight: 600;
      }

      /* Apple Live Tax Calculation Callout */
      .tax-math-callout {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 12px 14px;
        border-radius: 12px;
        background: linear-gradient(
          135deg,
          rgba(16, 185, 129, 0.05) 0%,
          rgba(16, 185, 129, 0.01) 100%
        );
        border: 1px solid rgba(16, 185, 129, 0.2);

        .math-callout-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #059669;
        }

        .math-breakdown-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;

          .math-chip {
            display: flex;
            flex-direction: column;
            gap: 1px;
            padding: 6px 10px;
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: 8px;

            .chip-label {
              font-size: 0.625rem;
              text-transform: uppercase;
              font-weight: 700;
              color: var(--color-text-muted);
            }

            .chip-val {
              font-size: 0.8125rem;
              font-weight: 700;
              color: var(--color-text-primary);
            }

            &.highlight-chip {
              border-color: rgba(194, 65, 12, 0.3);
              background: rgba(194, 65, 12, 0.05);

              .chip-val.text-brand {
                color: var(--color-primary);
              }
            }
          }

          .math-op {
            font-size: 0.875rem;
            font-weight: 700;
            color: var(--color-text-muted);
          }
        }
      }

      /* Quick Footer Preset Pills */
      .footer-presets-row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 6px;

        .preset-label {
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--color-text-muted);
          text-transform: uppercase;
        }

        .insert-pill {
          font-size: 0.6875rem;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 6px;
          background: var(--color-bone-light, #f8fafc);
          border: 1px solid var(--color-border);
          color: var(--color-text-secondary);
          cursor: pointer;
          transition: all 0.15s ease;

          &:hover {
            background: var(--color-surface);
            color: var(--color-primary);
            border-color: var(--color-primary);
          }

          &:active {
            transform: scale(0.96);
          }
        }
      }

      /* Thermal Monospace Bill Preview */
      .thermal-bill-preview {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 6px;

        .bill-preview-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--color-text-secondary);
        }

        .bill-paper-tape {
          padding: 12px 14px;
          background: #fbfbfb;
          border: 1px dashed var(--color-border);
          border-radius: 8px;
          font-size: 0.6875rem;
          color: #334155;
          line-height: 1.45;

          .dashed-line {
            color: #94a3b8;
            overflow: hidden;
            white-space: nowrap;
          }

          .tape-row.flex-between {
            display: flex;
            justify-content: space-between;
          }

          .tape-center {
            text-align: center;
            margin: 4px 0;

            &.italic-msg {
              font-style: italic;
              color: #475569;
            }

            &.qr-placeholder {
              font-size: 0.625rem;
              letter-spacing: 0.05em;
              color: #94a3b8;
            }
          }
        }
      }

      .google-review-panel {
        border-left: 3px solid #ea4335 !important;
      }

      .google-icon-wrap {
        background: rgba(234, 67, 53, 0.1) !important;
        color: #ea4335 !important;
      }

      .google-color {
        color: #ea4335;
      }

      .help-tip-card {
        display: flex;
        gap: 12px;
        padding: 12px 14px;
        border-radius: var(--radius-sm);
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.2);
        color: var(--color-text-secondary);
        font-size: 0.75rem;
        line-height: 1.45;

        .help-tip-icon {
          font-size: 1.125rem;
          color: #d97706;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .help-steps-list {
          margin: 6px 0 0 16px;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;

          code {
            font-family: monospace;
            background: rgba(0, 0, 0, 0.06);
            padding: 1px 4px;
            border-radius: 3px;
          }
        }
      }

      .header-actions-inline {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .test-link-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.75rem;
        padding: 4px 10px;
        white-space: nowrap;
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

      /* WhatsApp Apple-Style Gateway Styles */
      .icon-green {
        background: rgba(34, 197, 94, 0.1) !important;
        color: #16a34a !important;
      }

      .badge-connected {
        background: rgba(34, 197, 94, 0.1);
        color: #16a34a;
        border: 1px solid rgba(34, 197, 94, 0.25);
        font-size: 0.6875rem;
        font-weight: 700;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 9999px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }

      .badge-scan {
        background: rgba(245, 158, 11, 0.1);
        color: #d97706;
        border: 1px solid rgba(245, 158, 11, 0.25);
        font-size: 0.6875rem;
        font-weight: 700;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 9999px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }

      .badge-offline {
        background: rgba(100, 116, 139, 0.1);
        color: #64748b;
        border: 1px solid rgba(100, 116, 139, 0.25);
        font-size: 0.6875rem;
        font-weight: 700;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 9999px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }

      .wa-connected-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        background: rgba(34, 197, 94, 0.05);
        border: 1px solid rgba(34, 197, 94, 0.2);
        border-radius: var(--radius-md);
        padding: 16px 18px;
        margin-top: 10px;
        flex-wrap: wrap;

        .wa-device-meta {
          display: flex;
          align-items: center;
          gap: 14px;

          .wa-avatar-disc {
            width: 42px;
            height: 42px;
            border-radius: 12px;
            background: rgba(34, 197, 94, 0.12);
            color: #16a34a;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            flex-shrink: 0;
          }

          .wa-conn-details {
            display: flex;
            flex-direction: column;
            gap: 2px;

            .wa-title-row {
              display: flex;
              align-items: center;
              gap: 8px;

              .wa-conn-title {
                font-size: 0.9375rem;
                font-weight: 700;
                color: var(--color-text-primary);
                margin: 0;
              }

              .wa-verified-pill {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 0.625rem;
                font-weight: 700;
                color: #16a34a;
                background: rgba(34, 197, 94, 0.1);
                padding: 1px 6px;
                border-radius: 9999px;
              }
            }

            .wa-conn-phone {
              font-size: 0.8125rem;
              font-family: var(--font-mono, monospace);
              font-weight: 600;
              color: #16a34a;
              margin: 0;
            }

            .wa-conn-hint {
              font-size: 0.75rem;
              color: var(--color-text-secondary);
              margin: 0;
            }
          }
        }
      }

      .wa-pairing-container {
        display: flex;
        gap: 24px;
        align-items: flex-start;
        padding: 16px 0;
        flex-wrap: wrap;

        .wa-qr-box {
          background: #ffffff;
          border: 1px solid var(--color-border);
          border-radius: 16px;
          padding: 12px;
          box-shadow: var(--shadow-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 200px;
          min-height: 200px;

          .wa-qr-img {
            width: 190px;
            height: 190px;
            display: block;
            border-radius: 8px;
          }

          .wa-qr-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            text-align: center;
            padding: 20px;
          }
        }

        .wa-instructions {
          flex: 1;
          min-width: 240px;

          .wa-steps-list {
            padding-left: 20px;
            margin: 8px 0 16px 0;
            font-size: 0.8125rem;
            line-height: 1.6;
            color: var(--color-text-secondary);

            li {
              margin-bottom: 4px;
            }
          }

          .wa-perks-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: rgba(34, 197, 94, 0.1);
            color: #15803d;
            border: 1px solid rgba(34, 197, 94, 0.2);
            padding: 6px 12px;
            border-radius: 999px;
            font-size: 0.75rem;
            font-weight: 600;
          }
        }
      }

      .wa-templates-card {
        grid-column: 1 / -1;
      }

      .wa-template-tabs {
        display: flex;
        gap: 8px;
        margin-top: 14px;
        background: var(--color-bone-light, #f8fafc);
        padding: 5px;
        border-radius: 12px;
        border: 1px solid var(--color-border, #e2e8f0);
        overflow-x: auto;
      }

      .wa-tpl-tab-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        font-size: 0.8125rem;
        font-weight: 600;
        border-radius: 8px;
        border: none;
        background: transparent;
        color: var(--color-text-secondary, #64748b);
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        white-space: nowrap;

        &:hover {
          color: var(--color-text-primary, #0f172a);
          background: rgba(255, 255, 255, 0.1);
        }

        &.active {
          background: var(--color-surface, #ffffff);
          color: var(--color-text-primary, #0f172a);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          font-weight: 700;
        }

        i {
          font-size: 1rem;
        }
      }

      .wa-template-editor-grid {
        display: grid;
        grid-template-columns: 1fr 340px;
        gap: 20px;
        margin-top: 16px;

        @media (max-width: 960px) {
          grid-template-columns: 1fr;
        }
      }

      .wa-editor-pane {
        display: flex;
        flex-direction: column;
      }

      .wa-token-chips-wrapper {
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: var(--color-bone-light, #f8fafc);
        border: 1px dashed var(--color-border, #cbd5e1);
        border-radius: 10px;
        padding: 10px 12px;
      }

      .wa-tokens-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .wa-token-chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        font-size: 0.75rem;
        font-family: var(--font-mono, monospace);
        font-weight: 600;
        border-radius: 6px;
        border: 1px solid rgba(139, 92, 246, 0.3);
        background: rgba(139, 92, 246, 0.12);
        color: #8b5cf6;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          background: #7c3aed;
          color: #ffffff;
          border-color: #7c3aed;
          transform: translateY(-1px);
        }

        &.highlight-chip {
          border-color: rgba(16, 185, 129, 0.35);
          background: rgba(16, 185, 129, 0.12);
          color: #10b981;

          &:hover {
            background: #059669;
            color: #ffffff;
            border-color: #059669;
          }
        }
      }

      .wa-template-textarea {
        width: 100%;
        font-family: inherit;
        font-size: 0.875rem;
        line-height: 1.5;
        border-radius: 10px;
        padding: 12px 14px;
        resize: vertical;
        min-height: 150px;
        background: var(--color-surface, #ffffff) !important;
        color: var(--color-text-primary, #0f172a) !important;
        border: 1px solid var(--color-border, #cbd5e1);
        transition:
          border-color var(--transition-fast),
          box-shadow var(--transition-fast);

        &:focus {
          outline: none;
          border-color: var(--color-primary, #16a34a);
          box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.15);
        }

        &::placeholder {
          color: var(--color-text-muted, #94a3b8);
        }
      }

      .wa-preview-pane {
        display: flex;
        justify-content: center;
      }

      .wa-phone-mockup {
        width: 100%;
        max-width: 340px;
        background: #efeae2;
        border: 1px solid rgba(0, 0, 0, 0.15);
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.12);
        display: flex;
        flex-direction: column;
      }

      .wa-mockup-header {
        background: #075e54;
        color: #ffffff;
        padding: 10px 14px;
        display: flex;
        align-items: center;
        gap: 10px;

        .wa-header-avatar {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
        }

        .wa-header-info {
          display: flex;
          flex-direction: column;

          .wa-header-name {
            font-size: 0.875rem;
            font-weight: 700;
            line-height: 1.2;
          }

          .wa-header-status {
            font-size: 0.6875rem;
            opacity: 0.85;
          }
        }
      }

      .wa-mockup-body {
        padding: 14px 10px;
        min-height: 240px;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
      }

      .wa-date-chip {
        align-self: center;
        background: rgba(255, 255, 255, 0.85);
        font-size: 0.6875rem;
        font-weight: 600;
        color: #54656f;
        padding: 3px 10px;
        border-radius: 6px;
        box-shadow: 0 1px 1px rgba(0, 0, 0, 0.06);
        margin-bottom: 12px;
      }

      .wa-bubble-sent {
        align-self: flex-end;
        background: #d9fdd3;
        border-radius: 10px 0 10px 10px;
        padding: 8px 10px 6px 10px;
        max-width: 95%;
        box-shadow: 0 1px 0.5px rgba(11, 20, 26, 0.13);

        .wa-bubble-content {
          font-size: 0.8125rem;
          line-height: 1.45;
          color: #111b21;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .wa-bubble-meta {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
          margin-top: 4px;

          .wa-time-str {
            font-size: 0.625rem;
            color: #667781;
          }

          .wa-checks {
            font-size: 0.8125rem;
            color: #53bdeb;
          }
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

      /* 3-card System Status Grid with Apple Contained Bounds */
      .system-status-cards {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
        margin-top: 16px;
        width: 100%;
        box-sizing: border-box;
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
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 14px;
        min-width: 0;
        box-sizing: border-box;
        overflow: hidden;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease,
          border-color 0.15s ease;

        &.apple-status-card {
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
      }

      .system-status-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
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
        gap: 12px;
        min-width: 0;
      }

      .system-target-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .system-type-tag {
        font-size: 0.625rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-text-muted);
      }

      .system-target-name {
        font-size: 1rem;
        font-weight: 700;
        color: var(--color-text-primary);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .system-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 3px 10px;
        border-radius: 9999px;
        flex-shrink: 0;
      }

      .pill-online {
        background: rgba(22, 163, 74, 0.08);
        color: #16a34a;
        border: 1px solid rgba(22, 163, 74, 0.22);
      }

      .pill-offline {
        background: rgba(234, 88, 12, 0.08);
        color: #ea580c;
        border: 1px solid rgba(234, 88, 12, 0.22);
      }

      .status-pulse-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        display: inline-block;
        flex-shrink: 0;
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

      .system-status-desc {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        margin: 0;
        line-height: 1.45;
        overflow-wrap: break-word;
        word-break: break-word;
      }

      .system-status-card-footer {
        display: flex;
        flex-direction: column;
        gap: 6px;
        border-top: 1px solid var(--color-border);
        padding-top: 12px;
        margin-top: auto;
        min-width: 0;

        .latency-meta-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.75rem;

          .system-latency-label {
            color: var(--color-text-muted);
            font-weight: 500;
          }

          .system-latency-val {
            font-family: var(--font-mono, monospace);
            font-weight: 700;
            color: var(--color-text-primary);

            &.latency-good {
              color: #16a34a;
            }
            &.latency-fair {
              color: #d97706;
            }
            &.latency-slow {
              color: #dc2626;
            }
          }
        }

        .latency-gauge-track {
          height: 4px;
          background: var(--color-border);
          border-radius: 2px;
          overflow: hidden;

          .latency-meter-bar {
            height: 100%;
            border-radius: 2px;
            transition: width 0.3s ease;

            &.latency-good {
              background: #16a34a;
            }
            &.latency-fair {
              background: #f59e0b;
            }
            &.latency-slow {
              background: #ef4444;
            }
          }
        }
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

      /* ============================================================ */
      /* STANDARD SOFTWARE SYSTEM & RECOVERY RESET HUB STYLING        */
      /* ============================================================ */
      .system-overview-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 20px 24px;
        background: linear-gradient(
          135deg,
          var(--color-surface) 0%,
          var(--color-bone-light, #f8fafc) 100%
        );
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg, 12px);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);

        @media (max-width: 768px) {
          flex-direction: column;
          align-items: flex-start;
        }

        .system-hero-info {
          display: flex;
          align-items: center;
          gap: 16px;

          .system-brand-mark {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            background: rgba(220, 38, 38, 0.08);
            color: var(--color-crimson, #dc2626);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            border: 1px solid rgba(220, 38, 38, 0.2);
            flex-shrink: 0;
          }

          .system-hero-text {
            display: flex;
            flex-direction: column;
            gap: 4px;

            .system-title-row {
              display: flex;
              align-items: center;
              gap: 8px;
              flex-wrap: wrap;

              .system-title {
                font-size: 1.0625rem;
                font-weight: 700;
                color: var(--color-text-primary);
                margin: 0;
              }

              .system-version-pill {
                font-size: 0.6875rem;
                font-weight: 700;
                padding: 2px 8px;
                border-radius: 999px;
                background: var(--color-bone, #f1f5f9);
                border: 1px solid var(--color-border);
                color: var(--color-text-secondary);
                text-transform: uppercase;
                letter-spacing: 0.04em;
              }

              .system-arch-pill {
                font-size: 0.6875rem;
                font-weight: 700;
                padding: 2px 8px;
                border-radius: 999px;
                background: rgba(16, 185, 129, 0.1);
                color: #10b981;
                border: 1px solid rgba(16, 185, 129, 0.2);
                display: inline-flex;
                align-items: center;
                gap: 4px;
              }
            }

            .system-desc {
              font-size: 0.8125rem;
              color: var(--color-text-secondary);
              margin: 0;
              line-height: 1.4;
            }
          }
        }

        .system-hero-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
      }

      /* Storage Telemetry Extra Actions */
      .storage-panel-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px dashed var(--color-border);
        flex-wrap: wrap;
      }

      /* Recovery Center Panel */
      .recovery-center-panel {
        border-color: rgba(220, 38, 38, 0.2);

        .recovery-icon-wrap {
          background: rgba(220, 38, 38, 0.1);
          color: #dc2626;
        }

        .warning-badge {
          background: rgba(234, 88, 12, 0.1);
          color: #ea580c;
          border: 1px solid rgba(234, 88, 12, 0.2);
          font-size: 0.6875rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 3px 8px;
          border-radius: 999px;
        }
      }

      .recovery-tiers-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin-top: 18px;

        @media (max-width: 900px) {
          grid-template-columns: 1fr;
        }
      }

      .recovery-action-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 10px);
        padding: 16px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 12px;
        transition: all 0.15s ease;

        &:hover {
          border-color: var(--color-text-muted);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
        }

        &.tier-danger {
          border-color: rgba(220, 38, 38, 0.25);
          background: rgba(220, 38, 38, 0.02);

          &:hover {
            border-color: #dc2626;
            box-shadow: 0 4px 14px rgba(220, 38, 38, 0.08);
          }
        }

        &.tier-soft.is-dirty {
          border-color: rgba(234, 88, 12, 0.4);
          background: rgba(234, 88, 12, 0.02);
        }

        .recovery-card-top {
          display: flex;
          align-items: flex-start;
          gap: 12px;

          .recovery-icon-circle {
            width: 38px;
            height: 38px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.125rem;
            flex-shrink: 0;

            &.soft {
              background: rgba(59, 130, 246, 0.1);
              color: #2563eb;
              border: 1px solid rgba(59, 130, 246, 0.2);
            }

            &.cache {
              background: rgba(16, 185, 129, 0.1);
              color: #059669;
              border: 1px solid rgba(16, 185, 129, 0.2);
            }

            &.shift {
              background: rgba(168, 85, 247, 0.1);
              color: #7c3aed;
              border: 1px solid rgba(168, 85, 247, 0.2);
            }

            &.danger {
              background: rgba(220, 38, 38, 0.1);
              color: #dc2626;
              border: 1px solid rgba(220, 38, 38, 0.2);
            }
          }

          .recovery-meta {
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex: 1;

            .recovery-header-line {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;

              .recovery-title {
                font-size: 0.9375rem;
                font-weight: 700;
                color: var(--color-text-primary);
                margin: 0;

                &.text-danger {
                  color: #dc2626;
                }
              }

              .tier-pill {
                font-size: 0.625rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                padding: 2px 7px;
                border-radius: 999px;

                &.pill-safe {
                  background: #f0fdf4;
                  color: #166534;
                  border: 1px solid #bbf7d0;
                }

                &.pill-cache {
                  background: #f0fdfa;
                  color: #0f766e;
                  border: 1px solid #99f6e4;
                }

                &.pill-shift {
                  background: #faf5ff;
                  color: #6b21a8;
                  border: 1px solid #e9d5ff;
                }

                &.pill-danger {
                  background: #fef2f2;
                  color: #991b1b;
                  border: 1px solid #fecaca;
                }
              }
            }

            .recovery-desc {
              font-size: 0.8125rem;
              color: var(--color-text-secondary);
              margin: 0;
              line-height: 1.4;
            }
          }
        }

        .recovery-impact-row {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          padding: 8px 10px;
          background: var(--color-bone-light, #f8fafc);
          border: 1px solid var(--color-border);
          border-radius: 6px;
          font-size: 0.75rem;
          color: var(--color-text-secondary);

          .impact-label {
            font-weight: 700;
            color: var(--color-text-primary);
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            gap: 4px;
          }

          &.danger-impact {
            background: #fff5f5;
            border-color: #fed7d7;
            color: #991b1b;

            .impact-label {
              color: #c53030;
            }
          }
        }

        .recovery-footer-btn {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding-top: 4px;

          button {
            width: 100%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-weight: 600;
          }
        }
      }

      /* Recovery Disclosure Card */
      .recovery-disclosure-card {
        margin-top: 20px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 10px);
        padding: 16px 18px;

        .disclosure-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8125rem;
          color: var(--color-text-primary);
          padding-bottom: 12px;
          border-bottom: 1px solid var(--color-border);

          i {
            font-size: 1rem;
            color: var(--color-text-muted);
          }
        }

        .disclosure-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-top: 14px;

          @media (max-width: 768px) {
            grid-template-columns: 1fr;
          }

          .disclosure-col {
            display: flex;
            flex-direction: column;
            gap: 10px;

            .col-title-line {
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 0.75rem;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              color: var(--color-text-secondary);

              i {
                font-size: 0.875rem;
              }
            }

            .disclosure-list {
              list-style: none;
              padding: 0;
              margin: 0;
              display: flex;
              flex-direction: column;
              gap: 8px;

              li {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                font-size: 0.8125rem;
                color: var(--color-text-secondary);
                line-height: 1.4;

                i {
                  font-size: 0.9375rem;
                  margin-top: 2px;
                  flex-shrink: 0;

                  &.text-danger {
                    color: #dc2626;
                  }
                  &.text-success {
                    color: #16a34a;
                  }
                }
              }
            }
          }
        }
      }

      /* Apple Squircle Hero Panel for Recovery */
      .hero-recovery-panel {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 20px 24px;
        background: linear-gradient(
          135deg,
          rgba(239, 68, 68, 0.05) 0%,
          rgba(245, 158, 11, 0.02) 100%
        );
        border: 1px solid rgba(239, 68, 68, 0.2);
        border-radius: var(--radius-md);

        @media (max-width: 768px) {
          flex-direction: column;
          align-items: flex-start;
        }

        .hero-recovery-main {
          display: flex;
          align-items: center;
          gap: 16px;

          .hero-squircle-icon {
            width: 52px;
            height: 52px;
            border-radius: 14px;
            background: rgba(239, 68, 68, 0.12);
            color: #dc2626;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.625rem;
            flex-shrink: 0;
            box-shadow: 0 2px 8px rgba(220, 38, 38, 0.15);
          }

          .hero-recovery-content {
            display: flex;
            flex-direction: column;
            gap: 4px;

            .hero-title-row {
              display: flex;
              align-items: center;
              gap: 8px;
              flex-wrap: wrap;

              .hero-panel-heading {
                font-size: 1.125rem;
                font-weight: 700;
                color: var(--color-text-primary);
                margin: 0;
              }

              .apple-tag {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 0.6875rem;
                font-weight: 700;
                padding: 3px 8px;
                border-radius: 9999px;

                &.tag-danger {
                  background: rgba(220, 38, 38, 0.1);
                  color: #dc2626;
                  border: 1px solid rgba(220, 38, 38, 0.25);
                }

                &.tag-subtle {
                  background: var(--color-surface);
                  color: var(--color-text-muted);
                  border: 1px solid var(--color-border);
                }
              }
            }

            .hero-panel-sub {
              font-size: 0.8125rem;
              color: var(--color-text-secondary);
              margin: 0;
              line-height: 1.45;
            }
          }
        }

        .hero-recovery-actions {
          flex-shrink: 0;

          .pill-btn {
            border-radius: 9999px;
            padding: 8px 16px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-weight: 600;
            font-size: 0.8125rem;
          }
        }
      }

      /* Security Split Layout & Pentagi Password Styling */
      .security-split-layout {
        display: grid;
        grid-template-columns: 1.25fr 1fr;
        gap: 20px;
        align-items: start;

        @media (max-width: 900px) {
          grid-template-columns: 1fr;
        }
      }

      .icon-amber {
        background: rgba(245, 158, 11, 0.1) !important;
        color: #d97706 !important;
      }

      .icon-purple {
        background: rgba(147, 51, 234, 0.1) !important;
        color: #9333ea !important;
      }

      .icon-orange {
        background: rgba(234, 88, 12, 0.1) !important;
        color: #ea580c !important;
      }

      .label-with-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;

        .form-label {
          margin-bottom: 0;
        }

        .strength-pill {
          font-size: 0.625rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 2px 7px;
          border-radius: 9999px;

          &.weak {
            background: rgba(239, 68, 68, 0.1);
            color: #dc2626;
            border: 1px solid rgba(239, 68, 68, 0.25);
          }
          &.fair {
            background: rgba(245, 158, 11, 0.1);
            color: #d97706;
            border: 1px solid rgba(245, 158, 11, 0.25);
          }
          &.good {
            background: rgba(59, 130, 246, 0.1);
            color: #2563eb;
            border: 1px solid rgba(59, 130, 246, 0.25);
          }
          &.strong {
            background: rgba(16, 185, 129, 0.1);
            color: #059669;
            border: 1px solid rgba(16, 185, 129, 0.25);
          }
        }

        .match-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.6875rem;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 9999px;

          &.match-ok {
            background: rgba(16, 185, 129, 0.1);
            color: #059669;
            border: 1px solid rgba(16, 185, 129, 0.25);
          }
          &.match-bad {
            background: rgba(239, 68, 68, 0.1);
            color: #dc2626;
            border: 1px solid rgba(239, 68, 68, 0.25);
          }
        }
      }

      /* 4-bar Password Strength Track */
      .password-meter-track {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 4px;
        margin-top: 6px;

        .meter-segment {
          height: 4px;
          border-radius: 2px;
          background: var(--color-border);
          transition: background-color 0.2s ease;

          &.active.weak {
            background: #ef4444;
          }
          &.active.fair {
            background: #f59e0b;
          }
          &.active.good {
            background: #3b82f6;
          }
          &.active.strong {
            background: #10b981;
          }
        }
      }

      /* Security Operations Companion Matrix */
      .security-ops-box {
        .info-badge {
          background: rgba(59, 130, 246, 0.1);
          color: #2563eb;
          border: 1px solid rgba(59, 130, 246, 0.2);
          font-size: 0.6875rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 3px 8px;
          border-radius: 999px;
        }

        .security-operations-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 14px;

          .op-item {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 10px 12px;
            border-radius: var(--radius-sm);
            background: var(--color-surface);
            border: 1px solid var(--color-border);

            .op-icon-wrap {
              width: 32px;
              height: 32px;
              border-radius: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1rem;
              flex-shrink: 0;

              &.op-danger {
                background: rgba(239, 68, 68, 0.1);
                color: #ef4444;
              }
              &.op-warning {
                background: rgba(245, 158, 11, 0.1);
                color: #d97706;
              }
              &.op-info {
                background: rgba(59, 130, 246, 0.1);
                color: #2563eb;
              }
              &.op-success {
                background: rgba(16, 185, 129, 0.1);
                color: #059669;
              }
            }

            .op-meta {
              display: flex;
              flex-direction: column;
              gap: 2px;

              .op-title {
                font-size: 0.8125rem;
                font-weight: 700;
                color: var(--color-text-primary);
              }

              .op-desc {
                font-size: 0.75rem;
                color: var(--color-text-secondary);
                line-height: 1.4;
              }
            }
          }
        }

        .security-advisory-footer {
          margin-top: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: rgba(59, 130, 246, 0.05);
          border: 1px dashed rgba(59, 130, 246, 0.25);
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          color: var(--color-text-secondary);
          line-height: 1.35;

          i {
            font-size: 1rem;
            color: #2563eb;
            flex-shrink: 0;
          }
        }
      }

      /* System Reset Callout Card in Diagnostics */
      .system-reset-callout-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 16px 20px;
        background: linear-gradient(
          135deg,
          rgba(239, 68, 68, 0.04) 0%,
          rgba(245, 158, 11, 0.04) 100%
        );
        border: 1px dashed rgba(239, 68, 68, 0.35);
        border-radius: var(--radius-md, 10px);

        .callout-left {
          display: flex;
          align-items: center;
          gap: 14px;

          .callout-icon-box {
            width: 42px;
            height: 42px;
            border-radius: 10px;
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            flex-shrink: 0;
          }

          .callout-title {
            font-size: 0.9375rem;
            font-weight: 700;
            color: var(--color-text-primary);
            margin: 0 0 2px 0;
          }

          .callout-desc {
            font-size: 0.8125rem;
            color: var(--color-text-secondary);
            margin: 0;
            line-height: 1.4;
          }
        }

        @media (max-width: 640px) {
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;

          button {
            width: 100%;
            justify-content: center;
          }
        }
      }

      /* ==========================================================================
         APPLE FLUID DESIGN SYSTEM ADDITIONS (PRINTER, SERVICE, TELEMETRY)
         ========================================================================== */
      .highlight-purple {
        background: rgba(168, 85, 247, 0.1) !important;
        color: #9333ea !important;
        border-color: rgba(168, 85, 247, 0.25) !important;
      }

      .icon-purple {
        background: rgba(168, 85, 247, 0.1) !important;
        color: #9333ea !important;
      }

      .icon-amber {
        background: rgba(245, 158, 11, 0.1) !important;
        color: #d97706 !important;
      }

      /* Block 1: Hardware Receipt Printer Styles */
      .apple-radio-card {
        display: flex;
        cursor: pointer;
        border-radius: var(--radius-md);
        border: 1.5px solid var(--color-border);
        background: var(--color-surface);
        padding: 14px 16px;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;

        input[type='radio'] {
          display: none;
        }

        &:hover {
          border-color: var(--color-border-strong);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
        }

        &.selected {
          border-color: var(--color-primary);
          background: rgba(194, 65, 12, 0.03);
          box-shadow:
            0 0 0 1px var(--color-primary),
            0 4px 16px rgba(194, 65, 12, 0.08);
        }

        .radio-card-content {
          display: flex;
          align-items: center;
          gap: 14px;
          width: 100%;
        }

        .radio-icon-box {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          flex-shrink: 0;

          &.emerald-box {
            background: rgba(16, 185, 129, 0.1);
            color: #059669;
          }

          &.sky-box {
            background: rgba(14, 165, 233, 0.1);
            color: #0284c7;
          }

          &.amber-box {
            background: rgba(245, 158, 11, 0.1);
            color: #d97706;
          }
        }

        .radio-card-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
          font-size: 0.75rem;
          color: var(--color-text-muted);
          line-height: 1.35;
        }

        .radio-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;

          strong {
            font-size: 0.875rem;
            color: var(--color-text-primary);
            font-weight: 700;
          }
        }

        .tech-tag {
          font-size: 0.625rem;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          letter-spacing: 0.04em;

          &.tag-emerald {
            background: #ecfdf5;
            color: #059669;
            border: 1px solid #a7f3d0;
          }

          &.tag-sky {
            background: #f0f9ff;
            color: #0284c7;
            border: 1px solid #bae6fd;
          }

          &.tag-amber {
            background: #fffbeb;
            color: #d97706;
            border: 1px solid #fde68a;
          }
        }

        .radio-check-indicator {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 1.5px solid var(--color-border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.875rem;
          color: transparent;
          transition: all 0.2s ease;
        }

        &.selected .radio-check-indicator {
          border-color: var(--color-primary);
          background: var(--color-primary);
          color: #ffffff;
        }
      }

      .printer-device-box {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 14px 16px;
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 10px;

        &.apple-hardware-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }

        .label-with-action {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;

          .printer-label-wrap {
            display: flex;
            align-items: center;
            gap: 10px;

            .device-icon-disc {
              width: 32px;
              height: 32px;
              border-radius: 8px;
              background: rgba(194, 65, 12, 0.1);
              color: var(--color-primary);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1.05rem;
              flex-shrink: 0;
            }

            .device-hint-sub {
              font-size: 0.6875rem;
              color: var(--color-text-muted);
              display: block;
              margin-top: 1px;
            }
          }
        }

        .select-hardware-wrap {
          .font-mono-select {
            font-size: 0.8125rem;
          }
        }

        .printer-hardware-telemetry {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          padding-top: 4px;
          font-size: 0.75rem;
          color: var(--color-text-secondary);

          .telemetry-left {
            display: inline-flex;
            align-items: center;
            gap: 6px;

            .dot-live {
              width: 7px;
              height: 7px;
              border-radius: 50%;
              background: #10b981;
              box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
              flex-shrink: 0;
            }

            .status-summary {
              font-weight: 600;
              color: var(--color-text-primary);
            }
          }

          .telemetry-right {
            font-size: 0.7188rem;
            color: var(--color-text-muted);

            strong {
              color: var(--color-text-primary);
              font-weight: 600;
            }
          }
        }
      }

      .apple-segmented-control {
        display: grid;
        grid-template-columns: 1fr 1fr;
        background: var(--color-bone-light);
        padding: 4px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        gap: 4px;

        button {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 10px 14px;
          border: none;
          background: transparent;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          color: var(--color-text-secondary);

          &.active {
            background: var(--color-surface);
            color: var(--color-text-primary);
            font-weight: 700;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
          }

          strong {
            font-size: 0.875rem;
          }

          span {
            font-size: 0.6875rem;
            color: var(--color-text-muted);
            margin-top: 2px;
          }
        }
      }

      .apple-switches-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        margin-top: 14px;

        @media (max-width: 680px) {
          grid-template-columns: 1fr;
        }
      }

      .apple-switch-tile {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        background: var(--color-surface);
        border: 1.5px solid var(--color-border);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;

        &:hover {
          border-color: var(--color-border-strong);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
        }

        .switch-tile-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .tile-icon-box {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.04);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.125rem;
          color: var(--color-text-primary);
        }

        .tile-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .tile-title-row {
          display: flex;
          align-items: center;
          gap: 8px;

          strong {
            font-size: 0.8125rem;
            font-weight: 700;
            color: var(--color-text-primary);
          }
        }

        .hex-badge {
          font-family: monospace;
          font-size: 0.6875rem;
          font-weight: 600;
          padding: 1px 6px;
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.06);
          color: var(--color-text-secondary);
        }

        .tile-subtitle {
          font-size: 0.6875rem;
          color: var(--color-text-muted);
        }
      }

      .apple-switch {
        position: relative;
        width: 44px;
        height: 26px;
        flex-shrink: 0;

        input {
          opacity: 0;
          width: 0;
          height: 0;
          position: absolute;
        }

        .switch-slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background-color: var(--color-border-strong, #cbd5e1);
          transition: 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          border-radius: 9999px;
        }

        .switch-slider:before {
          position: absolute;
          content: '';
          height: 20px;
          width: 20px;
          left: 3px;
          bottom: 3px;
          background-color: #ffffff;
          transition: 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          border-radius: 50%;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
        }

        input:checked + .switch-slider {
          background-color: #22c55e;
        }

        input:checked + .switch-slider:before {
          transform: translateX(18px);
        }
      }

      .apple-test-slate {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 18px;
        border-radius: var(--radius-md);
        background: rgba(59, 130, 246, 0.04);
        border: 1px dashed rgba(59, 130, 246, 0.3);
        margin-top: 14px;
        gap: 14px;
        flex-wrap: wrap;

        .test-slate-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.875rem;
          color: var(--color-text-primary);
          margin-bottom: 2px;

          i {
            color: #2563eb;
            font-size: 1.125rem;
          }
        }
      }

      .tape-emulation-box {
        background: #ffffff;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 16px;
        margin-top: 14px;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);
        max-width: 440px;
        margin-left: auto;
        margin-right: auto;

        &.compact-tape {
          max-width: 340px;
        }

        .bill-preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--color-text-secondary);
          border-bottom: 1px solid var(--color-border);
          padding-bottom: 8px;
          margin-bottom: 12px;
        }

        .badge-tape-width {
          font-size: 0.625rem;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.06);
          color: var(--color-text-muted);
        }

        .bill-paper-tape {
          font-family: monospace;
          font-size: 0.8125rem;
          line-height: 1.5;
          color: #1e293b;
          background: #fafafa;
          padding: 12px;
          border-radius: 6px;
          border: 1px dashed #cbd5e1;
        }

        .tape-center {
          text-align: center;
        }

        .dashed-line {
          color: #94a3b8;
          text-align: center;
          overflow: hidden;
          letter-spacing: 1px;
          margin: 4px 0;
        }

        .tape-row {
          padding: 2px 0;
        }

        .italic-msg {
          margin-top: 6px;
          color: #059669;
          font-weight: 600;
        }
      }

      /* Block 2: Kitchen Dispatch & Takeaway Pacing Styles */
      .apple-channel-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 18px;
        border-radius: var(--radius-md);
        border: 1.5px solid var(--color-border);
        background: var(--color-surface);
        margin-top: 8px;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        gap: 16px;
        flex-wrap: wrap;

        &.is-enabled {
          border-color: rgba(34, 197, 94, 0.3);
          background: rgba(34, 197, 94, 0.02);
        }

        .channel-card-left {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          flex: 1;
          min-width: 260px;
        }

        .channel-icon-disc {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: rgba(245, 158, 11, 0.1);
          color: #d97706;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          flex-shrink: 0;
          transition: all 0.2s ease;

          &.teal-disc {
            background: rgba(13, 148, 136, 0.1);
            color: #0d9488;
          }

          &.active-disc {
            background: rgba(34, 197, 94, 0.12);
            color: #16a34a;
          }
        }

        .channel-card-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .channel-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .channel-title {
          font-size: 0.9375rem;
          font-weight: 700;
          color: var(--color-text-primary);
        }

        .channel-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 0.625rem;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 9999px;
          background: rgba(0, 0, 0, 0.06);
          color: var(--color-text-muted);
          letter-spacing: 0.03em;

          .dot-indicator {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #94a3b8;
          }

          &.active-pill {
            background: #ecfdf5;
            color: #059669;

            .dot-indicator {
              background: #22c55e;
              box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
            }
          }
        }

        .channel-desc {
          font-size: 0.75rem;
          color: var(--color-text-secondary);
          line-height: 1.4;
          margin: 0;
        }
      }

      .quick-preset-chips {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 8px;

        .preset-chip {
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          color: var(--color-text-secondary);
          font-size: 0.75rem;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 9999px;
          cursor: pointer;
          transition: all 0.15s ease;

          &:hover {
            background: var(--color-bone-light);
            color: var(--color-text-primary);
            border-color: var(--color-border-strong);
          }

          &.active {
            background: var(--color-primary);
            color: #ffffff;
            border-color: var(--color-primary);
            font-weight: 700;
            box-shadow: 0 2px 6px rgba(194, 65, 12, 0.25);
          }
        }
      }

      .apple-impact-slate {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 14px 16px;
        margin-top: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;

        .impact-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.75rem;
          color: var(--color-text-primary);
          border-bottom: 1px solid var(--color-border-subtle);
          padding-bottom: 8px;
        }

        .impact-badge-chip {
          font-size: 0.625rem;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.06);
          color: var(--color-text-muted);
          letter-spacing: 0.05em;
        }

        .impact-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;

          @media (max-width: 540px) {
            grid-template-columns: 1fr;
          }
        }

        .impact-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .impact-lbl {
          font-size: 0.6875rem;
          color: var(--color-text-muted);
          font-weight: 600;
        }

        .impact-val {
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--color-text-primary);
        }

        .text-emerald {
          color: #059669 !important;
        }

        .text-amber {
          color: #d97706 !important;
        }
      }

      /* Block 3: POS Platform Telemetry & Health Styles */
      .apple-telemetry-banner {
        background: linear-gradient(135deg, #1e293b, #0f172a) !important;
        color: #ffffff !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        border-radius: var(--radius-lg);
        padding: 20px 24px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);

        .system-title {
          color: #ffffff !important;
          font-size: 1.125rem;
          font-weight: 800;
          letter-spacing: -0.01em;
        }

        .system-desc {
          color: rgba(255, 255, 255, 0.75) !important;
          font-size: 0.8125rem;
          margin-top: 4px;
        }

        .last-check-text {
          color: rgba(255, 255, 255, 0.7) !important;
          font-size: 0.75rem;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }

        .apple-pulse-mark {
          background: rgba(59, 130, 246, 0.2) !important;
          color: #60a5fa !important;
          border: 1px solid rgba(59, 130, 246, 0.4) !important;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.35rem;
        }

        .apple-platform-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.6875rem;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.15);

          .dot-indicator {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #94a3b8;
          }

          &.is-all-online {
            background: rgba(34, 197, 94, 0.15);
            color: #4ade80;
            border-color: rgba(34, 197, 94, 0.3);

            .dot-indicator {
              background: #4ade80;
              box-shadow: 0 0 8px #4ade80;
            }
          }
        }
      }

      .apple-status-card {
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

        &:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
        }

        .latency-meta-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }

        .latency-gauge-track {
          width: 100%;
          height: 5px;
          border-radius: 9999px;
          background: rgba(0, 0, 0, 0.06);
          overflow: hidden;
        }

        .latency-meter-bar {
          height: 100%;
          border-radius: 9999px;
          transition: width 0.4s ease;
          background: #64748b;

          &.latency-good {
            background: #22c55e;
          }

          &.latency-fair {
            background: #eab308;
          }

          &.latency-slow {
            background: #ef4444;
          }
        }
      }

      .apple-metric-card {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px 18px;
        border-radius: var(--radius-md);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        transition: all 0.2s ease;

        &:hover {
          border-color: var(--color-border-strong);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
        }

        .metric-icon-disc {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.04);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          color: var(--color-text-secondary);
          flex-shrink: 0;
        }

        .metric-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .metric-num {
          font-size: 1.35rem;
          font-weight: 800;
          color: var(--color-text-primary);
          letter-spacing: -0.02em;
          line-height: 1;
        }

        .metric-lbl {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-text-muted);
        }
      }

      .apple-audit-row {
        border-bottom: 1px solid var(--color-border-subtle);
        padding: 12px 14px;
        transition: background 0.15s ease;

        &:hover {
          background: var(--color-bone-light);
        }
      }

      .apple-reset-callout {
        border: 1px solid rgba(245, 158, 11, 0.3) !important;
        background: rgba(245, 158, 11, 0.03) !important;
        border-radius: var(--radius-md);
        padding: 18px 20px;
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
  readonly whatsAppBridge = inject(WhatsAppBridgeService);
  private route = inject(ActivatedRoute);

  disconnectWhatsApp(): void {
    this.whatsAppBridge.logout().subscribe({
      next: () => this.toastService.success('WhatsApp session disconnected.'),
      error: () => this.toastService.error('Failed to disconnect WhatsApp.'),
    });
  }

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

  private _activeTab = signal<SettingsTab>('general');
  get activeTab(): SettingsTab {
    return this._activeTab();
  }
  set activeTab(val: SettingsTab) {
    this._activeTab.set(val);
  }

  setGstPreset(cgst: number, sgst: number): void {
    this.profile.cgstRate = cgst;
    this.profile.sgstRate = sgst;
  }

  isGstPresetActive(cgst: number, sgst: number): boolean {
    return this.profile.cgstRate === cgst && this.profile.sgstRate === sgst;
  }

  setFooterPreset(text: string): void {
    this.profile.invoiceFooter = text;
  }

  setPrepTimePreset(mins: number): void {
    this.profile.estimatedPrepMinutes = mins;
  }

  setMinSpendPreset(amt: number): void {
    this.profile.minOrderAmount = amt;
  }

  setPickupBufferPreset(mins: number): void {
    this.profile.pickupBufferMinutes = mins;
  }

  settingsSearchQuery = signal<string>('');

  navItems = [
    {
      id: 'general' as SettingsTab,
      category: 'RESTAURANT & OPERATIONS',
      label: 'Brand & Presence',
      icon: 'ph-storefront',
      keywords:
        'brand name tagline description logo phone email street city state pin google review reviews rating feedback qr menu website online profile identity',
    },
    {
      id: 'tax' as SettingsTab,
      category: 'RESTAURANT & OPERATIONS',
      label: 'Taxes & Invoicing',
      icon: 'ph-receipt',
      keywords:
        'tax taxes gst cgst sgst service charge gstin invoice bill receipt fssai license footer currency upi payment compliance',
    },
    {
      id: 'service' as SettingsTab,
      category: 'RESTAURANT & OPERATIONS',
      label: 'Kitchen Pacing & Service',
      icon: 'ph-cooking-pot',
      keywords:
        'kitchen service dispatch table ordering dine in takeaway counter prep time preparation buffer minimum spend pacing rules',
    },
    {
      id: 'printer' as SettingsTab,
      category: 'HARDWARE & INTEGRATIONS',
      label: 'Thermal Printer',
      icon: 'ph-printer',
      badge: 'ESC/POS',
      keywords:
        'printer thermal escpos usb network lan windows driver 80mm 58mm autocut drawer test print spooler hardware',
    },
    {
      id: 'whatsapp' as SettingsTab,
      category: 'HARDWARE & INTEGRATIONS',
      label: 'WhatsApp Gateway',
      icon: 'ph-whatsapp-logo',
      badge: 'FREE',
      keywords:
        'whatsapp web baileys bill delivery qr code phone gateway instant receipts free automated direct messaging',
    },
    {
      id: 'maintenance' as SettingsTab,
      category: 'PLATFORM & SYSTEM',
      label: 'System & Diagnostics',
      icon: 'ph-cpu',
      badge: 'LIVE',
      keywords:
        'system maintenance health telemetry latency ping backend axum supabase database storage local cache audit logs microservice',
    },
    {
      id: 'security' as SettingsTab,
      category: 'PLATFORM & SYSTEM',
      label: 'Admin Security',
      icon: 'ph-shield-check',
      adminOnly: true,
      keywords:
        'security admin password pin master credentials audit logs events ledger history access control',
    },
    {
      id: 'reset' as SettingsTab,
      category: 'PLATFORM & SYSTEM',
      label: 'Reset & Recovery',
      icon: 'ph-arrow-counter-clockwise',
      badge: 'RESET',
      adminOnly: true,
      keywords:
        'reset recovery restore defaults factory demo shift clear cache purge local storage revert discard factory reset',
    },
  ];

  groupedNavItems = computed(() => {
    const query = this.settingsSearchQuery().toLowerCase().trim();
    const isAdmin = this.auth.isAdmin();
    const available = this.navItems.filter((item) => !item.adminOnly || isAdmin);

    const categories = ['RESTAURANT & OPERATIONS', 'HARDWARE & INTEGRATIONS', 'PLATFORM & SYSTEM'];

    return categories
      .map((cat) => {
        const items = available
          .filter((i) => i.category === cat)
          .map((i) => ({
            ...i,
            matchesSearch:
              !query || i.label.toLowerCase().includes(query) || i.keywords.includes(query),
          }));
        return { category: cat, items };
      })
      .filter((g) => g.items.length > 0);
  });

  currentNavItem = computed(() => {
    const current = this._activeTab();
    return this.navItems.find((n) => n.id === current) || this.navItems[0];
  });

  currentNavCategory = computed(() => this.currentNavItem().category);
  currentNavTitle = computed(() => this.currentNavItem().label);

  switchTab(tab: SettingsTab): void {
    this.activeTab = tab;
  }

  confirmResetOpen = false;
  confirmShiftResetOpen = false;
  savedProfileJson = '';

  clearLocalCache(): void {
    this.mock.resetAllDemoData();
    this.loadCurrentSettings();
    this.toastService.success(
      'Local cache cleared and authoritative records refreshed from server.',
    );
  }

  executeShiftReset(): void {
    const allTables = this.dataService.tables();
    for (const tbl of allTables) {
      if (tbl.status !== 'AVAILABLE') {
        this.dataService.updateTableStatus(tbl.id, 'AVAILABLE');
      }
    }
    this.toastService.success('Dining floor and table seating reset for new shift.');
    this.confirmShiftResetOpen = false;
  }

  exportStorageSnapshot(): void {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      restaurant: this.profile,
      ordersCount: this.ordersCount(),
      menuCount: this.menuCount(),
      tablesCount: this.tablesCount(),
      customersCount: this.customersCount(),
      systemStatuses: this.systemStatuses(),
      localStorageKeys: Object.keys(localStorage).filter(
        (k) => k.startsWith('hotel_crm_') || k.startsWith('pos_'),
      ),
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pos_system_snapshot_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.toastService.success('Diagnostic snapshot exported successfully.');
  }

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

  getPasswordStrengthScore(pwd: string): number {
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 10) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;
    return Math.max(1, score);
  }

  getPasswordStrengthLabel(pwd: string): string {
    const score = this.getPasswordStrengthScore(pwd);
    switch (score) {
      case 1:
        return 'Weak';
      case 2:
        return 'Fair';
      case 3:
        return 'Good';
      case 4:
        return 'Strong';
      default:
        return 'Weak';
    }
  }

  ordersCount = () => this.mock.orders().length;
  menuCount = () => this.mock.menuItems().length;
  tablesCount = () => this.mock.tables().length;
  customersCount = () => this.mock.customers().length;

  activeWaTemplateTab: 'pending' | 'confirmed' | 'cancelled' = 'pending';

  readonly defaultWhatsAppTemplates = {
    pending:
      'Namaste {customer_name}! 🙏 We have received your reservation request for {restaurant_name} on {date} at {time} for {guests} guests.\n\nOur team is currently reviewing availability. We will confirm your table shortly.\n\nThank you for choosing us!',
    confirmed:
      'Namaste {customer_name}! 🌟 Your reservation at {restaurant_name} is CONFIRMED!\n\n📅 Date: {date}\n⏰ Time: {time}\n👥 Guests: {guests}\n🪑 Allocated Table: Table {table_number} ({section})\n\nWe look forward to serving you! If you need to make changes, please contact us.',
    cancelled:
      'Namaste {customer_name}. We regret to inform you that your reservation request at {restaurant_name} for {date} at {time} could not be confirmed.\n\nPlease contact us directly if you would like to reserve for an alternative slot. We apologize for the inconvenience.',
  };

  profile = {
    name: 'GuruKripa Dhaba',
    tagline: 'Artisanal Mughlai & Contemporary Indian Bistro',
    description: 'Traditional tandoori specialties, authentic recipes, and North Indian cuisine.',
    contactPhone: '+91 80 4912 8800',
    contactEmail: 'contact@gurukripadhaba.com',
    customerMenuUrl:
      (typeof localStorage !== 'undefined' &&
        localStorage.getItem('hotel_crm_customer_menu_url')) ||
      'https://gurukripadhaba-menu.vercel.app',
    googleReviewUrl:
      (typeof localStorage !== 'undefined' &&
        localStorage.getItem('hotel_crm_google_review_url')) ||
      '',
    street: '14 Heritage Promenade, MG Road',
    city: 'Bengaluru',
    statePin: 'Karnataka - 560001',
    cgstRate: 2.5,
    sgstRate: 2.5,
    serviceChargeRate: 0,
    gstNumber: '29AAAAA0000A1Z5',
    invoiceFooter:
      (typeof localStorage !== 'undefined' && localStorage.getItem('hotel_crm_invoice_footer')) ||
      'Thank you for dining with GuruKripa Dhaba! Please visit again.',
    fssaiNumber:
      (typeof localStorage !== 'undefined' && localStorage.getItem('hotel_crm_fssai_number')) ||
      '11223344556677',
    estimatedPrepMinutes: 25,
    minOrderAmount: 0,
    dineInEnabled: true,
    takeawayEnabled: true,
    pickupBufferMinutes:
      (typeof localStorage !== 'undefined' &&
        localStorage.getItem('hotel_crm_pickup_buffer_minutes') &&
        Number(localStorage.getItem('hotel_crm_pickup_buffer_minutes'))) ||
      20,
    whatsappTemplates: {
      pending:
        (typeof localStorage !== 'undefined' && localStorage.getItem('hotel_crm_wa_tpl_pending')) ||
        'Namaste {customer_name}! 🙏 We have received your reservation request for {restaurant_name} on {date} at {time} for {guests} guests.\n\nOur team is currently reviewing availability. We will confirm your table shortly.\n\nThank you for choosing us!',
      confirmed:
        (typeof localStorage !== 'undefined' &&
          localStorage.getItem('hotel_crm_wa_tpl_confirmed')) ||
        'Namaste {customer_name}! 🌟 Your reservation at {restaurant_name} is CONFIRMED!\n\n📅 Date: {date}\n⏰ Time: {time}\n👥 Guests: {guests}\n🪑 Allocated Table: Table {table_number} ({section})\n\nWe look forward to serving you! If you need to make changes, please contact us.',
      cancelled:
        (typeof localStorage !== 'undefined' &&
          localStorage.getItem('hotel_crm_wa_tpl_cancelled')) ||
        'Namaste {customer_name}. We regret to inform you that your reservation request at {restaurant_name} for {date} at {time} could not be confirmed.\n\nPlease contact us directly if you would like to reserve for an alternative slot. We apologize for the inconvenience.',
    },
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
    this.whatsAppBridge.startStatusPoller();
    this.route.queryParams.subscribe((params) => {
      if (params['tab'] && this.navItems.some((n) => n.id === params['tab'])) {
        this.activeTab = params['tab'] as SettingsTab;
      }
    });
  }

  cleanPortName(port?: string): string {
    if (!port) return '';
    const trimmed = port.trim();
    if (/^usb\d*/i.test(trimmed)) return '[USB]';
    if (/^(ip_|tcp|lan|eth)/i.test(trimmed)) return '[LAN]';
    if (/^(lpt|com)\d+/i.test(trimmed)) return `[${trimmed.toUpperCase()}]`;
    if (
      trimmed.length > 15 ||
      trimmed.includes('{') ||
      trimmed.includes('-') ||
      trimmed.toLowerCase() === 'nul:'
    )
      return '';
    return `[${trimmed}]`;
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
      const localFssai =
        typeof localStorage !== 'undefined' ? localStorage.getItem('hotel_crm_fssai_number') : null;
      const localFooter =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('hotel_crm_invoice_footer')
          : null;
      const localBuffer =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('hotel_crm_pickup_buffer_minutes')
          : null;
      const incomingTpls = res.whatsappTemplates || (res as any)?.whatsapp_templates || {};
      const localPending =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('hotel_crm_wa_tpl_pending')
          : null;
      const localConfirmed =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('hotel_crm_wa_tpl_confirmed')
          : null;
      const localCancelled =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('hotel_crm_wa_tpl_cancelled')
          : null;

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
          (typeof localStorage !== 'undefined' &&
            localStorage.getItem('hotel_crm_customer_menu_url')) ||
          res.contact?.website ||
          environment.customerMenuUrl ||
          'https://gurukripadhaba-menu.vercel.app',
        googleReviewUrl:
          (res as any)?.google_review_url ||
          res.googleReviewUrl ||
          res.contact?.googleReviewUrl ||
          (typeof localStorage !== 'undefined' &&
            localStorage.getItem('hotel_crm_google_review_url')) ||
          this.profile.googleReviewUrl ||
          '',
        street: res.address?.street || this.profile.street,
        city: res.address?.city || this.profile.city,
        statePin: `${res.address?.state || 'Karnataka'} - ${res.address?.zip || '560001'}`,
        cgstRate: res.taxSettings?.cgstRate ?? 2.5,
        sgstRate: res.taxSettings?.sgstRate ?? 2.5,
        serviceChargeRate: res.taxSettings?.serviceChargeRate ?? 0,
        gstNumber: res.taxSettings?.gstNumber || '29AAAAA0000A1Z5',
        invoiceFooter:
          res.invoiceFooter ||
          res.taxSettings?.invoiceFooter ||
          (res as any)?.invoice_footer ||
          localFooter ||
          this.profile.invoiceFooter,
        fssaiNumber:
          res.fssaiNumber ||
          res.taxSettings?.fssaiNumber ||
          (res as any)?.fssai_license ||
          localFssai ||
          this.profile.fssaiNumber,
        estimatedPrepMinutes: res.orderingSettings?.estimatedPrepMinutes || 25,
        minOrderAmount: res.orderingSettings?.minOrderAmount || 0,
        dineInEnabled: res.orderingSettings?.dineInEnabled !== false,
        takeawayEnabled: res.orderingSettings?.takeawayEnabled !== false,
        pickupBufferMinutes:
          res.orderingSettings?.pickupBufferMinutes ??
          (res as any)?.pickup_buffer_minutes ??
          (localBuffer ? Number(localBuffer) : this.profile.pickupBufferMinutes),
        whatsappTemplates: {
          pending: incomingTpls.pending || localPending || this.defaultWhatsAppTemplates.pending,
          confirmed:
            incomingTpls.confirmed || localConfirmed || this.defaultWhatsAppTemplates.confirmed,
          cancelled:
            incomingTpls.cancelled || localCancelled || this.defaultWhatsAppTemplates.cancelled,
        },
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
    const cleanGoogleReviewUrl = (this.profile.googleReviewUrl || '').trim();
    const cleanFssaiNumber = (this.profile.fssaiNumber || '').trim();
    const cleanInvoiceFooter = (this.profile.invoiceFooter || '').trim();
    const pickupBufferMinutes = Number(this.profile.pickupBufferMinutes) || 20;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('hotel_crm_customer_menu_url', cleanMenuUrl);
      localStorage.setItem('hotel_crm_google_review_url', cleanGoogleReviewUrl);
      localStorage.setItem('hotel_crm_fssai_number', cleanFssaiNumber);
      localStorage.setItem('hotel_crm_invoice_footer', cleanInvoiceFooter);
      localStorage.setItem('hotel_crm_pickup_buffer_minutes', String(pickupBufferMinutes));
      localStorage.setItem('hotel_crm_wa_tpl_pending', this.profile.whatsappTemplates.pending);
      localStorage.setItem('hotel_crm_wa_tpl_confirmed', this.profile.whatsappTemplates.confirmed);
      localStorage.setItem('hotel_crm_wa_tpl_cancelled', this.profile.whatsappTemplates.cancelled);
    }

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
      googleReviewUrl: cleanGoogleReviewUrl,
      fssaiNumber: cleanFssaiNumber,
      invoiceFooter: cleanInvoiceFooter,
      contact: {
        phone: this.profile.contactPhone,
        email: this.profile.contactEmail,
        website: cleanMenuUrl,
        googleReviewUrl: cleanGoogleReviewUrl,
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
        fssaiNumber: cleanFssaiNumber,
        invoiceFooter: cleanInvoiceFooter,
      },
      orderingSettings: {
        ...current?.orderingSettings,
        dineInEnabled: this.profile.dineInEnabled,
        takeawayEnabled: this.profile.takeawayEnabled,
        estimatedPrepMinutes: Number(this.profile.estimatedPrepMinutes) || 25,
        minOrderAmount: Number(this.profile.minOrderAmount) || 0,
        pickupBufferMinutes,
      },
      whatsappTemplates: {
        pending: this.profile.whatsappTemplates.pending,
        confirmed: this.profile.whatsappTemplates.confirmed,
        cancelled: this.profile.whatsappTemplates.cancelled,
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

  revertCurrentTemplateToDefault(): void {
    this.profile.whatsappTemplates[this.activeWaTemplateTab] =
      this.defaultWhatsAppTemplates[this.activeWaTemplateTab];
    this.toastService.info('Template reset to factory default');
  }

  insertToken(token: string): void {
    const current = this.profile.whatsappTemplates[this.activeWaTemplateTab] || '';
    this.profile.whatsappTemplates[this.activeWaTemplateTab] =
      current + (current.endsWith(' ') ? '' : ' ') + token;
  }

  getSimulatedPreviewText(): string {
    const raw =
      this.profile.whatsappTemplates[this.activeWaTemplateTab] ||
      this.defaultWhatsAppTemplates[this.activeWaTemplateTab];
    return raw
      .replace(/\{customer_name\}/g, 'Aditi Sharma')
      .replace(/\{restaurant_name\}/g, this.profile.name || 'GuruKripa Dhaba')
      .replace(/\{date\}/g, 'Tomorrow, 25 Nov')
      .replace(/\{time\}/g, '08:00 PM')
      .replace(/\{guests\}/g, '4')
      .replace(/\{table_number\}/g, 'T4')
      .replace(/\{section\}/g, 'Garden Terrace');
  }

  testGoogleReviewLink(): void {
    const raw = (this.profile.googleReviewUrl || '').trim();
    if (!raw) {
      this.toastService.warning('Please enter a Google Review redirect link first.');
      return;
    }
    const lower = raw.toLowerCase();
    if (
      lower.startsWith('javascript:') ||
      lower.startsWith('data:') ||
      lower.startsWith('vbscript:')
    ) {
      this.toastService.error('Invalid URL protocol detected.');
      return;
    }
    const formatted =
      raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
    window.open(formatted, '_blank', 'noopener,noreferrer');
  }

  copyMenuUrl(): void {
    const url =
      this.profile.customerMenuUrl ||
      environment.customerMenuUrl ||
      'https://gurukripadhaba-menu.vercel.app';
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        this.toastService.success('Customer Mobile Menu URL copied to clipboard');
      });
    } else {
      this.toastService.info(`Menu URL: ${url}`);
    }
  }

  openMenuUrl(): void {
    const raw = (
      this.profile.customerMenuUrl ||
      environment.customerMenuUrl ||
      'https://gurukripadhaba-menu.vercel.app'
    ).trim();
    const lower = raw.toLowerCase();
    if (
      lower.startsWith('javascript:') ||
      lower.startsWith('data:') ||
      lower.startsWith('vbscript:')
    ) {
      this.toastService.error('Invalid URL protocol detected.');
      return;
    }
    const formatted =
      raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
    window.open(formatted, '_blank', 'noopener,noreferrer');
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
        catchError(() =>
          this.http.get<{ status: string }>('http://127.0.0.1:3000/health/live').pipe(
            timeout(1500),
            catchError(() => of(null)),
          ),
        ),
      )
      .subscribe((res) => {
        const t1 = performance.now();
        const duration = Math.round(t1 - t0Local);
        const isOk = Boolean(
          res &&
          ((res as any).status === 'ok' ||
            (res as any).status === 'alive' ||
            (res as any).status === 'ready'),
        );

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

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('sb-access-token') || ''}` });
    this.http.get<{configured:boolean;sync:{online:boolean;pending:number;last_success:string|null}}>(
      `${environment.apiBaseUrl}/sync/status`, { headers }
    ).pipe(timeout(5000),catchError(() => of(null))).subscribe(result => {
      const online = Boolean(result?.configured && result.sync.online);
      this.systemStatuses.update(curr => ({
        ...curr,
        liveBackend: {
          online, statusText: online ? 'Sync active' : result?.configured ? 'Sync offline' : 'Sync unavailable',
          url: 'Device gateway',
          details: result ? `${result.sync.pending} changes pending. Last contact: ${result.sync.last_success || 'none yet'}.` : 'Local POS could not report sync status.',
          latencyMs: 0,
        },
        database: {
          online: !!result, statusText: result ? 'Local PostgreSQL ready' : 'Local database unavailable',
          url: 'Local POS', details: 'Readiness is measured by querying the local synchronization queue.', latencyMs: 0,
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
