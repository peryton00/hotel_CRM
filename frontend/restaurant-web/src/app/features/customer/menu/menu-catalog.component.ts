import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MockDataService } from '../../../data-access/mock/mock-data.service';
import { CartService } from '../../../core/services/cart.service';
import { ToastService } from '../../../core/services/toast.service';
import { MenuItem, MenuCategory, DietaryType } from '../../../core/models/menu.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { DietaryBadgeComponent } from '../../../shared/components/dietary-badge/dietary-badge.component';
import { FoodCustomizerModalComponent } from '../../../shared/components/food-customizer-modal/food-customizer-modal.component';

@Component({
  selector: 'app-menu-catalog',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    CurrencyInrPipe,
    DietaryBadgeComponent,
    FoodCustomizerModalComponent,
  ],
  template: `
    <div class="menu-catalog-page">
      @if (tableInvalid()) {
        <div class="invalid-table-card" role="alert" aria-live="polite">
          <div class="invalid-icon-badge">
            <i class="ph ph-warning-circle"></i>
          </div>
          <h2 class="invalid-heading">Table Ordering Unavailable</h2>
          <p class="invalid-desc">{{ tableInvalidReason() }}</p>
          <div class="invalid-instructions">
            <i class="ph ph-info"></i>
            <span
              >Please re-scan the QR code printed on your table standee, or notify restaurant staff
              for assistance.</span
            >
          </div>
          <a [routerLink]="['/menu/gurukripa-dhaba']" class="btn btn-secondary retry-btn">
            <i class="ph ph-arrow-left"></i>
            <span>Return to Restaurant Home</span>
          </a>
        </div>
      } @else {
        <!-- Table Dining Greeting Header -->
        <div class="dining-context-header">
          <div class="context-info">
            <div class="table-badge-big">
              <i class="ph ph-fork-knife"></i>
              <span>Table {{ tableNumber() }}</span>
            </div>
            <div class="dining-meta">
              <h1 class="heading-section">Royal Dining Menu</h1>
              <span class="text-xs text-muted"
                >Freshly prepared to order • Scan QR to customize</span
              >
            </div>
          </div>

          <a [routerLink]="['/menu/gurukripa-dhaba/coupons']" class="promo-pill-btn">
            <i class="ph ph-ticket"></i>
            <span>Offers</span>
          </a>
        </div>

        <!-- Search & Dietary Filter Bar -->
        <div class="search-filter-bar">
          <div class="search-box">
            <i class="ph ph-magnifying-glass"></i>
            <input
              type="text"
              class="form-input search-input"
              placeholder="Search for biryani, kebabs, dal makhani..."
              [ngModel]="searchQuery()"
              (ngModelChange)="searchQuery.set($event)"
            />
          </div>

          <div class="dietary-filter-chips">
            <button
              class="diet-chip"
              [class.active]="selectedDietary() === 'ALL'"
              (click)="selectedDietary.set('ALL')"
            >
              All
            </button>
            <button
              class="diet-chip veg"
              [class.active]="selectedDietary() === 'VEG'"
              (click)="selectedDietary.set('VEG')"
            >
              <span class="diet-dot veg"></span> Veg
            </button>
            <button
              class="diet-chip non-veg"
              [class.active]="selectedDietary() === 'NON_VEG'"
              (click)="selectedDietary.set('NON_VEG')"
            >
              <span class="diet-dot non-veg"></span> Non-Veg
            </button>
          </div>
        </div>

        <!-- Sticky Category Navigation Bar -->
        <nav class="sticky-category-nav">
          <div class="cat-nav-inner">
            <button
              class="cat-nav-btn"
              [class.active]="selectedCategoryId() === 'ALL'"
              (click)="selectedCategoryId.set('ALL')"
            >
              All Dishes
            </button>
            @for (cat of categories(); track cat.id) {
              <button
                class="cat-nav-btn"
                [class.active]="selectedCategoryId() === cat.id"
                (click)="selectedCategoryId.set(cat.id)"
              >
                {{ cat.name }}
              </button>
            }
          </div>
        </nav>

        <!-- Food Menu Items List -->
        <div class="dishes-container">
          @for (item of filteredDishes(); track item.id) {
            <div class="food-card" [class.unavailable]="!isItemAvailable(item)">
              <div class="food-details">
                <div class="food-top">
                  <app-dietary-badge [type]="item.dietary"></app-dietary-badge>
                  @if (item.isChefSpecial) {
                    <span class="chef-special-pill"
                      ><i class="ph ph-star-four"></i> Chef Special</span
                    >
                  }
                  @if (getItemStockStatus(item.id) === 'LOW_STOCK') {
                    <span class="low-stock-pill"
                      ><i class="ph ph-warning-circle"></i> Low Stock</span
                    >
                  }
                </div>

                <h2 class="food-title">{{ item.name }}</h2>
                <div class="food-price">{{ item.price | currencyInr }}</div>
                <p class="food-desc">{{ item.description }}</p>

                @if (item.portionSizes || item.variantGroups || item.addonGroups) {
                  <span class="custom-prompt">Customizable</span>
                }
              </div>

              <div class="food-thumb-action">
                <div class="thumb-frame">
                  <img [src]="item.imageUrl" [alt]="item.name" class="food-img" loading="lazy" />
                  @if (!isItemAvailable(item)) {
                    <div class="sold-out-overlay">Sold Out</div>
                  }
                </div>

                @if (isItemAvailable(item)) {
                  <div class="btn-wrap">
                    <button class="add-btn" (click)="handleItemClick(item)">
                      <span>ADD</span>
                      @if (item.portionSizes || item.variantGroups || item.addonGroups) {
                        <i class="ph ph-plus text-xs"></i>
                      }
                    </button>
                    @if (getItemCartCount(item.id); as count) {
                      <span class="count-tag">{{ count }}</span>
                    }
                  </div>
                }
              </div>
            </div>
          } @empty {
            <div class="empty-menu-card">
              <i class="ph ph-magnifying-glass"></i>
              <h3 class="heading-card">No dishes match your filter</h3>
              <p class="text-sm text-muted">
                Try clearing the search query or selecting a different dietary filter.
              </p>
            </div>
          }
        </div>

        <!-- Item Customization Modal -->
        <app-food-customizer-modal
          [isOpen]="isCustomizerOpen"
          [item]="customizingItem"
          (close)="isCustomizerOpen = false"
        ></app-food-customizer-modal>
      }
    </div>
  `,
  styles: [
    `
      .menu-catalog-page {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .invalid-table-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 40px 24px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        margin: 20px 0;
        box-shadow: var(--shadow-sm);
      }

      .invalid-icon-badge {
        width: 64px;
        height: 64px;
        border-radius: var(--radius-full);
        background: var(--color-danger-bg);
        color: var(--color-crimson);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
      }

      .invalid-heading {
        font-family: var(--font-heading);
        font-size: 1.5rem;
        color: var(--color-onyx);
        margin: 0;
      }

      .invalid-desc {
        color: var(--color-text-secondary);
        font-size: 0.9375rem;
        max-width: 440px;
        margin: 0;
      }

      .invalid-instructions {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--color-bone-light);
        padding: 12px 16px;
        border-radius: var(--radius-sm);
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        max-width: 480px;
      }

      .retry-btn {
        margin-top: 8px;
      }

      .dining-context-header {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        box-shadow: var(--shadow-xs);
      }

      .context-info {
        display: flex;
        align-items: center;
        gap: 14px;
      }

      .table-badge-big {
        background: var(--color-crimson);
        color: #ffffff;
        padding: 8px 14px;
        border-radius: var(--radius-sm);
        font-weight: 800;
        font-size: 0.9375rem;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 4px 10px rgba(194, 24, 7, 0.25);
      }

      .promo-pill-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        background: var(--color-gold-subtle);
        border: 1px solid rgba(212, 175, 55, 0.5);
        color: #7d6514;
        font-size: 0.8125rem;
        font-weight: 700;
        padding: 8px 14px;
        border-radius: var(--radius-full);
        transition: background var(--transition-fast);

        &:hover {
          background: #faecc7;
        }
      }

      .search-filter-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .search-box {
        position: relative;
        flex: 1;
        min-width: 240px;

        i {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--color-text-muted);
          font-size: 1.1rem;
        }

        .search-input {
          padding-left: 40px;
          border-radius: var(--radius-full);
        }
      }

      .dietary-filter-chips {
        display: flex;
        gap: 8px;
      }

      .diet-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: var(--radius-full);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        transition: all var(--transition-fast);

        &:hover {
          border-color: var(--color-taupe);
        }
        &.active {
          background: var(--color-onyx);
          color: #ffffff;
          border-color: var(--color-onyx);
        }
      }

      .diet-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        &.veg {
          background: #1b633e;
        }
        &.non-veg {
          background: #a91c12;
        }
      }

      .sticky-category-nav {
        position: sticky;
        top: 68px;
        z-index: 50;
        background: var(--color-background);
        padding: 8px 0;
        border-bottom: 1px solid var(--color-border);
      }

      .cat-nav-inner {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        scrollbar-width: none;
        &::-webkit-scrollbar {
          display: none;
        }
      }

      .cat-nav-btn {
        padding: 8px 14px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-full);
        white-space: nowrap;
        transition: all var(--transition-fast);

        &:hover {
          border-color: var(--color-taupe);
        }
        &.active {
          background: var(--color-crimson);
          color: #ffffff;
          border-color: var(--color-crimson);
          box-shadow: 0 2px 8px rgba(194, 24, 7, 0.2);
        }
      }

      .dishes-container {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .food-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 16px;
        display: flex;
        justify-content: space-between;
        gap: 16px;
        box-shadow: var(--shadow-xs);
        transition: all var(--transition-fast);

        &:hover {
          border-color: var(--color-taupe-light);
          box-shadow: var(--shadow-sm);
        }

        &.unavailable {
          opacity: 0.6;
        }
      }

      .food-details {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .food-top {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 2px;
      }

      .chef-special-pill {
        font-size: 0.6875rem;
        font-weight: 700;
        background: var(--color-gold-subtle);
        border: 1px solid rgba(212, 175, 55, 0.4);
        color: #7d6514;
        padding: 1px 6px;
        border-radius: var(--radius-xs);
        display: flex;
        align-items: center;
        gap: 3px;
      }

      .low-stock-pill {
        font-size: 0.6875rem;
        font-weight: 700;
        background: rgba(245, 158, 11, 0.15);
        border: 1px solid rgba(245, 158, 11, 0.35);
        color: #b45309;
        padding: 1px 6px;
        border-radius: var(--radius-xs);
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }

      .food-title {
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--color-text-primary);
      }

      .food-price {
        font-size: 1rem;
        font-weight: 800;
        color: var(--color-onyx);
        margin-bottom: 4px;
      }

      .food-desc {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .custom-prompt {
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-taupe);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-top: auto;
        padding-top: 6px;
      }

      .food-thumb-action {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 120px;
        flex-shrink: 0;
        position: relative;
      }

      .thumb-frame {
        width: 120px;
        height: 110px;
        border-radius: var(--radius-sm);
        overflow: hidden;
        background: var(--color-bone);
        position: relative;
      }

      .food-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .sold-out-overlay {
        position: absolute;
        inset: 0;
        background: rgba(18, 18, 18, 0.7);
        color: #ffffff;
        font-size: 0.75rem;
        font-weight: 800;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .btn-wrap {
        position: relative;
        margin-top: -16px;
        z-index: 2;
      }

      .add-btn {
        background: #ffffff;
        color: var(--color-crimson);
        border: 1.5px solid var(--color-crimson);
        padding: 6px 20px;
        border-radius: var(--radius-sm);
        font-weight: 800;
        font-size: 0.875rem;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
        display: flex;
        align-items: center;
        gap: 4px;
        transition: all var(--transition-fast);

        &:hover {
          background: var(--color-crimson);
          color: #ffffff;
        }
      }

      .count-tag {
        position: absolute;
        top: -8px;
        right: -8px;
        background: var(--color-onyx);
        color: #ffffff;
        font-size: 0.6875rem;
        font-weight: 700;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #ffffff;
      }

      .empty-menu-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 48px 24px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        i {
          font-size: 2rem;
          color: var(--color-taupe);
        }
      }
    `,
  ],
})
export class MenuCatalogComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private mock = inject(MockDataService);
  private cartService = inject(CartService);
  private toastService = inject(ToastService);

  tableToken = signal<string>('');
  tableNumber = signal<string>('');
  tableInvalid = signal<boolean>(false);
  tableInvalidReason = signal<string>('');

  categories = this.mock.categories;
  menuItems = this.mock.menuItems;

  selectedCategoryId = signal<string>('ALL');
  selectedDietary = signal<'ALL' | 'VEG' | 'NON_VEG'>('ALL');
  searchQuery = signal<string>('');

  isCustomizerOpen = false;
  customizingItem: MenuItem | null = null;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const token = params.get('tableToken');
      if (!token || !token.trim()) {
        this.tableInvalid.set(true);
        this.tableInvalidReason.set(
          'No table QR token provided. Please scan the QR code located on your dining table.',
        );
        this.tableNumber.set('');
        this.cartService.clearTableContext();
        return;
      }

      this.tableToken.set(token);

      // Lookup table by token
      const foundTable = this.mock.tables().find((t) => t.qrToken === token || t.id === token);
      if (!foundTable) {
        this.tableInvalid.set(true);
        this.tableInvalidReason.set(
          'Table QR code is invalid or unrecognized. Please scan a valid table QR code.',
        );
        this.tableNumber.set('');
        this.cartService.clearTableContext();
        return;
      }

      if (foundTable.orderingEnabled === false) {
        this.tableInvalid.set(true);
        this.tableInvalidReason.set(
          `Ordering is currently disabled for Table ${foundTable.number}. Please ask staff for assistance.`,
        );
        this.tableNumber.set(foundTable.number);
        this.cartService.clearTableContext();
        return;
      }

      if (foundTable.status === 'DIRTY') {
        this.tableInvalid.set(true);
        this.tableInvalidReason.set(
          `Table ${foundTable.number} is currently being prepared and cleaned. Ordering is temporarily unavailable.`,
        );
        this.tableNumber.set(foundTable.number);
        this.cartService.clearTableContext();
        return;
      }

      // Valid table context (AVAILABLE, OCCUPIED, RESERVED with orderingEnabled=true)
      this.tableInvalid.set(false);
      this.tableInvalidReason.set('');
      this.tableNumber.set(foundTable.number);
      this.cartService.setTableContext(foundTable.id, foundTable.number, token);
    });
  }

  filteredDishes = computed(() => {
    let list = this.menuItems();

    if (this.selectedCategoryId() !== 'ALL') {
      list = list.filter((m) => m.categoryId === this.selectedCategoryId());
    }

    if (this.selectedDietary() === 'VEG') {
      list = list.filter((m) => m.dietary === 'VEG' || m.dietary === 'VEGAN');
    } else if (this.selectedDietary() === 'NON_VEG') {
      list = list.filter((m) => m.dietary === 'NON_VEG' || m.dietary === 'EGG');
    }

    const q = this.searchQuery().toLowerCase().trim();
    if (q) {
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q),
      );
    }

    return list;
  });

  getItemCartCount(itemId: string): number {
    return this.cartService
      .items()
      .filter((i) => i.menuItemId === itemId)
      .reduce((acc, curr) => acc + curr.quantity, 0);
  }

  isItemAvailable(item: MenuItem): boolean {
    if (item.isAvailable === false) return false;
    const status = this.mock.getMenuItemAvailability(item.id);
    return status !== 'OUT_OF_STOCK';
  }

  getItemStockStatus(itemId: string): string {
    return this.mock.getMenuItemAvailability(itemId);
  }

  handleItemClick(item: MenuItem): void {
    if (this.tableInvalid()) {
      this.toastService.warning('Ordering is unavailable for this table.');
      return;
    }

    if (!this.isItemAvailable(item)) {
      this.toastService.warning(`${item.name} is currently out of stock.`);
      return;
    }

    // If dish has portions, variants or add-ons, open customizer modal
    if (
      (item.portionSizes && item.portionSizes.length > 0) ||
      (item.variantGroups && item.variantGroups.length > 0) ||
      (item.addonGroups && item.addonGroups.length > 0)
    ) {
      this.customizingItem = item;
      this.isCustomizerOpen = true;
    } else {
      // Add standard item directly
      this.cartService.addItem(item, 1);
      this.toastService.success(`Added ${item.name} to tray`);
    }
  }
}
