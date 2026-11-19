import { Injectable, signal } from '@angular/core';

// Compact, pre-rendered 8kHz 8-bit PCM WAV restaurant chime (3 notes: G5 -> B5 -> D6)
// Zero AudioContext allocations, zero Web Audio thread lockups, zero external dependencies
const CHIME_WAV_BASE64 =
  'data:audio/wav;base64,UklGRuQIAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YcAIAAB/mamqm4JoV1RhepSmqp6HbVpUXnSOoqqhjHJdVVxwiZ+po5F4YlZaa4Sap6WVfWZYWWd+lqWmmIJrW1hkepGippyHb15YYXWMn6Wei3RhWV9xh5ukoI95ZVpdbYOXo6GTfmlcXGl+k6GiloJtXlxmeo+eopmGcWFcZHWLm6Kbi3ZkXWJyhpihnY56aF5gboKVn56SfmtgX2t+kZ2flIJvYl9oeo2bn5eGc2RfZnaJmJ6ZindnYGRzhZWdmo17amFjb4GSnJuQf21jYm1+j5qck4JxZWJqeouYnJWGdGdiaHeIlpuWiXhqY2dzhJOamIx8bGRmcYGQmZmPf29mZW59jZiZkYJzZ2VseoqWmZOFdmllaneHk5mUiHlsZml0g5GYlot8bmdocoCOl5aNf3FoaHB9i5WXj4J0amdueomTl5GFd2xobHiGkZaSiHpuaGt1g4+Vk4p9cGlqc4CNlJSMgHNqanF9ipOUjoJ1bGpveoeRlJCFeG5qbniFj5SRh3twa212go2Tkol9cmtsdICLkpKLgHRtbHJ9iZGSjYJ2bmxxe4aPko6EeXBsb3iEjpKPh3txbW52goyRkIh+c21udX+KkJCKgHVubnN9iI+QjIJ4cG5ye4WOkI2EenFucXmDjJCOhnxzbnB3gYqPjoh+dW9vdX+Ijo+JgHZwb3R9h42PioJ4cW9ze4WMj4yEenNvcnmDi46Mhnx0cHF4gYmOjYd+dnFxdn+HjY2IgHdycXWcsqyPbFZYb42gnYlwYmh9lJ6Ue2JYZYOhrqGBXUpTdJu0sZRtUExjh6StnH5jWmaAlpyQemhldIucm4htW11zkqmqk3BUTmGFpbKkg2FQWHSTpqKMcWBjdYyYlINvZm2Clp2SemJaZoGeq6GEZFFWcZOqqpR0W1Zng5uilX5qZG6Ck5WJdmhpeI2cmYduXF5yj6WnlHZbVGOAnamfhWpbYHWOnJmIdGhreoyUjn5tZ3CElpyRe2RbZn+Zpp+HalhbcIyho5J5ZF9sgZOZj31ua3WFkZGFdGhreo6bmYdwX19xi5+jlHpjWmV9laCahnBkZ3eKlZKEdG1xf42Si3tsaHGElpuRfGdeZnyUoZyJcGBgcIeZnI97a2dxgY+SiXtwb3mHkY+Dc2lreo2amIhzY2Fwhpmfk35pYWh7j5mUhXRrbnqIkIyAdG91go6RiXpsaXKDlJqRf2tiaHqPm5mJdWdmcoSSlYx8cG11goyNhXlxcnyJkY6Cc2lseouXl4l2Z2Vwg5SZkYBvZ2x7ipKMfXBrcoCNk41/cWtxfoySjoFzbHB9i5KOgnRsb3uJkY+DdW1veoiRj4V3bm55h5CQhnhubniFj5CHem9udoSOkIh7cG51go2QiXxxbnWBjJCKfnJudICLkIt/c25zfoqQi4B0b3J9iY+MgXVvcnyIj4yDd3Bxe4eOjYR4cHF6ho6NhXlxcXmEjY2GenJxeIOMjYd7cnB3gouOh31zcXaBirGzjl1FV4extZJiSVmEqKyOaFZlh5+bgWdjeJKbi29faoiioINgU2iRrqmDWUpjkbGth1xMYoyrqIdjVmmLoJp/Z2R4kZmKcWRviZ2ZfmFbcZWqnnpYUm6YsKR9WFBrlKyigF5Xbo+imH1lZXmRmIlyZ3GJmZN7ZGJ4lqSVdFlad5yrmnRWVnSaq5t4W1p0lKKVeWNle5KXiHNpc4iVj3poaHyVno5wXGJ/naaRbldefZ6olHFaXnuZopF0Ymd+k5eHcmpzh5ONemttf5OYiG9haoWdn4lqWmWEoKOMbFpkgZygjHBhaYGVl4ZxanSHkox7bXCAkZOEb2ZwiJuYgmhebYqfnYRoXGuInpyGa2FthZeWg29pdYiRi3tvcYCPkIJwanWKl5J9aGN0jp6XfmVgcY2emIBoYnGKmZSAbWp3iZKLe3BygI2NgXJueIqUjXppaXqQmpB5ZWR4kZyTe2Zldo2ZkXxranmLkop6cHOAjIyAc3F6iZCJeGxufpCWinVman2Tmo12Zmh7kZiNeGtxgpGRg3JrdIaSj4BwbHeJko18bm17i5KKeW1vfo2Rh3ZscoGPkIR0bXSEkI6AcW13h5GMfXBueoqRinpvcH2MkId3bnKAjo+EdW50g4+OgXNud4aPjH5xb3qIkIp7cHB8io+HeW9yf4yPhXZvdIKNjYJ0b3eFjox/cnB5h4+KfHFxfImOh3pwc3+LjoV3cHSBjI2CdXB3hI2LgHRxeYaNiX1ycnuIjYd7cnN+io2FeXF1gIuMg3dxd4OMi4B1cnmFjIl+dHJ7h4yHfHNzfYmMhXpydYCKi4N4cneCi4qBdnJ5hIuJf3Vze4aMh3x0dH2Hi4V6c3V/iYuDeXN3gYqKgXdzeYOKiX92dHqFi4d9dXR8houFe3R2foiKhHp0d4CJiYJ4dHmCiYiAd3R6hIqHfnZ1fIaKhXx1dn6HiYR6dXeAiImCeXV5gomIgHh1eoOJh353dXyFiYV9dnZ+homEe3V3f4eIgnp1eYGIiIF4dXqDiId/d3Z8hIiFfXd3fYWIhHx2eH+GiIJ6dnmAh4eBeXZ6goeGf3h2e4OIhX53d32EiIR8d3h+hYeDe3d5gIaHgXp3eoGHhoB5d3uDh4V+eHd9hIeEfXh4foWHg3x3eYCGhoF6d3qBhoaAend7goaFf3l4fYOHhH14eH6EhoN8eHl/hYaCe3h6gIaFgHp4e4KGhX95eHyDhoR+eXl+hIaDfXh5f4SGgnx4eoCFhYF7eHuBhYV/enl8goaEfnl5fYOGg315en6EhYJ8eXqAhIWBe3l7gYWEgHp5fIKFhH96eX2DhYN+eXp+g4WCfXl6f4SFgXx5e4CEhIB7eXyBhYR/enp9goWDfnp6foOFgn16e3+DhIF8enuAhISAe3p8gYSDf3t6fYKEg356en6ChIJ9ent/g4SBfXp7gIOEgHx6fICEg397en2BhIN/e3p+goSCfnp7f4OEgX16e3+Dgw==';

