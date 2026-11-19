import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { filter } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class LoadingService {
  private router = inject(Router, { optional: true });
  private destroyRef = inject(DestroyRef);

  // Global Route Navigation State
  readonly isNavigating = signal<boolean>(false);
  readonly navigationProgress = signal<number>(0);

  // Fine-grained Operation Tracker (Operation Key -> Active Count)
  private activeOperations = signal<Record<string, number>>({});

  private navDebounceTimer: any = null;
  private navProgressTimer: any = null;
  private operationTimeouts = new Map<string, any>();

  constructor() {
    this.initRouterListener();

    this.destroyRef.onDestroy(() => {
      this.clearAllTimers();
    });
  }

  private initRouterListener(): void {
    if (!this.router) return;

    this.router.events
      .pipe(
        filter(
          (event) =>
            event instanceof NavigationStart ||
            event instanceof NavigationEnd ||
            event instanceof NavigationCancel ||
            event instanceof NavigationError
        )
      )
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          this.handleNavigationStart();
        } else {
          this.handleNavigationEnd();
        }
      });
  }

  private handleNavigationStart(): void {
    if (this.navDebounceTimer) {
      clearTimeout(this.navDebounceTimer);
    }

    // 80ms debounce prevents flickering on instantaneous route transitions
    this.navDebounceTimer = setTimeout(() => {
      this.isNavigating.set(true);
      this.navigationProgress.set(15);
      this.startProgressSimulation();
    }, 80);
  }

  private handleNavigationEnd(): void {
    if (this.navDebounceTimer) {
      clearTimeout(this.navDebounceTimer);
      this.navDebounceTimer = null;
    }

    if (this.navProgressTimer) {
      clearInterval(this.navProgressTimer);
      this.navProgressTimer = null;
    }

    if (this.isNavigating()) {
      this.navigationProgress.set(100);
      // Brief delay to allow completion bar to reach 100% before fading out
      setTimeout(() => {
        this.isNavigating.set(false);
        this.navigationProgress.set(0);
      }, 180);
    } else {
      this.navigationProgress.set(0);
    }
  }

  private startProgressSimulation(): void {
    if (this.navProgressTimer) {
      clearInterval(this.navProgressTimer);
    }

    // Smoothly increment progress up to 90% while route is resolving
    this.navProgressTimer = setInterval(() => {
      const current = this.navigationProgress();
      if (current < 85) {
        const step = Math.max(1, Math.floor((90 - current) / 6));
        this.navigationProgress.set(current + step);
      }
    }, 120);
  }

  /**
   * Set loading status for a specific operation key.
   * Tracks reference counts to correctly handle concurrent requests.
   */
  setLoading(key: string, loading: boolean): void {
    const current = { ...this.activeOperations() };
    const count = current[key] || 0;

    if (loading) {
      current[key] = count + 1;
      this.setupSafetyTimeout(key);
    } else {
      const updated = Math.max(0, count - 1);
      if (updated === 0) {
        delete current[key];
        this.clearSafetyTimeout(key);
      } else {
        current[key] = updated;
      }
    }

    this.activeOperations.set(current);
  }

  /**
   * Returns a computed boolean signal indicating whether an operation is loading.
   * If key is provided, checks that key specifically.
   * If key is omitted, returns true if ANY operation or route transition is active.
   */
  isLoading(key?: string) {
    if (key) {
      return computed(() => ((this.activeOperations()[key] || 0) > 0));
    }
    return computed(() => {
      const ops = this.activeOperations();
      const hasOps = Object.keys(ops).length > 0;
      return hasOps || this.isNavigating();
    });
  }

  /**
   * Convenience helper to wrap an asynchronous action with automatic loading tracking.
   */
  async withLoading<T>(key: string, task: Promise<T> | (() => Promise<T>)): Promise<T> {
    this.setLoading(key, true);
    try {
      const promise = typeof task === 'function' ? task() : task;
      return await promise;
    } finally {
      this.setLoading(key, false);
    }
  }

  private setupSafetyTimeout(key: string): void {
    this.clearSafetyTimeout(key);
    // Automatic safety timeout to prevent permanent stuck spinners if an unexpected runtime error occurs
    this.operationTimeouts.set(
      key,
      setTimeout(() => {
        const current = { ...this.activeOperations() };
        delete current[key];
        this.activeOperations.set(current);
        this.operationTimeouts.delete(key);
      }, 20000)
    );
  }

  private clearSafetyTimeout(key: string): void {
    if (this.operationTimeouts.has(key)) {
      clearTimeout(this.operationTimeouts.get(key));
      this.operationTimeouts.delete(key);
    }
  }

  private clearAllTimers(): void {
    if (this.navDebounceTimer) clearTimeout(this.navDebounceTimer);
    if (this.navProgressTimer) clearInterval(this.navProgressTimer);
    this.operationTimeouts.forEach((timer) => clearTimeout(timer));
    this.operationTimeouts.clear();
  }
}
