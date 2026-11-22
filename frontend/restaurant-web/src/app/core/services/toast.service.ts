import { Injectable, signal } from '@angular/core';
import { dynaura, createToaster, type ToastOptions, type ToasterHandle } from 'dynaura/vanilla';

export interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title?: string;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  readonly toasts = signal<ToastMessage[]>([]);
  private toasterHandle: ToasterHandle | null = null;

  constructor() {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        this.toasterHandle = createToaster({
          position: 'top',
          theme: 'dark',
          offset: 16,
          timer: true,
          swipe: 'edge',
        });
      } catch {
        // Fallback or SSR environment
      }
    }
  }

  show(
    message: string,
    type: 'success' | 'warning' | 'error' | 'info' = 'info',
    title?: string,
    options?: Partial<ToastOptions>,
  ): string {
    const id = options?.id || `toast-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const toast: ToastMessage = { id, type, title, message };
    this.toasts.set([...this.toasts(), toast]);

    const titleText =
      title ||
      (type === 'success'
        ? 'Success'
        : type === 'error'
          ? 'Notice'
          : type === 'warning'
            ? 'Warning'
            : 'Information');

    try {
      dynaura[type]({
        id,
        title: titleText,
        description: message,
        duration: options?.duration !== undefined ? options.duration : 4000,
        button: options?.button,
        secondaryButton: options?.secondaryButton,
        variant: options?.variant,
        ...options,
        onDismiss: (reason) => {
          this.toasts.set(this.toasts().filter((t) => t.id !== id));
          options?.onDismiss?.(reason);
        },
      });
    } catch {
      // If dynaura DOM is not mounted yet, ensure auto-dismiss in memory
      setTimeout(() => {
        this.dismiss(id);
      }, 4000);
    }

    return id;
  }

  success(message: string, title?: string, options?: Partial<ToastOptions>): string {
    return this.show(message, 'success', title || 'Success', options);
  }

  error(message: string, title?: string, options?: Partial<ToastOptions>): string {
    return this.show(message, 'error', title || 'Action Notice', options);
  }

  warning(message: string, title?: string, options?: Partial<ToastOptions>): string {
    return this.show(message, 'warning', title || 'Notice', options);
  }

  info(message: string, title?: string, options?: Partial<ToastOptions>): string {
    return this.show(message, 'info', title || 'Information', options);
  }

  loading(title: string, description?: string, options?: Partial<ToastOptions>): string {
    try {
      return dynaura.loading({
        title,
        description,
        ...options,
      });
    } catch {
      return '';
    }
  }

  live(title: string, options?: Partial<ToastOptions>): string {
    try {
      return dynaura.live({
        title,
        ...options,
      });
    } catch {
      return '';
    }
  }

  update(id: string, patch: Partial<ToastOptions>): void {
    try {
      dynaura.update(id, patch);
    } catch {
      // ignored
    }
  }

  dismiss(id?: string): void {
    if (id) {
      this.toasts.set(this.toasts().filter((t) => t.id !== id));
      try {
        dynaura.dismiss(id);
      } catch {
        // ignored
      }
    } else {
      this.toasts.set([]);
      try {
        dynaura.dismiss();
      } catch {
        // ignored
      }
    }
  }
}
