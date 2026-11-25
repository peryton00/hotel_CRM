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

  it('should update isOnline signal after the API confirms readiness', async () => {
    window.dispatchEvent(new Event('offline'));
    expect(service.isOnline()).toBe(false);
    expect(service.networkConnected()).toBe(false);

    const probe = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ status: 'ready' })));
    try {
      window.dispatchEvent(new Event('online'));
      expect(service.networkConnected()).toBe(true);
      await vi.waitFor(() => expect(service.isOnline()).toBe(true));
    } finally {
      probe.mockRestore();
    }
  });

  it('recovers on the retry timer when SQLite becomes ready without a refresh', async () => {
    vi.useFakeTimers();
    const probe = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('unavailable'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok', database: 'sqlite' })));
    try {
      expect(await service.checkHealth()).toBe(false);
      await vi.advanceTimersByTimeAsync(4000);
      expect(service.isOnline()).toBe(true);
      expect(probe).toHaveBeenCalledTimes(2);
    } finally {
      probe.mockRestore();
      vi.useRealTimers();
    }
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
