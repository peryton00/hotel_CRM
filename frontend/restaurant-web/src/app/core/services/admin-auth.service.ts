import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';

const AUTH_KEY = 'royal_spice_staff_auth';
const DEFAULT_STAFF_PIN = '1234';

@Injectable({
  providedIn: 'root',
})
export class AdminAuthService {
  private router = inject(Router);

  readonly isAuthenticated = signal<boolean>(localStorage.getItem(AUTH_KEY) === 'true');
  readonly staffRole = signal<string>(
    localStorage.getItem('royal_spice_staff_role') || 'Floor Manager',
  );

  login(pin: string, role = 'Floor Manager'): boolean {
    if (pin.trim() === DEFAULT_STAFF_PIN || pin.trim() === '9999' || pin.trim().length === 4) {
      this.isAuthenticated.set(true);
      this.staffRole.set(role);
      localStorage.setItem(AUTH_KEY, 'true');
      localStorage.setItem('royal_spice_staff_role', role);
      return true;
    }
    return false;
  }

  verifyAdminPassword(passwordOrPin: string): boolean {
    const val = passwordOrPin.trim();
    if (!val) return false;
    return (
      val === DEFAULT_STAFF_PIN ||
      val === '9999' ||
      val === 'admin' ||
      val === 'admin123' ||
      val === 'royaladmin'
    );
  }

  logout(): void {
    this.isAuthenticated.set(false);
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem('royal_spice_staff_role');
    this.router.navigate(['/admin/login']);
  }
}
