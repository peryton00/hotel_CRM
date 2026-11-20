import { Routes, CanDeactivateFn } from '@angular/router';
import { AdminLayoutComponent } from './layouts/admin-layout/admin-layout.component';
import { adminGuard } from './core/guards/admin.guard';

export function resolveDefaultEntry(): string {
  return 'admin';
}

export function resolveFallbackEntry(): string {
  return 'admin';
}

export const canDeactivateSettings: CanDeactivateFn<any> = (component) => {
  return typeof component?.canDeactivate === 'function' ? component.canDeactivate() : true;
};

export const routes: Routes = [
  // Default Entry
  {
    path: '',
    pathMatch: 'full',
    redirectTo: resolveDefaultEntry(),
  },

  // Unprotected Staff Login Terminal
  {
    path: 'admin/login',
    loadComponent: () =>
      import('./features/admin/login/admin-login.component').then((m) => m.AdminLoginComponent),
  },

  // Protected Admin CRM Route Group (Customers cannot enter)
  {
    path: 'admin',
    component: AdminLayoutComponent,
    canActivate: [adminGuard],
    canActivateChild: [adminGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/admin/dashboard/dashboard.component').then(
            (m) => m.AdminDashboardComponent,
          ),
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('./features/admin/customers/customer-list.component').then(
            (m) => m.CustomerListComponent,
          ),
      },
      {
        path: 'customers/:customerId',
        loadComponent: () =>
          import('./features/admin/customers/customer-detail.component').then(
            (m) => m.CustomerDetailComponent,
          ),
      },
      {
        path: 'tables',
        loadComponent: () =>
          import('./features/admin/tables/table-list.component').then((m) => m.TableListComponent),
      },
      {
        path: 'menu',
        loadComponent: () =>
          import('./features/admin/menu/menu-management.component').then(
            (m) => m.MenuManagementComponent,
          ),
      },
      {
        path: 'inventory',
        loadComponent: () =>
          import('./features/admin/inventory/inventory.component').then(
            (m) => m.InventoryComponent,
          ),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./features/admin/orders/order-queue.component').then(
            (m) => m.OrderQueueComponent,
          ),
      },
      {
        path: 'orders/:orderId',
        loadComponent: () =>
          import('./features/admin/orders/order-detail.component').then(
            (m) => m.OrderDetailComponent,
          ),
      },
      {
        path: 'billing',
        loadComponent: () =>
          import('./features/admin/billing/billing-queue.component').then(
            (m) => m.BillingQueueComponent,
          ),
      },
      {
        path: 'billing/:orderId',
        loadComponent: () =>
          import('./features/admin/billing/invoice-preview.component').then(
            (m) => m.InvoicePreviewComponent,
          ),
      },
      {
        path: 'coupons',
        loadComponent: () =>
          import('./features/admin/coupons/coupon-management.component').then(
            (m) => m.CouponManagementComponent,
          ),
      },
      {
        path: 'reservations',
        loadComponent: () =>
          import('./features/admin/reservations/reservation-list.component').then(
            (m) => m.ReservationListComponent,
          ),
      },
      {
        path: 'loyalty',
        loadComponent: () =>
          import('./features/admin/loyalty/loyalty-management.component').then(
            (m) => m.LoyaltyManagementComponent,
          ),
      },
      {
        path: 'feedback',
        loadComponent: () =>
          import('./features/admin/feedback/feedback-list.component').then(
            (m) => m.FeedbackListComponent,
          ),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/admin/reports/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'staff',
        loadComponent: () =>
          import('./features/admin/staff/staff-list.component').then((m) => m.StaffListComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/admin/settings/settings.component').then((m) => m.SettingsComponent),
        canDeactivate: [canDeactivateSettings],
      },
    ],
  },

  // Legacy customer routes redirect to admin (Customer menu is now on standalone Next.js site)
  {
    path: 'menu/:restaurantSlug',
    redirectTo: 'admin',
  },
  {
    path: 'menu/:restaurantSlug/**',
    redirectTo: 'admin',
  },

  // Catch-all Fallback
  {
    path: '**',
    redirectTo: resolveFallbackEntry(),
  },
];
