import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';

const AUTH_TOKEN_KEY = 'sb-access-token';
const STAFF_ROLE_KEY = 'staff_role';

@Injectable({
  providedIn: 'root',
})
export class AdminAuthService {
  private router = inject(Router);

  readonly isAuthenticated = signal<boolean>(
    !!(localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem('supabase_auth_token')),
  );
  readonly staffRole = signal<string>(localStorage.getItem(STAFF_ROLE_KEY) || 'MANAGER');

  loginWithToken(token: string, role = 'MANAGER'): void {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(STAFF_ROLE_KEY, role);
    this.isAuthenticated.set(true);
    this.staffRole.set(role);
  }

  login(pinOrToken: string, role = 'MANAGER'): boolean {
    const trimmed = pinOrToken.trim();
    if (!trimmed) return false;

    // Persist real staff session
    this.loginWithToken(trimmed, role);
    return true;
  }

  verifyAdminPassword(passwordOrPin: string): boolean {
    const val = passwordOrPin.trim();
    return val.length >= 4;
  }

  logout(): void {
    this.isAuthenticated.set(false);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem('supabase_auth_token');
    localStorage.removeItem(STAFF_ROLE_KEY);
    this.router.navigate(['/admin/login']);
  }
}
