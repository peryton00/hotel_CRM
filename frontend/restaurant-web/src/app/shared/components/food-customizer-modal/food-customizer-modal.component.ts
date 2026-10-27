import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuItem, PortionSize, VariantOption, AddonOption } from '../../../core/models/menu.model';
import { SelectedVariant, SelectedAddon } from '../../../core/models/order.model';
import { CurrencyInrPipe } from '../../pipes/currency-inr.pipe';
import { DietaryBadgeComponent } from '../dietary-badge/dietary-badge.component';
import { CartService } from '../../../core/services/cart.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-food-customizer-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyInrPipe, DietaryBadgeComponent],
  template: `
    @if (isOpen && item) {
      <div class="modal-overlay" (click)="onBackdropClick($event)">
        <div class="modal-card customizer-card" role="dialog" aria-modal="true">
          <div class="customizer-header">
            <div class="item-meta">
              <div class="title-row">
                <app-dietary-badge [type]="item.dietary"></app-dietary-badge>
                <h3 class="item-name">{{ item.name }}</h3>
              </div>
              <div class="item-price">{{ calculatedUnitPrice | currencyInr }}</div>
            </div>
            <button class="close-btn" (click)="close.emit()" aria-label="Close modal">
              <i class="ph ph-x"></i>
            </button>
          </div>

          <div class="customizer-body">
            @if (item.imageUrl) {
              <div class="customizer-img-wrap">
                <img [src]="item.imageUrl" [alt]="item.name" class="customizer-img" />
              </div>
            }

            <p class="item-desc">{{ item.description }}</p>

            <!-- Portion Sizes (if configured) -->
            @if (item.portionSizes && item.portionSizes.length > 0) {
              <div class="custom-section">
                <div class="section-title">
                  Select Portion <span class="required-tag">Required</span>
                </div>
                <div class="options-list">
                  @for (portion of item.portionSizes; track portion.label) {
                    <label class="option-label radio-label">
                      <input
                        type="radio"
                        name="portionGroup"
                        [checked]="selectedPortion?.label === portion.label"
                        (change)="selectPortion(portion)"
                      />
                      <span class="option-name">{{ portion.label }}</span>
                      <span class="option-price">{{ portion.price | currencyInr }}</span>
                    </label>
                  }
                </div>
              </div>
            }

            <!-- Variant Groups (e.g. Spice Level) -->
            @if (item.variantGroups && item.variantGroups.length > 0) {
              @for (grp of item.variantGroups; track grp.id) {
                <div class="custom-section">
                  <div class="section-title">
                    {{ grp.name }}
                    @if (grp.required) {
                      <span class="required-tag">Required</span>
                    }
                  </div>
                  <div class="options-list">
                    @for (opt of grp.options; track opt.id) {
                      <label class="option-label radio-label">
                        <input
                          type="radio"
                          [name]="grp.id"
                          [checked]="isVariantSelected(grp.name, opt.name)"
                          (change)="selectVariant(grp.name, opt)"
                        />
                        <span class="option-name">{{ opt.name }}</span>
                        @if (opt.priceDelta > 0) {
                          <span class="option-delta">+{{ opt.priceDelta | currencyInr }}</span>
                        }
                      </label>
                    }
                  </div>
                </div>
              }
            }

            <!-- Addon Groups (e.g. Dips, Raita, Extra Butter) -->
            @if (item.addonGroups && item.addonGroups.length > 0) {
              @for (grp of item.addonGroups; track grp.id) {
                <div class="custom-section">
                  <div class="section-title">
                    {{ grp.name }} <span class="optional-tag">Optional</span>
                  </div>
                  <div class="options-list">
                    @for (addon of grp.options; track addon.id) {
                      <label class="option-label checkbox-label">
                        <input
                          type="checkbox"
                          [checked]="isAddonSelected(addon.name)"
                          (change)="toggleAddon(addon)"
                        />
                        <span class="option-name">{{ addon.name }}</span>
                        <span class="option-delta">+{{ addon.priceDelta | currencyInr }}</span>
                      </label>
                    }
                  </div>
                </div>
              }
            }

            <!-- Special Cooking Request -->
            <div class="custom-section">
              <label class="section-title" for="specialInstructions"
                >Special Instructions (Optional)</label
              >
              <textarea
                id="specialInstructions"
                class="form-textarea"
                rows="2"
                placeholder="E.g., Less spicy, no coriander, extra hot..."
                [(ngModel)]="specialInstructions"
              ></textarea>
            </div>
          </div>

          <div class="customizer-footer">
            <div class="qty-picker">
              <button class="qty-btn" (click)="decreaseQty()" [disabled]="quantity <= 1">
                <i class="ph ph-minus"></i>
              </button>
              <span class="qty-value">{{ quantity }}</span>
              <button class="qty-btn" (click)="increaseQty()">
                <i class="ph ph-plus"></i>
              </button>
            </div>

            <button
              class="btn btn-primary add-tray-btn"
              [disabled]="!isFormValid"
              (click)="addToCart()"
            >
              <span>Add to Tray</span>
              <span class="total-pill">{{ calculatedUnitPrice * quantity | currencyInr }}</span>
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .customizer-card {
        max-width: 520px;
        display: flex;
        flex-direction: column;
      }

      .customizer-header {
        padding: 18px 20px;
        border-bottom: 1px solid var(--color-border);
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        position: sticky;
        top: 0;
        background: var(--color-surface);
        z-index: 10;
      }

      .title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }

      .item-name {
        font-size: 1.125rem;
        font-weight: 700;
      }

      .item-price {
        font-size: 1rem;
        font-weight: 700;
        color: var(--color-crimson);
      }

      .close-btn {
        font-size: 1.35rem;
        color: var(--color-text-muted);
        padding: 4px;
        &:hover {
          color: var(--color-onyx);
        }
      }

      .customizer-body {
        padding: 20px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .customizer-img-wrap {
        width: 100%;
        height: 180px;
        border-radius: var(--radius-md);
        overflow: hidden;
        background: var(--color-bone);
      }

      .customizer-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .item-desc {
        font-size: 0.875rem;
        color: var(--color-text-secondary);
        line-height: 1.45;
      }

      .custom-section {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-sm);
        padding: 14px 16px;
      }

      .section-title {
        font-size: 0.8125rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .required-tag {
        background: var(--color-danger-bg);
        color: var(--color-danger);
        font-size: 0.6875rem;
        padding: 2px 6px;
        border-radius: var(--radius-xs);
        font-weight: 700;
      }

      .optional-tag {
        background: var(--color-bone-dark);
        color: var(--color-text-muted);
        font-size: 0.6875rem;
        padding: 2px 6px;
        border-radius: var(--radius-xs);
      }

      .options-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .option-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        font-size: 0.875rem;
        padding: 6px 0;

        input {
          margin-right: 10px;
          accent-color: var(--color-crimson);
        }
      }

      .option-name {
        flex: 1;
        color: var(--color-text-primary);
      }

      .option-price,
      .option-delta {
        font-weight: 600;
        color: var(--color-text-secondary);
        font-size: 0.8125rem;
      }

      .customizer-footer {
        padding: 16px 20px;
        border-top: 1px solid var(--color-border);
        background: var(--color-surface);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        position: sticky;
        bottom: 0;
        z-index: 10;
      }

      .qty-picker {
        display: flex;
        align-items: center;
        background: var(--color-bone);
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        overflow: hidden;
      }

      .qty-btn {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-onyx);
        font-size: 0.9rem;
        &:hover:not(:disabled) {
          background: var(--color-bone-dark);
        }
        &:disabled {
          opacity: 0.4;
        }
      }

      .qty-value {
        width: 32px;
        text-align: center;
        font-weight: 700;
        font-size: 0.9375rem;
      }

      .add-tray-btn {
        flex: 1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 18px;
      }

      .total-pill {
        background: rgba(255, 255, 255, 0.2);
        padding: 2px 8px;
        border-radius: var(--radius-xs);
        font-weight: 700;
      }
    `,
  ],
})
export class FoodCustomizerModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() item: MenuItem | null = null;
  @Output() close = new EventEmitter<void>();

  private cartService = inject(CartService);
  private toastService = inject(ToastService);

  quantity = 1;
  selectedPortion: PortionSize | null = null;
  selectedVariants: { [groupName: string]: VariantOption } = {};
  selectedAddons: AddonOption[] = [];
  specialInstructions = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['item'] && this.item) {
      this.resetSelection();
    }
  }

  private resetSelection(): void {
    this.quantity = 1;
    this.specialInstructions = '';
    this.selectedAddons = [];
    this.selectedVariants = {};

    if (this.item?.portionSizes && this.item.portionSizes.length > 0) {
      this.selectedPortion = this.item.portionSizes[0];
    } else {
      this.selectedPortion = null;
    }

    if (this.item?.variantGroups) {
      for (const grp of this.item.variantGroups) {
        if (grp.required && grp.options.length > 0) {
          this.selectedVariants[grp.name] = grp.options[0];
        }
      }
    }
  }

  selectPortion(portion: PortionSize): void {
    this.selectedPortion = portion;
  }

  selectVariant(groupName: string, option: VariantOption): void {
    this.selectedVariants[groupName] = option;
  }

  isVariantSelected(groupName: string, optionName: string): boolean {
    return this.selectedVariants[groupName]?.name === optionName;
  }

  toggleAddon(addon: AddonOption): void {
    const idx = this.selectedAddons.findIndex((a) => a.name === addon.name);
    if (idx > -1) {
      this.selectedAddons.splice(idx, 1);
    } else {
      this.selectedAddons.push(addon);
    }
  }

  isAddonSelected(addonName: string): boolean {
    return this.selectedAddons.some((a) => a.name === addonName);
  }

  increaseQty(): void {
    this.quantity++;
  }

  decreaseQty(): void {
    if (this.quantity > 1) this.quantity--;
  }

  get calculatedUnitPrice(): number {
    if (!this.item) return 0;
    let price = this.selectedPortion ? this.selectedPortion.price : this.item.price;
    for (const key of Object.keys(this.selectedVariants)) {
      price += this.selectedVariants[key].priceDelta;
    }
    for (const addon of this.selectedAddons) {
      price += addon.priceDelta;
    }
    return price;
  }

  get isFormValid(): boolean {
    if (!this.item) return false;
    if (this.item.variantGroups) {
      for (const grp of this.item.variantGroups) {
        if (grp.required && !this.selectedVariants[grp.name]) {
          return false;
        }
      }
    }
    return true;
  }

  addToCart(): void {
    if (!this.item || !this.isFormValid) return;

    const variants: SelectedVariant[] = Object.keys(this.selectedVariants).map((k) => ({
      groupName: k,
      optionName: this.selectedVariants[k].name,
      priceDelta: this.selectedVariants[k].priceDelta,
    }));

    const addons: SelectedAddon[] = this.selectedAddons.map((a) => ({
      name: a.name,
      priceDelta: a.priceDelta,
    }));

    this.cartService.addItem(
      this.item,
      this.quantity,
      this.selectedPortion || undefined,
      variants,
      addons,
      this.specialInstructions.trim() || undefined,
    );

    this.toastService.success(`Added ${this.quantity} × ${this.item.name} to Tray`);
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.close.emit();
    }
  }
}
