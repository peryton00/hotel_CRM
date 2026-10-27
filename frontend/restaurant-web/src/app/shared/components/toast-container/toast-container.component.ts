import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-stack" aria-live="polite" aria-atomic="true">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast-item {{ toast.type }}" role="alert">
          <div class="toast-content">
            @if (toast.title) {
              <div class="toast-title">{{ toast.title }}</div>
            }
            <div class="toast-msg">{{ toast.message }}</div>
          </div>
          <button
            class="toast-close"
            (click)="toastService.dismiss(toast.id)"
            aria-label="Close notification"
          >
            <i class="ph ph-x"></i>
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .toast-stack {
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-width: 380px;
        width: calc(100vw - 48px);
        pointer-events: none;
      }

      .toast-item {
        pointer-events: auto;
        background: var(--color-surface);
        border-radius: var(--radius-sm);
        padding: 12px 16px;
        box-shadow: var(--shadow-lg);
        border-left: 4px solid var(--color-primary);
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        animation: slideIn 0.25s ease-out;

        &.success {
          border-left-color: var(--color-success);
          .toast-title {
            color: var(--color-success);
          }
        }
        &.warning {
          border-left-color: var(--color-warning);
          .toast-title {
            color: var(--color-warning);
          }
        }
        &.error {
          border-left-color: var(--color-danger);
          .toast-title {
            color: var(--color-danger);
          }
        }
        &.info {
          border-left-color: var(--color-info);
          .toast-title {
            color: var(--color-info);
          }
        }
      }

      .toast-content {
        flex: 1;
      }

      .toast-title {
        font-size: 0.875rem;
        font-weight: 700;
        margin-bottom: 2px;
      }

      .toast-msg {
        font-size: 0.8125rem;
        color: var(--color-text-primary);
        line-height: 1.4;
      }

      .toast-close {
        color: var(--color-text-muted);
        font-size: 1.1rem;
        padding: 2px;
        transition: color var(--transition-fast);
        &:hover {
          color: var(--color-onyx);
        }
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateX(20px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `,
  ],
})
export class ToastContainerComponent {
  toastService = inject(ToastService);
}
