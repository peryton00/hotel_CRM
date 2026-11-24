import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { MenuCategory, MenuItem, DietaryType } from '../../../core/models/menu.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { DietaryBadgeComponent } from '../../../shared/components/dietary-badge/dietary-badge.component';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import { ToastService } from '../../../core/services/toast.service';
import { SkeletonLoaderComponent } from '../../../shared/components/loading/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-menu-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CurrencyInrPipe,
    DietaryBadgeComponent,
    ConfirmModalComponent,
    SkeletonLoaderComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="menu-mgmt-page">
      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="heading-display">Menu Catalog</h1>
          <p class="text-muted">
            Manage dishes, portions, kitchen availability, and live ingredient stock.
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
        <div class="toolbar-categories-rail">
          <span class="toolbar-label"><i class="ph ph-squares-four"></i> Categories:</span>
          <div class="category-tabs-scroll">
            <button
              class="cat-tab"
              [class.active]="selectedCategoryId() === 'ALL'"
              (click)="selectedCategoryId.set('ALL')"
            >
              <span>All Items</span>
              @if (!isLoading()) {
                <span class="cat-badge">{{ menuItems().length }}</span>
              }
            </button>
            @for (cat of categories(); track cat.id) {
              <button
                class="cat-tab"
                [class.active]="selectedCategoryId() === cat.id"
                (click)="selectedCategoryId.set(cat.id)"
              >
                <span>{{ cat.name }}</span>
                @if (!isLoading()) {
                  <span class="cat-badge">{{ countByCategory(cat.id) }}</span>
                }
              </button>
            }
          </div>
        </div>

        <div class="search-wrap">
          <i class="ph ph-magnifying-glass search-icon"></i>
          <input
            type="text"
            class="form-input search-input"
            placeholder="Search dishes..."
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)"
          />
          @if (searchQuery()) {
            <button
              type="button"
              class="btn-clear-search"
              (click)="searchQuery.set('')"
              title="Clear search"
            >
              <i class="ph ph-x"></i>
            </button>
          }
        </div>
      </div>

      <!-- Dish Cards Grid -->
      <div class="menu-items-grid">
        @if (isLoading()) {
          <app-skeleton variant="menu-card" [count]="6" />
        } @else {
          @for (item of filteredMenuItems(); track item.id) {
            <div
              class="dish-card"
              [class.manually-disabled]="!item.isAvailable"
              [class.out-of-stock]="item.isAvailable && getItemStatus(item).code === 'OUT_OF_STOCK'"
              [class.low-stock]="item.isAvailable && getItemStatus(item).code === 'LOW_STOCK'"
            >
              <div class="dish-thumb-wrap">
                <img [src]="item.imageUrl" [alt]="item.name" class="dish-img" loading="lazy" />
                <div class="floating-top-row">
                  <div class="dish-badges">
                    <app-dietary-badge [type]="item.dietary"></app-dietary-badge>
                    @if (item.isChefSpecial) {
                      <span class="badge badge-gold"
                        ><i class="ph ph-star-four"></i> Chef Special</span
                      >
                    }
                  </div>
                  <div class="dish-stock-status">
                    <span
                      class="inventory-status-pill {{ getItemStatus(item).cssClass }}"
                      [attr.aria-label]="'Inventory status: ' + getItemStatus(item).label"
                    >
                      <i class="ph {{ getItemStatus(item).icon }}" aria-hidden="true"></i>
                      <span>{{ getItemStatus(item).label }}</span>
                    </span>
                  </div>
                </div>

                @if (!item.isAvailable) {
                  <div class="stock-overlay disabled-overlay">
                    <i class="ph ph-prohibit" aria-hidden="true"></i>
                    <span>Kitchen Disabled</span>
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

                @if (item.description) {
                  <p class="dish-desc">{{ item.description }}</p>
                } @else {
                  <p class="dish-desc empty">No recipe description added.</p>
                }

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
                  class="availability-toggle-btn"
                  [class.active]="item.isAvailable"
                  [class.inactive]="!item.isAvailable"
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

                <div class="footer-btn-group">
                  <button
                    class="btn-icon"
                    (click)="openEditItemModal(item)"
                    title="Edit Recipe & Pricing"
                  >
                    <i class="ph ph-pencil-simple"></i>
                  </button>

                  <button
                    class="btn-icon btn-danger"
                    (click)="confirmDeleteItem(item)"
                    title="Delete Dish"
                  >
                    <i class="ph ph-trash"></i>
                  </button>
                </div>
              </div>
            </div>
          } @empty {
            @if (selectedCategory() && countByCategory(selectedCategory()!.id) === 0) {
              <app-empty-state
                icon="ph-folder-dashed"
                [title]="'No Dishes in ' + selectedCategory()!.name"
                message="This category has no dishes yet. Add a dish or delete this unused category."
                actionText="Add Dish"
                actionIcon="ph-plus-circle"
                (actionClick)="openAddItemModal()"
                secondaryActionText="Delete Category"
                (secondaryActionClick)="confirmDeleteCategory(selectedCategory()!)"
              />
            } @else {
              <app-empty-state
                icon="ph-fork-knife"
                title="No Dishes Found"
                message="Try adjusting your search query or select another category."
                actionText="Add Dish"
                actionIcon="ph-plus-circle"
                (actionClick)="openAddItemModal()"
              />
            }
          }
        }
      </div>

      <!-- Add / Edit Dish Modal -->
      @if (showItemModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card dish-form-modal" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card">
                {{ editingItem ? 'Edit Dish' : 'Add New Dish' }}
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
                <label class="form-label">Dish Description</label>
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

      <!-- Delete Dish Confirmation -->
      <app-confirm-modal
        [isOpen]="!!itemToDelete"
        title="Delete Dish"
        [message]="
          'Are you sure you want to permanently delete ' +
          itemToDelete?.name +
          '? Customers will no longer be able to order this item.'
        "
        confirmText="Delete Dish"
        (confirm)="executeDeleteItem()"
        (cancel)="itemToDelete = null"
      ></app-confirm-modal>

      <!-- Delete Category Confirmation -->
      <app-confirm-modal
        [isOpen]="!!categoryToDelete"
        title="Delete Category"
        [message]="
          'Are you sure you want to permanently delete category ' + categoryToDelete?.name + '?'
        "
        confirmText="Delete Category"
        (confirm)="executeDeleteCategory()"
        (cancel)="categoryToDelete = null"
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
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 12px);
        padding: 10px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        box-shadow: var(--shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.04));
      }

      .toolbar-categories-rail {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
        min-width: 0;
      }

      .toolbar-label {
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-text-muted, #64748b);
        display: inline-flex;
        align-items: center;
        gap: 5px;
        white-space: nowrap;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .category-tabs-scroll {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: thin;
        flex: 1;
        padding-bottom: 2px;
      }

      .cat-tab {
        padding: 6px 12px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary, #64748b);
        border: 1px solid transparent;
        background: transparent;
        border-radius: var(--radius-sm, 8px);
        white-space: nowrap;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: all var(--transition-fast, 0.15s ease);

        .cat-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.6875rem;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: var(--radius-full, 9999px);
          background: rgba(148, 163, 184, 0.18);
          color: inherit;
          min-width: 18px;
          line-height: 1.2;
        }

        &:hover {
          background: var(--color-bone-light, #f1f5f9);
          color: var(--color-text-primary, #1e293b);
        }

        &.active {
          background: var(--color-onyx, #1e293b);
          color: #ffffff;

          .cat-badge {
            background: rgba(255, 255, 255, 0.22);
            color: #ffffff;
          }
        }
      }

      .search-wrap,
      .search-input-wrap {
        position: relative;
        flex: 0 0 190px !important;
        width: 190px !important;
        max-width: 190px !important;
        min-width: 0 !important;

        @media (max-width: 900px) {
          flex: 1 1 100% !important;
          width: 100% !important;
          max-width: 100% !important;
        }

        i.search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--color-text-muted);
          font-size: 1.125rem;
          pointer-events: none;
        }

        .form-input {
          height: 44px;
          padding-left: 42px;
          padding-right: 32px;
          font-size: 0.875rem;
          border-radius: var(--radius-md, 10px);
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text-primary);
          transition: all var(--transition-fast, 0.15s ease);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);

          &:focus {
            border-color: var(--color-primary);
            box-shadow: 0 0 0 3px rgba(194, 65, 12, 0.12);
            outline: none;
          }

          &::placeholder {
            color: var(--color-text-muted);
          }
        }

        .btn-clear-search {
          position: absolute;
          right: 6px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          color: var(--color-text-muted, #64748b);
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 0.6875rem;
          transition: all var(--transition-fast, 0.15s ease);

          &:hover {
            background: rgba(148, 163, 184, 0.2);
            color: var(--color-text-primary, #1e293b);
          }
        }
      }

      .menu-items-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 20px;

        app-empty-state {
          grid-column: 1 / -1;

          .empty-secondary-btn {
            color: var(--color-crimson, #dc2626);
            border-color: rgba(220, 38, 38, 0.3);

            &:hover {
              background: rgba(220, 38, 38, 0.08);
              border-color: var(--color-crimson, #dc2626);
            }
          }
        }
      }

      .dish-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 12px);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: var(--shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.05));
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease,
          border-color 0.15s ease;

        &:hover {
          border-color: rgba(220, 38, 38, 0.3);
          box-shadow: var(--shadow-sm, 0 2px 4px rgba(0, 0, 0, 0.05));
        }

        &.manually-disabled {
          opacity: 0.65;
          border-style: dashed;
        }

        &.out-of-stock {
          opacity: 0.75;
        }

        &.low-stock {
          border-color: #f59e0b;
        }
      }

      .dish-thumb-wrap {
        position: relative;
        width: 100%;
        height: 180px;
        background: var(--color-bone-light, #f1f5f9);
        overflow: hidden;
      }

      .dish-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s ease;
      }

      .dish-card:hover .dish-img {
        transform: scale(1.02);
      }

      .floating-top-row {
        position: absolute;
        top: 8px;
        left: 8px;
        right: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        pointer-events: none;
        z-index: 2;
      }

      .dish-badges {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(4px);
        padding: 3px 6px;
        border-radius: var(--radius-sm, 6px);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }

      .dish-stock-status {
        display: inline-flex;
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
        z-index: 1;

        &.disabled-overlay {
          background: rgba(30, 30, 30, 0.75);
        }

        &.out-of-stock-overlay {
          background: rgba(194, 24, 7, 0.8);
        }
      }

      .inventory-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 8px;
        border-radius: var(--radius-xs, 4px);
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.01em;
        backdrop-filter: blur(4px);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

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
          color: var(--color-crimson, #dc2626);
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
        color: var(--color-text-primary, #1e293b);
      }

      .dish-price {
        font-size: 1.05rem;
        font-weight: 800;
        color: var(--color-crimson, #dc2626);
        white-space: nowrap;
      }

      .dish-desc {
        font-size: 0.8125rem;
        color: var(--color-text-secondary, #64748b);
        line-height: 1.45;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;

        &.empty {
          font-style: italic;
          color: var(--color-text-muted, #94a3b8);
          opacity: 0.7;
        }
      }

      .dish-meta {
        display: flex;
        gap: 10px;
        margin-top: auto;
        padding-top: 8px;
        border-top: 1px solid var(--color-border-subtle, #f1f5f9);
      }

      .meta-tag {
        font-size: 0.6875rem;
        color: var(--color-text-muted, #64748b);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .dish-footer-actions {
        padding: 10px 14px;
        border-top: 1px solid var(--color-border-subtle, #f1f5f9);
        background: var(--color-bone-light, #f8fafc);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .availability-toggle-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border-radius: var(--radius-full, 9999px);
        font-size: 0.75rem;
        font-weight: 700;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all var(--transition-fast, 0.15s ease);
        background: transparent;

        &.active {
          background: #ecfdf5;
          color: #059669;
          border-color: rgba(5, 150, 105, 0.25);

          &:hover {
            background: #d1fae5;
          }
        }

        &.inactive {
          background: var(--color-surface, #ffffff);
          color: var(--color-text-muted, #94a3b8);
          border-color: var(--color-border, #e2e8f0);

          &:hover {
            color: var(--color-text-secondary, #64748b);
            border-color: var(--color-text-muted, #94a3b8);
          }
        }
      }

      .footer-btn-group {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }

      .btn-icon {
        width: 30px;
        height: 30px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-sm, 6px);
        border: 1px solid var(--color-border, #e2e8f0);
        background: var(--color-surface, #ffffff);
        color: var(--color-text-secondary, #64748b);
        cursor: pointer;
        font-size: 0.875rem;
        transition: all var(--transition-fast, 0.15s ease);

        &:hover {
          color: var(--color-text-primary, #1e293b);
          border-color: var(--color-text-muted, #94a3b8);
          background: var(--color-bone-light, #f1f5f9);
        }

        &.btn-danger:hover {
          color: #dc2626;
          border-color: rgba(220, 38, 38, 0.3);
          background: #fee2e2;
        }
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

      .theme-dark,
      [data-theme='dark'] {
        .toolbar-card {
          background: #121418;
          border-color: rgba(255, 255, 255, 0.08);
        }

        .toolbar-label {
          color: #94a3b8;
        }

        app-empty-state .empty-secondary-btn {
          color: #f87171;
          border-color: rgba(248, 113, 113, 0.35);

          &:hover {
            background: rgba(239, 68, 68, 0.15);
          }
        }

        .cat-tab {
          color: #94a3b8;

          .cat-badge {
            background: rgba(255, 255, 255, 0.08);
            color: #94a3b8;
          }

          &:hover {
            background: rgba(255, 255, 255, 0.06);
            color: #f1f5f9;
          }

          &.active {
            background: #252b36;
            color: #f1f5f9;
            border-color: rgba(255, 255, 255, 0.12);

            .cat-badge {
              background: rgba(255, 255, 255, 0.18);
              color: #ffffff;
            }
          }
        }

        .search-wrap,
        .search-input-wrap {
          .form-input {
            background: #181d26;
            border-color: rgba(255, 255, 255, 0.1);
            color: #f1f5f9;

            &:focus {
              border-color: #f87171;
              box-shadow: 0 0 0 2px rgba(248, 113, 113, 0.15);
            }
          }

          .btn-clear-search {
            color: #94a3b8;

            &:hover {
              background: rgba(255, 255, 255, 0.1);
              color: #f1f5f9;
            }
          }
        }

        .dish-card {
          background: #151820;
          border-color: rgba(255, 255, 255, 0.08);

          &:hover {
            border-color: rgba(248, 113, 113, 0.3);
          }

          &.manually-disabled {
            border-color: rgba(255, 255, 255, 0.12);
          }
        }

        .dish-thumb-wrap {
          background: #1c212c;
        }

        .dish-badges {
          background: rgba(21, 24, 32, 0.85);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
        }

        .dish-title {
          color: #f1f5f9;
        }

        .dish-desc {
          color: #94a3b8;

          &.empty {
            color: #64748b;
          }
        }

        .dish-meta {
          border-top-color: rgba(255, 255, 255, 0.06);

          .meta-tag {
            color: #94a3b8;
          }
        }

        .dish-footer-actions {
          background: #101217;
          border-top-color: rgba(255, 255, 255, 0.08);
        }

        .availability-toggle-btn {
          &.active {
            background: rgba(16, 185, 129, 0.14);
            color: #34d399;
            border-color: rgba(52, 211, 153, 0.3);

            &:hover {
              background: rgba(16, 185, 129, 0.22);
            }
          }

          &.inactive {
            background: rgba(255, 255, 255, 0.05);
            color: #94a3b8;
            border-color: rgba(255, 255, 255, 0.1);

            &:hover {
              color: #f1f5f9;
              border-color: rgba(255, 255, 255, 0.2);
            }
          }
        }

        .btn-icon {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.1);
          color: #94a3b8;

          &:hover {
            color: #f1f5f9;
            border-color: rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.08);
          }

          &.btn-danger:hover {
            color: #f87171;
            border-color: rgba(248, 113, 113, 0.35);
            background: rgba(239, 68, 68, 0.15);
          }
        }

        .modal-card {
          background: #151820;
          border-color: rgba(255, 255, 255, 0.1);
          color: #f1f5f9;
        }

        .modal-header,
        .modal-footer {
          border-color: rgba(255, 255, 255, 0.08);
        }

        .form-input,
        .form-select,
        .form-textarea {
          background: #1d222d;
          border-color: rgba(255, 255, 255, 0.12);
          color: #f1f5f9;
        }
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

  readonly isLoading = computed(
    () => this.dataService.isMenuLoading() || !this.dataService.menuLoaded(),
  );

  selectedCategoryId = signal<string>('ALL');
  selectedCategory = computed(() => {
    const id = this.selectedCategoryId();
    if (id === 'ALL') return null;
    return this.categories().find((c) => c.id === id) || null;
  });
  searchQuery = signal<string>('');

  showItemModal = false;
  editingItem: MenuItem | null = null;
  itemForm: Partial<MenuItem> = {};

  showCategoryModal = false;
  newCategoryName = '';

  itemToDelete: MenuItem | null = null;
  categoryToDelete: MenuCategory | null = null;

  countByCategory(categoryId: string): number {
    return this.menuItems().filter((m) => m.categoryId === categoryId).length;
  }

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
    this.mock.toggleMenuItemAvailability(item.id, newStatus);
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
      this.mock.updateMenuItem(this.editingItem.id, this.itemForm);
      this.toastService.success(`Updated ${this.itemForm.name}`);
    } else {
      this.mock.createMenuItem(this.itemForm);
      this.toastService.success(`Added ${this.itemForm.name} to menu catalog`);
    }

    this.showItemModal = false;
  }

  confirmDeleteItem(item: MenuItem): void {
    this.itemToDelete = item;
  }

  executeDeleteItem(): void {
    if (!this.itemToDelete) return;
    const name = this.itemToDelete.name;
    this.mock.deleteMenuItem(this.itemToDelete.id);
    this.toastService.success(`Removed ${name} from catalog`);
    this.itemToDelete = null;
  }

  openAddCategoryModal(): void {
    this.newCategoryName = '';
    this.showCategoryModal = true;
  }

  saveCategory(): void {
    if (!this.newCategoryName.trim()) return;
    this.mock.createMenuCategory(this.newCategoryName);
    this.toastService.success(`Created category ${this.newCategoryName}`);
    this.showCategoryModal = false;
  }

  confirmDeleteCategory(cat: MenuCategory, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    const count = this.countByCategory(cat.id);
    if (count > 0) {
      this.toastService.warning(
        `Cannot delete "${cat.name}" because it still contains ${count} dish${count > 1 ? 'es' : ''}. Move or delete dishes first.`,
      );
      return;
    }
    this.categoryToDelete = cat;
  }

  executeDeleteCategory(): void {
    if (!this.categoryToDelete) return;
    const cat = this.categoryToDelete;
    const res = this.mock.deleteMenuCategory(cat.id);
    if (res.success) {
      this.toastService.success(`Removed category "${cat.name}"`);
      if (this.selectedCategoryId() === cat.id) {
        this.selectedCategoryId.set('ALL');
      }
    }
    this.categoryToDelete = null;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.showItemModal = false;
      this.showCategoryModal = false;
    }
  }
}
