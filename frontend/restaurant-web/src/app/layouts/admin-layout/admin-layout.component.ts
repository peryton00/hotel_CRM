import { Component, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { RestaurantDataService } from '../../data-access/services/restaurant-data.service';
import { AdminAuthService } from '../../core/services/admin-auth.service';
import { AdminThemeService } from '../../core/services/admin-theme.service';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { SoundService } from '../../core/services/sound.service';
import { ToastService } from '../../core/services/toast.service';
import { WhatsAppBridgeService } from '../../core/services/whatsapp-bridge.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div
      class="admin-shell"
      [class.sidebar-collapsed]="isSidebarCollapsed()"
      [attr.data-theme]="themeService.theme()"
      [class.theme-dark]="themeService.isDark()"
    >
      <!-- Mobile Overlay for Drawer -->
      @if (isMobileMenuOpen()) {
        <div class="drawer-backdrop" (click)="toggleMobileMenu()"></div>
      }

      <!-- Admin Sidebar -->
      <aside class="admin-sidebar" [class.mobile-open]="isMobileMenuOpen()">
        <div class="sidebar-brand">
          <div class="brand-crest" [attr.title]="restaurant()?.name || 'GuruKripa Dhaba'">
            <img [src]="logoUrl()" alt="Restaurant Logo" class="brand-logo-img" />
          </div>
          <div class="brand-info">
            <span class="brand-title">{{ restaurant()?.name || 'GuruKripa Dhaba' }}</span>
            <span class="brand-badge">ADMIN CRM</span>
          </div>
          <button
            class="collapse-toggle"
            (click)="toggleSidebar()"
            [attr.title]="isSidebarCollapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
            [attr.aria-label]="isSidebarCollapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          >
            <i class="ph ph-sidebar-simple"></i>
          </button>
          <button
            class="mobile-close-btn"
            (click)="toggleMobileMenu()"
            aria-label="Close navigation"
          >
            <i class="ph ph-x"></i>
          </button>
        </div>

        <nav class="sidebar-nav">
          <div class="nav-group-label">OPERATIONS</div>

          @if (auth.canAccess('dashboard')) {
            <a
              routerLink="/admin/dashboard"
              routerLinkActive="active"
              class="nav-item"
              (click)="closeMobileMenu()"
              [attr.title]="isSidebarCollapsed() ? 'Dashboard' : null"
            >
              <i class="ph ph-chart-pie-slice"></i>
              <span class="nav-text">Dashboard</span>
            </a>
          }

          @if (auth.canAccess('orders')) {
            <a
              routerLink="/admin/orders"
              routerLinkActive="active"
              class="nav-item"
              (click)="closeMobileMenu()"
              [attr.title]="
                isSidebarCollapsed() ? 'Live Orders (' + activeOrdersCount() + ' active)' : null
              "
            >
              <i class="ph ph-receipt"></i>
              <span class="nav-text">Live Orders</span>
              @if (activeOrdersCount() > 0) {
                <span
                  class="live-pill"
                  [attr.title]="activeOrdersCount() + ' active orders in queue'"
                >
                  {{ activeOrdersCount() }}
                </span>
                <span class="live-dot" [attr.title]="activeOrdersCount() + ' active orders'"></span>
              }
            </a>
          }

          @if (auth.canAccess('tables')) {
            <a
              routerLink="/admin/tables"
              routerLinkActive="active"
              class="nav-item"
              (click)="closeMobileMenu()"
              [attr.title]="
                isSidebarCollapsed()
                  ? 'Tables & QR' +
                    (incomingReservationsCount() > 0
                      ? ' (' + incomingReservationsCount() + ' reservations)'
                      : '')
                  : null
              "
            >
              <i class="ph ph-qr-code"></i>
              <span class="nav-text">Tables & QR</span>
              @if (incomingReservationsCount() > 0) {
                <span
                  class="live-pill"
                  [attr.title]="incomingReservationsCount() + ' table reservations'"
                >
                  {{ incomingReservationsCount() }}
                </span>
                <span
                  class="live-dot"
                  [attr.title]="incomingReservationsCount() + ' reservations'"
                ></span>
              }
            </a>
          }

          @if (auth.canAccess('menu')) {
            <a
              routerLink="/admin/menu"
              routerLinkActive="active"
              class="nav-item"
              (click)="closeMobileMenu()"
              [attr.title]="isSidebarCollapsed() ? 'Menu Catalog' : null"
            >
              <i class="ph ph-book-open"></i>
              <span class="nav-text">Menu Catalog</span>
            </a>
          }

          @if (auth.canAccess('inventory')) {
            <a
              routerLink="/admin/inventory"
              routerLinkActive="active"
              class="nav-item"
              (click)="closeMobileMenu()"
              [attr.title]="isSidebarCollapsed() ? 'Inventory & Recipes' : null"
            >
              <i class="ph ph-package"></i>
              <span class="nav-text">Inventory & Recipes</span>
            </a>
          }

          @if (auth.canAccess('billing')) {
            <a
              routerLink="/admin/billing"
              routerLinkActive="active"
              class="nav-item"
              (click)="closeMobileMenu()"
              [attr.title]="isSidebarCollapsed() ? 'Billing & Invoices' : null"
            >
              <i class="ph ph-currency-inr"></i>
              <span class="nav-text">Billing & Invoices</span>
            </a>
          }

          @if (hasGuestSection()) {
            <div class="nav-group-label">GUEST EXPERIENCE</div>

            @if (auth.canAccess('customers')) {
              <a
                routerLink="/admin/customers"
                routerLinkActive="active"
                class="nav-item"
                (click)="closeMobileMenu()"
                [attr.title]="isSidebarCollapsed() ? 'Customers' : null"
              >
                <i class="ph ph-users"></i>
                <span class="nav-text">Customers</span>
              </a>
            }

            @if (auth.canAccess('coupons')) {
              <a
                routerLink="/admin/coupons"
                routerLinkActive="active"
                class="nav-item"
                (click)="closeMobileMenu()"
                [attr.title]="isSidebarCollapsed() ? 'Coupons & Offers' : null"
              >
                <i class="ph ph-tag"></i>
                <span class="nav-text">Coupons & Offers</span>
              </a>
            }

            @if (auth.canAccess('reservations')) {
              <a
                routerLink="/admin/reservations"
                routerLinkActive="active"
                class="nav-item"
                (click)="closeMobileMenu()"
                [attr.title]="
                  isSidebarCollapsed()
                    ? 'Reservations' +
                      (incomingReservationsCount() > 0
                        ? ' (' + incomingReservationsCount() + ' incoming)'
                        : '')
                    : null
                "
              >
                <i class="ph ph-calendar-check"></i>
                <span class="nav-text">Reservations</span>
                @if (incomingReservationsCount() > 0) {
                  <span
                    class="live-pill"
                    [attr.title]="incomingReservationsCount() + ' incoming reservations'"
                  >
                    {{ incomingReservationsCount() }}
                  </span>
                  <span
                    class="live-dot"
                    [attr.title]="incomingReservationsCount() + ' incoming reservations'"
                  ></span>
                }
              </a>
            }

            @if (auth.canAccess('loyalty')) {
              <a
                routerLink="/admin/loyalty"
                routerLinkActive="active"
                class="nav-item"
                (click)="closeMobileMenu()"
                [attr.title]="isSidebarCollapsed() ? 'Loyalty Program' : null"
              >
                <i class="ph ph-crown"></i>
                <span class="nav-text">Loyalty Program</span>
              </a>
            }

            @if (auth.canAccess('feedback')) {
              <a
                routerLink="/admin/feedback"
                routerLinkActive="active"
                class="nav-item"
                (click)="closeMobileMenu()"
                [attr.title]="isSidebarCollapsed() ? 'Feedback & Reviews' : null"
              >
                <i class="ph ph-star"></i>
                <span class="nav-text">Feedback & Reviews</span>
              </a>
            }
          }

          @if (hasManagementSection()) {
            <div class="nav-group-label">MANAGEMENT</div>

            @if (auth.canAccess('reports')) {
              <a
                routerLink="/admin/reports"
                routerLinkActive="active"
                class="nav-item"
                (click)="closeMobileMenu()"
                [attr.title]="isSidebarCollapsed() ? 'Reports & Analytics' : null"
              >
                <i class="ph ph-chart-line-up"></i>
                <span class="nav-text">Reports & Analytics</span>
              </a>
            }

            @if (auth.canAccess('staff')) {
              <a
                routerLink="/admin/staff"
                routerLinkActive="active"
                class="nav-item"
                (click)="closeMobileMenu()"
                [attr.title]="isSidebarCollapsed() ? 'Staff Directory' : null"
              >
                <i class="ph ph-identification-badge"></i>
                <span class="nav-text">Staff Directory</span>
              </a>
            }

            @if (auth.canAccess('settings')) {
              <a
                routerLink="/admin/settings"
                routerLinkActive="active"
                class="nav-item"
                (click)="closeMobileMenu()"
                [attr.title]="isSidebarCollapsed() ? 'Settings & Reset' : null"
              >
                <i class="ph ph-gear"></i>
                <span class="nav-text">Settings & Reset</span>
              </a>
            }
          }
        </nav>

        <div class="sidebar-footer">
          <div class="sidebar-footer-info">
            <span class="terminal-tag">POS Terminal</span>
            <span class="cloud-status">
              <span class="status-pip"></span>
              <span>{{ network.isOnline() ? 'Cloud Synced' : 'Offline' }}</span>
            </span>
          </div>
        </div>
      </aside>

      <!-- Main Workspace -->
      <div class="admin-main">
        <!-- Top Navigation Bar -->
        <header class="admin-topbar">
          <div class="topbar-left">
            <button
              class="mobile-toggle-btn"
              (click)="toggleMobileMenu()"
              aria-label="Open navigation menu"
            >
              <i class="ph ph-list"></i>
            </button>
            <div class="restaurant-indicator">
              <span
                class="connection-status-pill"
                [class.is-online]="network.isOnline()"
                [class.is-offline]="!network.isOnline()"
                [attr.title]="
                  network.isOnline()
                    ? 'Internet Connection: Online'
                    : 'Internet Connection: Offline'
                "
              >
                <span class="connection-dot"></span>
                <i
                  class="ph"
                  [class.ph-wifi-high]="network.isOnline()"
                  [class.ph-wifi-slash]="!network.isOnline()"
                ></i>
                <span>{{ network.isOnline() ? 'Online' : 'Offline' }}</span>
              </span>
            </div>
          </div>

          <div class="topbar-right">
            <!-- Cluster 1: Mode Switcher -->
            <button
              type="button"
              class="mode-toggle-pill"
              [class.mode-admin]="auth.isAdmin()"
              [class.mode-staff]="!auth.isAdmin()"
              (click)="toggleRoleMode()"
              [attr.title]="
                auth.isAdmin()
                  ? 'Super Admin Mode Active (Full CRM Control) — Click to switch to Floor Staff Mode'
                  : 'Floor Staff Mode Active (Orders & Billing Only) — Click to unlock Admin Mode'
              "
              aria-label="Toggle between Admin and Staff Mode"
            >
              <span class="mode-pill-badge">
                <i
                  class="ph"
                  [class.ph-crown-simple]="auth.isAdmin()"
                  [class.ph-users-three]="!auth.isAdmin()"
                ></i>
                <span class="mode-pill-title">{{
                  auth.isAdmin() ? 'Admin Mode' : 'Staff Mode'
                }}</span>
              </span>
              <span class="mode-pill-divider"></span>
              <span class="mode-pill-action">
                @if (auth.isAdmin()) {
                  <span>To Staff</span>
                  <i class="ph ph-arrow-right"></i>
                } @else {
                  <i class="ph ph-lock-key"></i>
                  <span>Unlock</span>
                }
              </span>
            </button>

            <!-- Cluster 2: Integrated Utility Tool Rack -->
            <div class="topbar-tool-rack">
              <!-- Sound Toggle -->
              <button
                type="button"
                class="topbar-tool-btn sound-tool-btn"
                [class.muted]="soundService.isMuted()"
                (click)="soundService.toggleMute()"
                [title]="
                  !soundService.isMuted()
                    ? 'Audio chimes active for incoming orders (Click to mute)'
                    : 'Order audio muted (Click to unmute)'
                "
                aria-label="Toggle Order Arrival Sound"
              >
                <i
                  class="ph"
                  [class.ph-speaker-high]="!soundService.isMuted()"
                  [class.ph-speaker-simple-slash]="soundService.isMuted()"
                ></i>
              </button>

              <!-- Theme Switch -->
              <button
                type="button"
                class="topbar-tool-btn theme-tool-btn"
                (click)="themeService.toggleTheme()"
                [attr.aria-label]="
                  themeService.isDark() ? 'Switch to light mode' : 'Switch to dark mode'
                "
                [attr.title]="
                  themeService.isDark() ? 'Switch to light mode' : 'Switch to dark mode'
                "
              >
                <i
                  class="ph"
                  [class.ph-sun]="themeService.isDark()"
                  [class.ph-moon-stars]="!themeService.isDark()"
                ></i>
              </button>

              <!-- WhatsApp Gateway Live Status & Navigation -->
              <button
                type="button"
                (click)="openWhatsAppSettings()"
                class="topbar-tool-btn whatsapp-status-btn"
                [class.status-connected]="whatsAppBridge.connectionStatus() === 'CONNECTED'"
                [class.status-pairing]="
                  whatsAppBridge.connectionStatus() === 'SCAN_QR' ||
                  whatsAppBridge.connectionStatus() === 'CONNECTING'
                "
                [class.status-disconnected]="whatsAppBridge.connectionStatus() === 'DISCONNECTED'"
                [attr.title]="whatsAppButtonTooltip()"
                aria-label="WhatsApp Gateway Status"
              >
                <span
                  class="wa-status-dot"
                  [class.dot-connected]="whatsAppBridge.connectionStatus() === 'CONNECTED'"
                  [class.dot-pairing]="
                    whatsAppBridge.connectionStatus() === 'SCAN_QR' ||
                    whatsAppBridge.connectionStatus() === 'CONNECTING'
                  "
                  [class.dot-disconnected]="whatsAppBridge.connectionStatus() === 'DISCONNECTED'"
                ></span>
                <i
                  class="ph"
                  [class.ph-whatsapp-logo]="whatsAppBridge.connectionStatus() !== 'CONNECTED'"
                  [class.ph-fill]="whatsAppBridge.connectionStatus() === 'CONNECTED'"
                  [class.ph-whatsapp-logo]="whatsAppBridge.connectionStatus() === 'CONNECTED'"
                ></i>
                <span class="whatsapp-label">{{ whatsAppButtonLabel() }}</span>
              </button>
            </div>

            <!-- Cluster 3: User Identity & Session Exit -->
            <div class="topbar-user-cluster">
              <div class="avatar-badge" [class.admin-badge]="auth.isAdmin()">
                <div class="avatar-circle">{{ userInitial() }}</div>
                <div class="avatar-details">
                  <span class="avatar-name">{{ userName() }}</span>
                  <span
                    class="avatar-role-text"
                    [class.role-admin]="auth.isAdmin()"
                    [class.role-staff]="!auth.isAdmin()"
                  >
                    {{ auth.isAdmin() ? 'Full CRM Access' : userRoleBadge() || 'Floor Operations' }}
                  </span>
                </div>
              </div>

              <!-- Quick Exit Button -->
              <button
                (click)="logout()"
                class="topbar-exit-btn"
                title="Exit Staff Console"
                aria-label="Exit Staff Console"
              >
                <i class="ph ph-sign-out"></i>
              </button>
            </div>
          </div>
        </header>

        <!-- Offline / Sync Status Notification Banner -->
        @if (!network.isOnline()) {
          <div class="offline-global-banner" [class.order-active]="isOrderRoute()">
            <div class="banner-inner">
              <div class="banner-left">
                <span class="offline-tag"
                  ><i class="ph ph-wifi-slash"></i> Offline Mode Active</span
                >
                @if (isOrderRoute()) {
                  <span class="banner-text">
                    <strong>POS & Manual Orders Operational:</strong> Orders and payments are
                    recorded locally and safely preserved. Changes will auto-sync with the database
                    once reconnected.
                  </span>
                } @else {
                  <span class="banner-text">
                    <strong>Cloud Disconnected:</strong> Live updates for this section are paused
                    until connection returns. Orders and Cashier billing remain fully functional.
                  </span>
                }
              </div>
              <div class="banner-actions">
                @if (pendingSyncCount() > 0) {
                  <div class="sync-count-tag" title="Queued actions waiting to sync with database">
                    <i class="ph ph-clock-counter-clockwise"></i>
                    <span
                      >{{ pendingSyncCount() }} change{{
                        pendingSyncCount() === 1 ? '' : 's'
                      }}
                      pending sync</span
                    >
                  </div>
                }
                <button
                  type="button"
                  class="btn-retry-sync"
                  (click)="retryConnection()"
                  [disabled]="network.isChecking()"
                  title="Check database connection and sync offline data now"
                >
                  <i class="ph ph-arrows-clockwise" [class.banner-spin]="network.isChecking()"></i>
                  <span>{{ network.isChecking() ? 'Checking...' : 'Check Connection' }}</span>
                </button>
              </div>
            </div>
          </div>
        } @else if (isSyncing()) {
          <div class="syncing-global-banner">
            <div class="banner-inner">
              <i class="ph ph-arrows-clockwise banner-spin"></i>
              <span
                >Reconnected to cloud. Synchronizing offline orders and payments with
                database...</span
              >
            </div>
          </div>
        }

        <!-- Page Content View -->
        <main class="admin-content">
          <router-outlet></router-outlet>
        </main>
      </div>

      <!-- Admin Mode Unlock Verification Modal -->
      @if (showAdminPinModal()) {
        <div class="pin-modal-backdrop" (click)="closePinModal()">
          <div class="pin-modal-card" (click)="$event.stopPropagation()">
            <div class="pin-modal-header">
              <div class="pin-modal-title-group">
                <div class="pin-modal-icon">
                  <i class="ph ph-shield-check"></i>
                </div>
                <div>
                  <h3 class="pin-modal-heading">Unlock Admin Mode</h3>
                  <p class="pin-modal-subheading">
                    Enter Super Admin password or PIN to unlock unrestricted CRM access.
                  </p>
                </div>
              </div>
              <button
                type="button"
                class="pin-modal-close-btn"
                (click)="closePinModal()"
                aria-label="Close modal"
              >
                <i class="ph ph-x"></i>
              </button>
            </div>

            <form (ngSubmit)="confirmUnlockAdmin()" class="pin-modal-form">
              <div class="pin-input-field">
                <label for="adminModeSecretInput">Admin Password / PIN</label>
                <div class="pin-input-wrapper">
                  <i class="ph ph-lock-key pin-field-icon"></i>
                  <input
                    id="adminModeSecretInput"
                    type="password"
                    [(ngModel)]="adminPinInput"
                    name="adminPinInput"
                    placeholder="Enter Admin Password or PIN"
                    autocomplete="current-password"
                    required
                  />
                </div>
                @if (pinError()) {
                  <div class="pin-error-alert">
                    <i class="ph ph-warning-circle"></i>
                    <span>{{ pinError() }}</span>
                  </div>
                }
              </div>

              <div class="pin-modal-footer">
                <button
                  type="button"
                  class="btn btn-secondary"
                  (click)="closePinModal()"
                  [disabled]="isVerifyingPin()"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  class="btn btn-primary btn-unlock"
                  [disabled]="isVerifyingPin() || !adminPinInput.trim()"
                >
                  @if (isVerifyingPin()) {
                    <i class="ph ph-arrows-clockwise spin"></i>
                    <span>Verifying...</span>
                  } @else {
                    <i class="ph ph-lock-key-open"></i>
                    <span>Unlock Admin</span>
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .admin-shell {
        display: flex;
        min-height: 100vh;
        background-color: var(--color-background);
        position: relative;
      }

      .admin-sidebar {
        width: var(--sidebar-width);
        background-color: #14161b;
        color: #ffffff;
        display: flex;
        flex-direction: column;
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        z-index: 950;
        overflow-x: hidden;
        will-change: width;
        transition: width 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
        border-right: 1px solid rgba(255, 255, 255, 0.07);
        box-shadow: 2px 0 16px rgba(0, 0, 0, 0.3);

        @media (max-width: 1024px) {
          transform: translateX(-100%);
          transition: transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
          width: 280px;

          &.mobile-open {
            transform: translateX(0);
          }
        }
      }

      .sidebar-collapsed .admin-sidebar {
        width: var(--sidebar-collapsed-width);

        .sidebar-brand {
          padding: 0;
          position: relative;
        }

        .brand-crest {
          position: absolute;
          left: calc(50% - 18px);
          top: calc(50% - 18px);
          margin: 0 !important;
          opacity: 1;
          transform: scale(1);
          pointer-events: auto;
        }

        .brand-info {
          opacity: 0;
          max-width: 0;
          pointer-events: none;
          transform: translateX(-8px);
        }

        .collapse-toggle {
          position: absolute;
          left: calc(50% - 18px);
          top: calc(50% - 18px);
          margin: 0 !important;
          width: 36px;
          height: 36px;
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
          opacity: 0;
          transform: scale(0.85);
          pointer-events: none;
        }

        &:hover {
          .brand-crest {
            opacity: 0;
            transform: scale(0.85);
            pointer-events: none;
          }

          .collapse-toggle {
            opacity: 1;
            transform: scale(1);
            pointer-events: auto;
            z-index: 2;

            &:hover {
              background: rgba(255, 255, 255, 0.16);
              border-color: rgba(255, 255, 255, 0.24);
              transform: scale(1.06);
            }

            &:active {
              transform: scale(0.96);
            }
          }
        }

        .nav-group-label {
          opacity: 0;
          max-height: 0;
          padding: 0;
          margin: 0;
          pointer-events: none;
        }

        .sidebar-nav {
          padding: 16px 8px;
          align-items: center;
        }

        .nav-item {
          justify-content: center;
          padding: 10px 0;
          width: 100%;
          gap: 0;

          i {
            font-size: 1.3rem;
          }

          &.active {
            background: rgba(245, 158, 11, 0.16);
          }
        }

        .nav-text {
          opacity: 0;
          max-width: 0;
          pointer-events: none;
          transform: translateX(-8px);
        }

        .live-pill {
          display: none;
        }

        .live-dot {
          display: block;
        }

        .sidebar-footer {
          opacity: 0;
          max-height: 0;
          padding: 0;
          border-top-color: transparent;
          pointer-events: none;
        }
      }

      .sidebar-brand {
        height: var(--topbar-height);
        display: flex;
        align-items: center;
        padding: 0 16px;
        gap: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
        position: relative;
        overflow: hidden;
        transition: padding 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .brand-crest {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        overflow: hidden;
        transition:
          opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1),
          transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .brand-logo-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }

      .brand-info {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        white-space: nowrap;
        opacity: 1;
        max-width: 170px;
        transition:
          opacity 0.2s ease,
          max-width 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
          transform 0.2s ease;
      }

      .brand-title {
        font-family: var(--font-display);
        font-size: 0.95rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: #ffffff;
        white-space: nowrap;
      }

      .brand-badge {
        font-size: 0.6rem;
        letter-spacing: 0.08em;
        color: #f59e0b;
        font-weight: 700;
        text-transform: uppercase;
      }

      .mobile-close-btn {
        margin-left: auto;
        color: var(--color-taupe);
        font-size: 1.4rem;
        display: none;
        @media (max-width: 1024px) {
          display: block;
        }
      }

      .sidebar-nav {
        flex: 1;
        padding: 14px 10px;
        overflow-y: auto;
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
        gap: 2px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.1) transparent;

        &::-webkit-scrollbar {
          width: 4px;
        }

        &::-webkit-scrollbar-track {
          background: transparent;
        }

        &::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: var(--radius-full);
          transition: background var(--transition-fast);
        }

        &:hover {
          scrollbar-color: rgba(255, 255, 255, 0.2) transparent;

          &::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
          }
        }
      }

      .nav-group-label {
        font-size: 0.625rem;
        font-weight: 700;
        color: #64748b;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        padding: 14px 10px 4px;
        white-space: nowrap;
        overflow: hidden;
        opacity: 1;
        max-height: 28px;
        transition:
          opacity 0.18s ease,
          max-height 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
          padding 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .nav-item {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 8px 12px;
        border-radius: 8px;
        color: #94a3b8;
        font-size: 0.8125rem;
        font-weight: 500;
        white-space: nowrap;
        position: relative;
        cursor: pointer;
        text-decoration: none;
        transition:
          background-color 0.15s ease,
          color 0.15s ease,
          padding 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
          gap 320ms cubic-bezier(0.2, 0.8, 0.2, 1);

        i {
          font-size: 1.15rem;
          flex-shrink: 0;
          color: #94a3b8;
          transition:
            color var(--transition-fast),
            font-size 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        &:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #ffffff;

          i {
            color: #f59e0b;
          }
        }

        &.active {
          background: rgba(245, 158, 11, 0.12);
          color: #ffffff;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

          i {
            color: #f59e0b;
          }
        }
      }

      .nav-text {
        white-space: nowrap;
        overflow: hidden;
        opacity: 1;
        max-width: 180px;
        transition:
          opacity 0.2s ease,
          max-width 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
          transform 0.2s ease;
      }

      .live-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: auto;
        background: #ef4444;
        color: #ffffff;
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 1px 6px;
        min-width: 20px;
        text-align: center;
        border-radius: var(--radius-full);
        box-shadow: 0 0 8px rgba(239, 68, 68, 0.4);
        animation: pulseGlow 1.8s infinite;
        transition: opacity 0.2s ease;
      }

      .live-dot {
        display: none;
        position: absolute;
        top: 8px;
        right: 18px;
        width: 7px;
        height: 7px;
        background: #ef4444;
        border-radius: 50%;
        box-shadow: 0 0 6px #ef4444;
        animation: pulseGlow 1.5s infinite;
      }

      .sidebar-footer {
        padding: 12px 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.07);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        background: rgba(255, 255, 255, 0.015);
        white-space: nowrap;
        overflow: hidden;
        opacity: 1;
        max-height: 48px;
        transition:
          opacity 0.18s ease,
          max-height 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
          padding 320ms cubic-bezier(0.2, 0.8, 0.2, 1),
          border-color 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .sidebar-footer-info {
        display: flex;
        flex-direction: column;
        line-height: 1.25;

        .terminal-tag {
          font-size: 0.72rem;
          font-weight: 600;
          color: #cbd5e1;
        }

        .cloud-status {
          font-size: 0.65rem;
          color: #10b981;
          display: flex;
          align-items: center;
          gap: 5px;
          font-weight: 500;
        }

        .status-pip {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
        }
      }

      .collapse-toggle {
        margin-left: auto;
        color: #94a3b8;
        font-size: 1.15rem;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: transparent;
        border: 1px solid transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex-shrink: 0;
        transition:
          opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1),
          transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
          background-color 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;

        &:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.14);
        }

        &:active {
          transform: scale(0.94);
        }

        @media (max-width: 1024px) {
          display: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .brand-crest,
        .collapse-toggle,
        .admin-sidebar,
        .admin-main,
        .brand-info,
        .nav-text,
        .nav-item,
        .nav-group-label,
        .sidebar-footer {
          transition: none !important;
        }
      }

      .admin-main {
        flex: 1;
        margin-left: var(--sidebar-width);
        display: flex;
        flex-direction: column;
        min-width: 0;
        will-change: margin-left;
        transition: margin-left 320ms cubic-bezier(0.2, 0.8, 0.2, 1);

        @media (max-width: 1024px) {
          margin-left: 0;
        }
      }

      .sidebar-collapsed .admin-main {
        margin-left: var(--sidebar-collapsed-width);
        @media (max-width: 1024px) {
          margin-left: 0;
        }
      }

      .admin-topbar {
        height: var(--topbar-height);
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 28px;
        position: sticky;
        top: 0;
        z-index: 850;

        @media (max-width: 768px) {
          padding: 0 16px;
        }
      }

      .topbar-left {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .mobile-toggle-btn {
        display: none;
        font-size: 1.5rem;
        color: var(--color-onyx);
        padding: 4px;
        @media (max-width: 1024px) {
          display: block;
        }
      }

      .connection-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 4px 10px;
        border-radius: var(--radius-full);
        transition: all var(--transition-fast);

        i {
          font-size: 0.875rem;
        }

        &.is-online {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #166534;

          .connection-dot {
            background: #22c55e;
            box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.3);
            animation: pulseGlow 1.5s infinite;
          }
        }

        &.is-offline {
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.35);
          color: #b91c1c;

          .connection-dot {
            background: #ef4444;
          }
        }
      }

      .connection-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .dining-room-tag {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        background: var(--color-bone);
        border: 1px solid var(--color-border);
        padding: 4px 10px;
        border-radius: var(--radius-full);
      }

      .topbar-right {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      /* Cluster 1: Mode Switcher */
      .mode-toggle-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 34px;
        padding: 0 12px 0 8px;
        border-radius: var(--radius-full);
        font-family: inherit;
        font-size: 0.75rem;
        cursor: pointer;
        transition: all var(--transition-fast);
        border: 1px solid transparent;
        background: var(--color-surface);
        color: var(--color-text);

        &:hover {
          transform: translateY(-1px);
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
        }

        &.mode-admin {
          background: rgba(245, 158, 11, 0.09);
          border-color: rgba(245, 158, 11, 0.4);

          .mode-pill-badge {
            color: #d97706;
          }

          .mode-pill-divider {
            background: rgba(245, 158, 11, 0.3);
          }

          .mode-pill-action {
            color: #b45309;
          }

          &:hover {
            border-color: rgba(245, 158, 11, 0.7);
            background: rgba(245, 158, 11, 0.16);
          }
        }

        &.mode-staff {
          background: rgba(59, 130, 246, 0.09);
          border-color: rgba(59, 130, 246, 0.4);

          .mode-pill-badge {
            color: #2563eb;
          }

          .mode-pill-divider {
            background: rgba(59, 130, 246, 0.3);
          }

          .mode-pill-action {
            color: #2563eb;
          }

          &:hover {
            border-color: rgba(59, 130, 246, 0.7);
            background: rgba(59, 130, 246, 0.16);
          }
        }

        .mode-pill-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: 700;
          font-size: 0.75rem;
          letter-spacing: 0.02em;

          i {
            font-size: 0.95rem;
          }
        }

        .mode-pill-divider {
          width: 1px;
          height: 14px;
        }

        .mode-pill-action {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.72rem;
          font-weight: 600;

          i {
            font-size: 0.75rem;
          }
        }
      }

      /* Cluster 2: Integrated Utility Tool Rack */
      .topbar-tool-rack {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 2px;
        height: 34px;
        border-radius: var(--radius-full);
        background: rgba(18, 18, 18, 0.04);
        border: 1px solid var(--color-border);
      }

      .topbar-tool-btn {
        height: 28px;
        border-radius: var(--radius-full);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: var(--color-text-muted);
        cursor: pointer;
        transition: all var(--transition-fast);
        padding: 0 7px;
        text-decoration: none;

        &:hover {
          background: rgba(18, 18, 18, 0.08);
          color: var(--color-text);
          transform: translateY(-0.5px);
        }

        i {
          font-size: 1rem;
        }

        &.sound-tool-btn {
          width: 28px;
          padding: 0;
          color: #16a34a;

          &.muted {
            color: var(--color-text-muted);
            opacity: 0.6;
          }
        }

        &.theme-tool-btn {
          width: 28px;
          padding: 0;
          color: #6366f1;
        }

        &.whatsapp-status-btn {
          gap: 6px;
          font-size: 0.72rem;
          font-weight: 600;
          padding: 0 10px;
          border-radius: 9999px;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          color: #475569;
          background: rgba(148, 163, 184, 0.08);

          i {
            font-size: 0.95rem;
            color: #64748b;
            transition: color 0.2s ease;
          }

          .wa-status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #94a3b8;
            flex-shrink: 0;
            transition:
              background 0.3s ease,
              box-shadow 0.3s ease;

            &.dot-connected {
              background: #22c55e;
              box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25);
              animation: wa-pulse-green 2.5s infinite;
            }

            &.dot-pairing {
              background: #f59e0b;
              box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.25);
              animation: wa-pulse-amber 1.5s infinite;
            }

            &.dot-disconnected {
              background: #ef4444;
              box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.25);
              animation: wa-dot-blink-offline 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
            }
          }

          &.status-connected {
            color: #15803d;
            background: rgba(34, 197, 94, 0.1);
            border-color: rgba(34, 197, 94, 0.22);

            i {
              color: #16a34a;
            }

            &:hover {
              background: rgba(34, 197, 94, 0.18);
              border-color: rgba(34, 197, 94, 0.38);
              color: #166534;
            }
          }

          &.status-pairing {
            color: #b45309;
            background: rgba(245, 158, 11, 0.1);
            border-color: rgba(245, 158, 11, 0.28);

            i {
              color: #d97706;
            }

            &:hover {
              background: rgba(245, 158, 11, 0.18);
              border-color: rgba(245, 158, 11, 0.42);
            }
          }

          &.status-disconnected {
            color: #dc2626;
            background: rgba(239, 68, 68, 0.08);
            border-color: rgba(239, 68, 68, 0.22);
            animation: wa-button-blink-offline 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;

            i {
              color: #ef4444;
            }

            &:hover {
              animation-play-state: paused;
              background: rgba(239, 68, 68, 0.2);
              border-color: rgba(239, 68, 68, 0.45);
              color: #b91c1c;
            }
          }

          @media (max-width: 640px) {
            .whatsapp-label {
              display: none;
            }
            width: 32px;
            padding: 0;
            justify-content: center;
          }
        }
      }

      .theme-dark .topbar-tool-rack,
      [data-theme='dark'] .topbar-tool-rack {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.1);

        .topbar-tool-btn {
          &:hover {
            background: rgba(255, 255, 255, 0.12);
            color: #ffffff;
          }

          &.sound-tool-btn {
            color: #4ade80;
            &.muted {
              color: #94a3b8;
            }
          }

          &.theme-tool-btn {
            color: #facc15;
          }

          &.whatsapp-status-btn {
            background: rgba(255, 255, 255, 0.06);
            color: #cbd5e1;

            i {
              color: #94a3b8;
            }

            &.status-connected {
              color: #86efac;
              background: rgba(34, 197, 94, 0.15);
              border-color: rgba(34, 197, 94, 0.32);

              i {
                color: #4ade80;
              }

              &:hover {
                background: rgba(34, 197, 94, 0.25);
                border-color: rgba(34, 197, 94, 0.48);
              }
            }

            &.status-pairing {
              color: #fde68a;
              background: rgba(245, 158, 11, 0.18);
              border-color: rgba(245, 158, 11, 0.38);

              i {
                color: #fbbf24;
              }

              &:hover {
                background: rgba(245, 158, 11, 0.28);
              }
            }

            &.status-disconnected {
              color: #fca5a5;
              background: rgba(239, 68, 68, 0.12);
              border-color: rgba(239, 68, 68, 0.3);
              animation: wa-button-blink-offline-dark 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;

              i {
                color: #f87171;
              }

              &:hover {
                animation-play-state: paused;
                background: rgba(239, 68, 68, 0.28);
                border-color: rgba(239, 68, 68, 0.55);
                color: #ffffff;
              }
            }
          }
        }
      }

      /* Cluster 3: User Identity & Session Exit */
      .topbar-user-cluster {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-left: 8px;
        border-left: 1px solid var(--color-border);
      }

      .avatar-badge {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .avatar-circle {
        width: 32px;
        height: 32px;
        border-radius: var(--radius-full);
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        color: #ffffff;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.8rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
      }

      .admin-badge .avatar-circle {
        background: linear-gradient(135deg, #f59e0b 0%, #b45309 100%);
        color: #1e1e1e;
        font-weight: 800;
      }

      .avatar-details {
        display: flex;
        flex-direction: column;
        line-height: 1.2;

        @media (max-width: 768px) {
          display: none;
        }
      }

      .avatar-name {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--color-text);
      }

      .avatar-role-text {
        font-size: 0.68rem;
        font-weight: 600;

        &.role-admin {
          color: #d97706;
        }

        &.role-staff {
          color: #2563eb;
        }
      }

      .theme-dark .avatar-role-text.role-admin,
      [data-theme='dark'] .avatar-role-text.role-admin {
        color: #fbbf24;
      }

      .theme-dark .avatar-role-text.role-staff,
      [data-theme='dark'] .avatar-role-text.role-staff {
        color: #60a5fa;
      }

      .topbar-exit-btn {
        width: 32px;
        height: 32px;
        border-radius: var(--radius-full);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid transparent;
        background: transparent;
        color: var(--color-text-muted);
        cursor: pointer;
        transition: all var(--transition-fast);

        i {
          font-size: 1.05rem;
        }

        &:hover {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.25);
          transform: translateY(-1px);
        }
      }

      .offline-global-banner {
        background-color: rgba(245, 158, 11, 0.12);
        border-bottom: 1px solid rgba(245, 158, 11, 0.25);
        color: #d97706;
        padding: 10px 24px;
        transition: all var(--transition-normal);

        &.order-active {
          background-color: rgba(16, 185, 129, 0.12);
          border-bottom: 1px solid rgba(16, 185, 129, 0.25);
          color: #059669;
        }

        .banner-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .banner-left {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }

        .offline-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 8px;
          background: rgba(245, 158, 11, 0.2);
          border-radius: var(--radius-xs, 4px);
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        &.order-active .offline-tag {
          background: rgba(16, 185, 129, 0.2);
        }

        .banner-text {
          font-size: 0.85rem;
          line-height: 1.4;

          strong {
            font-weight: 600;
          }
        }

        .sync-count-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          padding: 4px 10px;
          background: rgba(0, 0, 0, 0.05);
          border-radius: var(--radius-sm, 6px);
        }

        .banner-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .btn-retry-sync {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: var(--radius-sm, 6px);
          border: 1px solid currentColor;
          background: transparent;
          color: inherit;
          cursor: pointer;
          transition: all var(--transition-fast, 0.15s ease);

          &:hover:not(:disabled) {
            background: rgba(0, 0, 0, 0.08);
          }

          &:disabled {
            opacity: 0.6;
            cursor: wait;
          }
        }
      }

      .syncing-global-banner {
        background-color: rgba(59, 130, 246, 0.12);
        border-bottom: 1px solid rgba(59, 130, 246, 0.25);
        color: #2563eb;
        padding: 10px 24px;

        .banner-inner {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.85rem;
          font-weight: 600;
          max-width: 1400px;
          margin: 0 auto;
        }

        .banner-spin {
          animation: spin 1s linear infinite;
        }
      }

      :host-context([data-theme='dark']),
      :host-context(.dark-theme) {
        .offline-global-banner {
          background-color: rgba(245, 158, 11, 0.15);
          color: #fbbf24;

          &.order-active {
            background-color: rgba(16, 185, 129, 0.15);
            color: #34d399;
          }

          .sync-count-tag {
            background: rgba(255, 255, 255, 0.08);
          }
        }

        .syncing-global-banner {
          background-color: rgba(59, 130, 246, 0.18);
          color: #60a5fa;
        }
      }

      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      .admin-content {
        padding: 28px;
        flex: 1;

        @media (max-width: 768px) {
          padding: 16px;
        }
      }

      .drawer-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(18, 18, 18, 0.6);
        backdrop-filter: blur(2px);
        z-index: 940;
      }

      .pin-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.7);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 16px;
      }

      .pin-modal-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg, 12px);
        box-shadow:
          0 20px 25px -5px rgba(0, 0, 0, 0.3),
          0 8px 10px -6px rgba(0, 0, 0, 0.2);
        width: 100%;
        max-width: 440px;
        overflow: hidden;
        animation: pinModalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes pinModalPop {
        from {
          opacity: 0;
          transform: scale(0.95) translateY(8px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      .pin-modal-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding: 20px 20px 12px;
        border-bottom: 1px solid var(--color-border);
      }

      .pin-modal-title-group {
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }

      .pin-modal-icon {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: rgba(245, 158, 11, 0.15);
        color: #d97706;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        flex-shrink: 0;
      }

      .pin-modal-heading {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--color-text);
      }

      .pin-modal-subheading {
        margin: 4px 0 0;
        font-size: 0.8rem;
        color: var(--color-text-muted);
        line-height: 1.4;
      }

      .pin-modal-close-btn {
        background: transparent;
        border: none;
        color: var(--color-text-muted);
        font-size: 1.1rem;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          background: rgba(0, 0, 0, 0.05);
          color: var(--color-text);
        }
      }

      .pin-modal-form {
        padding: 20px;
      }

      .pin-input-field {
        margin-bottom: 20px;

        label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          margin-bottom: 6px;
          color: var(--color-text);
        }
      }

      .pin-input-wrapper {
        position: relative;
        display: flex;
        align-items: center;

        .pin-field-icon {
          position: absolute;
          left: 12px;
          color: var(--color-text-muted);
          font-size: 1.1rem;
        }

        input {
          width: 100%;
          padding: 10px 12px 10px 38px;
          border-radius: 8px;
          border: 1px solid var(--color-border);
          background: var(--color-background);
          color: var(--color-text);
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.15s ease;

          &:focus {
            border-color: #d97706;
            box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
          }
        }
      }

      .pin-error-alert {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        color: #ef4444;
        font-size: 0.78rem;
        font-weight: 500;
      }

      .pin-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;

        .btn-unlock {
          background: #d97706;
          border-color: #d97706;
          color: #ffffff;

          &:hover:not(:disabled) {
            background: #b45309;
            border-color: #b45309;
          }
        }
      }

      @keyframes wa-pulse-green {
        0% {
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.6);
        }
        70% {
          box-shadow: 0 0 0 5px rgba(34, 197, 94, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
        }
      }

      @keyframes wa-pulse-amber {
        0% {
          box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.65);
        }
        70% {
          box-shadow: 0 0 0 5px rgba(245, 158, 11, 0);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
        }
      }

      @keyframes wa-button-blink-offline {
        0%,
        100% {
          background: rgba(239, 68, 68, 0.07);
          border-color: rgba(239, 68, 68, 0.2);
          color: #dc2626;
          box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
        }
        50% {
          background: rgba(239, 68, 68, 0.18);
          border-color: rgba(239, 68, 68, 0.45);
          color: #b91c1c;
          box-shadow: 0 0 8px rgba(239, 68, 68, 0.25);
        }
      }

      @keyframes wa-button-blink-offline-dark {
        0%,
        100% {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.25);
          color: #fca5a5;
          box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
        }
        50% {
          background: rgba(239, 68, 68, 0.25);
          border-color: rgba(239, 68, 68, 0.55);
          color: #fecaca;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.35);
        }
      }

      @keyframes wa-dot-blink-offline {
        0%,
        100% {
          background: #ef4444;
          box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
          opacity: 0.6;
        }
        50% {
          background: #dc2626;
          box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2);
          opacity: 1;
        }
      }
    `,
  ],
})
export class AdminLayoutComponent {
  isDesktop = environment.isDesktop;
  auth = inject(AdminAuthService);
  themeService = inject(AdminThemeService);
  network = inject(NetworkStatusService);
  soundService = inject(SoundService);
  readonly whatsAppBridge = inject(WhatsAppBridgeService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;

  readonly currentUrl = signal<string>(this.router.url);

  constructor() {
    this.whatsAppBridge.startStatusPoller();

    this.router.events.subscribe(() => {
      this.currentUrl.set(this.router.url);
    });

    // Listen globally across the CRM for incoming live orders
    let lastGlobalEventTimestamp = 0;
    effect(() => {
      const ev = this.dataService.liveOrderEvent();
      if (!ev) return;
      if (ev.timestamp && ev.timestamp === lastGlobalEventTimestamp) return;
      lastGlobalEventTimestamp = ev.timestamp || Date.now();

      if (ev.type === 'ORDER_CREATED' && ev.order) {
        // If user is currently outside the Live Order Queue, give them a notification toast
        if (!this.currentUrl().includes('/admin/orders')) {
          const loc =
            ev.order.orderType === 'TAKEAWAY' ? 'Takeaway' : `Table ${ev.order.tableNumber || '?'}`;
          this.toastService.info(
            `New order ${ev.order.orderNumber} placed for ${loc}`,
            'New Order Arrival',
          );
        }
      }
    });

    // Listen globally across the CRM for incoming live table reservations
    let lastReservationEventTimestamp = 0;
    effect(() => {
      const ev = this.dataService.liveReservationEvent();
      if (!ev) return;
      if (ev.timestamp && ev.timestamp === lastReservationEventTimestamp) return;
      lastReservationEventTimestamp = ev.timestamp || Date.now();

      if (ev.type === 'RESERVATION_CREATED' && ev.reservation) {
        const res = ev.reservation;
        const rawDate = res.reservationDate || res.reservationTime || new Date().toISOString();
        const parsedDate = new Date(rawDate);
        const resDate = parsedDate.toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        });
        const resTime = parsedDate.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        this.toastService.info(
          `New Table Reservation: ${res.customerName} (${res.partySize} Guests) for ${resDate} at ${resTime}`,
          'Incoming Reservation',
        );
      }
    });
  }

  readonly incomingReservationsCount = computed(() => {
    return this.dataService
      .reservations()
      .filter((r) => r.status === 'CONFIRMED' || (r.status as string) === 'PENDING').length;
  });

  isOrderRoute = computed(() => {
    const url = this.currentUrl();
    return (
      url.includes('/admin/orders') ||
      url.includes('/admin/billing') ||
      url.includes('/admin/tables')
    );
  });

  pendingSyncCount = computed(() => {
    return this.dataService.offlineOutbox().length;
  });

  isSyncing = computed(() => {
    return this.dataService.isSyncingOffline();
  });

  restaurant = this.mock.restaurant;
  logoUrl = computed(() => {
    const raw = this.restaurant()?.logoUrl;
    if (!raw || raw.includes('photo-1555396273-367ea4eb4db5')) {
      return '/logo.svg';
    }
    return raw;
  });
  isSidebarCollapsed = signal<boolean>(false);
  isMobileMenuOpen = signal<boolean>(false);

  activeOrdersCount = computed(() => {
    return this.dataService
      .orders()
      .filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;
  });

  userName = computed(() => {
    return this.auth.currentUser()?.name || (this.auth.isAdmin() ? 'Super Admin' : 'Staff Member');
  });

  userRoleBadge = computed(() => {
    const r = (this.auth.currentUser()?.role || this.auth.staffRole()).replace(/_/g, ' ');
    return this.auth.isAdmin() ? 'Super Admin' : r;
  });

  userInitial = computed(() => {
    const name = this.userName();
    return name ? name.charAt(0).toUpperCase() : 'S';
  });

  hasGuestSection = computed(() => {
    return (
      this.auth.canAccess('customers') ||
      this.auth.canAccess('coupons') ||
      this.auth.canAccess('reservations') ||
      this.auth.canAccess('loyalty') ||
      this.auth.canAccess('feedback')
    );
  });

  hasManagementSection = computed(() => {
    return (
      this.auth.canAccess('reports') ||
      this.auth.canAccess('staff') ||
      this.auth.canAccess('settings')
    );
  });

  toggleSidebar(): void {
    this.isSidebarCollapsed.set(!this.isSidebarCollapsed());
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.set(!this.isMobileMenuOpen());
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }

  showAdminPinModal = signal<boolean>(false);
  isVerifyingPin = signal<boolean>(false);
  pinError = signal<string>('');
  adminPinInput = '';
  private pendingAdminRedirect: string | null = null;

  readonly whatsAppButtonLabel = computed(() => {
    const status = this.whatsAppBridge.connectionStatus();
    if (status === 'CONNECTED') return 'WhatsApp';
    if (status === 'SCAN_QR') return 'Scan QR';
    if (status === 'CONNECTING') return 'Connecting';
    return 'WhatsApp';
  });

  readonly whatsAppButtonTooltip = computed(() => {
    const status = this.whatsAppBridge.connectionStatus();
    if (status === 'CONNECTED') {
      const phone = this.whatsAppBridge.connectedPhone();
      return phone
        ? `WhatsApp Gateway Connected (+${phone}) • Click to configure`
        : 'WhatsApp Gateway Connected & Ready • Click to configure';
    }
    if (status === 'SCAN_QR') {
      return 'WhatsApp Pairing Required: QR Code Ready • Click to scan';
    }
    if (status === 'CONNECTING') {
      return 'WhatsApp Gateway Connecting... • Click to view status';
    }
    return 'WhatsApp Gateway Disconnected • Click to open WhatsApp settings';
  });

  openWhatsAppSettings(): void {
    if (this.auth.canAccess('settings')) {
      this.router.navigate(['/admin/settings'], { queryParams: { tab: 'whatsapp' } });
    } else {
      this.pendingAdminRedirect = '/admin/settings?tab=whatsapp';
      this.toastService.info(
        'Admin PIN required to configure WhatsApp Gateway',
        'Admin Authentication',
      );
      this.toggleRoleMode();
    }
  }

  toggleRoleMode(): void {
    if (this.auth.isAdmin()) {
      this.auth.setRoleMode('STAFF');
      this.toastService.info(
        'Switched to Staff Mode. Access restricted to Orders, Tables, and Bill Printing.',
        'Staff Mode',
      );
    } else {
      this.adminPinInput = '';
      this.pinError.set('');
      this.showAdminPinModal.set(true);
    }
  }

  confirmUnlockAdmin(): void {
    const pin = this.adminPinInput.trim();
    if (!pin) {
      this.pinError.set('Please enter the Admin PIN or password.');
      return;
    }

    this.isVerifyingPin.set(true);
    this.pinError.set('');

    this.auth.verifyAdminPasswordAsync(pin).subscribe({
      next: (isValid) => {
        this.isVerifyingPin.set(false);
        if (isValid) {
          this.auth.setRoleMode('ADMIN');
          this.showAdminPinModal.set(false);
          this.adminPinInput = '';
          this.toastService.success(
            'Super Admin Mode unlocked. Full CRM access granted.',
            'Admin Mode',
          );
          if (this.pendingAdminRedirect) {
            const dest = this.pendingAdminRedirect;
            this.pendingAdminRedirect = null;
            this.router.navigateByUrl(dest);
          }
        } else {
          this.pinError.set('Incorrect Admin PIN or password. Access denied.');
        }
      },
      error: () => {
        this.isVerifyingPin.set(false);
        if (this.auth.verifyAdminPassword(pin)) {
          this.auth.setRoleMode('ADMIN');
          this.showAdminPinModal.set(false);
          this.adminPinInput = '';
          this.toastService.success(
            'Super Admin Mode unlocked. Full CRM access granted.',
            'Admin Mode',
          );
          if (this.pendingAdminRedirect) {
            const dest = this.pendingAdminRedirect;
            this.pendingAdminRedirect = null;
            this.router.navigateByUrl(dest);
          }
        } else {
          this.pinError.set('Incorrect Admin PIN or password. Access denied.');
        }
      },
    });
  }

  closePinModal(): void {
    if (this.isVerifyingPin()) return;
    this.showAdminPinModal.set(false);
    this.adminPinInput = '';
    this.pinError.set('');
  }

  retryConnection(): void {
    this.network.checkHealth().then((isHealthy) => {
      if (isHealthy) {
        this.dataService.flushOfflineQueue();
        this.dataService.loadAuthoritativeData();
      }
    });
  }

  logout(): void {
    this.auth.logout();
  }
}
