import { Injectable, signal, OnDestroy } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class NetworkStatusService implements OnDestroy {
  readonly isOnline = signal<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  readonly isBroadcastChannelSupported = signal<boolean>(
    typeof BroadcastChannel !== 'undefined',
  );

  readonly isChecking = signal<boolean>(false);

  private probeIntervalId: any = null;
  private readonly healthUrl =
    (environment?.apiBaseUrl ? environment.apiBaseUrl.replace(/\/api\/v1\/?$/, '') : 'http://localhost:3000') +
    '/health/ready';

  private readonly onlineHandler = () => {
    this.setOnline();
  };
  private readonly offlineHandler = () => {
    this.isOnline.set(false);
    this.startProbe();
  };

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);

      if (!this.isOnline()) {
        this.startProbe();
      }
    }
  }

  reportConnectionError(): void {
    if (this.isOnline()) {
      this.isOnline.set(false);
      this.startProbe();
    }
  }

  setOnline(): void {
    if (!this.isOnline()) {
      this.isOnline.set(true);
      this.stopProbe();
    }
  }

  async checkHealth(): Promise<boolean> {
    if (typeof window === 'undefined') return true;
    this.isChecking.set(true);
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;

      const res = await fetch(this.healthUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller?.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.status === 'ready' || data?.status === 'alive') {
          this.setOnline();
          this.isChecking.set(false);
          return true;
        }
      }
      this.isOnline.set(false);
      this.isChecking.set(false);
      return false;
    } catch {
      this.isOnline.set(false);
      this.isChecking.set(false);
      return false;
    }
  }

  startProbe(): void {
    if (this.probeIntervalId !== null || typeof window === 'undefined') return;
    // Check every 4 seconds when offline to detect recovery
    this.probeIntervalId = setInterval(() => {
      if (!this.isOnline()) {
        this.checkHealth();
      } else {
        this.stopProbe();
      }
    }, 4000);
  }

  stopProbe(): void {
    if (this.probeIntervalId !== null) {
      clearInterval(this.probeIntervalId);
      this.probeIntervalId = null;
    }
  }

  ngOnDestroy(): void {
    this.stopProbe();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineHandler);
      window.removeEventListener('offline', this.offlineHandler);
    }
  }
}
