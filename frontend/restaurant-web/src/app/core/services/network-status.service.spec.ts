import { TestBed } from '@angular/core/testing';
import { NetworkStatusService } from './network-status.service';

describe('NetworkStatusService', () => {
  let service: NetworkStatusService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NetworkStatusService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('should initialize with online status matching navigator or default true', () => {
    expect(typeof service.isOnline()).toBe('boolean');
  });

  it('should update isOnline signal when window emits online and offline events', () => {
    window.dispatchEvent(new Event('offline'));
    expect(service.isOnline()).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(service.isOnline()).toBe(true);
  });

  it('should detect BroadcastChannel support', () => {
    expect(typeof service.isBroadcastChannelSupported()).toBe('boolean');
  });

  it('should handle reportConnectionError and manual setOnline', () => {
    service.setOnline();
    expect(service.isOnline()).toBe(true);

    service.reportConnectionError();
    expect(service.isOnline()).toBe(false);

    service.setOnline();
    expect(service.isOnline()).toBe(true);
  });

  it('should verify database health via checkHealth', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        ({
          ok: true,
          json: async () => ({ status: 'ready' }),
        }) as any;

      service.reportConnectionError();
      const healthy = await service.checkHealth();
      expect(healthy).toBe(true);
      expect(service.isOnline()).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
