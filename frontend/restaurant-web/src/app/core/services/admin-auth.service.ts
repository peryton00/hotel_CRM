import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, catchError, map, switchMap, firstValueFrom, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { StaffMember, StaffRole } from '../models/staff.model';

const AUTH_TOKEN_KEY = 'sb-access-token';
const STAFF_ROLE_KEY = 'staff_role';
const STAFF_USER_KEY = 'staff_user';
export const ADMIN_PASSWORD_HASH_KEY = 'supabase_admin_pwd_secret';

export interface AuthLoginResponse {
  success: boolean;
  message?: string;
  user?: StaffMember;
  token?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AdminAuthService {
  private router = inject(Router);
  private http = inject(HttpClient);

  private readonly apiUrl = environment.apiBaseUrl;

  private parseStoredUser(): StaffMember | null {
    try {
      const raw = localStorage.getItem(STAFF_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private isStoredSessionValid(): boolean {
    try {
      if (typeof localStorage === 'undefined') return false;
      const token =
        localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem('supabase_auth_token');
      if (!token || token === 'undefined' || token === 'null' || !token.trim()) {
        return false;
      }
      const user = this.parseStoredUser();
      if (!user || !user.id || !user.role) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  readonly isAuthenticated = signal<boolean>(this.isStoredSessionValid());
  readonly staffRole = signal<string>(
    this.isStoredSessionValid() ? localStorage.getItem(STAFF_ROLE_KEY) || 'STAFF' : 'STAFF',
  );
  readonly currentUser = signal<StaffMember | null>(
    this.isStoredSessionValid() ? this.parseStoredUser() : null,
  );

  readonly authEvent$ = new Subject<{
    type: 'LOGIN' | 'LOGOUT';
    user: StaffMember | null;
    isExpired?: boolean;
  }>();

  readonly isAdmin = computed(() => this.staffRole().toUpperCase() === 'ADMIN');
  readonly isManager = computed(
    () => this.staffRole().toUpperCase() === 'MANAGER' || this.isAdmin(),
  );
  readonly isCashier = computed(() => this.staffRole().toUpperCase() === 'CASHIER');
  readonly isCaptain = computed(() => this.staffRole().toUpperCase() === 'CAPTAIN');
  readonly isChef = computed(
    () =>
      this.staffRole().toUpperCase() === 'EXECUTIVE_CHEF' ||
      this.staffRole().toUpperCase() === 'CHEF' ||
      this.staffRole().toUpperCase() === 'HEAD CHEF (KDS)',
  );

  /**
   * Evaluates dynamic granular permissions.
   * Admins have universal override (*). Staff permissions are evaluated against the assigned permissions list.
   */
  hasPermission(permissionKey: string): boolean {
    if (this.isAdmin()) {
      return true;
    }
    const user = this.currentUser();
    if (!user) {
      return false;
    }
    if (user.role === 'ADMIN') {
      return true;
    }
    const permissions = user.permissions || [];
    if (permissions.includes('*')) {
      return true;
    }
    return permissions.includes(permissionKey);
  }

  constructor() {
    if (!this.isStoredSessionValid()) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem('supabase_auth_token');
      localStorage.removeItem(STAFF_ROLE_KEY);
      localStorage.removeItem(STAFF_USER_KEY);
      this.isAuthenticated.set(false);
      this.currentUser.set(null);
    }
    localStorage.removeItem(ADMIN_PASSWORD_HASH_KEY);
  }

  firstAdminRequired() {
    return this.http.get<{required:boolean}>(`${this.apiUrl}/auth/setup`);
  }

  loginWithSupabase(loginId: string, secretPassword: string, firstAdmin = false): Observable<AuthLoginResponse> {
    const id = loginId.trim();
    const pwd = secretPassword.trim();

    if (!id || !pwd) {
      return of({
        success: false,
        message: 'Please provide both your Staff/Admin ID and your secret access password.',
      });
    }

    // 1. Try Backend API first
    return this.http
      .post<{ success: boolean; data?: { token: string; user: any }; error?: any }>(
        `${this.apiUrl}/auth/${firstAdmin ? 'setup' : 'login'}`,
        { login_id: id, password: pwd },
      )
      .pipe(
        map((res) => {
          if (res && res.success && res.data) {
            this.setSession(res.data.token, res.data.user);
            return {
              success: true,
              user: res.data.user,
              token: res.data.token,
            };
          }
          return {
            success: false,
            message: 'Invalid staff ID or password.',
          };
        }),
        catchError((backendErr) => {
          const msg =
            backendErr.error?.error?.message ||
            backendErr.error?.message ||
            'Unable to sign in. Check the local POS connection and your credentials.';
          return of({ success: false, message: msg });
        }),
      );
  }

  private setSession(token: string, rawUser: any): void {
    const role = (rawUser?.role || 'STAFF').toUpperCase();
    const user: StaffMember = {
      id: rawUser?.id || '',
      permissions: Array.isArray(rawUser?.permissions) ? rawUser.permissions : [],
      restaurant_id: rawUser?.restaurant_id,
      name: rawUser?.name || 'Staff Member',
      role: role as StaffRole,
      email: rawUser?.email || '',
      phone: rawUser?.phone || rawUser?.phone_e164 || '',
      shift: rawUser?.shift || 'General Shift',
      status: 'ACTIVE',
      assignedSection: rawUser?.assigned_section || rawUser?.assignedSection || 'Main Dining Floor',
      loginId: rawUser?.login_id || rawUser?.loginId || rawUser?.name,
    };

    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(STAFF_ROLE_KEY, role);
    localStorage.setItem(STAFF_USER_KEY, JSON.stringify(user));

    this.isAuthenticated.set(true);
    this.staffRole.set(role);
    this.currentUser.set(user);
    this.authEvent$.next({ type: 'LOGIN', user });
  }

  /**
   * Synchronous login helper for backward compatibility
   */
  login(pinOrToken: string, role = 'MANAGER'): boolean {
    const trimmed = pinOrToken.trim();
    if (!trimmed) return false;
    this.loginWithToken(trimmed, role);
    return true;
  }

  loginWithToken(token: string, role = 'MANAGER'): void {
    const r = role.toUpperCase();
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(STAFF_ROLE_KEY, r);
    this.isAuthenticated.set(true);
    this.staffRole.set(r);
    this.authEvent$.next({ type: 'LOGIN', user: this.currentUser() });
  }

  verifyAdminPassword(password: string): Promise<boolean> {
    return firstValueFrom(this.verifyAdminPasswordAsync(password));
  }

  private get authorizationHeaders(): HttpHeaders {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  verifyAdminPasswordAsync(password: string): Observable<boolean> {
    if (!password.trim()) return of(false);
    return this.http.post<{ data?: { valid: boolean } }>(
      `${this.apiUrl}/auth/verify-admin-password`, { password }, { headers: this.authorizationHeaders },
    ).pipe(map(response => response.data?.valid === true), catchError(() => of(false)));
  }

  changeAdminPassword(newPassword: string, currentPassword?: string): Observable<{ success: boolean; message: string }> {
    if (newPassword.trim().length < 4) return of({ success: false, message: 'Password must be at least 4 characters long.' });
    return this.verifyAdminPasswordAsync(currentPassword || '').pipe(switchMap(valid => {
      if (!valid) return of({ success: false, message: 'Current admin password is incorrect.' });
      const id = this.currentUser()?.id;
      if (!id || !this.isAdmin()) return of({ success: false, message: 'Sign in as an administrator.' });
      return this.http.put(`${this.apiUrl}/restaurants/staff/${id}`, { password: newPassword.trim() }, { headers: this.authorizationHeaders }).pipe(
        map(() => ({ success: true, message: 'Admin password updated.' })),
        catchError(() => of({ success: false, message: 'Password update failed.' })),
      );
    }));
  }

  /**
   * Role-Based Access Control matrix for the CRM.
   * Controls what tabs each staff role is permitted to see and navigate to.
   */
  canAccess(routePath: string): boolean {
    const role = this.staffRole().toUpperCase();

    // Super Admin has full, unrestricted CRM access
    if (role === 'ADMIN') return true;

    // Normalize path to root segment (handles 'admin', '/admin', '/admin/orders', 'orders', etc.)
    const clean = (routePath || '')
      .toLowerCase()
      .trim()
      .replace(/^\/?admin(\/|$)/, '')
      .replace(/^\//, '');

    const segment = clean.split('/')[0];
    if (!segment) return true; // shell / base entry allowed

    switch (role) {
      case 'MANAGER':
        // Managers manage floor operations, but CANNOT manage staff credentials or reset system settings
        return segment !== 'staff' && segment !== 'settings';

      case 'CASHIER':
        // Cashiers handle billing, settlement, invoices, and table payments
        return ['billing', 'orders', 'customers', 'tables'].includes(segment);

      case 'CAPTAIN':
        // Floor captains manage table dining, customer orders, and table bookings
        return ['orders', 'tables', 'reservations', 'menu'].includes(segment);

      case 'EXECUTIVE_CHEF':
      case 'CHEF':
      case 'SOUS_CHEF':
      case 'HEAD CHEF (KDS)':
        // Kitchen staff handle live orders (KDS), dishes availability, and ingredient inventory
        return ['orders', 'menu', 'inventory'].includes(segment);

      case 'SERVICE_CREW':
      case 'BEVERAGE_SPECIALIST':
        return ['orders', 'tables'].includes(segment);

      case 'STAFF':
        // Staff mode: ordering lifecycle (takeaway, dine-in tables) + bill printing & payment settlement
        return ['orders', 'tables', 'billing'].includes(segment);

      default:
        return ['orders'].includes(segment);
    }
  }

  /**
   * Switches CRM operational mode between full ADMIN access and restricted STAFF floor operations.
   */
  setRoleMode(mode: 'ADMIN' | 'STAFF'): void {
    const r = mode.toUpperCase();
    localStorage.setItem(STAFF_ROLE_KEY, r);
    this.staffRole.set(r);

    const user = this.currentUser();
    if (user) {
      const updatedUser: StaffMember = {
        ...user,
        role: r as StaffRole,
      };
      this.currentUser.set(updatedUser);
      localStorage.setItem(STAFF_USER_KEY, JSON.stringify(updatedUser));
    }

    // If current route is restricted in the new mode, redirect to default landing route
    if (!this.canAccess(this.router.url)) {
      this.router.navigate([this.getDefaultRouteForRole()]);
    }
  }

  /**
   * Returns the primary landing route for a staff member based on their role
   */
  getDefaultRouteForRole(): string {
    const role = this.staffRole().toUpperCase();
    if (role === 'ADMIN' || role === 'MANAGER') return '/admin/dashboard';
    if (role === 'CASHIER') return '/admin/billing';
    if (role === 'STAFF') return '/admin/orders';
    if (role === 'CAPTAIN') return '/admin/orders';
    if (
      role === 'EXECUTIVE_CHEF' ||
      role === 'CHEF' ||
      role === 'SOUS_CHEF' ||
      role === 'HEAD CHEF (KDS)'
    ) {
      return '/admin/orders';
    }
    return '/admin/orders';
  }

  logout(isExpired = false): void {
    const priorUser = this.currentUser();
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('supabase_auth_token');
    localStorage.removeItem(STAFF_ROLE_KEY);
    localStorage.removeItem(STAFF_USER_KEY);
    this.authEvent$.next({ type: 'LOGOUT', user: priorUser, isExpired });
    if (isExpired) {
      this.router.navigate(['/admin/login'], { queryParams: { expired: 'true' } });
    } else {
      this.router.navigate(['/admin/login']);
    }
  }
}
