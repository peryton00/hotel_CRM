import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AdminThemeService } from './admin-theme.service';

describe('AdminThemeService', () => {
  let service: AdminThemeService;

  beforeEach(() => {
    localStorage.clear();
    service = new AdminThemeService();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('initializes with light theme by default if no stored preference', () => {
    expect(service.theme()).toBe('light');
    expect(service.isDark()).toBe(false);
  });

  it('toggles between light and dark themes and updates isDark signal', () => {
    service.toggleTheme();
    expect(service.theme()).toBe('dark');
    expect(service.isDark()).toBe(true);
    expect(localStorage.getItem('hotel_admin_theme')).toBe('dark');

    service.toggleTheme();
    expect(service.theme()).toBe('light');
    expect(service.isDark()).toBe(false);
    expect(localStorage.getItem('hotel_admin_theme')).toBe('light');
  });

  it('loads saved theme preference from localStorage on initialization', () => {
    localStorage.setItem('hotel_admin_theme', 'dark');
    const newService = new AdminThemeService();
    expect(newService.theme()).toBe('dark');
    expect(newService.isDark()).toBe(true);
  });

  it('sets theme explicitly via setTheme', () => {
    service.setTheme('dark');
    expect(service.theme()).toBe('dark');
    expect(service.isDark()).toBe(true);
    expect(localStorage.getItem('hotel_admin_theme')).toBe('dark');

    service.setTheme('light');
    expect(service.theme()).toBe('light');
    expect(service.isDark()).toBe(false);
    expect(localStorage.getItem('hotel_admin_theme')).toBe('light');
  });
});