@Injectable({
  providedIn: 'root',
})
export class SoundService {
  readonly isMuted = signal<boolean>(this.loadMutedPreference());

  private audioEl: HTMLAudioElement | null = null;
  private lastPlayedTime = 0;

  constructor() {
    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      try {
        this.audioEl = new Audio(CHIME_WAV_BASE64);
        this.audioEl.preload = 'auto';
        this.audioEl.volume = 0.45;
      } catch {
        // Fallback for restricted environments
      }
    }
  }

  toggleMute(): boolean {
    const next = !this.isMuted();
    this.isMuted.set(next);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('hotel_crm_sound_muted', next ? 'true' : 'false');
      } catch {}
    }
    if (!next) {
      this.playOrderArrivalSound();
    }
    return next;
  }

  setMuted(muted: boolean): void {
    this.isMuted.set(muted);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('hotel_crm_sound_muted', muted ? 'true' : 'false');
      } catch {}
    }
  }

  playOrderArrivalSound(): void {
    if (this.isMuted()) return;
    if (typeof window === 'undefined') return;

    // 1-second debounce prevents overlapping bursts
    const now = Date.now();
    if (now - this.lastPlayedTime < 1000) return;
    this.lastPlayedTime = now;

    try {
      if (!this.audioEl && typeof Audio !== 'undefined') {
        this.audioEl = new Audio(CHIME_WAV_BASE64);
        this.audioEl.preload = 'auto';
        this.audioEl.volume = 0.45;
      }

      if (this.audioEl) {
        this.audioEl.currentTime = 0;
        const playPromise = this.audioEl.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Safe ignore if browser blocks autoplay before first user interaction
          });
        }
      }
    } catch {
      // Audio fallback - never throw or block UI thread
    }
  }

  private loadMutedPreference(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      return localStorage.getItem('hotel_crm_sound_muted') === 'true';
    } catch {
      return false;
    }
  }
}
