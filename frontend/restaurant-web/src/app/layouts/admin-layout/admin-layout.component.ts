import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { ToastContainerComponent } from '../../shared/components/toast-container/toast-container.component';
import { RestaurantDataService } from '../../data-access/services/restaurant-data.service';
import { AdminAuthService } from '../../core/services/admin-auth.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, ToastContainerComponent],
  template: `
    <div class="admin-shell" [class.sidebar-collapsed]="isSidebarCollapsed()">
      <!-- Mobile Overlay for Drawer -->
      @if (isMobileMenuOpen()) {
        <div class="drawer-backdrop" (click)="toggleMobileMenu()"></div>
      }

      <!-- Admin Sidebar -->
      <aside class="admin-sidebar" [class.mobile-open]="isMobileMenuOpen()">
        <div class="sidebar-brand">
          <div class="brand-crest">
            <i class="ph ph-crown"></i>
          </div>
          @if (!isSidebarCollapsed()) {
            <div class="brand-info">
              <span class="brand-title">{{ restaurant()?.name || 'GuruKripa Dhaba' }}</span>
              <span class="brand-badge">ADMIN CRM</span>
            </div>
          }
          <button
            class="mobile-close-btn"
            (click)="toggleMobileMenu()"
            aria-label="Close navigation"
          >
            <i class="ph ph-x"></i>
          </button>
        </div>

        <nav class="sidebar-nav">
          <div class="nav-group-label" *ngIf="!isSidebarCollapsed()">OPERATIONS</div>

          <a
            routerLink="/admin/dashboard"
            routerLinkActive="active"
            class="nav-item"
            (click)="closeMobileMenu()"
            [attr.title]="isSidebarCollapsed() ? 'Dashboard' : null"
          >
            <i class="ph ph-chart-pie-slice"></i>
            <span class="nav-text" *ngIf="!isSidebarCollapsed()">Dashboard</span>
          </a>

          <a
            routerLink="/admin/orders"
            routerLinkActive="active"
            class="nav-item"
            (click)="closeMobileMenu()"
            [attr.title]="isSidebarCollapsed() ? 'Live Orders' : null"
          >
            <i class="ph ph-receipt"></i>
            <span class="nav-text" *ngIf="!isSidebarCollapsed()">Live Orders</span>
            <span class="live-pill" *ngIf="!isSidebarCollapsed()">Live</span>
            <span class="live-dot" *ngIf="isSidebarCollapsed()" title="Live Orders"></span>
          </a>

          <a
            routerLink="/admin/tables"
            routerLinkActive="active"
            class="nav-item"
            (click)="closeMobileMenu()"
            [attr.title]="isSidebarCollapsed() ? 'Tables & QR' : null"
          >
            <i class="ph ph-qr-code"></i>
            <span class="nav-text" *ngIf="!isSidebarCollapsed()">Tables & QR</span>
          </a>

          <a
            routerLink="/admin/menu"
            routerLinkActive="active"
            class="nav-item"
            (click)="closeMobileMenu()"
            [attr.title]="isSidebarCollapsed() ? 'Menu Catalog' : null"
          >
            <i class="ph ph-book-open"></i>
            <span class="nav-text" *ngIf="!isSidebarCollapsed()">Menu Catalog</span>
          </a>

          <a
            routerLink="/admin/inventory"
            routerLinkActive="active"
            class="nav-item"
            (click)="closeMobileMenu()"
            [attr.title]="isSidebarCollapsed() ? 'Inventory & Recipes' : null"
          >
            <i class="ph ph-package"></i>
            <span class="nav-text" *ngIf="!isSidebarCollapsed()">Inventory & Recipes</span>
          </a>

          <a
            routerLink="/admin/billing"
            routerLinkActive="active"
            class="nav-item"
            (click)="closeMobileMenu()"
            [attr.title]="isSidebarCollapsed() ? 'Billing & Invoices' : null"
          >
            <i class="ph ph-currency-inr"></i>
            <span class="nav-text" *ngIf="!isSidebarCollapsed()">Billing & Invoices</span>
          </a>

          <div class="nav-group-label" *ngIf="!isSidebarCollapsed()">GUEST EXPERIENCE</div>

          <a
            routerLink="/admin/customers"
            routerLinkActive="active"
            class="nav-item"
            (click)="closeMobileMenu()"
            [attr.title]="isSidebarCollapsed() ? 'Customers' : null"
          >
            <i class="ph ph-users"></i>
            <span class="nav-text" *ngIf="!isSidebarCollapsed()">Customers</span>
          </a>

          <a
            routerLink="/admin/coupons"
            routerLinkActive="active"
            class="nav-item"
            (click)="closeMobileMenu()"
            [attr.title]="isSidebarCollapsed() ? 'Coupons & Offers' : null"
          >
            <i class="ph ph-tag"></i>
            <span class="nav-text" *ngIf="!isSidebarCollapsed()">Coupons & Offers</span>
          </a>

          <a
            routerLink="/admin/reservations"
            routerLinkActive="active"
            class="nav-item"
            (click)="closeMobileMenu()"
            [attr.title]="isSidebarCollapsed() ? 'Reservations' : null"
          >
            <i class="ph ph-calendar-check"></i>
            <span class="nav-text" *ngIf="!isSidebarCollapsed()">Reservations</span>
          </a>

          <a
            routerLink="/admin/loyalty"
            routerLinkActive="active"
            class="nav-item"
            (click)="closeMobileMenu()"
            [attr.title]="isSidebarCollapsed() ? 'Loyalty Program' : null"
          >
            <i class="ph ph-crown"></i>
            <span class="nav-text" *ngIf="!isSidebarCollapsed()">Loyalty Program</span>
          </a>

          <a
            routerLink="/admin/feedback"
            routerLinkActive="active"
            class="nav-item"
            (click)="closeMobileMenu()"
            [attr.title]="isSidebarCollapsed() ? 'Feedback & Reviews' : null"
          >
            <i class="ph ph-star"></i>
            <span class="nav-text" *ngIf="!isSidebarCollapsed()">Feedback & Reviews</span>
          </a>

          <div class="nav-group-label" *ngIf="!isSidebarCollapsed()">MANAGEMENT</div>

          <a
            routerLink="/admin/reports"
            routerLinkActive="active"
            class="nav-item"
            (click)="closeMobileMenu()"
            [attr.title]="isSidebarCollapsed() ? 'Reports & Analytics' : null"
          >
            <i class="ph ph-chart-line-up"></i>
            <span class="nav-text" *ngIf="!isSidebarCollapsed()">Reports & Analytics</span>
          </a>

          <a
            routerLink="/admin/staff"
            routerLinkActive="active"
            class="nav-item"
            (click)="closeMobileMenu()"
            [attr.title]="isSidebarCollapsed() ? 'Staff Directory' : null"
          >
            <i class="ph ph-identification-badge"></i>
            <span class="nav-text" *ngIf="!isSidebarCollapsed()">Staff Directory</span>
          </a>

          <a
            routerLink="/admin/settings"
            routerLinkActive="active"
            class="nav-item"
            (click)="closeMobileMenu()"
            [attr.title]="isSidebarCollapsed() ? 'Settings & Reset' : null"
          >
            <i class="ph ph-gear"></i>
            <span class="nav-text" *ngIf="!isSidebarCollapsed()">Settings & Reset</span>
          </a>
        </nav>

        <div class="sidebar-footer">
          <a
            href="/menu/gurukripa-dhaba/table/tbl-07"
            target="_blank"
            class="live-menu-link"
            [attr.title]="
              isSidebarCollapsed() ? 'Customer Menu View' : 'Open Customer Digital Ordering View'
            "
          >
            <i class="ph ph-arrow-square-out"></i>
            <span *ngIf="!isSidebarCollapsed()">Customer Menu View</span>
          </a>
          <button
            class="collapse-toggle"
            (click)="toggleSidebar()"
            [attr.title]="isSidebarCollapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
            aria-label="Toggle sidebar collapse"
          >
            <i
              class="ph"
              [class.ph-caret-left]="!isSidebarCollapsed()"
              [class.ph-caret-right]="isSidebarCollapsed()"
            ></i>
          </button>
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
              <span class="dining-room-tag">Civil Lines Flagship</span>
            </div>
          </div>

          <div class="topbar-right">
            <a
              href="/menu/gurukripa-dhaba/table/tbl-07"
              target="_blank"
              class="btn btn-secondary btn-sm preview-btn"
            >
              <i class="ph ph-device-mobile"></i>
              <span>Customer Mobile View</span>
            </a>

            <div class="avatar-badge">
              <div class="avatar-circle">M</div>
              <div class="avatar-details">
                <span class="avatar-name">Ranveer B.</span>
                <span class="avatar-role">General Manager</span>
              </div>
            </div>

            <button
              (click)="logout()"
              class="btn btn-secondary btn-sm exit-btn"
              title="Exit Staff Console"
            >
              <i class="ph ph-sign-out"></i>
              <span>Exit Admin</span>
            </button>
          </div>
        </header>

        <!-- Page Content View -->
        <main class="admin-content">
          <router-outlet></router-outlet>
        </main>
      </div>

      <!-- Global Toast Alerts -->
      <app-toast-container></app-toast-container>
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
        background-color: var(--color-onyx);
        color: #ffffff;
        display: flex;
        flex-direction: column;
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        z-index: 100;
        transition: width var(--transition-normal);
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 2px 0 16px rgba(18, 18, 18, 0.2);

        @media (max-width: 1024px) {
          transform: translateX(-100%);
          transition: transform var(--transition-normal);
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
          justify-content: center;
        }

        .nav-group-label {
          display: none;
        }

        .sidebar-nav {
          padding: 16px 8px;
          align-items: center;
        }

        .nav-item {
          justify-content: center;
          padding: 12px 0;
          width: 100%;
          gap: 0;

          i {
            font-size: 1.35rem;
          }

          &.active::before {
            content: '';
            position: absolute;
            left: 0;
            top: 6px;
            bottom: 6px;
            width: 3px;
            background: var(--color-gold);
            border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
          }
        }

        .sidebar-footer {
          flex-direction: column;
          padding: 12px 8px;
          gap: 8px;
          align-items: center;

          .live-menu-link {
            width: 40px;
            height: 40px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: var(--radius-sm);
          }

          .collapse-toggle {
            width: 40px;
            height: 40px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
        }
      }

      .sidebar-brand {
        height: var(--topbar-height);
        display: flex;
        align-items: center;
        padding: 0 20px;
        gap: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .brand-crest {
        width: 38px;
        height: 38px;
        border-radius: var(--radius-sm);
        background: linear-gradient(135deg, var(--color-crimson), #800e04);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-gold);
        font-size: 1.25rem;
        flex-shrink: 0;
      }

      .brand-info {
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .brand-title {
        font-family: var(--font-display);
        font-size: 1.05rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--color-bone);
        white-space: nowrap;
      }

      .brand-badge {
        font-size: 0.625rem;
        letter-spacing: 0.1em;
        color: var(--color-gold);
        font-weight: 700;
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
        padding: 16px 12px;
        overflow-y: auto;
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
        gap: 4px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.12) transparent;

        &::-webkit-scrollbar {
          width: 4px;
        }

        &::-webkit-scrollbar-track {
          background: transparent;
        }

        &::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: var(--radius-full);
          transition: background var(--transition-fast);
        }

        &:hover {
          scrollbar-color: rgba(255, 255, 255, 0.25) transparent;

          &::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.25);
          }

          &::-webkit-scrollbar-thumb:hover {
            background: var(--color-gold);
          }
        }
      }

      .nav-group-label {
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-taupe);
        letter-spacing: 0.08em;
        padding: 14px 12px 6px;
      }

      .nav-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        border-radius: var(--radius-sm);
        color: #d1c7bd;
        font-size: 0.875rem;
        font-weight: 500;
        transition: all var(--transition-fast);
        position: relative;
        cursor: pointer;

        i {
          font-size: 1.25rem;
          flex-shrink: 0;
          transition:
            transform var(--transition-fast),
            color var(--transition-fast);
        }

        &:hover {
          background: rgba(255, 255, 255, 0.07);
          color: #ffffff;

          i {
            transform: scale(1.08);
            color: var(--color-gold);
          }
        }

        &.active {
          background: var(--color-crimson);
          color: #ffffff;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(194, 24, 7, 0.35);

          i {
            color: #ffffff;
            transform: none;
          }

          &::before {
            content: '';
            position: absolute;
            left: 0;
            top: 6px;
            bottom: 6px;
            width: 3px;
            background: var(--color-gold);
            border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
          }
        }
      }

      .live-pill {
        margin-left: auto;
        background: var(--color-success);
        color: #ffffff;
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 1px 7px;
        border-radius: var(--radius-full);
        box-shadow: 0 0 8px rgba(27, 99, 62, 0.5);
      }

      .live-dot {
        position: absolute;
        top: 8px;
        right: 18px;
        width: 7px;
        height: 7px;
        background: var(--color-success);
        border-radius: 50%;
        box-shadow: 0 0 6px var(--color-success);
      }

      .sidebar-footer {
        padding: 14px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .live-menu-link {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.8125rem;
        color: var(--color-gold);
        font-weight: 600;
        padding: 6px 10px;
        border-radius: var(--radius-xs);
        background: rgba(212, 175, 55, 0.1);
        transition: all var(--transition-fast);
        &:hover {
          background: rgba(212, 175, 55, 0.2);
        }
      }

      .collapse-toggle {
        color: var(--color-taupe);
        font-size: 1.2rem;
        padding: 6px;
        border-radius: var(--radius-xs);
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all var(--transition-fast);
        &:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.18);
        }
        @media (max-width: 1024px) {
          display: none;
        }
      }

      .admin-main {
        flex: 1;
        margin-left: var(--sidebar-width);
        display: flex;
        flex-direction: column;
        min-width: 0;
        transition: margin-left var(--transition-normal);

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
        z-index: 90;

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
        gap: 16px;
      }

      .preview-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        @media (max-width: 600px) {
          span {
            display: none;
          }
        }
      }

      .avatar-badge {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .avatar-circle {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--color-onyx);
        color: var(--color-gold);
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.875rem;
      }

      .avatar-details {
        display: flex;
        flex-direction: column;
        @media (max-width: 768px) {
          display: none;
        }
      }

      .avatar-name {
        font-size: 0.8125rem;
        font-weight: 700;
        line-height: 1.2;
      }

      .avatar-role {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
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
        z-index: 99;
      }
    `,
  ],
})
export class AdminLayoutComponent {
  auth = inject(AdminAuthService);
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;

  restaurant = this.mock.restaurant;
  isSidebarCollapsed = signal<boolean>(false);
  isMobileMenuOpen = signal<boolean>(false);

  toggleSidebar(): void {
    this.isSidebarCollapsed.set(!this.isSidebarCollapsed());
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen.set(!this.isMobileMenuOpen());
  }

  closeMobileMenu(): void {
    this.isMobileMenuOpen.set(false);
  }

  logout(): void {
    this.auth.logout();
  }
}
