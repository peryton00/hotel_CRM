import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';
export type SpinnerColor = 'primary' | 'secondary' | 'white' | 'muted' | 'gold' | 'currentColor';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="spinner-wrapper" [class]="'size-' + size" role="status" [attr.aria-label]="label">
      <svg
        class="spinner-svg"
        [class]="'color-' + color"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        [style.stroke-width]="strokeWidth"
      >
        <circle class="track" cx="12" cy="12" r="9.5" stroke="currentColor" stroke-opacity="0.2" />
        <path
          class="arc"
          d="M12 2.5 A 9.5 9.5 0 0 1 21.5 12"
          stroke="currentColor"
          stroke-linecap="round"
        />
      </svg>
      <span class="sr-only">{{ label }}</span>
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
        line-height: 1;
      }

      .spinner-wrapper {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .size-xs .spinner-svg {
        width: 12px;
        height: 12px;
      }

      .size-sm .spinner-svg {
        width: 16px;
        height: 16px;
      }

      .size-md .spinner-svg {
        width: 24px;
        height: 24px;
      }

      .size-lg .spinner-svg {
        width: 36px;
        height: 36px;
      }

      .spinner-svg {
        animation: spinnerSpin 0.75s linear infinite;
        transform-origin: center;
      }

      .color-primary {
        color: var(--color-crimson, #c21807);
      }

      .color-secondary {
        color: var(--color-text-primary, #121212);
      }

      .color-white {
        color: #ffffff;
      }

      .color-muted {
        color: var(--color-text-muted, #a39181);
      }

      .color-gold {
        color: var(--color-gold, #d4af37);
      }

      .color-currentColor {
        color: currentColor;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      @keyframes spinnerSpin {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .spinner-svg {
          animation: spinnerSpin 2s linear infinite;
        }
      }
    `,
  ],
})
export class LoadingSpinnerComponent {
  @Input() size: SpinnerSize = 'sm';
  @Input() color: SpinnerColor = 'primary';
  @Input() strokeWidth: number = 2.5;
  @Input() label: string = 'Loading...';
}
