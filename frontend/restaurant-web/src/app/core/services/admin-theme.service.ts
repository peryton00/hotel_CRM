import { Injectable, signal } from '@angular/core';

export type AdminTheme = 'light' | 'dark';

@Injectable({
  providedIn: 'root',
})
export class AdminThemeService {
  private readonly STORAGE_KEY = 'hotel_admin_theme';

  readonly theme = signal<AdminTheme>(this.getInitialTheme());
  readonly isDark = signal<boolean>(this.theme() === 'dark');

  toggleTheme(): void {
    const nextTheme: AdminTheme = this.theme() === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
  }

  setTheme(newTheme: AdminTheme): void {
    this.theme.set(newTheme);
    this.isDark.set(newTheme === 'dark');
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(this.STORAGE_KEY, newTheme);
      } catch {
        // Defensive localStorage fallback
      }
    }
  }

  private getInitialTheme(): AdminTheme {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved === 'dark' || saved === 'light') {
          return saved;
        }
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          return 'dark';
        }
      } catch {
        return 'light';
      }
    }
    return 'light';
  }
}
