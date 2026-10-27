import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { MenuCategory, MenuItem, DietaryType } from '../../../core/models/menu.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { DietaryBadgeComponent } from '../../../shared/components/dietary-badge/dietary-badge.component';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-menu-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CurrencyInrPipe,
    DietaryBadgeComponent,
    ConfirmModalComponent,
  ],
  template: `
    <div class="menu-mgmt-page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="heading-display">Menu Catalog Management</h1>
          <p class="text-muted">
            Curate culinary recipes, portions, variants, pricing, and live inventory availability.
          </p>
        </div>

        <div class="header-actions">
          <button class="btn btn-secondary" (click)="openAddCategoryModal()">
            <i class="ph ph-folder-plus"></i>
            <span>Add Category</span>
          </button>
          <button class="btn btn-primary" (click)="openAddItemModal()">
            <i class="ph ph-plus-circle"></i>
            <span>Add Dish</span>
          </button>
        </div>
      </div>

      <!-- Categories & Search Toolbar -->
      <div class="toolbar-card">
        <div class="category-tabs-scroll">
          <button
            class="cat-tab"
            [class.active]="selectedCategoryId() === 'ALL'"
            (click)="selectedCategoryId.set('ALL')"
          >
            All Items ({{ menuItems().length }})
          </button>
          @for (cat of categories(); track cat.id) {
            <button
              class="cat-tab"
              [class.active]="selectedCategoryId() === cat.id"
              (click)="selectedCategoryId.set(cat.id)"
            >
              {{ cat.name }}
            </button>
          }
        </div>

        <div class="search-input-wrap">
          <i class="ph ph-magnifying-glass"></i>
          <input
            type="text"
            class="form-input"
            placeholder="Search dish by name or keyword..."
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)"
          />
        </div>
      </div>

      <!-- Dish Cards Grid -->
      <div class="menu-items-grid">
        @for (item of filteredMenuItems(); track item.id) {
          <div
            class="dish-card"
            [class.manually-disabled]="!item.isAvailable"
            [class.out-of-stock]="item.isAvailable && getItemStatus(item).code === 'OUT_OF_STOCK'"
            [class.low-stock]="item.isAvailable && getItemStatus(item).code === 'LOW_STOCK'"
          >
            <div class="dish-thumb-wrap">
              <img [src]="item.imageUrl" [alt]="item.name" class="dish-img" loading="lazy" />
              <div class="dish-badges">
                <app-dietary-badge [type]="item.dietary"></app-dietary-badge>
                @if (item.isChefSpecial) {
                  <span class="badge badge-gold"><i class="ph ph-star-four"></i> Chef Special</span>
                }
              </div>
              @if (!item.isAvailable) {
                <div class="stock-overlay disabled-overlay">
                  <i class="ph ph-prohibit" aria-hidden="true"></i>
                  <span>Manually Disabled</span>
                </div>
              } @else if (getItemStatus(item).code === 'OUT_OF_STOCK') {
                <div class="stock-overlay out-of-stock-overlay">
                  <i class="ph ph-x-circle" aria-hidden="true"></i>
                  <span>Out of Stock</span>
                </div>
              }
            </div>

            <div class="dish-content">
              <div class="dish-header-row">
                <h3 class="dish-title">{{ item.name }}</h3>
                <span class="dish-price">{{ item.price | currencyInr }}</span>
              </div>

              <!-- Live Inventory Availability Badge -->
              <div class="inventory-status-wrap">
                <span
                  class="inventory-status-pill {{ getItemStatus(item).cssClass }}"
                  [attr.aria-label]="'Inventory status: ' + getItemStatus(item).label"
                >
                  <i class="ph {{ getItemStatus(item).icon }}" aria-hidden="true"></i>
                  <span>{{ getItemStatus(item).label }}</span>
                </span>
              </div>

              <p class="dish-desc">{{ item.description }}</p>

              <div class="dish-meta">
                <span class="meta-tag"
                  ><i class="ph ph-clock"></i> {{ item.prepTimeMinutes }} mins</span
                >
                @if (item.portionSizes && item.portionSizes.length > 0) {
                  <span class="meta-tag"><i class="ph ph-arrows-out-simple"></i> Portions</span>
                }
                @if (item.variantGroups && item.variantGroups.length > 0) {
                  <span class="meta-tag"><i class="ph ph-sliders"></i> Variants</span>
                }
              </div>
            </div>

            <div class="dish-footer-actions">
              <button
                class="btn btn-sm"
                [class.btn-success]="item.isAvailable"
                [class.btn-secondary]="!item.isAvailable"
                (click)="toggleAvailability(item)"
                [attr.aria-label]="
                  item.isAvailable ? 'Disable ' + item.name : 'Enable ' + item.name
                "
              >
                <i
                  class="ph"
                  [class.ph-check-circle]="item.isAvailable"
                  [class.ph-prohibit]="!item.isAvailable"
                ></i>
                <span>{{ item.isAvailable ? 'Active' : 'Disabled' }}</span>
              </button>

              <button
                class="btn btn-secondary btn-sm"
                (click)="openEditItemModal(item)"
                title="Edit Recipe & Pricing"
              >
                <i class="ph ph-pencil-simple"></i>
              </button>

              <button
                class="btn btn-secondary btn-sm btn-icon-danger"
                (click)="confirmDeleteItem(item)"
                title="Delete Dish"
              >
                <i class="ph ph-trash"></i>
              </button>
            </div>
          </div>
        } @empty {
          <div class="empty-state-panel">
            <i class="ph ph-fork-knife empty-icon"></i>
            <h3 class="heading-card">No dishes found in this category</h3>
            <p class="text-muted">
              Try selecting another category or add a new recipe to this section.
            </p>
          </div>
        }
      </div>

      <!-- Add / Edit Dish Modal -->
      @if (showItemModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card dish-form-modal" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card">
                {{ editingItem ? 'Edit Culinary Recipe' : 'Add New Dish' }}
              </h3>
              <button class="close-btn" (click)="showItemModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Dish Name *</label>
                  <input
                    type="text"
                    class="form-input"
                    placeholder="e.g. Kakori Kebab"
                    [(ngModel)]="itemForm.name"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">Category *</label>
                  <select class="form-select" [(ngModel)]="itemForm.categoryId">
                    @for (cat of categories(); track cat.id) {
                      <option [value]="cat.id">{{ cat.name }}</option>
                    }
                  </select>
                </div>
              </div>

              <div class="form-row-3">
                <div class="form-group">
                  <label class="form-label">Base Price (₹) *</label>
                  <input type="number" class="form-input" min="1" [(ngModel)]="itemForm.price" />
                </div>
                <div class="form-group">
                  <label class="form-label">Dietary Type</label>
                  <select class="form-select" [(ngModel)]="itemForm.dietary">
                    <option value="VEG">Vegetarian (Green)</option>
                    <option value="NON_VEG">Non-Veg (Red)</option>
                    <option value="EGG">Egg (Amber)</option>
                    <option value="VEGAN">Vegan (Leaf)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Prep Time (Mins)</label>
                  <input
                    type="number"
                    class="form-input"
                    min="1"
                    max="120"
                    [(ngModel)]="itemForm.prepTimeMinutes"
                  />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Culinary Description</label>
                <textarea
                  class="form-textarea"
                  rows="2"
                  placeholder="Appetizing description of ingredients and cooking method..."
                  [(ngModel)]="itemForm.description"
                ></textarea>
              </div>

              <div class="form-group">
                <label class="form-label">Image URL</label>
                <input
                  type="url"
                  class="form-input"
                  placeholder="https://images.unsplash.com/..."
                  [(ngModel)]="itemForm.imageUrl"
                />
              </div>

              <div class="checkbox-options-row">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="itemForm.isPopular" />
                  <span>Mark as Popular Dish</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="itemForm.isChefSpecial" />
                  <span>Chef Recommendation Badge</span>
                </label>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showItemModal = false">Cancel</button>
              <button
                class="btn btn-primary"
                (click)="saveItem()"
                [disabled]="!itemForm.name?.trim() || !itemForm.price"
              >
                {{ editingItem ? 'Save Updates' : 'Add to Catalog' }}
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Add Category Modal -->
      @if (showCategoryModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card">Add Menu Category</h3>
              <button class="close-btn" (click)="showCategoryModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">Category Name *</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="e.g. Seafood & Coastal Mains"
                  [(ngModel)]="newCategoryName"
                />
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showCategoryModal = false">Cancel</button>
              <button
                class="btn btn-primary"
                (click)="saveCategory()"
                [disabled]="!newCategoryName.trim()"
              >
                Save Category
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Delete Confirmation -->
      <app-confirm-modal
        [isOpen]="!!itemToDelete"
        title="Delete Culinary Dish"
        [message]="
          'Are you sure you want to permanently delete ' +
          itemToDelete?.name +
          '? Customers will no longer be able to order this item.'
        "
        confirmText="Delete Dish"
        (confirm)="executeDeleteItem()"
        (cancel)="itemToDelete = null"
      ></app-confirm-modal>
    </div>
  `,
  styles: [
    `
      .menu-mgmt-page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        flex-wrap: wrap;
        gap: 16px;
      }

      .header-actions {
        display: flex;
        gap: 12px;
      }

      .toolbar-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 14px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }

      .category-tabs-scroll {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        max-width: calc(100% - 280px);

        @media (max-width: 900px) {
          max-width: 100%;
        }
      }

      .cat-tab {
        padding: 8px 14px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        border-radius: var(--radius-sm);
        white-space: nowrap;
        transition: all var(--transition-fast);

        &:hover {
          background: var(--color-bone-light);
        }
        &.active {
          background: var(--color-crimson);
          color: #ffffff;
        }
      }

      .search-input-wrap {
        position: relative;
        min-width: 260px;
        flex: 1;

        i {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--color-text-muted);
          font-size: 1.1rem;
        }

        .form-input {
          padding-left: 38px;
        }
      }

      .menu-items-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 20px;
      }

      .dish-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: var(--shadow-xs);
        transition: all var(--transition-fast);

        &:hover {
          border-color: var(--color-taupe);
          box-shadow: var(--shadow-sm);
        }

        &.manually-disabled {
          opacity: 0.65;
          border-style: dashed;
        }

        &.out-of-stock {
          opacity: 0.75;
        }

        &.low-stock {
          border-color: #f57f17;
        }
      }

      .dish-thumb-wrap {
        position: relative;
        width: 100%;
        height: 180px;
        background: var(--color-bone);
      }

      .dish-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .dish-badges {
        position: absolute;
        top: 10px;
        left: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(255, 255, 255, 0.9);
        padding: 4px 8px;
        border-radius: var(--radius-xs);
        box-shadow: var(--shadow-xs);
      }

      .stock-overlay {
        position: absolute;
        inset: 0;
        background: rgba(18, 18, 18, 0.7);
        backdrop-filter: blur(2px);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        color: #ffffff;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        font-size: 0.8125rem;

        &.disabled-overlay {
          background: rgba(30, 30, 30, 0.75);
        }

        &.out-of-stock-overlay {
          background: rgba(194, 24, 7, 0.8);
        }
      }

      .inventory-status-wrap {
        display: flex;
        align-items: center;
        margin: 2px 0 4px 0;
      }

      .inventory-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 8px;
        border-radius: var(--radius-xs);
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.01em;

        &.badge-success {
          background: #e8f5e9;
          color: #2e7d32;
          border: 1px solid #c8e6c9;
        }

        &.badge-warning {
          background: #fff8e1;
          color: #e65100;
          border: 1px solid #ffe082;
        }

        &.badge-danger {
          background: #ffebee;
          color: var(--color-crimson);
          border: 1px solid #ffcdd2;
        }

        &.badge-disabled {
          background: #eceff1;
          color: #546e7a;
          border: 1px solid #cfd8dc;
        }

        &.badge-untracked {
          background: #f5f5f5;
          color: #757575;
          border: 1px solid #e0e0e0;
        }
      }

      .dish-content {
        padding: 16px;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .dish-header-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
      }

      .dish-title {
        font-size: 1.05rem;
        font-weight: 700;
        line-height: 1.3;
      }

      .dish-price {
        font-size: 1.05rem;
        font-weight: 800;
        color: var(--color-crimson);
        white-space: nowrap;
      }

      .dish-desc {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .dish-meta {
        display: flex;
        gap: 10px;
        margin-top: auto;
        padding-top: 8px;
      }

      .meta-tag {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .dish-footer-actions {
        padding: 12px 16px;
        border-top: 1px solid var(--color-border-subtle);
        background: var(--color-bone-light);
        display: flex;
        align-items: center;
        gap: 8px;

        button:first-child {
          flex: 1;
        }
      }

      .btn-success {
        background: var(--color-success);
        color: #ffffff;
        &:hover {
          opacity: 0.9;
        }
      }

      .btn-icon-danger:hover {
        background: var(--color-danger-bg);
        color: var(--color-danger);
      }

      .empty-state-panel {
        grid-column: 1 / -1;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 48px 24px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }

      .empty-icon {
        font-size: 2.5rem;
        color: var(--color-taupe);
      }

      .dish-form-modal {
        max-width: 640px;
      }

      .form-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .form-row-3 {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 12px;
      }

      .checkbox-options-row {
        display: flex;
        gap: 20px;
        margin-top: 6px;
      }

      .checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.8125rem;
        font-weight: 600;
        cursor: pointer;
      }

      .modal-header,
      .modal-footer {
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid var(--color-border);
      }

      .modal-footer {
        border-bottom: none;
        border-top: 1px solid var(--color-border);
        justify-content: flex-end;
        gap: 12px;
      }

      .modal-body {
        padding: 20px;
      }
      .close-btn {
        font-size: 1.25rem;
        color: var(--color-text-muted);
        &:hover {
          color: var(--color-onyx);
        }
      }
    `,
  ],
})
export class MenuManagementComponent {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);

  categories = this.mock.categories;
  menuItems = this.mock.menuItems;

  selectedCategoryId = signal<string>('ALL');
  searchQuery = signal<string>('');

  showItemModal = false;
  editingItem: MenuItem | null = null;
  itemForm: Partial<MenuItem> = {};

  showCategoryModal = false;
  newCategoryName = '';

  itemToDelete: MenuItem | null = null;

  filteredMenuItems = computed(() => {
    let list = this.menuItems();
    if (this.selectedCategoryId() !== 'ALL') {
      list = list.filter((m) => m.categoryId === this.selectedCategoryId());
    }
    const q = this.searchQuery().toLowerCase().trim();
    if (q) {
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q),
      );
    }
    return list;
  });

  getItemStatus(item: MenuItem): {
    code: 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNTRACKED' | 'MANUALLY_DISABLED';
    label: string;
    icon: string;
    cssClass: string;
    produciblePortions?: number;
  } {
    if (!item.isAvailable) {
      return {
        code: 'MANUALLY_DISABLED',
        label: 'Manually Disabled',
        icon: 'ph-prohibit',
        cssClass: 'badge-disabled',
        produciblePortions: 0,
      };
    }

    const avail = this.mock.checkMenuItemAvailability(item.id);
    switch (avail.status) {
      case 'OUT_OF_STOCK':
        return {
          code: 'OUT_OF_STOCK',
          label: 'Out of Stock',
          icon: 'ph-x-circle',
          cssClass: 'badge-danger',
          produciblePortions: 0,
        };
      case 'LOW_STOCK':
        return {
          code: 'LOW_STOCK',
          label: `Low Stock (${avail.produciblePortions} left)`,
          icon: 'ph-warning-circle',
          cssClass: 'badge-warning',
          produciblePortions: avail.produciblePortions,
        };
      case 'AVAILABLE':
        return {
          code: 'AVAILABLE',
          label: `In Stock (${avail.produciblePortions})`,
          icon: 'ph-check-circle',
          cssClass: 'badge-success',
          produciblePortions: avail.produciblePortions,
        };
      case 'UNTRACKED':
      default:
        return {
          code: 'UNTRACKED',
          label: 'Untracked Recipe',
          icon: 'ph-info',
          cssClass: 'badge-untracked',
          produciblePortions: 999,
        };
    }
  }

  toggleAvailability(item: MenuItem): void {
    const newStatus = !item.isAvailable;
    const updated = this.mock
      .menuItems()
      .map((m) => (m.id === item.id ? { ...m, isAvailable: newStatus } : m));
    this.mock.menuItems.set(updated);
    this.mock.saveLocal('menuItems', updated);
    this.toastService.info(`${item.name} is now ${newStatus ? 'enabled' : 'disabled'}`);
  }

  openAddItemModal(): void {
    this.editingItem = null;
    this.itemForm = {
      name: '',
      categoryId: this.categories()[0]?.id || 'cat-01',
      price: 350,
      dietary: 'VEG' as DietaryType,
      prepTimeMinutes: 15,
      description: '',
      imageUrl:
        'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
      isAvailable: true,
      isPopular: false,
      isChefSpecial: false,
    };
    this.showItemModal = true;
  }

  openEditItemModal(item: MenuItem): void {
    this.editingItem = item;
    this.itemForm = { ...item };
    this.showItemModal = true;
  }

  saveItem(): void {
    if (!this.itemForm.name?.trim() || !this.itemForm.price) return;

    if (this.editingItem) {
      const updated = this.mock
        .menuItems()
        .map((m) => (m.id === this.editingItem!.id ? ({ ...m, ...this.itemForm } as MenuItem) : m));
      this.mock.menuItems.set(updated);
      this.mock.saveLocal('menuItems', updated);
      this.toastService.success(`Updated ${this.itemForm.name}`);
    } else {
      const newItem: MenuItem = {
        id: `item-${Date.now().toString().slice(-4)}`,
        name: this.itemForm.name.trim(),
        categoryId: this.itemForm.categoryId || 'cat-01',
        price: Number(this.itemForm.price),
        dietary: this.itemForm.dietary || 'VEG',
        prepTimeMinutes: Number(this.itemForm.prepTimeMinutes) || 15,
        description: this.itemForm.description || '',
        imageUrl:
          this.itemForm.imageUrl ||
          'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
        isAvailable: true,
        isPopular: !!this.itemForm.isPopular,
        isChefSpecial: !!this.itemForm.isChefSpecial,
      };
      const updated = [newItem, ...this.mock.menuItems()];
      this.mock.menuItems.set(updated);
      this.mock.saveLocal('menuItems', updated);
      this.toastService.success(`Added ${newItem.name} to menu catalog`);
    }

    this.showItemModal = false;
  }

  confirmDeleteItem(item: MenuItem): void {
    this.itemToDelete = item;
  }

  executeDeleteItem(): void {
    if (!this.itemToDelete) return;
    const name = this.itemToDelete.name;
    const updated = this.mock.menuItems().filter((m) => m.id !== this.itemToDelete!.id);
    this.mock.menuItems.set(updated);
    this.mock.saveLocal('menuItems', updated);
    this.toastService.success(`Removed ${name} from catalog`);
    this.itemToDelete = null;
  }

  openAddCategoryModal(): void {
    this.newCategoryName = '';
    this.showCategoryModal = true;
  }

  saveCategory(): void {
    if (!this.newCategoryName.trim()) return;
    const newCat: MenuCategory = {
      id: `cat-${Date.now().toString().slice(-4)}`,
      name: this.newCategoryName.trim(),
      slug: this.newCategoryName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      sortOrder: this.categories().length + 1,
      isActive: true,
    };
    const updated = [...this.mock.categories(), newCat];
    this.mock.categories.set(updated);
    this.mock.saveLocal('categories', updated);
    this.toastService.success(`Created category ${newCat.name}`);
    this.showCategoryModal = false;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.showItemModal = false;
      this.showCategoryModal = false;
    }
  }
}
