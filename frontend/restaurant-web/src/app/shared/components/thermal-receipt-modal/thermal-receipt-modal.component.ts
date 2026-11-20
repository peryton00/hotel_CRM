import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Order } from '../../../core/models/order.model';
import { Restaurant } from '../../../core/models/restaurant.model';
import {
  ThermalPrinterService,
  SystemPrinterInfo,
} from '../../../core/services/thermal-printer.service';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { renderEscPosPreviewText, EscPosPrinterConfig } from '../../../core/utils/escpos.util';

@Component({
  selector: 'app-thermal-receipt-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (isOpen) {
      <div class="modal-overlay" (click)="onBackdropClick($event)">
        <div
          class="modal-card thermal-modal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="thermal-dialog-title"
        >
          <!-- Modal Header -->
          <header class="modal-header">
            <div class="header-left">
              <div class="icon-avatar">
                <i class="ph ph-printer"></i>
              </div>
              <div class="header-text">
                <div class="title-row">
                  <h3 id="thermal-dialog-title" class="modal-title">
                    Thermal Receipt Print & Preview
                  </h3>
                  <span
                    class="target-pill"
                    [class.online]="activePrinterDisplayName()"
                    [class.offline]="!activePrinterDisplayName()"
                  >
                    <span class="status-dot"></span>
                    {{
                      config().target === 'WINDOWS'
                        ? 'Windows RAW'
                        : config().target === 'NETWORK'
                          ? 'Network POS'
                          : 'Browser Fallback'
                    }}
                  </span>
                </div>
                <p class="modal-subtitle">
                  Direct ESC/POS Hardware Spooler • {{ config().paperWidth }} Monospace Output
                </p>
              </div>
            </div>

            <button
              type="button"
              class="close-btn"
              (click)="onClose()"
              aria-label="Close thermal print preview"
            >
              <i class="ph ph-x"></i>
            </button>
          </header>

          <!-- Modal Body (Two-Column Split on Desktop) -->
          <div class="modal-body thermal-modal-body">
            <!-- Left Column: Hardware Controls & Print Config -->
            <aside class="controls-panel">
              <!-- Section 1: Print Mode -->
              <section class="config-section">
                <label class="section-label" for="printerTargetSelect">Print Method</label>
                <div class="segmented-control mode-segments">
                  <button
                    type="button"
                    class="segment-btn"
                    [class.active]="config().target === 'WINDOWS'"
                    (click)="onTargetChange('WINDOWS')"
                  >
                    <i class="ph ph-cpu"></i>
                    <span>Windows Spooler</span>
                  </button>
                  <button
                    type="button"
                    class="segment-btn"
                    [class.active]="config().target === 'NETWORK'"
                    (click)="onTargetChange('NETWORK')"
                  >
                    <i class="ph ph-wifi-high"></i>
                    <span>Network POS</span>
                  </button>
                  <button
                    type="button"
                    class="segment-btn"
                    [class.active]="config().target === 'BROWSER'"
                    (click)="onTargetChange('BROWSER')"
                  >
                    <i class="ph ph-browser"></i>
                    <span>Browser (A4)</span>
                  </button>
                </div>
              </section>

              <!-- Section 2: Destination Device Selection -->
              <section class="config-section">
                @if (config().target === 'WINDOWS') {
                  <div class="field-header">
                    <label class="section-label" for="windowsPrinterSelect">
                      Destination Printer
                      @if (systemPrinters().length > 0) {
                        <span class="count-tag">({{ systemPrinters().length }} detected)</span>
                      }
                    </label>
                    <button
                      type="button"
                      class="tool-link"
                      (click)="refreshPrinters()"
                      [disabled]="isLoadingPrinters()"
                      title="Scan local system for connected USB / Spooler printers"
                    >
                      <i class="ph ph-arrows-clockwise" [class.spin]="isLoadingPrinters()"></i>
                      <span>{{ isLoadingPrinters() ? 'Scanning...' : 'Rescan' }}</span>
                    </button>
                  </div>

                  <div class="select-wrapper">
                    <select
                      id="windowsPrinterSelect"
                      class="custom-select"
                      [ngModel]="config().printerName || ''"
                      (ngModelChange)="onPrinterNameChange($event)"
                    >
                      @if (systemPrinters().length === 0) {
                        <option value="">Default Windows Spooler</option>
                      } @else {
                        @for (p of systemPrinters(); track p.name) {
                          <option [value]="p.name">
                            {{ p.name }} {{ p.is_default ? '(Default)' : '' }}
                          </option>
                        }
                      }
                    </select>
                    <i class="ph ph-caret-down select-arrow"></i>
                  </div>
                }

                @if (config().target === 'NETWORK') {
                  <div class="field-header">
                    <label class="section-label" for="networkIpInput">POS Printer IP Address</label>
                  </div>
                  <div class="input-wrapper">
                    <i class="ph ph-desktop input-icon"></i>
                    <input
                      id="networkIpInput"
                      type="text"
                      class="custom-input with-icon"
                      placeholder="e.g. 192.168.1.100"
                      [ngModel]="config().networkAddress || '192.168.1.200'"
                      (ngModelChange)="onNetworkAddressChange($event)"
                    />
                  </div>
                }

                @if (config().target === 'BROWSER') {
                  <div class="browser-info-card">
                    <i class="ph ph-info text-sky"></i>
                    <p class="text-xs">
                      Uses your operating system's standard print dialog. Ideal for A4 laser
                      printing, PDF archiving, or when no ESC/POS hardware is connected.
                    </p>
                  </div>
                }

                <!-- Quick Hardware Test Slip Button -->
                @if (config().target !== 'BROWSER') {
                  <div class="hardware-action-row">
                    <button
                      type="button"
                      class="test-hardware-btn"
                      (click)="testHardwareConnection()"
                      [disabled]="isTestingHardware() || isPrinting()"
                      title="Send a 1-second test ticket to verify printer readiness"
                    >
                      @if (isTestingHardware()) {
                        <i class="ph ph-spinner spin"></i>
                        <span>Testing Hardware...</span>
                      } @else {
                        <i class="ph ph-lightning"></i>
                        <span>Send Test Ticket to Hardware</span>
                      }
                    </button>
                  </div>
                }
              </section>

              <!-- Section 3: Paper Width Selector -->
              <section class="config-section">
                <label class="section-label">Roll Width / Monospace Columns</label>
                <div class="paper-width-grid">
                  <button
                    type="button"
                    class="width-option-card"
                    [class.selected]="config().paperWidth === '80mm'"
                    (click)="onPaperWidthChange('80mm')"
                  >
                    <div class="width-badge">80 mm</div>
                    <div class="width-details">
                      <strong class="width-title">Standard 80mm</strong>
                      <span class="width-spec">48 Characters per Line</span>
                    </div>
                    @if (config().paperWidth === '80mm') {
                      <i class="ph ph-check-circle-fill text-sky check-indicator"></i>
                    }
                  </button>

                  <button
                    type="button"
                    class="width-option-card"
                    [class.selected]="config().paperWidth === '58mm'"
                    (click)="onPaperWidthChange('58mm')"
                  >
                    <div class="width-badge compact">58 mm</div>
                    <div class="width-details">
                      <strong class="width-title">Compact 58mm</strong>
                      <span class="width-spec">32 Characters per Line</span>
                    </div>
                    @if (config().paperWidth === '58mm') {
                      <i class="ph ph-check-circle-fill text-sky check-indicator"></i>
                    }
                  </button>
                </div>
              </section>

              <!-- Section 4: Order & Print Status Metadata -->
              @if (order) {
                <section class="order-summary-card">
                  <div class="summary-header">
                    <span class="summary-id">{{ order.orderNumber }}</span>
                    <span
                      class="badge"
                      [class.badge-paid]="order.paymentStatus === 'PAID'"
                      [class.badge-unpaid]="order.paymentStatus !== 'PAID'"
                    >
                      {{ order.paymentStatus || 'UNPAID' }}
                    </span>
                  </div>
                  <div class="summary-meta-grid">
                    <div class="meta-cell">
                      <span class="meta-label">Service</span>
                      <span class="meta-val">Table {{ order.tableNumber || 'N/A' }}</span>
                    </div>
                    <div class="meta-cell">
                      <span class="meta-label">Guest</span>
                      <span class="meta-val">{{ order.customerName || 'Walk-in' }}</span>
                    </div>
                    <div class="meta-cell">
                      <span class="meta-label">Bill Total</span>
                      <span class="meta-val font-semibold"
                        >₹{{ (order.totalAmount || 0).toFixed(2) }}</span
                      >
                    </div>
                    <div class="meta-cell">
                      <span class="meta-label">Print Status</span>
                      <span class="meta-val" [class.text-amber]="effectivePrintCount > 0">
                        {{
                          effectivePrintCount > 0
                            ? 'Copy #' + (effectivePrintCount + 1)
                            : 'Original'
                        }}
                      </span>
                    </div>
                  </div>
                </section>
              }

              <!-- Inline Status Feedback Toast / Banner -->
              @if (statusMessage(); as msg) {
                <div
                  class="status-toast"
                  [class.toast-success]="msg.type === 'success'"
                  [class.toast-error]="msg.type === 'error'"
                  [class.toast-info]="msg.type === 'info'"
                >
                  <i
                    class="ph"
                    [class.ph-check-circle-fill]="msg.type === 'success'"
                    [class.ph-warning-octagon-fill]="msg.type === 'error'"
                    [class.ph-info-fill]="msg.type === 'info'"
                  ></i>
                  <span class="toast-text">{{ msg.text }}</span>
                  <button
                    type="button"
                    class="toast-close"
                    (click)="statusMessage.set(null)"
                    aria-label="Dismiss message"
                  >
                    <i class="ph ph-x"></i>
                  </button>
                </div>
              }

              <!-- Supervisor Password Authorization (For Duplicate Reprints) -->
              @if (showAdminAuth()) {
                <div class="admin-auth-card">
                  <div class="auth-header">
                    <div class="auth-icon-badge">
                      <i class="ph-bold ph-shield-check"></i>
                    </div>
                    <div class="auth-text-wrap">
                      <div class="auth-title-row">
                        <strong class="auth-title">Supervisor Authorization Required</strong>
                        <span class="auth-badge-pill"
                          >Copy #{{ (effectivePrintCount || 0) + 1 }}</span
                        >
                      </div>
                      <p class="auth-desc">
                        Original bill has already been issued. Enter Admin PIN to print duplicate
                        copy.
                      </p>
                    </div>
                    <button
                      type="button"
                      class="auth-close-btn"
                      (click)="showAdminAuth.set(false)"
                      title="Cancel authorization"
                    >
                      <i class="ph ph-x"></i>
                    </button>
                  </div>
                  <div class="auth-form-wrap">
                    <div class="auth-input-wrapper">
                      <i class="ph ph-lock-key auth-input-icon"></i>
                      <input
                        type="password"
                        class="custom-input auth-pin-input with-icon"
                        placeholder="Admin PIN or password"
                        [(ngModel)]="adminPasswordInput"
                        (keyup.enter)="authorizeAndPrint()"
                        autofocus
                      />
                    </div>
                    <div class="auth-actions-row">
                      <button
                        type="button"
                        class="btn btn-auth-submit"
                        [disabled]="!adminPasswordInput.trim() || isPrinting()"
                        (click)="authorizeAndPrint()"
                      >
                        <i class="ph-bold ph-check"></i>
                        <span>Authorize</span>
                      </button>
                      <button
                        type="button"
                        class="btn btn-auth-cancel"
                        (click)="showAdminAuth.set(false)"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  @if (adminAuthError()) {
                    <div class="auth-err">
                      <i class="ph-bold ph-warning-circle"></i>
                      <span>{{ adminAuthError() }}</span>
                    </div>
                  }
                </div>
              }
            </aside>

            <!-- Right Column: Tactile Monospace Receipt Tape Preview -->
            <main class="preview-panel">
              <div class="preview-bar">
                <div class="preview-specs">
                  <i class="ph ph-article"></i>
                  <span class="specs-title">ESC/POS Slip Preview</span>
                  <span class="specs-badge"
                    >{{ config().paperWidth }} •
                    {{ config().paperWidth === '80mm' ? '48' : '32' }} Cols</span
                  >
                </div>
                <div class="specs-hint">Exact monospace hardware output</div>
              </div>

              <div class="tape-canvas">
                <!-- Physical Receipt Paper -->
                <div
                  class="receipt-paper"
                  [class.paper-58mm]="config().paperWidth === '58mm'"
                  [class.paper-80mm]="config().paperWidth === '80mm'"
                >
                  <!-- Top Jagged Cutter Edge -->
                  <div class="paper-jagged-edge top"></div>

                  <!-- Optional Restaurant Logo Header -->
                  @if (restaurant?.logoUrl && !tapeLogoFailed()) {
                    <div class="tape-logo-header">
                      <img
                        [src]="restaurant?.logoUrl"
                        [alt]="restaurant?.name || 'Restaurant Logo'"
                        class="tape-logo-img"
                        (error)="tapeLogoFailed.set(true)"
                      />
                    </div>
                  }

                  <!-- Preformatted Monospace Receipt Text -->
                  <pre class="paper-mono-content">{{ receiptPreviewText() }}</pre>

                  <!-- Bottom Jagged Cutter Edge -->
                  <div class="paper-jagged-edge bottom"></div>
                </div>
              </div>
            </main>
          </div>

          <!-- Modal Footer Actions -->
          <footer class="modal-footer thermal-modal-footer">
            <div class="footer-status-hint">
              <span class="hint-dot"></span>
              <span class="hint-text">
                Target: <strong>{{ activePrinterDisplayName() }}</strong> ({{
                  config().paperWidth
                }})
              </span>
            </div>

            <div class="footer-btn-group">
              <button type="button" class="btn btn-ghost" (click)="onClose()">Close</button>

              <button
                type="button"
                class="btn btn-secondary btn-system-print"
                (click)="onSystemPrint()"
                title="Open Windows / Browser standard print dialog (A4 or PDF)"
              >
                <i class="ph ph-file-pdf"></i>
                <span>System Print (A4)</span>
              </button>

              <button
                type="button"
                class="btn btn-primary btn-hardware-print"
                [disabled]="isPrinting()"
                (click)="onThermalPrintClick()"
                title="Send ESC/POS binary stream to printer hardware"
              >
                @if (isPrinting()) {
                  <i class="ph ph-spinner spin"></i>
                  <span>Printing Slip...</span>
                } @else {
                  <i class="ph ph-printer"></i>
                  <span>
                    {{
                      effectivePrintCount > 0
                        ? 'Print Reprint to Hardware'
                        : 'Print to Thermal Hardware'
                    }}
                  </span>
                }
              </button>
            </div>
          </footer>
        </div>
      </div>
    }
  `,
  styles: [
    `
      /* Overlay Backdrop */
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.65);
        backdrop-filter: blur(6px);
        z-index: 1050;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        box-sizing: border-box;
      }

      /* Modal Card Container */
      .thermal-modal-card {
        background: #ffffff !important;
        color: #0f172a !important;
        border-radius: 14px;
        box-shadow:
          0 25px 50px -12px rgba(15, 23, 42, 0.25),
          0 0 0 1px rgba(226, 232, 240, 0.8);
        max-width: 960px;
        width: 100%;
        max-height: 92vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: modalScaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);

        // Prevent theme inversion: ensure modal typography always stays sharp and high contrast
        h1,
        h2,
        h3,
        h4,
        strong,
        b {
          color: #0f172a;
        }
      }

      @keyframes modalScaleIn {
        from {
          opacity: 0;
          transform: scale(0.97) translateY(4px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      /* Modal Header */
      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 24px;
        border-bottom: 1px solid #f1f5f9;
        background: #ffffff;
        flex-shrink: 0;
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 14px;
      }

      .icon-avatar {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: #f0f9ff;
        border: 1px solid #bae6fd;
        color: #0284c7;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.35rem;
        flex-shrink: 0;
      }

      .header-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .title-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .modal-title,
      #thermal-dialog-title {
        font-size: 1.05rem;
        font-weight: 700;
        color: #0f172a !important;
        margin: 0;
        letter-spacing: -0.01em;
      }

      .target-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.72rem;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 9999px;
        background: #f1f5f9;
        color: #475569;

        &.online {
          background: #ecfdf5;
          color: #065f46;
          .status-dot {
            background: #10b981;
            box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
          }
        }
        &.offline {
          background: #fef3c7;
          color: #92400e;
          .status-dot {
            background: #f59e0b;
          }
        }
      }

      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #94a3b8;
      }

      .modal-subtitle {
        font-size: 0.78rem;
        color: #64748b;
        margin: 0;
      }

      .close-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 1.25rem;
        cursor: pointer;
        padding: 6px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
        &:hover {
          color: #0f172a;
          background: #f1f5f9;
        }
      }

      /* Modal Body: Two-Column Responsive Split */
      .thermal-modal-body {
        display: grid;
        grid-template-columns: 370px 1fr;
        overflow: hidden;
        flex: 1;
        min-height: 0;

        @media (max-width: 840px) {
          grid-template-columns: 1fr;
          overflow-y: auto;
        }
      }

      /* Left Column: Controls Panel */
      .controls-panel {
        padding: 20px 22px;
        background: #f8fafc;
        border-right: 1px solid #e2e8f0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 18px;

        @media (max-width: 840px) {
          border-right: none;
          border-bottom: 1px solid #e2e8f0;
        }
      }

      .config-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .section-label {
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #64748b;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .count-tag {
        font-size: 0.7rem;
        color: #0284c7;
        font-weight: 600;
        text-transform: none;
      }

      .field-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .tool-link {
        background: none;
        border: none;
        color: #0284c7;
        font-size: 0.75rem;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        padding: 0;
        &:hover:not(:disabled) {
          color: #0369a1;
          text-decoration: underline;
        }
        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      }

      /* Mode Segmented Controls */
      .segmented-control {
        display: flex;
        background: #e2e8f0;
        border-radius: 8px;
        padding: 3px;
        gap: 2px;
      }

      .segment-btn {
        flex: 1;
        border: none;
        background: transparent;
        font-size: 0.74rem;
        font-weight: 600;
        color: #475569;
        padding: 7px 4px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        transition: all 0.15s ease;

        i {
          font-size: 0.9rem;
        }

        &.active {
          background: #ffffff;
          color: #0f172a;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
        }
      }

      /* Custom Select & Inputs */
      .select-wrapper {
        position: relative;
        display: flex;
        align-items: center;
      }

      .custom-select {
        width: 100%;
        height: 38px;
        padding: 0 32px 0 12px;
        border-radius: 8px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        font-size: 0.8125rem;
        color: #0f172a;
        appearance: none;
        cursor: pointer;
        transition: all 0.15s ease;

        &:focus {
          outline: none;
          border-color: #0284c7;
          box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
        }
      }

      .select-arrow {
        position: absolute;
        right: 12px;
        pointer-events: none;
        color: #64748b;
        font-size: 0.85rem;
      }

      .input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
      }

      .input-icon {
        position: absolute;
        left: 12px;
        color: #94a3b8;
        font-size: 0.95rem;
        pointer-events: none;
      }

      .custom-input {
        width: 100%;
        height: 38px;
        padding: 0 12px;
        border-radius: 8px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        font-size: 0.8125rem;
        color: #0f172a;
        box-sizing: border-box;
        transition: all 0.15s ease;

        &.with-icon {
          padding-left: 34px;
        }

        &:focus {
          outline: none;
          border-color: #0284c7;
          box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.12);
        }
      }

      .browser-info-card {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        background: #f0f9ff;
        border: 1px solid #bae6fd;
        border-radius: 8px;
        padding: 10px 12px;
        color: #0369a1;
        line-height: 1.4;
      }

      .text-sky {
        color: #0284c7;
      }

      .text-amber {
        color: #b45309;
      }

      .text-xs {
        font-size: 0.75rem;
        margin: 0;
      }

      /* Hardware Action Row */
      .hardware-action-row {
        margin-top: 4px;
      }

      .test-hardware-btn {
        width: 100%;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
        color: #334155;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover:not(:disabled) {
          background: #f1f5f9;
          border-color: #94a3b8;
          color: #0f172a;
        }

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      }

      /* Paper Width Selector Cards */
      .paper-width-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .width-option-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 10px 12px;
        text-align: left;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 4px;
        position: relative;
        transition: all 0.15s ease;

        &:hover {
          border-color: #cbd5e1;
          background: #fafafa;
        }

        &.selected {
          border-color: #0284c7;
          background: #f0f9ff;
          box-shadow: 0 0 0 1px #0284c7;
        }
      }

      .width-badge {
        font-size: 0.68rem;
        font-weight: 700;
        background: #0284c7;
        color: #ffffff;
        padding: 2px 6px;
        border-radius: 4px;
        align-self: flex-start;

        &.compact {
          background: #475569;
        }
      }

      .width-details {
        display: flex;
        flex-direction: column;
      }

      .width-title {
        font-size: 0.78rem;
        font-weight: 700;
        color: #0f172a;
      }

      .width-spec {
        font-size: 0.68rem;
        color: #64748b;
      }

      .check-indicator {
        position: absolute;
        top: 8px;
        right: 8px;
        font-size: 0.95rem;
      }

      /* Order Metadata Card */
      .order-summary-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .summary-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 6px;
        border-bottom: 1px solid #f1f5f9;
      }

      .summary-id {
        font-size: 0.8125rem;
        font-weight: 700;
        color: #0f172a;
        font-family: ui-monospace, monospace;
      }

      .badge {
        font-size: 0.68rem;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 4px;
        text-transform: uppercase;
        letter-spacing: 0.04em;

        &.badge-paid {
          background: #dcfce7;
          color: #15803d;
        }
        &.badge-unpaid {
          background: #fee2e2;
          color: #b91c1c;
        }
      }

      .summary-meta-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px 12px;
      }

      .meta-cell {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .meta-label {
        font-size: 0.66rem;
        text-transform: uppercase;
        color: #94a3b8;
        font-weight: 600;
      }

      .meta-val {
        font-size: 0.78rem;
        color: #1e293b;
      }

      .font-semibold {
        font-weight: 600;
      }

      /* Status Feedback Toast */
      .status-toast {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 8px;
        font-size: 0.78rem;
        line-height: 1.35;
        position: relative;

        i {
          font-size: 1.1rem;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .toast-text {
          flex: 1;
        }

        .toast-close {
          background: none;
          border: none;
          color: inherit;
          opacity: 0.7;
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
          font-size: 0.85rem;
          &:hover {
            opacity: 1;
          }
        }

        &.toast-success {
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          color: #065f46;
          i {
            color: #059669;
          }
        }

        &.toast-error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
          i {
            color: #dc2626;
          }
        }

        &.toast-info {
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1e40af;
          i {
            color: #2563eb;
          }
        }
      }

      /* Supervisor Authentication Card */
      .admin-auth-card {
        background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
        border: 1px solid #fcd34d;
        border-radius: 10px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        box-shadow:
          0 4px 12px -2px rgba(217, 119, 6, 0.12),
          0 2px 4px -1px rgba(0, 0, 0, 0.04);
        animation: authCardIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes authCardIn {
        from {
          opacity: 0;
          transform: translateY(-4px) scale(0.99);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .auth-header {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        position: relative;
      }

      .auth-icon-badge {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: #fde68a;
        color: #b45309;
        border: 1px solid rgba(217, 119, 6, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 1.1rem;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
      }

      .auth-text-wrap {
        flex: 1;
        min-width: 0;
      }

      .auth-title-row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      .auth-title {
        font-size: 0.8125rem;
        font-weight: 700;
        color: #92400e;
        letter-spacing: -0.01em;
      }

      .auth-badge-pill {
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        background: rgba(217, 119, 6, 0.14);
        color: #92400e;
        padding: 1px 6px;
        border-radius: 10px;
      }

      .auth-desc {
        font-size: 0.72rem;
        color: #78350f;
        margin: 2px 0 0 0;
        line-height: 1.35;
      }

      .auth-close-btn {
        background: transparent;
        border: none;
        padding: 3px;
        border-radius: 5px;
        cursor: pointer;
        color: #92400e;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.95rem;
        opacity: 0.75;
        transition: all 0.15s ease;

        &:hover {
          opacity: 1;
          background: rgba(180, 83, 9, 0.12);
        }
      }

      .auth-form-wrap {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .auth-input-wrapper {
        position: relative;
        width: 100%;
        display: flex;
        align-items: center;
      }

      .auth-actions-row {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: flex-end;

        .btn-auth-submit {
          flex: 1;
        }

        .btn-auth-cancel {
          padding: 0 14px;
        }
      }

      .auth-input-icon {
        position: absolute;
        left: 10px;
        font-size: 0.95rem;
        color: #92400e;
        opacity: 0.7;
        pointer-events: none;
      }

      .auth-pin-input {
        width: 100%;
        height: 34px;
        padding: 0 10px 0 30px !important;
        font-size: 0.8rem;
        font-weight: 500;
        background: #ffffff;
        border: 1px solid #fcd34d;
        border-radius: 6px;
        color: #0f172a;
        box-sizing: border-box;
        transition: all 0.15s ease;

        &:focus {
          border-color: #d97706;
          box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.18);
          outline: none;
        }

        &::placeholder {
          color: #9ca3af;
        }
      }

      .btn-auth-submit {
        height: 34px;
        background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
        color: #ffffff;
        border: none;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 700;
        padding: 0 12px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        white-space: nowrap;
        box-shadow: 0 2px 5px rgba(180, 83, 9, 0.25);
        transition: all 0.15s ease;

        &:hover:not(:disabled) {
          background: linear-gradient(135deg, #b45309 0%, #92400e 100%);
          box-shadow: 0 3px 8px rgba(180, 83, 9, 0.35);
          transform: translateY(-1px);
        }

        &:active:not(:disabled) {
          transform: translateY(0);
        }

        &:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }
      }

      .btn-auth-cancel {
        height: 34px;
        background: #ffffff;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
        color: #4b5563;
        padding: 0 10px;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.15s ease;

        &:hover {
          background: #f3f4f6;
          color: #111827;
          border-color: #9ca3af;
        }
      }

      .auth-err {
        font-size: 0.72rem;
        font-weight: 600;
        color: #b91c1c;
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 8px;
        border-radius: 5px;
        background: #fef2f2;
        border: 1px solid #fecaca;
      }

      :host-context([data-theme='dark']),
      :host-context(.theme-dark) {
        .admin-auth-card {
          background: linear-gradient(145deg, #1e1910 0%, #15120d 100%) !important;
          border-color: rgba(245, 158, 11, 0.35) !important;
          box-shadow:
            0 6px 18px -4px rgba(0, 0, 0, 0.6),
            0 0 12px rgba(245, 158, 11, 0.08) !important;
        }

        .auth-icon-badge {
          background: rgba(245, 158, 11, 0.18) !important;
          color: #fbbf24 !important;
          border-color: rgba(245, 158, 11, 0.35) !important;
          box-shadow: none !important;
        }

        .auth-title {
          color: #fef3c7 !important;
        }

        .auth-badge-pill {
          background: rgba(245, 158, 11, 0.22) !important;
          color: #fbbf24 !important;
        }

        .auth-desc {
          color: #cbd5e1 !important;
        }

        .auth-close-btn {
          color: #94a3b8 !important;
          &:hover {
            background: rgba(255, 255, 255, 0.08) !important;
            color: #f1f5f9 !important;
          }
        }

        .auth-input-icon {
          color: #fbbf24 !important;
        }

        .auth-pin-input {
          background: #0f1115 !important;
          border-color: rgba(255, 255, 255, 0.18) !important;
          color: #f8fafc !important;

          &:focus {
            border-color: #fbbf24 !important;
            box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.22) !important;
          }

          &::placeholder {
            color: #64748b !important;
          }
        }

        .btn-auth-submit {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
          color: #0f172a !important;
          font-weight: 800 !important;
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3) !important;

          &:hover:not(:disabled) {
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%) !important;
          }
        }

        .btn-auth-cancel {
          background: rgba(255, 255, 255, 0.06) !important;
          border-color: rgba(255, 255, 255, 0.14) !important;
          color: #cbd5e1 !important;

          &:hover {
            background: rgba(255, 255, 255, 0.12) !important;
            color: #ffffff !important;
            border-color: rgba(255, 255, 255, 0.25) !important;
          }
        }

        .auth-err {
          background: rgba(239, 68, 68, 0.15) !important;
          color: #fca5a5 !important;
          border-color: rgba(239, 68, 68, 0.3) !important;
        }
      }

      /* Right Column: Tactile Monospace Receipt Tape Preview */
      .preview-panel {
        background: #f1f5f9;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .preview-bar {
        height: 42px;
        padding: 0 18px;
        background: #e2e8f0;
        border-bottom: 1px solid #cbd5e1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }

      .preview-specs {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #1e293b;
        font-size: 0.8125rem;
        font-weight: 600;
      }

      .specs-badge {
        font-size: 0.7rem;
        background: #cbd5e1;
        color: #334155;
        padding: 2px 7px;
        border-radius: 4px;
        font-weight: 600;
      }

      .specs-hint {
        font-size: 0.72rem;
        color: #64748b;
      }

      /* Canvas Stage */
      .tape-canvas {
        flex: 1;
        overflow-y: auto;
        padding: 28px 20px;
        display: flex;
        justify-content: center;
        background-color: #f1f5f9;
        background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
        background-size: 16px 16px;
      }

      /* Monospace Receipt Paper Tape */
      .receipt-paper {
        background: #ffffff !important;
        color: #0f172a !important;
        box-shadow:
          0 10px 25px -5px rgba(15, 23, 42, 0.12),
          0 4px 6px -2px rgba(15, 23, 42, 0.05);
        border: 1px solid rgba(226, 232, 240, 0.8);
        position: relative;
        padding: 18px 14px;
        transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        box-sizing: border-box;
        margin: auto 0;

        &.paper-80mm {
          width: 380px;
        }

        &.paper-58mm {
          width: 275px;
        }
      }

      /* Clean Realistic Serrated Cutter Edge */
      .paper-jagged-edge {
        position: absolute;
        left: 0;
        right: 0;
        height: 6px;
        background-size: 10px 6px;
        background-repeat: repeat-x;

        &.top {
          top: -6px;
          background-image:
            linear-gradient(135deg, #f1f5f9 50%, transparent 50%),
            linear-gradient(-135deg, #f1f5f9 50%, #ffffff 50%);
        }
        &.bottom {
          bottom: -6px;
          background-image:
            linear-gradient(45deg, #f1f5f9 50%, #ffffff 50%),
            linear-gradient(-45deg, #f1f5f9 50%, transparent 50%);
        }
      }

      /* Tape Logo */
      .tape-logo-header {
        text-align: center;
        margin-bottom: 8px;
        padding-bottom: 6px;
        border-bottom: 1px dashed #cbd5e1;

        .tape-logo-img {
          height: 38px;
          max-width: 110px;
          object-fit: contain;
          filter: grayscale(100%) contrast(150%);
          margin: 0 auto;
          display: block;
        }
      }

      /* Receipt Monospace Content */
      .paper-mono-content {
        margin: 0;
        font-family:
          ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;
        font-size: 11px;
        line-height: 1.35;
        white-space: pre;
        color: #0f172a !important;
        user-select: text;
        text-align: center;
      }

      /* Modal Footer */
      .thermal-modal-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 24px;
        border-top: 1px solid #f1f5f9;
        background: #ffffff;
        flex-shrink: 0;

        @media (max-width: 640px) {
          flex-direction: column;
          gap: 12px;
          align-items: stretch;
        }
      }

      .footer-status-hint {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.78rem;
        color: #475569;

        .hint-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
        }

        strong {
          color: #0f172a;
        }

        .hint-text {
          color: inherit;
        }
      }

      :host-context([data-theme='dark']) .footer-status-hint,
      :host-context(.theme-dark) .footer-status-hint,
      :host-context([data-theme='dark']) .hint-text,
      :host-context(.theme-dark) .hint-text {
        color: #94a3b8 !important;

        strong {
          color: #f1f5f9 !important;
        }
      }

      .footer-btn-group {
        display: flex;
        align-items: center;
        gap: 10px;
        justify-content: flex-end;

        @media (max-width: 640px) {
          justify-content: stretch;
          .btn {
            flex: 1;
          }
        }
      }

      /* Buttons */
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        border: 1px solid transparent;

        &.btn-ghost {
          background: transparent;
          color: #475569;
          border-color: #cbd5e1;
          &:hover {
            background: #f1f5f9;
            color: #0f172a;
          }
        }

        :host-context([data-theme='dark']) &.btn-ghost,
        :host-context(.theme-dark) &.btn-ghost {
          background: rgba(255, 255, 255, 0.08) !important;
          color: #e2e8f0 !important;
          border: 1px solid rgba(255, 255, 255, 0.16) !important;

          &:hover {
            background: rgba(255, 255, 255, 0.14) !important;
            color: #ffffff !important;
            border-color: rgba(255, 255, 255, 0.28) !important;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
          }
        }

        &.btn-secondary {
          background: #f8fafc;
          border-color: #cbd5e1;
          color: #334155;
          &:hover {
            background: #f1f5f9;
            color: #0f172a;
          }
        }

        &.btn-primary {
          background: #0284c7;
          color: #ffffff;
          box-shadow: 0 1px 2px rgba(2, 132, 199, 0.2);
          &:hover:not(:disabled) {
            background: #0369a1;
          }
          &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        }
      }

      .spin {
        animation: spinAnim 1s linear infinite;
      }

      @keyframes spinAnim {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class ThermalReceiptModalComponent {
  private thermalPrinter = inject(ThermalPrinterService);
  private adminAuth = inject(AdminAuthService);
  private toastService = inject(ToastService);

  @Input() isOpen = false;
  @Input() order: Order | null = null;
  @Input() splitBill: any = null;
  @Input() restaurant: Partial<Restaurant> | null = null;
  @Input() effectivePrintCount = 0;

  @Output() close = new EventEmitter<void>();
  @Output() printed = new EventEmitter<{
    method: 'THERMAL' | 'BROWSER';
    printCount: number;
  }>();

  config = this.thermalPrinter.config;
  systemPrinters = this.thermalPrinter.systemPrinters;
  isLoadingPrinters = this.thermalPrinter.isLoadingPrinters;

  tapeLogoFailed = signal<boolean>(false);
  isPrinting = signal<boolean>(false);
  isTestingHardware = signal<boolean>(false);
  showAdminAuth = signal<boolean>(false);
  adminPasswordInput = '';
  adminAuthError = signal<string>('');

  statusMessage = signal<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  receiptPreviewText = computed(() => {
    const ord = this.order;
    if (!ord) return 'No order data available for receipt preview.';
    const rest = this.restaurant || {};
    const cfg = this.config();
    const split = this.splitBill;
    return renderEscPosPreviewText(rest, ord, split, cfg);
  });

  currentTargetLabel = computed(() => {
    const t = this.config().target;
    if (t === 'WINDOWS') return 'Windows Spooler (RAW)';
    if (t === 'NETWORK') return 'Network TCP (ESC/POS)';
    return 'Browser System Dialog (A4/PDF)';
  });

  activePrinterDisplayName = computed(() => {
    const cfg = this.config();
    if (cfg.target === 'NETWORK') return cfg.networkAddress || 'Network POS';
    if (cfg.target === 'WINDOWS') {
      return cfg.printerName || 'Default Windows Printer';
    }
    return 'Standard Browser Print';
  });

  onClose(): void {
    this.statusMessage.set(null);
    this.showAdminAuth.set(false);
    this.adminPasswordInput = '';
    this.adminAuthError.set('');
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.onClose();
    }
  }

  onTargetChange(target: 'WINDOWS' | 'NETWORK' | 'BROWSER'): void {
    this.thermalPrinter.saveConfig({ target });
    this.statusMessage.set({
      type: 'info',
      text: `Print mode changed to ${target === 'WINDOWS' ? 'Windows Spooler' : target === 'NETWORK' ? 'Network POS' : 'Browser Dialog'}.`,
    });
  }

  onPrinterNameChange(name: string): void {
    this.thermalPrinter.saveConfig({ printerName: name });
    this.statusMessage.set({
      type: 'info',
      text: `Selected printer set to "${name}".`,
    });
  }

  onNetworkAddressChange(addr: string): void {
    this.thermalPrinter.saveConfig({ networkAddress: addr });
  }

  onPaperWidthChange(width: '80mm' | '58mm'): void {
    this.thermalPrinter.saveConfig({ paperWidth: width });
    this.statusMessage.set({
      type: 'info',
      text: `Paper width changed to ${width} (${width === '80mm' ? '48' : '32'} columns).`,
    });
  }

  refreshPrinters(): void {
    this.thermalPrinter.loadSystemPrinters();
    this.statusMessage.set({
      type: 'info',
      text: 'Scanning local system for connected hardware printers...',
    });
  }

  testHardwareConnection(): void {
    this.isTestingHardware.set(true);
    const restName = this.restaurant?.name || 'Hotel CRM POS';
    const targetName = this.activePrinterDisplayName();

    this.thermalPrinter.testPrint(restName).subscribe({
      next: (res) => {
        this.isTestingHardware.set(false);
        if (res.success) {
          const written = res.bytes_written ? ` (${res.bytes_written} bytes)` : '';
          this.statusMessage.set({
            type: 'success',
            text: `Hardware communication verified! Test ticket${written} successfully sent to "${targetName}". Check if slip printed & cut.`,
          });
        } else {
          this.statusMessage.set({
            type: 'error',
            text: `Hardware test failed: ${res.message}. Please check if "${targetName}" is powered on and connected.`,
          });
        }
      },
      error: (err) => {
        this.isTestingHardware.set(false);
        this.statusMessage.set({
          type: 'error',
          text: `Hardware test error: ${err?.message || 'Printer offline or unreachable.'}`,
        });
      },
    });
  }

  onThermalPrintClick(): void {
    // If order was already printed, require Admin Authorization before dispatching reprint
    if (this.effectivePrintCount > 0) {
      this.adminPasswordInput = '';
      this.adminAuthError.set('');
      this.showAdminAuth.set(true);
      return;
    }

    this.executeThermalPrint(false);
  }

  authorizeAndPrint(): void {
    const pwd = this.adminPasswordInput.trim();
    if (!this.adminAuth.verifyAdminPassword(pwd)) {
      this.adminAuthError.set('Incorrect admin password. Supervisor authorization required.');
      return;
    }

    this.showAdminAuth.set(false);
    this.adminPasswordInput = '';
    this.adminAuthError.set('');
    this.executeThermalPrint(true);
  }

  private executeThermalPrint(isAdminOverride: boolean): void {
    const ord = this.order;
    if (!ord) return;

    const cfg = this.config();
    if (cfg.target === 'BROWSER') {
      this.onSystemPrint();
      return;
    }

    this.isPrinting.set(true);
    const rest = this.restaurant || {};
    const targetName = this.activePrinterDisplayName();

    this.thermalPrinter.printOrderReceipt(rest, ord, this.splitBill).subscribe({
      next: (res) => {
        this.isPrinting.set(false);
        if (res.success) {
          const bytes = res.bytes_written ? ` (${res.bytes_written} bytes)` : '';
          const copyInfo =
            this.effectivePrintCount > 0
              ? `Duplicate Reprint (Copy #${this.effectivePrintCount + 1})`
              : 'Original Receipt';
          this.statusMessage.set({
            type: 'success',
            text: `Thermal receipt${bytes} successfully dispatched to "${targetName}". ${copyInfo} printed.`,
          });
          this.toastService.success(`Thermal receipt sent to ${targetName}.`);
          this.printed.emit({
            method: 'THERMAL',
            printCount: (this.effectivePrintCount || 0) + 1,
          });
        } else {
          this.statusMessage.set({
            type: 'error',
            text: `Failed to print to "${targetName}": ${res.message}. You can switch printers above or use System Print (A4 / PDF).`,
          });
          this.toastService.warning(`Printer notice: ${res.message}`);
        }
      },
      error: (err) => {
        this.isPrinting.set(false);
        this.statusMessage.set({
          type: 'error',
          text: `Hardware communication error: ${err?.message || 'Printer offline'}. Please check cable/network or use System Print.`,
        });
      },
    });
  }

  onSystemPrint(): void {
    this.statusMessage.set({
      type: 'info',
      text: 'Opening standard Windows / Browser print dialog...',
    });
    window.print();
    this.printed.emit({
      method: 'BROWSER',
      printCount: (this.effectivePrintCount || 0) + 1,
    });
  }
}
