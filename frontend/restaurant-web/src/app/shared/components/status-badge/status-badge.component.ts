import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="badge" [ngClass]="badgeClass">
      <span class="indicator-dot"></span>
      {{ status }}
    </span>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }
      .indicator-dot {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
    `,
  ],
})
export class StatusBadgeComponent {
  @Input() status: string = '';

  get badgeClass(): string {
    const s = this.status.toUpperCase();
    if (
      [
        'SERVED',
        'COMPLETED',
        'PAID',
        'AVAILABLE',
        'CONFIRMED',
        'ACTIVE',
        'VIP',
        'PUBLISHED',
      ].includes(s)
    ) {
      return 'badge-success';
    }
    if (['PREPARING', 'OCCUPIED', 'SEATED', 'PARTIALLY_PAID', 'PENDING'].includes(s)) {
      return 'badge-warning';
    }
    if (['ACCEPTED', 'INFO', 'RESERVED'].includes(s)) {
      return 'badge-info';
    }
    if (['CANCELLED', 'REFUNDED', 'DIRTY', 'INACTIVE', 'NO_SHOW'].includes(s)) {
      return 'badge-danger';
    }
    return 'badge-outline';
  }
}
