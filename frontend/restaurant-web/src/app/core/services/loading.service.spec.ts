import { TestBed } from '@angular/core/testing';
import { Router, NavigationStart, NavigationEnd, NavigationCancel } from '@angular/router';
import { Subject } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  let service: LoadingService;
  let routerEvents$: Subject<any>;
  let mockRouter: any;

  beforeEach(() => {
    vi.useFakeTimers();
    routerEvents$ = new Subject<any>();
    mockRouter = {
      events: routerEvents$.asObservable(),
    };

    TestBed.configureTestingModule({
      providers: [
        LoadingService,
        { provide: Router, useValue: mockRouter },
      ],
    });

    service = TestBed.inject(LoadingService);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    routerEvents$.complete();
  });

  it('should be created and initialized with idle navigation state', () => {
    expect(service).toBeTruthy();
    expect(service.isNavigating()).toBe(false);
    expect(service.navigationProgress()).toBe(0);
  });

  it('should debounce navigation start to avoid flash for instant navigations', () => {
    routerEvents$.next(new NavigationStart(1, '/admin/orders'));
    expect(service.isNavigating()).toBe(false);

    // Instant completion before debounce finishes (e.g. 40ms)
    vi.advanceTimersByTime(40);
    routerEvents$.next(new NavigationEnd(1, '/admin/orders', '/admin/orders'));
    vi.advanceTimersByTime(50);

    expect(service.isNavigating()).toBe(false);
  });

  it('should activate navigation loading and progress for transitions exceeding debounce', () => {
    routerEvents$.next(new NavigationStart(2, '/admin/reports'));
    vi.advanceTimersByTime(90); // past 80ms debounce

    expect(service.isNavigating()).toBe(true);
    expect(service.navigationProgress()).toBeGreaterThanOrEqual(15);

    // Progress increments over time
    vi.advanceTimersByTime(240);
    expect(service.navigationProgress()).toBeGreaterThan(15);

    // Finish navigation
    routerEvents$.next(new NavigationEnd(2, '/admin/reports', '/admin/reports'));
    expect(service.navigationProgress()).toBe(100);

    vi.advanceTimersByTime(200);
    expect(service.isNavigating()).toBe(false);
    expect(service.navigationProgress()).toBe(0);
  });

  it('should handle navigation cancellation gracefully', () => {
    routerEvents$.next(new NavigationStart(3, '/admin/customers'));
    vi.advanceTimersByTime(90);
    expect(service.isNavigating()).toBe(true);

    routerEvents$.next(new NavigationCancel(3, '/admin/customers', 'Guard blocked'));
    expect(service.navigationProgress()).toBe(100);
    vi.advanceTimersByTime(200);
    expect(service.isNavigating()).toBe(false);
  });

  it('should track fine-grained operations with reference counting', () => {
    const isCustomerLoading = service.isLoading('customers');
    expect(isCustomerLoading()).toBe(false);

    service.setLoading('customers', true);
    expect(isCustomerLoading()).toBe(true);

    // Second concurrent request on same key
    service.setLoading('customers', true);
    expect(isCustomerLoading()).toBe(true);

    // First request finishes
    service.setLoading('customers', false);
    expect(isCustomerLoading()).toBe(true);

    // Second request finishes
    service.setLoading('customers', false);
    expect(isCustomerLoading()).toBe(false);
  });

  it('should wrap async operations with withLoading helper', async () => {
    const isSaving = service.isLoading('save-customer');
    expect(isSaving()).toBe(false);

    const promise = service.withLoading('save-customer', async () => {
      expect(isSaving()).toBe(true);
      return 'saved';
    });

    const result = await promise;
    expect(result).toBe('saved');
    expect(isSaving()).toBe(false);
  });
});
