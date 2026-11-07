import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AdminAuthService } from './admin-auth.service';
import { adminGuard } from '../guards/admin.guard';
import { ToastService } from './toast.service';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';

describe('AdminAuthService & Controlled Access RBAC System', () => {
  let service: AdminAuthService;
  let httpMock: HttpTestingController;
  let routerMock: any;
  let toastMock: any;

  beforeEach(() => {
    localStorage.clear();

    routerMock = {
      navigate: vi.fn(),
    };

    toastMock = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        AdminAuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: routerMock },
        { provide: ToastService, useValue: toastMock },
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AdminAuthService);

    // Flush any automatic background refresh request from constructor
    const backgroundReqs = httpMock.match((req) => req.url.includes('staff_members?role=eq.ADMIN'));
    backgroundReqs.forEach((r) => r.flush([{ pin_hash: 'Admin@123' }]));
  });

  afterEach(() => {
    try {
      httpMock.verify();
    } finally {
      TestBed.resetTestingModule();
      localStorage.clear();
    }
  });

  describe('1. Supabase Authentication & Password Verification', () => {
    it('authenticates admin successfully against Supabase backend', () => {
      let result: any;
      service.loginWithSupabase('admin', 'Admin@123').subscribe((res) => {
        result = res;
      });

      const req = httpMock.expectOne('http://localhost:3000/api/v1/auth/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ login_id: 'admin', password: 'Admin@123' });

      req.flush({
        success: true,
        data: {
          token: 'jwt-admin-token-12345',
          user: {
            id: 'admin-uuid-001',
            name: 'Super Admin',
            role: 'ADMIN',
            email: 'admin@hotelcrm.com',
            login_id: 'admin',
          },
        },
      });

      expect(result.success).toBe(true);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.staffRole()).toBe('ADMIN');
      expect(service.isAdmin()).toBe(true);
      expect(localStorage.getItem('sb-access-token')).toBe('jwt-admin-token-12345');
    });

    it('rejects login when credentials do not match Supabase', () => {
      let result: any;
      service.loginWithSupabase('admin', 'WrongPass').subscribe((res) => {
        result = res;
      });

      const req = httpMock.expectOne('http://localhost:3000/api/v1/auth/login');
      req.flush(
        {
          success: false,
          error: { message: 'Invalid credentials. Access restricted to passwords set in Supabase.' },
        },
        { status: 401, statusText: 'Unauthorized' },
      );

      // Handle direct PostgREST fallback attempt if triggered
      const fallback = httpMock.match((r) => r.url.includes('/rest/v1/staff_members'));
      fallback.forEach((r) => r.flush([]));

      expect(result.success).toBe(false);
      expect(service.isAuthenticated()).toBe(false);
    });

    it('verifies admin password set in Supabase for high-privilege operations', () => {
      localStorage.setItem('supabase_admin_pwd_secret', 'SuperSecretAdmin2026');

      expect(service.verifyAdminPassword('SuperSecretAdmin2026')).toBe(true);
      expect(service.verifyAdminPassword('WrongAdminSecret')).toBe(false);
      expect(service.verifyAdminPassword('')).toBe(false);
    });

    it('authenticates assigned staff member with their secret password', () => {
      let result: any;
      service.loginWithSupabase('rohit.cashier', 'Staff#8k2M').subscribe((res) => {
        result = res;
      });

      const req = httpMock.expectOne('http://localhost:3000/api/v1/auth/login');
      req.flush({
        success: true,
        data: {
          token: 'jwt-staff-token-67890',
          user: {
            id: 'staff-uuid-002',
            name: 'Rohit Verma',
            role: 'CASHIER',
            email: 'rohit@dhaba.com',
            login_id: 'rohit.cashier',
          },
        },
      });

      expect(result.success).toBe(true);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.staffRole()).toBe('CASHIER');
      expect(service.isCashier()).toBe(true);
      expect(service.isAdmin()).toBe(false);
    });
  });

  describe('2. Role-Based Controlled Access Matrix (canAccess)', () => {
    it('grants Super Admin full unrestricted access to all routes', () => {
      service.loginWithToken('admin-token', 'ADMIN');

      expect(service.canAccess('dashboard')).toBe(true);
      expect(service.canAccess('orders')).toBe(true);
      expect(service.canAccess('tables')).toBe(true);
      expect(service.canAccess('menu')).toBe(true);
      expect(service.canAccess('inventory')).toBe(true);
      expect(service.canAccess('billing')).toBe(true);
      expect(service.canAccess('customers')).toBe(true);
      expect(service.canAccess('coupons')).toBe(true);
      expect(service.canAccess('reservations')).toBe(true);
      expect(service.canAccess('loyalty')).toBe(true);
      expect(service.canAccess('feedback')).toBe(true);
      expect(service.canAccess('reports')).toBe(true);
      expect(service.canAccess('staff')).toBe(true);
      expect(service.canAccess('settings')).toBe(true);
    });

    it('restricts Manager from Staff Management and System Settings/Reset', () => {
      service.loginWithToken('manager-token', 'MANAGER');

      expect(service.canAccess('dashboard')).toBe(true);
      expect(service.canAccess('orders')).toBe(true);
      expect(service.canAccess('billing')).toBe(true);
      expect(service.canAccess('reports')).toBe(true);
      // Denied sections
      expect(service.canAccess('staff')).toBe(false);
      expect(service.canAccess('settings')).toBe(false);
    });

    it('enforces controlled access for Billing Cashier', () => {
      service.loginWithToken('cashier-token', 'CASHIER');

      // Cashier allowed sections
      expect(service.canAccess('billing')).toBe(true);
      expect(service.canAccess('orders')).toBe(true);
      expect(service.canAccess('customers')).toBe(true);
      expect(service.canAccess('tables')).toBe(true);

      // Cashier prohibited sections
      expect(service.canAccess('staff')).toBe(false);
      expect(service.canAccess('settings')).toBe(false);
      expect(service.canAccess('reports')).toBe(false);
      expect(service.canAccess('inventory')).toBe(false);
    });

    it('enforces controlled access for Floor Captain', () => {
      service.loginWithToken('captain-token', 'CAPTAIN');

      // Base / shell access should always be allowed
      expect(service.canAccess('admin')).toBe(true);
      expect(service.canAccess('/admin')).toBe(true);
      expect(service.canAccess('/admin/')).toBe(true);
      expect(service.canAccess('')).toBe(true);

      // Captain allowed sections (with or without '/admin/' prefix)
      expect(service.canAccess('orders')).toBe(true);
      expect(service.canAccess('/admin/orders')).toBe(true);
      expect(service.canAccess('tables')).toBe(true);
      expect(service.canAccess('/admin/tables')).toBe(true);
      expect(service.canAccess('reservations')).toBe(true);
      expect(service.canAccess('menu')).toBe(true);

      // Captain prohibited sections
      expect(service.canAccess('billing')).toBe(false);
      expect(service.canAccess('/admin/billing')).toBe(false);
      expect(service.canAccess('staff')).toBe(false);
      expect(service.canAccess('settings')).toBe(false);
      expect(service.canAccess('reports')).toBe(false);
      expect(service.canAccess('dashboard')).toBe(false);
    });

    it('enforces controlled access for Head Chef / Kitchen KDS', () => {
      service.loginWithToken('chef-token', 'EXECUTIVE_CHEF');

      // Chef allowed sections
      expect(service.canAccess('orders')).toBe(true);
      expect(service.canAccess('menu')).toBe(true);
      expect(service.canAccess('inventory')).toBe(true);

      // Chef prohibited sections
      expect(service.canAccess('billing')).toBe(false);
      expect(service.canAccess('staff')).toBe(false);
      expect(service.canAccess('settings')).toBe(false);
      expect(service.canAccess('customers')).toBe(false);
      expect(service.canAccess('reports')).toBe(false);
    });

    it('resolves appropriate default landing routes for each role', () => {
      service.loginWithToken('token', 'ADMIN');
      expect(service.getDefaultRouteForRole()).toBe('/admin/dashboard');

      service.loginWithToken('token', 'MANAGER');
      expect(service.getDefaultRouteForRole()).toBe('/admin/dashboard');

      service.loginWithToken('token', 'CASHIER');
      expect(service.getDefaultRouteForRole()).toBe('/admin/billing');

      service.loginWithToken('token', 'CAPTAIN');
      expect(service.getDefaultRouteForRole()).toBe('/admin/orders');

      service.loginWithToken('token', 'EXECUTIVE_CHEF');
      expect(service.getDefaultRouteForRole()).toBe('/admin/orders');
    });
  });

  describe('3. Route Guard Enforcement (adminGuard)', () => {
    it('redirects unauthenticated users to /admin/login', () => {
      const route = { routeConfig: { path: 'dashboard' } } as ActivatedRouteSnapshot;
      const state = { url: '/admin/dashboard' } as RouterStateSnapshot;

      const allowed = TestBed.runInInjectionContext(() => adminGuard(route, state));
      expect(allowed).toBe(false);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/admin/login']);
    });

    it('allows Admin to access /admin/staff and /admin/settings', () => {
      service.loginWithToken('token', 'ADMIN');

      const route = { routeConfig: { path: 'staff' } } as ActivatedRouteSnapshot;
      const state = { url: '/admin/staff' } as RouterStateSnapshot;

      const allowed = TestBed.runInInjectionContext(() => adminGuard(route, state));
      expect(allowed).toBe(true);
    });

    it('allows authenticated staff to enter parent /admin shell without infinite loops', () => {
      service.loginWithToken('token', 'CAPTAIN');

      const route = { routeConfig: { path: 'admin' } } as ActivatedRouteSnapshot;
      const state = { url: '/admin' } as RouterStateSnapshot;

      const allowed = TestBed.runInInjectionContext(() => adminGuard(route, state));
      expect(allowed).toBe(true);
      expect(routerMock.navigate).not.toHaveBeenCalled();
    });

    it('allows Captain to access /admin/orders directly', () => {
      service.loginWithToken('token', 'CAPTAIN');

      const route = { routeConfig: { path: 'orders' } } as ActivatedRouteSnapshot;
      const state = { url: '/admin/orders' } as RouterStateSnapshot;

      const allowed = TestBed.runInInjectionContext(() => adminGuard(route, state));
      expect(allowed).toBe(true);
    });

    it('blocks Cashier from navigating to /admin/staff and redirects to /admin/billing with toast warning', () => {
      service.loginWithToken('token', 'CASHIER');

      const route = { routeConfig: { path: 'staff' } } as ActivatedRouteSnapshot;
      const state = { url: '/admin/staff' } as RouterStateSnapshot;

      const allowed = TestBed.runInInjectionContext(() => adminGuard(route, state));
      expect(allowed).toBe(false);
      expect(toastMock.error).toHaveBeenCalled();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/admin/billing']);
    });
  });

  describe('4. Session Management and Logout', () => {
    it('clears all session storage and redirects to login on logout', () => {
      service.loginWithToken('test-token', 'ADMIN');
      expect(service.isAuthenticated()).toBe(true);

      service.logout();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.currentUser()).toBeNull();
      expect(localStorage.getItem('sb-access-token')).toBeNull();
      expect(localStorage.getItem('staff_role')).toBeNull();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/admin/login']);
    });
  });
});
