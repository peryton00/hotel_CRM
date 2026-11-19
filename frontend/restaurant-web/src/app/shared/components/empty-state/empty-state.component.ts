import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="empty-state-wrapper"
      [class.compact]="compact()"
      [class.bordered]="bordered()"
      role="status"
    >
      <div class="empty-icon-circle">
        <i class="ph" [class]="icon()"></i>
      </div>

      <div class="empty-content">
        <h3 class="empty-title">{{ title() }}</h3>
        <p class="empty-description">{{ message() }}</p>
      </div>

      @if (actionText()) {
        <div class="empty-actions">
          <button
            type="button"
            class="btn btn-primary empty-action-btn"
            (click)="actionClick.emit()"
          >
            @if (actionIcon()) {
              <i class="ph" [class]="actionIcon()"></i>
            }
            <span>{{ actionText() }}</span>
          </button>

          @if (secondaryActionText()) {
            <button
              type="button"
              class="btn btn-secondary empty-secondary-btn"
              (click)="secondaryActionClick.emit()"
            >
              <span>{{ secondaryActionText() }}</span>
            </button>
          }
        </div>
      }

      <ng-content />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .empty-state-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 48px 24px;
        border-radius: var(--radius-md, 12px);
        background: transparent;
        gap: 16px;

        &.bordered {
          background: var(--color-surface, #ffffff);
          border: 1px dashed var(--color-border, #e5ded4);
        }

        &.compact {
          padding: 24px 16px;
          gap: 12px;

          .empty-icon-circle {
            width: 44px;
            height: 44px;
            font-size: 1.25rem;
          }

          .empty-title {
            font-size: 0.9375rem;
          }

          .empty-description {
            font-size: 0.8125rem;
          }
        }
      }

      .empty-icon-circle {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: var(--color-bone-light, #faf8f4);
        border: 1px solid var(--color-border, #e5ded4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-taupe, #a39181);
        font-size: 1.75rem;
        box-shadow: var(--shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.04));
      }

      .empty-content {
        max-width: 420px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .empty-title {
        font-family: var(--font-ui, inherit);
        font-size: 1.0625rem;
        font-weight: 700;
        color: var(--color-text-primary, #121212);
        margin: 0;
        letter-spacing: -0.01em;
      }

      .empty-description {
        font-size: 0.875rem;
        color: var(--color-text-muted, #78716c);
        line-height: 1.5;
        margin: 0;
      }

      .empty-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 4px;
        flex-wrap: wrap;
        justify-content: center;
      }

      .empty-action-btn {
        padding: 8px 18px;
        font-size: 0.875rem;
      }

      .empty-secondary-btn {
        padding: 8px 16px;
        font-size: 0.875rem;
      }
    `,
  ],
})
export class EmptyStateComponent {
  icon = input<string>('ph-tray');
  title = input<string>('No Data Available');
  message = input<string>('There are currently no records to display.');
  actionText = input<string | undefined>(undefined);
  actionIcon = input<string | undefined>(undefined);
  secondaryActionText = input<string | undefined>(undefined);
  compact = input<boolean>(false);
  bordered = input<boolean>(true);

  actionClick = output<void>();
  secondaryActionClick = output<void>();
}
