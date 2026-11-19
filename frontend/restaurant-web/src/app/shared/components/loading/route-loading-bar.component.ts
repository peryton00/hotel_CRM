import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoadingService } from '../../../core/services/loading.service';

@Component({
  selector: 'app-route-loading-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (loadingService.isNavigating()) {
      <div
        class="route-loading-container"
        role="progressbar"
        [attr.aria-valuenow]="loadingService.navigationProgress()"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Page loading"
      >
        <div
          class="route-loading-bar"
          [style.width.%]="loadingService.navigationProgress()"
        >
          <div class="glow-effect"></div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .route-loading-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 3px;
        z-index: 999999;
        pointer-events: none;
        background: transparent;
        overflow: hidden;
      }

      .route-loading-bar {
        height: 100%;
        background: var(--loading-bar-gradient, linear-gradient(90deg, #c21807 0%, #d4af37 50%, #c21807 100%));
        transition: width 150ms cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        box-shadow: 0 0 10px rgba(194, 24, 7, 0.6), 0 0 5px rgba(212, 175, 55, 0.5);
      }

      .glow-effect {
        position: absolute;
        right: 0;
        top: -2px;
        width: 100px;
        height: 7px;
        opacity: 0.8;
        transform: rotate(3deg);
        background: radial-gradient(circle, #ffffff 10%, rgba(212, 175, 55, 0) 80%);
      }

      @media (prefers-reduced-motion: reduce) {
        .route-loading-bar {
          transition: none;
        }
      }
    `,
  ],
})
export class RouteLoadingBarComponent {
  readonly loadingService = inject(LoadingService);
}
