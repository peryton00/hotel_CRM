import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DietaryType } from '../../../core/models/menu.model';

@Component({
  selector: 'app-dietary-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="dietary-badge"
      [class.veg]="type === 'VEG'"
      [class.non-veg]="type === 'NON_VEG'"
      [class.egg]="type === 'EGG'"
      [class.vegan]="type === 'VEGAN'"
      [attr.aria-label]="label"
      [title]="label"
    ></span>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        vertical-align: middle;
      }
    `,
  ],
})
export class DietaryBadgeComponent {
  @Input() type: DietaryType = 'VEG';

  get label(): string {
    switch (this.type) {
      case 'VEG':
        return 'Vegetarian';
      case 'NON_VEG':
        return 'Non-Vegetarian';
      case 'EGG':
        return 'Contains Egg';
      case 'VEGAN':
        return 'Vegan';
      default:
        return 'Food';
    }
  }
}
