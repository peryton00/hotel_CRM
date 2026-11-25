import { Injectable, signal, OnDestroy } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class NetworkStatusService implements OnDestroy {
  readonly isOnline = signal<boolean>(environment.isDesktop || typeof navigator === 'undefined' || navigator.onLine);

  readonly networkConnected = signal(typeof navigator === 'undefined' || navigator.onLine);

  readonly isBroadcastChannelSupported = signal<boolean>(typeof BroadcastChannel !== 'undefined');

  readonly isChecking = signal<boolean>(false);

  private linkInterval?: ReturnType<typeof setInterval>;
  private readonly refreshLink = () => {
    if (navigator.onLine !== this.networkConnected()) {
      if (navigator.onLine) this.onlineHandler();
      else this.offlineHandler();
    }
  };

  private probeIntervalId: any = null;
  private readonly healthUrl =
    (environment?.apiBaseUrl
      ? environment.apiBaseUrl.replace(/\/api\/v1\/?$/, '')
      : 'http://localhost:3000') + '/health/ready';

  private readonly onlineHandler = () => {
    this.networkConnected.set(true);
    void this.checkHealth();
  };
  private readonly offlineHandler = () => {
    this.networkConnected.set(false);
    if (environment.isDesktop) {
      void this.checkHealth();
      return;
    }
    this.isOnline.set(false);
    this.startProbe();
  };

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onlineHandler);
      window.addEventListener('offline', this.offlineHandler);
      window.addEventListener('focus', this.refreshLink);
      if (environment.isDesktop) this.linkInterval = setInterval(this.refreshLink, 4000);

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
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;

      const res = await fetch(this.healthUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller?.signal,
      });

      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.status === 'ready' || data?.status === 'alive' || (data?.status === 'ok' && data.database === 'sqlite')) {
          this.setOnline();
          return true;
        }
      }
      this.reportConnectionError();
      this.startProbe();
      return false;
    } catch {
      this.reportConnectionError();
      this.startProbe();
      return false;
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
      this.isChecking.set(false);
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
      window.removeEventListener('focus', this.refreshLink);
      clearInterval(this.linkInterval);
    }
  }
}
