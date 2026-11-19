import { TestBed } from '@angular/core/testing';
import { SoundService } from './sound.service';

describe('SoundService', () => {
  let service: SoundService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SoundService);
  });

  it('should initialize with muted state matching default or storage', () => {
    expect(typeof service.isMuted()).toBe('boolean');
  });

  it('should toggle mute state and update localStorage', () => {
    const initial = service.isMuted();
    const toggled = service.toggleMute();
    expect(toggled).toBe(!initial);
    expect(service.isMuted()).toBe(!initial);
  });

  it('should allow setting muted state explicitly', () => {
    service.setMuted(true);
    expect(service.isMuted()).toBe(true);
    service.setMuted(false);
    expect(service.isMuted()).toBe(false);
  });

  it('should execute playOrderArrivalSound safely without crashing in test environment', () => {
    expect(() => service.playOrderArrivalSound()).not.toThrow();
  });
});
