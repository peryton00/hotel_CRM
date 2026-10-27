import { Injectable, signal } from '@angular/core';

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

  show(
    message: string,
    type: 'success' | 'warning' | 'error' | 'info' = 'info',
    title?: string,
  ): void {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const toast: ToastMessage = { id, type, title, message };
    this.toasts.set([...this.toasts(), toast]);

    setTimeout(() => {
      this.dismiss(id);
    }, 4000);
  }

  success(message: string, title?: string): void {
    this.show(message, 'success', title || 'Success');
  }

  error(message: string, title?: string): void {
    this.show(message, 'error', title || 'Action Notice');
  }

  warning(message: string, title?: string): void {
    this.show(message, 'warning', title || 'Notice');
  }

  info(message: string, title?: string): void {
    this.show(message, 'info', title || 'Information');
  }

  dismiss(id: string): void {
    this.toasts.set(this.toasts().filter((t) => t.id !== id));
  }
}
