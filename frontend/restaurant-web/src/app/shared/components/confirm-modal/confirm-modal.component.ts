import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen) {
      <div class="modal-overlay" (click)="onBackdropClick($event)">
        <div class="modal-card confirm-card" role="dialog" aria-modal="true">
          <div class="confirm-header">
            <div class="confirm-icon" [class.danger]="isDanger">
              <i class="ph" [class.ph-warning-octagon]="isDanger" [class.ph-info]="!isDanger"></i>
            </div>
            <div>
              <h3 class="confirm-title">{{ title }}</h3>
              <p class="confirm-message">{{ message }}</p>
            </div>
          </div>
          <div class="confirm-actions">
            <button class="btn btn-secondary" (click)="cancel.emit()">{{ cancelText }}</button>
            <button
              class="btn"
              [class.btn-danger]="isDanger"
              [class.btn-primary]="!isDanger"
              (click)="confirm.emit()"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .confirm-card {
        max-width: 440px;
        padding: 24px;
      }

      .confirm-header {
        display: flex;
        gap: 16px;
        margin-bottom: 24px;
      }

      .confirm-icon {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--color-info-bg);
        color: var(--color-info);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;

        &.danger {
          background: var(--color-danger-bg);
          color: var(--color-danger);
        }
      }

      .confirm-title {
        font-size: 1.125rem;
        font-weight: 700;
        margin-bottom: 6px;
      }

      .confirm-message {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        line-height: 1.45;
      }

      .confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }
    `,
  ],
})
export class ConfirmModalComponent {
  @Input() isOpen = false;
  @Input() title = 'Confirm Action';
  @Input() message = 'Are you sure you want to proceed?';
  @Input() confirmText = 'Confirm';
  @Input() cancelText = 'Cancel';
  @Input() isDanger = true;

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.cancel.emit();
    }
  }
}
