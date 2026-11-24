import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { ToastService } from '../../../core/services/toast.service';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import {
  Ingredient,
  IngredientCategory,
  MeasurementUnit,
  Recipe,
  RecipeItem,
  StockMovement,
  StockMovementType,
  MenuStockStatus,
  roundStock,
  convertUnit,
  areUnitsCompatible,
} from '../../../core/models/inventory.model';
import { MenuItem } from '../../../core/models/menu.model';
import { DietaryBadgeComponent } from '../../../shared/components/dietary-badge/dietary-badge.component';
import { SkeletonLoaderComponent } from '../../../shared/components/loading/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

type InventoryTab = 'INGREDIENTS' | 'RECIPES' | 'LEDGER';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CurrencyInrPipe,
    DietaryBadgeComponent,
    SkeletonLoaderComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="inventory-page">
      <!-- Page Header -->
      <div class="page-header">
        <div class="header-left">
          <div class="header-title-row">
            <h1 class="heading-display">Inventory &amp; Recipes</h1>
            <span class="apple-status-chip">
              <span class="dot-indicator"></span>
              Live Stock
            </span>
          </div>
          <p class="text-muted">
            Track ingredient stock levels, recipe costs, restock orders, and stock adjustments.
          </p>
        </div>

        <div class="header-actions">
          <button
            class="apple-btn-secondary"
            (click)="openRestockModal()"
            title="Record fresh ingredient shipment"
          >
            <i class="ph ph-truck"></i>
            <span>Record Restock</span>
          </button>
          <button
            class="apple-btn-secondary"
            (click)="openAdjustmentModal()"
            title="Record wastage or manual stock adjustment"
          >
            <i class="ph ph-arrows-clockwise"></i>
            <span>Adjust / Waste</span>
          </button>
          <button
            class="apple-btn-secondary"
            (click)="openRecipeModal()"
            title="Define or edit recipe formulation"
          >
            <i class="ph ph-book-open"></i>
            <span>New Recipe</span>
          </button>
          <button
            class="apple-btn-primary"
            (click)="openIngredientModal()"
            title="Register a new tracked kitchen raw material"
          >
            <i class="ph ph-plus"></i>
            <span>New Ingredient</span>
          </button>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-icon icon-blue"><i class="ph ph-package"></i></div>
          <div class="kpi-content">
            <span class="kpi-label">Tracked Items</span>
            <strong class="kpi-value">
              @if (isLoading()) {
                <app-skeleton variant="text" width="45px" height="1.6rem" />
              } @else {
                {{ valuationSummary().totalTracked }}
              }
            </strong>
          </div>
        </div>

        <div class="kpi-card" [class.kpi-alert]="valuationSummary().lowStockCount > 0">
          <div
            class="kpi-icon"
            [class.alert-icon]="valuationSummary().lowStockCount > 0"
            [class.icon-emerald]="valuationSummary().lowStockCount === 0"
          >
            <i
              class="ph"
              [class.ph-warning-circle]="valuationSummary().lowStockCount > 0"
              [class.ph-check-circle]="valuationSummary().lowStockCount === 0"
            ></i>
          </div>
          <div class="kpi-content">
            <span class="kpi-label">Low Stock</span>
            <strong
              class="kpi-value"
              [class.text-amber]="valuationSummary().lowStockCount > 0"
              [class.text-emerald]="valuationSummary().lowStockCount === 0"
            >
              @if (isLoading()) {
                <app-skeleton variant="text" width="45px" height="1.6rem" />
              } @else {
                {{ valuationSummary().lowStockCount }}
              }
            </strong>
          </div>
        </div>

        <div class="kpi-card" [class.kpi-danger]="valuationSummary().outOfStockCount > 0">
          <div
            class="kpi-icon"
            [class.danger-icon]="valuationSummary().outOfStockCount > 0"
            [class.icon-slate]="valuationSummary().outOfStockCount === 0"
          >
            <i
              class="ph"
              [class.ph-x-circle]="valuationSummary().outOfStockCount > 0"
              [class.ph-shield-check]="valuationSummary().outOfStockCount === 0"
            ></i>
          </div>
          <div class="kpi-content">
            <span class="kpi-label">Out of Stock</span>
            <strong class="kpi-value" [class.text-crimson]="valuationSummary().outOfStockCount > 0">
              @if (isLoading()) {
                <app-skeleton variant="text" width="45px" height="1.6rem" />
              } @else {
                {{ valuationSummary().outOfStockCount }}
              }
            </strong>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon icon-emerald"><i class="ph ph-currency-inr"></i></div>
          <div class="kpi-content">
            <span class="kpi-label">Inventory Value</span>
            <strong class="kpi-value">
              @if (isLoading()) {
                <app-skeleton variant="text" width="90px" height="1.6rem" />
              } @else {
                {{ valuationSummary().estimatedValue | currencyInr }}
              }
            </strong>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon icon-rose"><i class="ph ph-trash"></i></div>
          <div class="kpi-content">
            <span class="kpi-label">Recorded Wastage</span>
            <strong
              class="kpi-value"
              [class.text-crimson]="valuationSummary().totalWastageCost > 0"
            >
              @if (isLoading()) {
                <app-skeleton variant="text" width="90px" height="1.6rem" />
              } @else {
                {{ valuationSummary().totalWastageCost | currencyInr }}
              }
            </strong>
          </div>
        </div>
      </div>

      <!-- Main Navigation Tabs -->
      <div class="tabs-nav-bar">
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'INGREDIENTS'"
          (click)="activeTab.set('INGREDIENTS')"
        >
          <i class="ph ph-leaf tab-icon"></i>
          <span class="tab-title">Ingredients Stock</span>
          <span class="tab-count-pill">{{ ingredients().length }}</span>
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'RECIPES'"
          (click)="activeTab.set('RECIPES')"
        >
          <i class="ph ph-cooking-pot tab-icon"></i>
          <span class="tab-title">Recipes & Dish Costing</span>
          <span class="tab-count-pill">{{ recipes().length }}</span>
        </button>
        <button
          class="tab-btn"
          [class.active]="activeTab() === 'LEDGER'"
          (click)="activeTab.set('LEDGER')"
        >
          <i class="ph ph-clipboard-text tab-icon"></i>
          <span class="tab-title">Movement Audit Ledger</span>
          <span class="tab-count-pill">{{ stockMovements().length }}</span>
        </button>
      </div>

      <!-- TAB 1: INGREDIENTS LIST & STOCK CONTROL -->
      @if (activeTab() === 'INGREDIENTS') {
        <div class="tab-content">
          <!-- Filter Toolbar -->
          <div class="toolbar-card">
            <div class="search-input-wrap">
              <i class="ph ph-magnifying-glass search-icon"></i>
              <input
                type="text"
                class="form-input search-input"
                placeholder="Search ingredient by name or supplier..."
                [ngModel]="ingredientSearch()"
                (ngModelChange)="ingredientSearch.set($event)"
              />
              @if (ingredientSearch()) {
                <button
                  type="button"
                  class="search-clear-btn"
                  (click)="ingredientSearch.set('')"
                  title="Clear search"
                  aria-label="Clear search query"
                >
                  <i class="ph ph-x"></i>
                </button>
              }
            </div>

            <div class="filter-controls">
              <div class="filter-select-wrap" [class.filter-active]="selectedCategory() !== 'ALL'">
                <i class="ph ph-tag select-lead-icon"></i>
                <select
                  class="form-select filter-select"
                  [ngModel]="selectedCategory()"
                  (ngModelChange)="selectedCategory.set($event)"
                  aria-label="Filter by Category"
                >
                  <option value="ALL">All Categories</option>
                  <option value="DAIRY">Dairy</option>
                  <option value="MEAT">Meat & Poultry</option>
                  <option value="PRODUCE">Produce & Veg</option>
                  <option value="GRAINS">Grains & Pulses</option>
                  <option value="SPICES">Spices & Seasoning</option>
                  <option value="OTHER">Oils & Condiments</option>
                </select>
                <i class="ph ph-caret-down select-caret-icon"></i>
              </div>

              <div
                class="filter-select-wrap"
                [class.filter-active]="selectedStockFilter() !== 'ALL'"
              >
                <i class="ph ph-chart-pie-slice select-lead-icon"></i>
                <select
                  class="form-select filter-select"
                  [ngModel]="selectedStockFilter()"
                  (ngModelChange)="selectedStockFilter.set($event)"
                  aria-label="Filter by Stock Level"
                >
                  <option value="ALL">All Stock Levels</option>
                  <option value="IN_STOCK">Adequate Stock</option>
                  <option value="LOW_STOCK">Low Stock Alert</option>
                  <option value="OUT_OF_STOCK">Out of Stock</option>
                </select>
                <i class="ph ph-caret-down select-caret-icon"></i>
              </div>

              @if (
                ingredientSearch() ||
                selectedCategory() !== 'ALL' ||
                selectedStockFilter() !== 'ALL'
              ) {
                <button
                  type="button"
                  class="btn-reset-filters"
                  (click)="
                    ingredientSearch.set('');
                    selectedCategory.set('ALL');
                    selectedStockFilter.set('ALL')
                  "
                  title="Reset all active filters"
                >
                  <i class="ph ph-arrow-counter-clockwise"></i>
                  <span>Reset</span>
                </button>
              }

              <div class="filter-count-badge">
                <span class="count-value">{{ filteredIngredients().length }}</span>
                <span class="count-label">{{
                  filteredIngredients().length === 1 ? 'item' : 'items'
                }}</span>
              </div>
            </div>
          </div>

          <!-- Ingredients Table -->
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Ingredient &amp; Spec</th>
                  <th>Category</th>
                  <th>Current Stock</th>
                  <th>Min Threshold</th>
                  <th>Unit Rate</th>
                  <th>Stock Valuation</th>
                  <th>Status</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                @if (isLoading()) {
                  <tr>
                    <td colspan="8" style="padding: 0;">
                      <app-skeleton variant="ingredient-row" [count]="6" />
                    </td>
                  </tr>
                } @else {
                  @for (ing of filteredIngredients(); track ing.id) {
                    <tr
                      [class.row-alert]="
                        ing.currentStock > 0 && ing.currentStock <= ing.minThreshold
                      "
                      [class.row-danger]="ing.currentStock <= 0"
                    >
                      <td>
                        <div class="ing-meta-cell">
                          <strong class="ing-name">{{ ing.name }}</strong>
                          <div class="ing-sub-meta">
                            @if (ing.supplierName) {
                              <span class="supplier-tag">
                                <i class="ph ph-storefront"></i>
                                {{ ing.supplierName }}
                              </span>
                            }
                            @if (ing.description) {
                              <span class="desc-tag">{{ ing.description }}</span>
                            }
                          </div>
                        </div>
                      </td>
                      <td>
                        <span class="category-pill" [attr.data-cat]="ing.category">{{
                          ing.category
                        }}</span>
                      </td>
                      <td>
                        <div class="stock-qty-cell">
                          <span
                            class="stock-num"
                            [class.text-crimson]="ing.currentStock <= 0"
                            [class.text-amber]="
                              ing.currentStock > 0 && ing.currentStock <= ing.minThreshold
                            "
                          >
                            {{ ing.currentStock }} {{ ing.unit }}
                          </span>
                          @if (getReservedQuantity(ing.id); as resQty) {
                            @if (resQty > 0) {
                              <span class="text-xs text-muted" title="Active order reservations">
                                Avail: {{ getAvailableStock(ing.id) }} • Res: {{ resQty }}
                                {{ ing.unit }}
                              </span>
                            }
                          }
                          @if (ing.targetStock) {
                            <div
                              class="stock-bar-track"
                              title="Current: {{ ing.currentStock }} / Target: {{
                                ing.targetStock
                              }}"
                            >
                              <div
                                class="stock-bar-fill"
                                [style.width.%]="
                                  calcStockPercentage(ing.currentStock, ing.targetStock)
                                "
                                [class.fill-danger]="ing.currentStock <= 0"
                                [class.fill-warning]="
                                  ing.currentStock > 0 && ing.currentStock <= ing.minThreshold
                                "
                              ></div>
                            </div>
                          }
                        </div>
                      </td>
                      <td>
                        <span class="threshold-val">{{ ing.minThreshold }} {{ ing.unit }}</span>
                      </td>
                      <td>
                        <span class="unit-rate-val"
                          >{{ ing.costPerUnit | currencyInr }}/{{ ing.costUnit }}</span
                        >
                      </td>
                      <td>
                        <strong class="valuation-val">{{
                          calcIngredientValue(ing) | currencyInr
                        }}</strong>
                      </td>
                      <td>
                        @if (ing.currentStock <= 0) {
                          <span class="badge-status-pill is-danger">
                            <span class="status-dot"></span>
                            Out of Stock
                          </span>
                        } @else if (ing.currentStock <= ing.minThreshold) {
                          <span class="badge-status-pill is-warning">
                            <span class="status-dot"></span>
                            Low Stock
                          </span>
                        } @else {
                          <span class="badge-status-pill is-success">
                            <span class="status-dot"></span>
                            In Stock
                          </span>
                        }
                      </td>
                      <td class="text-right">
                        <div class="row-actions justify-end">
                          <button
                            class="apple-row-btn"
                            (click)="quickRestock(ing)"
                            title="Quick Restock"
                            aria-label="Quick Restock"
                          >
                            <i class="ph ph-plus-circle"></i>
                          </button>
                          <button
                            class="apple-row-btn"
                            (click)="quickAdjust(ing)"
                            title="Adjust or Record Wastage"
                            aria-label="Adjust or Record Wastage"
                          >
                            <i class="ph ph-arrows-clockwise"></i>
                          </button>
                          <button
                            class="apple-row-btn"
                            (click)="openIngredientModal(ing)"
                            title="Edit Ingredient Settings"
                            aria-label="Edit Ingredient Settings"
                          >
                            <i class="ph ph-pencil-simple"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="8" style="padding: 0;">
                        <app-empty-state
                          icon="ph-package"
                          title="No Ingredients Found"
                          message="No raw kitchen materials match your search and category filter."
                          actionText="New Ingredient"
                          actionIcon="ph-plus"
                          (actionClick)="openIngredientModal()"
                          [bordered]="false"
                        />
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- TAB 2: RECIPES & DISH COSTING -->
      @if (activeTab() === 'RECIPES') {
        <div class="tab-content">
          <!-- Recipe Toolbar -->
          <div class="toolbar-card">
            <div class="search-input-wrap">
              <i class="ph ph-magnifying-glass"></i>
              <input
                type="text"
                class="form-input"
                placeholder="Search recipe by menu dish name..."
                [ngModel]="recipeSearch()"
                (ngModelChange)="recipeSearch.set($event)"
              />
            </div>
          </div>

          <div class="recipes-grid">
            @for (rec of filteredRecipes(); track rec.id) {
              @let avail = getRecipeAvailability(rec.menuItemId);
              <div class="recipe-card" [class.recipe-inactive]="!rec.isActive">
                <div class="recipe-header">
                  <div>
                    <h3 class="recipe-title">{{ rec.menuItemName }}</h3>
                    <span class="recipe-ver"
                      >Recipe v{{ rec.version }} • {{ rec.isActive ? 'Active' : 'Archived' }}</span
                    >
                  </div>
                  <div
                    class="recipe-status-pill"
                    [ngClass]="'status-' + (avail.status || 'UNTRACKED').toLowerCase()"
                  >
                    @if (avail.status === 'AVAILABLE') {
                      <i class="ph ph-check-circle"></i>
                      <span>Ready ({{ avail.produciblePortions }} portions)</span>
                    } @else if (avail.status === 'LOW_STOCK') {
                      <i class="ph ph-warning"></i>
                      <span>Low ({{ avail.produciblePortions }} portions)</span>
                    } @else if (avail.status === 'OUT_OF_STOCK') {
                      <i class="ph ph-x-circle"></i> <span>Out of Stock</span>
                    } @else {
                      <i class="ph ph-minus-circle"></i> <span>Untracked</span>
                    }
                  </div>
                </div>

                <div class="recipe-cost-banner">
                  <div class="cost-stat">
                    <span class="stat-lbl">Indicative Food Cost</span>
                    <strong class="stat-val text-onyx">{{
                      rec.indicativeCost | currencyInr
                    }}</strong>
                  </div>
                  @if (getDishPrice(rec.menuItemId); as price) {
                    <div class="cost-stat">
                      <span class="stat-lbl">Menu Price</span>
                      <strong class="stat-val">{{ price | currencyInr }}</strong>
                    </div>
                    <div class="cost-stat">
                      <span class="stat-lbl">Est. Food Cost %</span>
                      <strong class="stat-val text-secondary"
                        >{{ calcFoodCostPct(rec.indicativeCost, price) }}%</strong
                      >
                    </div>
                  }
                </div>

                <!-- Ingredient Formulation List -->
                <div class="recipe-ingredients-list">
                  <h4 class="ing-list-heading">Required Ingredients Per Serving:</h4>
                  <ul class="ing-items-stream">
                    @for (it of rec.items; track it.ingredientId) {
                      @let ing = getIngredient(it.ingredientId);
                      <li class="ing-item-row">
                        <span class="ing-name">{{ ing?.name || it.ingredientId }}</span>
                        <span class="ing-qty"
                          ><strong>{{ it.quantity }}</strong> {{ it.unit }}</span
                        >
                        @if (ing) {
                          <span class="ing-stock-hint" [class.text-crimson]="ing.currentStock <= 0">
                            (Stock: {{ ing.currentStock }} {{ ing.unit }})
                          </span>
                        }
                      </li>
                    }
                  </ul>
                </div>

                @if (rec.instructions) {
                  <p class="recipe-instructions">
                    <i class="ph ph-note"></i> <em>{{ rec.instructions }}</em>
                  </p>
                }

                @if (avail.missingIngredients && avail.missingIngredients.length > 0) {
                  <div class="missing-alert">
                    <i class="ph ph-warning-octagon"></i>
                    <span>Shortage: {{ avail.missingIngredients.join(', ') }}</span>
                  </div>
                }

                <div class="recipe-actions">
                  <button class="btn btn-secondary btn-sm" (click)="openRecipeModal(rec)">
                    <i class="ph ph-pencil"></i>
                    <span>Edit Formulation</span>
                  </button>
                  <button class="btn btn-secondary btn-sm" (click)="toggleRecipe(rec)">
                    <i
                      class="ph"
                      [class.ph-eye-slash]="rec.isActive"
                      [class.ph-eye]="!rec.isActive"
                    ></i>
                    <span>{{ rec.isActive ? 'Deactivate' : 'Activate' }}</span>
                  </button>
                </div>
              </div>
            } @empty {
              <div style="grid-column: 1 / -1; width: 100%;">
                <app-empty-state
                  icon="ph-cooking-pot"
                  title="No Recipes Found"
                  message="Define dish recipes and formulations to calculate ingredient costs and food margins."
                  actionText="New Recipe"
                  actionIcon="ph-book-open"
                  (actionClick)="openRecipeModal()"
                  [bordered]="false"
                />
              </div>
            }
          </div>
        </div>
      }

      <!-- TAB 3: STOCK MOVEMENT LEDGER -->
      @if (activeTab() === 'LEDGER') {
        <div class="tab-content">
          <!-- Ledger Toolbar -->
          <div class="toolbar-card">
            <div class="search-input-wrap">
              <i class="ph ph-magnifying-glass"></i>
              <input
                type="text"
                class="form-input"
                placeholder="Search ledger by ingredient, reason, or order #..."
                [ngModel]="ledgerSearch()"
                (ngModelChange)="ledgerSearch.set($event)"
              />
            </div>

            <div class="filter-controls">
              <select
                class="form-select"
                [ngModel]="selectedMovementType()"
                (ngModelChange)="selectedMovementType.set($event)"
              >
                <option value="ALL">All Movement Types</option>
                <option value="OPENING_STOCK">Opening Stock</option>
                <option value="RESTOCK">Restock / Purchase</option>
                <option value="RECIPE_CONSUMPTION">Recipe Consumption</option>
                <option value="WASTAGE">Wastage / Spoilage</option>
                <option value="MANUAL_ADJUSTMENT">Manual Adjustment</option>
                <option value="REVERSAL">Reversal</option>
              </select>
            </div>
          </div>

          <!-- Movement History Table -->
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Movement Type</th>
                  <th>Ingredient</th>
                  <th>Delta (Qty)</th>
                  <th>Level Transition</th>
                  <th>Audit Reason & Reference</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                @for (mov of filteredMovements(); track mov.id) {
                  <tr>
                    <td class="text-nowrap text-sm text-muted">
                      {{ mov.timestamp | date: 'short' }}
                    </td>
                    <td>
                      <span class="badge" [ngClass]="getMovementBadgeClass(mov.type)">
                        {{ formatMovementType(mov.type) }}
                      </span>
                    </td>
                    <td>
                      <strong>{{ mov.ingredientName }}</strong>
                    </td>
                    <td>
                      <strong
                        [class.text-green]="mov.quantityDelta > 0"
                        [class.text-crimson]="mov.quantityDelta < 0"
                      >
                        {{ mov.quantityDelta > 0 ? '+' : '' }}{{ mov.quantityDelta }} {{ mov.unit }}
                      </strong>
                    </td>
                    <td class="text-nowrap text-sm">
                      {{ mov.quantityBefore }} {{ mov.unit }}
                      <i class="ph ph-arrow-right text-xs mx-1"></i>
                      <strong>{{ mov.quantityAfter }} {{ mov.unit }}</strong>
                    </td>
                    <td>
                      <div class="reason-cell">
                        <span>{{ mov.reason }}</span>
                        @if (mov.referenceId) {
                          <span class="ref-pill">{{ mov.referenceId }}</span>
                        }
                      </div>
                    </td>
                    <td class="text-sm text-secondary">{{ mov.staffName || 'System' }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7" style="padding: 0;">
                      <app-empty-state
                        icon="ph-clipboard-text"
                        title="No Stock Movements Recorded"
                        message="Restocks, wastage, and kitchen recipe deductions will be audited here."
                        [bordered]="false"
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- MODAL 1: ADD / EDIT INGREDIENT -->
      @if (showIngredientModal()) {
        <div class="modal-overlay" (click)="onBackdropClick($event, 'ingredient')">
          <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="ing-modal-title">
            <div class="modal-header">
              <div>
                <h2 id="ing-modal-title" class="heading-card">
                  {{ editingIngredientId() ? 'Edit Ingredient' : 'Register New Ingredient' }}
                </h2>
                <p class="text-xs text-muted">
                  Raw material catalog item with base measurement units.
                </p>
              </div>
              <button
                class="modal-close-btn"
                (click)="showIngredientModal.set(false)"
                aria-label="Close modal"
              >
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <div class="form-group">
                <label class="form-label" for="ingName">Ingredient Name *</label>
                <input
                  id="ingName"
                  type="text"
                  class="form-input"
                  [(ngModel)]="ingredientForm.name"
                  placeholder="e.g. Malai Paneer, Basmati Rice"
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="ingDesc">Description / Quality Specs</label>
                <input
                  id="ingDesc"
                  type="text"
                  class="form-input"
                  [(ngModel)]="ingredientForm.description"
                  placeholder="e.g. 100% full-cream buffalo milk block"
                />
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label class="form-label" for="ingCat">Category *</label>
                  <select id="ingCat" class="form-select" [(ngModel)]="ingredientForm.category">
                    <option value="PRODUCE">Produce (Vegetables/Fruits)</option>
                    <option value="DAIRY">Dairy</option>
                    <option value="MEAT">Meat & Poultry</option>
                    <option value="GRAINS">Grains & Pulses</option>
                    <option value="SPICES">Spices & Seasoning</option>
                    <option value="BEVERAGES">Beverages</option>
                    <option value="PACKAGING">Packaging</option>
                    <option value="OTHER">Other / Cooking Oils</option>
                  </select>
                </div>

                <div class="form-group flex-1">
                  <label class="form-label" for="ingUnit">Base Measurement Unit *</label>
                  <select id="ingUnit" class="form-select" [(ngModel)]="ingredientForm.unit">
                    <option value="kg">Kilograms (kg)</option>
                    <option value="g">Grams (g)</option>
                    <option value="l">Litres (l)</option>
                    <option value="ml">Millilitres (ml)</option>
                    <option value="pcs">Pieces / Units (pcs)</option>
                  </select>
                </div>
              </div>

              <div class="form-row">
                @if (!editingIngredientId()) {
                  <div class="form-group flex-1">
                    <label class="form-label" for="ingInitial">Initial Stock *</label>
                    <input
                      id="ingInitial"
                      type="number"
                      step="0.1"
                      class="form-input"
                      [(ngModel)]="ingredientForm.currentStock"
                    />
                  </div>
                }

                <div class="form-group flex-1">
                  <label class="form-label" for="ingMin">Min Alert Threshold *</label>
                  <input
                    id="ingMin"
                    type="number"
                    step="0.1"
                    class="form-input"
                    [(ngModel)]="ingredientForm.minThreshold"
                  />
                </div>

                <div class="form-group flex-1">
                  <label class="form-label" for="ingTarget">Target / Reorder Level</label>
                  <input
                    id="ingTarget"
                    type="number"
                    step="0.1"
                    class="form-input"
                    [(ngModel)]="ingredientForm.targetStock"
                  />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label class="form-label" for="ingCost">Purchase Cost (INR) *</label>
                  <input
                    id="ingCost"
                    type="number"
                    step="0.5"
                    class="form-input"
                    [(ngModel)]="ingredientForm.costPerUnit"
                  />
                </div>

                <div class="form-group flex-1">
                  <label class="form-label" for="ingSupplier">Supplier Name</label>
                  <input
                    id="ingSupplier"
                    type="text"
                    class="form-input"
                    [(ngModel)]="ingredientForm.supplierName"
                    placeholder="e.g. Verka Dairy, Local Mandi"
                  />
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showIngredientModal.set(false)">
                Cancel
              </button>
              <button class="btn btn-primary" (click)="saveIngredient()">Save Ingredient</button>
            </div>
          </div>
        </div>
      }

      <!-- MODAL 2: RESTOCK WORKFLOW -->
      @if (showRestockModal()) {
        <div class="modal-overlay" (click)="onBackdropClick($event, 'restock')">
          <div
            class="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="restock-modal-title"
          >
            <div class="modal-header">
              <div>
                <h2 id="restock-modal-title" class="heading-card">
                  Record Stock Receipt / Restock
                </h2>
                <p class="text-xs text-muted">
                  Auditable incoming supply delivery from wholesale vendor.
                </p>
              </div>
              <button
                class="modal-close-btn"
                (click)="showRestockModal.set(false)"
                aria-label="Close modal"
              >
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <div class="form-group">
                <label class="form-label" for="restockIng">Target Ingredient *</label>
                <select id="restockIng" class="form-select" [(ngModel)]="restockForm.ingredientId">
                  <option value="">Select an ingredient...</option>
                  @for (ing of ingredients(); track ing.id) {
                    <option [value]="ing.id">
                      {{ ing.name }} (Current: {{ ing.currentStock }} {{ ing.unit }})
                    </option>
                  }
                </select>
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label class="form-label" for="restockQty">Received Quantity *</label>
                  <input
                    id="restockQty"
                    type="number"
                    step="0.1"
                    min="0.01"
                    class="form-input"
                    [(ngModel)]="restockForm.quantity"
                    placeholder="Quantity added"
                  />
                </div>

                <div class="form-group flex-1">
                  <label class="form-label" for="restockStaff">Received By Staff</label>
                  <input
                    id="restockStaff"
                    type="text"
                    class="form-input"
                    [(ngModel)]="restockForm.staffName"
                    placeholder="Staff Name"
                  />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="restockReason">Delivery Invoice / Vendor Note</label>
                <input
                  id="restockReason"
                  type="text"
                  class="form-input"
                  [(ngModel)]="restockForm.reason"
                  placeholder="e.g. Invoice #PO-9402 from Punjab Mandi"
                />
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showRestockModal.set(false)">
                Cancel
              </button>
              <button class="btn btn-primary" (click)="submitRestock()">Commit Restock</button>
            </div>
          </div>
        </div>
      }

      <!-- MODAL 3: MANUAL ADJUSTMENT / WASTAGE WORKFLOW -->
      @if (showAdjustmentModal()) {
        <div class="modal-overlay" (click)="onBackdropClick($event, 'adjust')">
          <div
            class="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="adjust-modal-title"
          >
            <div class="modal-header">
              <div>
                <h2 id="adjust-modal-title" class="heading-card">
                  Record Stock Adjustment / Wastage
                </h2>
                <p class="text-xs text-muted">
                  Audited deduction or physical count adjustment. Requires reason.
                </p>
              </div>
              <button
                class="modal-close-btn"
                (click)="showAdjustmentModal.set(false)"
                aria-label="Close modal"
              >
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <div class="form-group">
                <label class="form-label" for="adjType">Adjustment Type *</label>
                <select id="adjType" class="form-select" [(ngModel)]="adjustForm.type">
                  <option value="WASTAGE">Kitchen Wastage / Spoilage</option>
                  <option value="MANUAL_ADJUSTMENT">Physical Audit Stock Adjustment</option>
                  <option value="STOCK_CORRECTION">Correction of Prior Error</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="adjIng">Ingredient *</label>
                <select id="adjIng" class="form-select" [(ngModel)]="adjustForm.ingredientId">
                  <option value="">Select an ingredient...</option>
                  @for (ing of ingredients(); track ing.id) {
                    <option [value]="ing.id">
                      {{ ing.name }} (Current: {{ ing.currentStock }} {{ ing.unit }})
                    </option>
                  }
                </select>
              </div>

              <div class="form-row">
                <div class="form-group flex-1">
                  <label class="form-label" for="adjQty">Quantity Change *</label>
                  <input
                    id="adjQty"
                    type="number"
                    step="0.05"
                    class="form-input"
                    [(ngModel)]="adjustForm.delta"
                    placeholder="e.g. -2.5 for wastage, +1.0 for gain"
                  />
                  <span class="text-xs text-muted"
                    >Use negative numbers for deductions or wastage.</span
                  >
                </div>

                <div class="form-group flex-1">
                  <label class="form-label" for="adjStaff">Audited By Staff</label>
                  <input
                    id="adjStaff"
                    type="text"
                    class="form-input"
                    [(ngModel)]="adjustForm.staffName"
                  />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="adjReason">Mandatory Audit Reason *</label>
                <input
                  id="adjReason"
                  type="text"
                  class="form-input"
                  [(ngModel)]="adjustForm.reason"
                  placeholder="e.g. Refrigerator breakdown spoilage, physical count discrepancy"
                />
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showAdjustmentModal.set(false)">
                Cancel
              </button>
              <button class="btn btn-primary" (click)="submitAdjustment()">
                Record Adjustment
              </button>
            </div>
          </div>
        </div>
      }

      <!-- MODAL 4: RECIPE EDITOR -->
      @if (showRecipeModal()) {
        <div class="modal-overlay" (click)="onBackdropClick($event, 'recipe')">
          <div
            class="modal-card modal-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recipe-modal-title"
          >
            <div class="modal-header">
              <div>
                <h2 id="recipe-modal-title" class="heading-card">
                  {{ editingRecipeId() ? 'Edit Recipe Formulation' : 'Create New Dish Recipe' }}
                </h2>
                <p class="text-xs text-muted">
                  Define raw ingredient portion requirements per single menu dish serving.
                </p>
              </div>
              <button
                class="modal-close-btn"
                (click)="showRecipeModal.set(false)"
                aria-label="Close modal"
              >
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">Target Menu Dish *</label>

                @if (getSelectedRecipeDish(); as dish) {
                  <div class="chosen-dish-card">
                    <div class="chosen-dish-main">
                      <app-dietary-badge [type]="dish.dietary"></app-dietary-badge>
                      <div class="chosen-dish-text">
                        <strong class="chosen-dish-name">{{ dish.name }}</strong>
                        <span class="text-xs text-muted">
                          Menu Price: <strong>{{ dish.price | currencyInr }}</strong> • Category:
                          {{ getDishCategoryName(dish.categoryId) }}
                        </span>
                      </div>
                    </div>
                    @if (!editingRecipeId()) {
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        (click)="openDishPickerDrawer()"
                        title="Choose another dish"
                      >
                        <i class="ph ph-arrows-clockwise"></i>
                        <span>Change Dish</span>
                      </button>
                    } @else {
                      <span class="badge badge-neutral">Locked (Editing Formulation)</span>
                    }
                  </div>
                } @else {
                  <button
                    type="button"
                    class="dish-picker-trigger-btn"
                    (click)="openDishPickerDrawer()"
                  >
                    <div class="trigger-icon-circle">
                      <i class="ph ph-cooking-pot"></i>
                    </div>
                    <div class="trigger-text-wrap">
                      <strong class="trigger-heading">Choose Menu Dish from Catalog</strong>
                      <span class="trigger-sub"
                        >Search all dishes with categories, pricing, and recipe status</span
                      >
                    </div>
                    <span class="btn btn-secondary btn-sm">
                      <i class="ph ph-magnifying-glass"></i>
                      <span>Browse Dishes</span>
                    </span>
                  </button>
                }
              </div>

              <div class="recipe-items-section">
                <div class="section-title-row">
                  <h3 class="heading-card text-sm">Formulation Ingredients</h3>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    (click)="addRecipeItemRow()"
                  >
                    <i class="ph ph-plus"></i> Add Ingredient
                  </button>
                </div>

                <div class="recipe-table-wrap">
                  <table class="recipe-form-table">
                    <thead>
                      <tr>
                        <th>Ingredient</th>
                        <th>Required Qty</th>
                        <th>Measurement Unit</th>
                        <th>Indicative Cost</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (it of recipeForm.items; track $index) {
                        <tr>
                          <td>
                            <select
                              class="form-select select-sm"
                              [(ngModel)]="it.ingredientId"
                              (ngModelChange)="onRecipeItemIngredientChange(it)"
                            >
                              <option value="">Select ingredient...</option>
                              @for (ing of ingredients(); track ing.id) {
                                <option [value]="ing.id">{{ ing.name }} ({{ ing.unit }})</option>
                              }
                            </select>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min="0.001"
                              class="form-input input-sm"
                              [(ngModel)]="it.quantity"
                            />
                          </td>
                          <td>
                            <select class="form-select select-sm" [(ngModel)]="it.unit">
                              <option value="kg">kg</option>
                              <option value="g">g</option>
                              <option value="l">l</option>
                              <option value="ml">ml</option>
                              <option value="pcs">pcs</option>
                            </select>
                          </td>
                          <td class="text-sm">
                            <strong>{{ calcItemCost(it) | currencyInr }}</strong>
                          </td>
                          <td>
                            <button
                              type="button"
                              class="btn-icon danger"
                              (click)="removeRecipeItemRow($index)"
                              title="Remove item"
                            >
                              <i class="ph ph-trash"></i>
                            </button>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>

                <div class="recipe-total-cost-strip">
                  <span>Calculated Indicative Portion Cost:</span>
                  <strong class="total-cost-val">{{
                    previewCalculatedCost() | currencyInr
                  }}</strong>
                </div>
              </div>

              <div class="form-group mt-4">
                <label class="form-label" for="recNotes">Preparation Notes / SOP</label>
                <textarea
                  id="recNotes"
                  class="form-input"
                  rows="2"
                  [(ngModel)]="recipeForm.instructions"
                  placeholder="e.g. 24-hour hung curd marination; finish over high flame tandoor charcoal"
                ></textarea>
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showRecipeModal.set(false)">Cancel</button>
              <button class="btn btn-primary" (click)="saveRecipe()">Save Recipe</button>
            </div>
          </div>
        </div>
      }

      <!-- Slide-out Menu Dish Picker Side Panel Drawer -->
      @if (showDishPickerDrawer) {
        <div class="modal-overlay drawer-overlay" (click)="onDishPickerBackdropClick($event)">
          <div
            class="dish-picker-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dish-drawer-title"
          >
            <div class="drawer-header">
              <div class="drawer-title-group">
                <div class="drawer-crest-icon"><i class="ph ph-cooking-pot"></i></div>
                <div>
                  <h3 id="dish-drawer-title" class="drawer-title">Select Menu Dish</h3>
                  <p class="drawer-sub">
                    Choose a dish from the menu to formulate its recipe & portion costing.
                  </p>
                </div>
              </div>
              <button
                type="button"
                class="drawer-close-btn"
                (click)="showDishPickerDrawer = false"
                aria-label="Close dish picker"
              >
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="drawer-search-bar">
              <div class="search-input-wrap">
                <i class="ph ph-magnifying-glass search-ico"></i>
                <input
                  type="text"
                  class="form-input search-input"
                  placeholder="Search dish by name or category..."
                  [ngModel]="dishPickerSearch()"
                  (ngModelChange)="dishPickerSearch.set($event)"
                />
                @if (dishPickerSearch()) {
                  <button type="button" class="search-clear-btn" (click)="dishPickerSearch.set('')">
                    <i class="ph ph-x"></i>
                  </button>
                }
              </div>

              <!-- Categories Filter Chips -->
              <div class="drawer-cat-chips">
                <button
                  type="button"
                  class="cat-chip"
                  [class.active]="dishPickerCategory() === 'ALL'"
                  (click)="dishPickerCategory.set('ALL')"
                >
                  All ({{ menuItems().length }})
                </button>
                @for (cat of categories(); track cat.id) {
                  <button
                    type="button"
                    class="cat-chip"
                    [class.active]="dishPickerCategory() === cat.id"
                    (click)="dishPickerCategory.set(cat.id)"
                  >
                    {{ cat.name }}
                  </button>
                }
              </div>

              <!-- Dietary Toggle Chips -->
              <div class="drawer-diet-chips">
                <button
                  type="button"
                  class="diet-filter-pill"
                  [class.active]="dishPickerDietary() === 'ALL'"
                  (click)="dishPickerDietary.set('ALL')"
                >
                  All
                </button>
                <button
                  type="button"
                  class="diet-filter-pill veg"
                  [class.active]="dishPickerDietary() === 'VEG'"
                  (click)="dishPickerDietary.set('VEG')"
                >
                  <span class="diet-dot veg"></span> Veg
                </button>
                <button
                  type="button"
                  class="diet-filter-pill non-veg"
                  [class.active]="dishPickerDietary() === 'NON_VEG'"
                  (click)="dishPickerDietary.set('NON_VEG')"
                >
                  <span class="diet-dot non-veg"></span> Non-Veg
                </button>
              </div>
            </div>

            <!-- Drawer Dishes List -->
            <div class="drawer-dishes-stream">
              @for (dish of filteredPickerDishes(); track dish.id) {
                @let isSelected = recipeForm.menuItemId === dish.id;
                @let existingRec = getRecipeForDish(dish.id);
                <div
                  class="drawer-dish-item"
                  [class.is-selected]="isSelected"
                  (click)="selectDishForRecipe(dish)"
                >
                  <div class="dish-item-left">
                    <app-dietary-badge [type]="dish.dietary"></app-dietary-badge>
                    <div class="dish-item-info">
                      <strong class="dish-name">{{ dish.name }}</strong>
                      <div class="dish-meta">
                        <span class="dish-price">{{ dish.price | currencyInr }}</span>
                        <span class="sep-dot">•</span>
                        <span class="dish-category">{{
                          getDishCategoryName(dish.categoryId)
                        }}</span>
                        @if (existingRec) {
                          <span class="sep-dot">•</span>
                          <span class="badge badge-neutral text-xs"
                            >Recipe v{{ existingRec.version }}</span
                          >
                        }
                      </div>
                    </div>
                  </div>

                  <div class="dish-item-right">
                    @if (isSelected) {
                      <span class="badge badge-gold"><i class="ph ph-check"></i> Selected</span>
                    } @else {
                      <button type="button" class="btn btn-secondary btn-xs">
                        <span>Select</span>
                        <i class="ph ph-arrow-right"></i>
                      </button>
                    }
                  </div>
                </div>
              } @empty {
                <div class="drawer-empty-state">
                  <i class="ph ph-magnifying-glass"></i>
                  <p>No dishes found matching filter.</p>
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .inventory-page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--space-md);

        .header-title-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 3px;
        }

        .heading-display {
          margin: 0;
          font-size: 1.875rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: var(--color-onyx);
        }

        .apple-status-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.6875rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 3px 8px;
          border-radius: 9999px;
          background: rgba(16, 185, 129, 0.1);
          color: #059669;
          border: 1px solid rgba(16, 185, 129, 0.22);

          .dot-indicator {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #10b981;
            box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
          }
        }
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .apple-btn-primary {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-radius: 8px;
        background: var(--color-primary);
        color: #ffffff;
        font-size: 0.8125rem;
        font-weight: 600;
        border: 1px solid var(--color-primary);
        cursor: pointer;
        transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: 0 1px 3px rgba(194, 65, 12, 0.25);

        &:hover {
          background: #b23b0a;
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(194, 65, 12, 0.35);
        }

        &:active {
          transform: scale(0.97);
        }
      }

      .apple-btn-secondary {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--color-surface);
        color: var(--color-text-primary);
        font-size: 0.8125rem;
        font-weight: 600;
        border: 1px solid var(--color-border);
        cursor: pointer;
        transition: all 0.16s cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);

        &:hover {
          background: var(--color-bone-light);
          border-color: var(--color-border-subtle);
          color: var(--color-text-primary);
          transform: translateY(-1px);
        }

        &:active {
          transform: scale(0.97);
        }
      }

      /* KPI Cards */
      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 12px;
      }

      .kpi-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        padding: 12px 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

        &:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
          border-color: var(--color-border-subtle);
        }

        &.kpi-alert {
          border-color: rgba(245, 158, 11, 0.35);
          background: rgba(245, 158, 11, 0.03);
        }

        &.kpi-danger {
          border-color: rgba(239, 68, 68, 0.35);
          background: rgba(239, 68, 68, 0.03);
        }
      }

      .kpi-icon {
        width: 38px;
        height: 38px;
        border-radius: 9px;
        background: rgba(18, 18, 18, 0.04);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.15rem;
        color: var(--color-onyx);
        flex-shrink: 0;

        &.alert-icon {
          background: rgba(245, 158, 11, 0.12);
          color: #d97706;
        }
        &.danger-icon {
          background: rgba(239, 68, 68, 0.12);
          color: #dc2626;
        }
        &.value-icon {
          background: rgba(59, 130, 246, 0.1);
          color: #2563eb;
        }
        &.waste-icon {
          background: rgba(239, 68, 68, 0.1);
          color: #dc2626;
        }
        &.icon-blue {
          background: rgba(59, 130, 246, 0.1);
          color: #2563eb;
        }
        &.icon-emerald {
          background: rgba(16, 185, 129, 0.1);
          color: #059669;
        }
        &.icon-rose {
          background: rgba(239, 68, 68, 0.1);
          color: #dc2626;
        }
        &.icon-slate {
          background: rgba(100, 116, 139, 0.1);
          color: #475569;
        }
      }

      .kpi-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .kpi-label {
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        white-space: nowrap;
      }

      .kpi-value {
        font-size: 1.3125rem;
        font-weight: 800;
        color: var(--color-text-primary);
        letter-spacing: -0.02em;
        line-height: 1.2;
      }

      /* Apple Segmented Tabs Bar */
      .tabs-nav-bar {
        display: inline-flex;
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        padding: 4px;
        gap: 3px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
        overflow-x: auto;
        max-width: 100%;
        margin-bottom: 4px;
      }

      .tab-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        background: transparent;
        border: none;
        border-radius: 7px;
        font-weight: 600;
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;

        .tab-icon {
          font-size: 1.05rem;
          color: var(--color-taupe);
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .tab-title {
          font-weight: 600;
        }

        .tab-count-pill {
          font-size: 0.6875rem;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 9999px;
          background: rgba(0, 0, 0, 0.05);
          color: var(--color-text-muted);
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }

        &:hover:not(.active) {
          color: var(--color-text-primary);
          background: rgba(0, 0, 0, 0.03);

          .tab-icon {
            color: var(--color-onyx);
          }
        }

        &.active {
          background: var(--color-surface);
          color: var(--color-text-primary);
          box-shadow:
            0 1px 4px rgba(0, 0, 0, 0.08),
            0 0 1px rgba(0, 0, 0, 0.1);

          .tab-icon {
            color: var(--color-primary);
            transform: scale(1.05);
          }

          .tab-title {
            color: var(--color-text-primary);
            font-weight: 700;
          }

          .tab-count-pill {
            background: rgba(194, 65, 12, 0.12);
            color: var(--color-primary);
            font-weight: 700;
          }
        }
      }

      /* Toolbar */
      .toolbar-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 12px 18px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 14px;
        margin-bottom: var(--space-md);
        box-shadow: var(--shadow-card);
        transition:
          border-color var(--transition-fast),
          box-shadow var(--transition-fast);

        &:focus-within {
          border-color: rgba(212, 175, 55, 0.45);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
        }
      }

      .search-input-wrap {
        position: relative;
        flex: 1;
        min-width: 280px;
        display: flex;
        align-items: center;

        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--color-taupe);
          font-size: 1.1rem;
          pointer-events: none;
          transition: color var(--transition-fast);
        }

        .search-input {
          width: 100%;
          height: 44px;
          padding-left: 42px;
          padding-right: 38px;
          border-radius: var(--radius-md, 10px);
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          font-size: 0.875rem;
          color: var(--color-text-primary);
          transition: all var(--transition-fast);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);

          &:focus {
            background: var(--color-surface);
            border-color: var(--color-primary);
            box-shadow: 0 0 0 3px rgba(194, 65, 12, 0.12);
            outline: none;

            & ~ .search-icon {
              color: var(--color-primary);
            }
          }

          &::placeholder {
            color: var(--color-taupe);
          }
        }

        .search-clear-btn {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: none;
          background: rgba(18, 18, 18, 0.08);
          color: var(--color-text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 0.75rem;
          transition: all var(--transition-fast);

          &:hover {
            background: var(--color-onyx);
            color: #ffffff;
          }
        }
      }

      .filter-controls {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .filter-select-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;

        .select-lead-icon {
          position: absolute;
          left: 12px;
          pointer-events: none;
          color: var(--color-taupe);
          font-size: 1rem;
          transition: color var(--transition-fast);
          z-index: 1;
        }

        .select-caret-icon {
          position: absolute;
          right: 12px;
          pointer-events: none;
          color: var(--color-taupe);
          font-size: 0.85rem;
          transition:
            transform var(--transition-fast),
            color var(--transition-fast);
          z-index: 1;
        }

        .filter-select {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          height: 40px;
          padding: 0 34px 0 36px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--color-text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);

          &:hover {
            border-color: var(--color-taupe);
            color: var(--color-onyx);
          }

          &:focus {
            border-color: var(--color-crimson);
            box-shadow: var(--shadow-focus);
            outline: none;
            color: var(--color-onyx);

            & ~ .select-lead-icon {
              color: var(--color-crimson);
            }
            & ~ .select-caret-icon {
              color: var(--color-crimson);
              transform: rotate(180deg);
            }
          }
        }

        &.filter-active {
          .filter-select {
            border-color: rgba(212, 175, 55, 0.6);
            background: var(--color-gold-subtle);
            color: #7d6514;
            font-weight: 700;
          }

          .select-lead-icon {
            color: #7d6514;
          }

          .select-caret-icon {
            color: #7d6514;
          }
        }
      }

      .btn-reset-filters {
        height: 40px;
        padding: 0 12px;
        border-radius: var(--radius-sm);
        border: 1px dashed var(--color-border);
        background: transparent;
        color: var(--color-crimson);
        font-size: 0.8125rem;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        transition: all var(--transition-fast);

        &:hover {
          background: var(--color-danger-bg);
          border-color: var(--color-crimson);
          border-style: solid;
        }
      }

      .filter-count-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 40px;
        padding: 0 14px;
        border-radius: var(--radius-sm);
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        white-space: nowrap;

        .count-value {
          font-weight: 800;
          color: var(--color-onyx);
          font-size: 0.875rem;
        }

        .count-label {
          color: var(--color-text-muted);
          font-weight: 500;
        }
      }

      /* Table */
      .table-container {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        overflow-x: auto;
        box-shadow: var(--shadow-xs);
      }

      .data-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 0.875rem;

        th {
          background: var(--color-bone-light);
          padding: 14px 16px;
          text-align: left;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--color-text-secondary);
          border-bottom: 1px solid var(--color-border);
          white-space: nowrap;
        }

        td {
          padding: 14px 16px;
          border-bottom: 1px solid var(--color-border-subtle);
          color: var(--color-text-primary);
          vertical-align: middle;
        }

        tr:last-child td {
          border-bottom: none;
        }

        tr:hover td {
          background-color: var(--color-surface-hover);
        }

        tr.row-alert td {
          background-color: rgba(133, 83, 0, 0.04);
        }
        tr.row-danger td {
          background-color: rgba(169, 28, 18, 0.04);
        }
      }

      .ing-meta-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;

        .ing-name {
          color: var(--color-text-primary);
          font-weight: 700;
          font-size: 0.875rem;
        }

        .ing-sub-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;

          .supplier-tag {
            font-size: 0.6875rem;
            color: var(--color-text-secondary);
            display: inline-flex;
            align-items: center;
            gap: 3px;
          }

          .desc-tag {
            font-size: 0.6875rem;
            color: var(--color-text-muted);
          }
        }
      }

      .category-pill {
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 6px;
        background: rgba(100, 116, 139, 0.08);
        border: 1px solid rgba(100, 116, 139, 0.16);
        color: #475569;
        letter-spacing: 0.04em;
        display: inline-block;

        &[data-cat='DAIRY'] {
          background: rgba(59, 130, 246, 0.1);
          color: #2563eb;
          border-color: rgba(59, 130, 246, 0.2);
        }
        &[data-cat='MEAT'] {
          background: rgba(239, 68, 68, 0.1);
          color: #dc2626;
          border-color: rgba(239, 68, 68, 0.2);
        }
        &[data-cat='PRODUCE'] {
          background: rgba(16, 185, 129, 0.1);
          color: #059669;
          border-color: rgba(16, 185, 129, 0.2);
        }
        &[data-cat='GRAINS'],
        &[data-cat='PULSES'] {
          background: rgba(245, 158, 11, 0.1);
          color: #d97706;
          border-color: rgba(245, 158, 11, 0.2);
        }
        &[data-cat='SPICES'] {
          background: rgba(249, 115, 22, 0.1);
          color: #ea580c;
          border-color: rgba(249, 115, 22, 0.2);
        }
        &[data-cat='FLOUR'],
        &[data-cat='OTHER'] {
          background: rgba(100, 116, 139, 0.1);
          color: #475569;
          border-color: rgba(100, 116, 139, 0.2);
        }
      }

      .stock-qty-cell {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 110px;
      }

      .stock-num {
        font-weight: 700;
        font-size: 0.875rem;
      }

      .threshold-val,
      .unit-rate-val {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
      }

      .valuation-val {
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--color-text-primary);
      }

      .stock-bar-track {
        width: 100%;
        height: 5px;
        background: rgba(18, 18, 18, 0.06);
        border-radius: 9999px;
        overflow: hidden;
      }

      .stock-bar-fill {
        height: 100%;
        background: #10b981;
        border-radius: 9999px;
        transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);

        &.fill-warning {
          background: #f59e0b;
        }
        &.fill-danger {
          background: #ef4444;
        }
      }

      .badge-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 9px;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        white-space: nowrap;

        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        &.is-success {
          background: rgba(16, 185, 129, 0.1);
          color: #059669;
          border: 1px solid rgba(16, 185, 129, 0.22);
          .status-dot {
            background: #10b981;
          }
        }
        &.is-warning {
          background: rgba(245, 158, 11, 0.1);
          color: #d97706;
          border: 1px solid rgba(245, 158, 11, 0.22);
          .status-dot {
            background: #f59e0b;
          }
        }
        &.is-danger {
          background: rgba(239, 68, 68, 0.1);
          color: #dc2626;
          border: 1px solid rgba(239, 68, 68, 0.22);
          .status-dot {
            background: #ef4444;
          }
        }
      }

      .row-actions {
        display: flex;
        align-items: center;
        gap: 6px;

        &.justify-end {
          justify-content: flex-end;
        }
      }

      .apple-row-btn {
        width: 30px;
        height: 30px;
        border-radius: 7px;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        font-size: 0.95rem;

        &:hover {
          background: var(--color-bone-light);
          border-color: var(--color-text-muted);
          color: var(--color-text-primary);
          transform: translateY(-1px);
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.04);
        }

        &:active {
          transform: scale(0.94);
        }
      }

      .btn-icon {
        width: 32px;
        height: 32px;
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all var(--transition-fast);
        font-size: 1rem;

        &:hover {
          background: var(--color-surface-hover);
          color: var(--color-onyx);
          border-color: var(--color-taupe);
          box-shadow: var(--shadow-xs);
        }

        &.danger:hover {
          background: var(--color-danger-bg);
          color: var(--color-danger);
          border-color: var(--color-danger);
        }
      }

      /* Badges */
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: var(--radius-full);
        line-height: 1.3;

        &.badge-success {
          background: var(--color-success-bg);
          color: var(--color-success);
        }
        &.badge-warning {
          background: var(--color-warning-bg);
          color: var(--color-warning);
        }
        &.badge-danger {
          background: var(--color-danger-bg);
          color: var(--color-danger);
        }
        &.badge-info {
          background: var(--color-info-bg);
          color: var(--color-info);
        }
        &.badge-neutral {
          background: rgba(18, 18, 18, 0.06);
          color: var(--color-text-secondary);
        }
      }

      /* Recipes Grid */
      .recipes-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
        gap: var(--space-md);
      }

      .recipe-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: var(--space-md);
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
        box-shadow: var(--shadow-xs);
        transition:
          transform var(--transition-fast),
          box-shadow var(--transition-fast);

        &:hover {
          box-shadow: var(--shadow-sm);
        }

        &.recipe-inactive {
          opacity: 0.65;
        }
      }

      .recipe-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: var(--space-sm);
      }

      .recipe-title {
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--color-text-primary);
      }

      .recipe-ver {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .recipe-status-pill {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: var(--radius-full);
        display: inline-flex;
        align-items: center;
        gap: 5px;

        &.status-available {
          background: var(--color-success-bg);
          color: var(--color-success);
        }
        &.status-low_stock {
          background: var(--color-warning-bg);
          color: var(--color-warning);
        }
        &.status-out_of_stock {
          background: var(--color-danger-bg);
          color: var(--color-danger);
        }
        &.status-untracked {
          background: rgba(18, 18, 18, 0.06);
          color: var(--color-text-secondary);
        }
      }

      .recipe-cost-banner {
        background: var(--color-background);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 8px 12px;
        display: flex;
        justify-content: space-between;
        gap: var(--space-sm);
      }

      .cost-stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .stat-lbl {
        font-size: 0.6875rem;
        color: var(--color-text-secondary);
        text-transform: uppercase;
        font-weight: 600;
      }

      .stat-val {
        font-size: 0.9375rem;
        font-weight: 800;
      }

      .ing-list-heading {
        font-size: 0.75rem;
        text-transform: uppercase;
        color: var(--color-text-muted);
        margin-bottom: 6px;
        font-weight: 700;
      }

      .ing-items-stream {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .ing-item-row {
        display: flex;
        justify-content: space-between;
        font-size: 0.8125rem;
        padding: 4px 0;
        border-bottom: 1px dashed rgba(18, 18, 18, 0.06);
      }

      .ing-name {
        color: var(--color-text-primary);
      }

      .ing-qty {
        color: var(--color-onyx);
        font-weight: 600;
      }

      .ing-stock-hint {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
      }

      .recipe-instructions {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
        background: var(--color-bone-light);
        padding: 8px 12px;
        border-radius: var(--radius-sm);
        margin-top: 4px;
        border: 1px solid var(--color-border-subtle);
      }

      .missing-alert {
        background: var(--color-danger-bg);
        border: 1px solid rgba(169, 28, 18, 0.25);
        color: var(--color-danger);
        font-size: 0.75rem;
        font-weight: 600;
        padding: 6px 10px;
        border-radius: var(--radius-sm);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .recipe-actions {
        display: flex;
        gap: var(--space-sm);
        margin-top: auto;
        padding-top: var(--space-sm);
        border-top: 1px solid var(--color-border);
      }

      /* Ledger Details */
      .reason-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .ref-pill {
        font-size: 0.6875rem;
        background: rgba(18, 18, 18, 0.06);
        border: 1px solid var(--color-border-subtle);
        padding: 2px 6px;
        border-radius: var(--radius-xs);
        font-family: monospace;
        color: var(--color-text-secondary);
        display: inline-block;
        width: fit-content;
      }

      /* Modals */
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(18, 18, 18, 0.65);
        backdrop-filter: blur(4px);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-md);
      }

      .modal-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        width: 100%;
        max-width: 540px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: var(--shadow-lg);
        display: flex;
        flex-direction: column;

        &.modal-lg {
          max-width: 680px;
        }
      }

      .modal-header {
        padding: var(--space-md) var(--space-lg);
        border-bottom: 1px solid var(--color-border);
        display: flex;
        justify-content: space-between;
        align-items: center;

        h2 {
          font-size: 1.25rem;
          margin: 0;
        }
      }

      .modal-close-btn {
        background: transparent;
        border: none;
        font-size: 1.25rem;
        color: var(--color-text-muted);
        cursor: pointer;
        transition: color var(--transition-fast);
        &:hover {
          color: var(--color-onyx);
        }
      }

      .modal-body {
        padding: var(--space-lg);
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
      }

      .modal-footer {
        padding: var(--space-md) var(--space-lg);
        border-top: 1px solid var(--color-border);
        display: flex;
        justify-content: flex-end;
        gap: var(--space-sm);
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .form-row {
        display: flex;
        gap: var(--space-md);
        flex-wrap: wrap;
      }

      .flex-1 {
        flex: 1;
        min-width: 140px;
      }

      .form-label {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--color-text-secondary);
        letter-spacing: 0.04em;
      }

      .recipe-form-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;

        th {
          font-size: 0.6875rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--color-text-muted);
          text-align: left;
          padding: 8px;
          background: var(--color-bone-light);
          border-bottom: 1px solid var(--color-border);
        }

        td {
          padding: 8px;
          vertical-align: middle;
          border-bottom: 1px solid var(--color-border-subtle);
        }
      }

      .input-sm,
      .select-sm {
        padding: 6px 10px;
        font-size: 0.8125rem;
      }

      .recipe-total-cost-strip {
        background: var(--color-background);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 10px 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 8px;
        font-size: 0.875rem;
        font-weight: 600;
      }

      .total-cost-val {
        font-size: 1.15rem;
        font-weight: 700;
        color: var(--color-crimson);
      }

      .section-title-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .empty-card {
        grid-column: 1 / -1;
        text-align: center;
        padding: var(--space-2xl);
        background: var(--color-surface);
        border: 1px dashed var(--color-border);
        border-radius: var(--radius-md);

        i {
          font-size: 3rem;
          color: var(--color-text-muted);
        }
      }

      .text-green {
        color: var(--color-success);
      }
      .text-amber {
        color: var(--color-warning);
      }
      .text-crimson {
        color: var(--color-danger);
      }
      .text-onyx {
        color: var(--color-onyx);
      }
      .text-nowrap {
        white-space: nowrap;
      }
      .btn-sm {
        padding: 6px 12px;
        font-size: 0.8125rem;
      }

      /* Chosen Dish Card in Recipe Modal */
      .chosen-dish-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-md);
        padding: 12px 16px;
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        border-left: 3px solid var(--color-gold);
        border-radius: var(--radius-md);

        .chosen-dish-main {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .chosen-dish-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .chosen-dish-name {
          font-size: 0.9375rem;
          color: var(--color-onyx);
          font-weight: 700;
        }
      }

      .dish-picker-trigger-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 14px 18px;
        background: var(--color-bone-light);
        border: 1.5px dashed var(--color-border);
        border-radius: var(--radius-md);
        cursor: pointer;
        text-align: left;
        transition: all var(--transition-fast);

        &:hover {
          border-color: var(--color-gold);
          background: var(--color-surface-hover);
        }

        .trigger-icon-circle {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-full);
          background: rgba(212, 175, 55, 0.15);
          color: var(--color-gold);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          flex-shrink: 0;
        }

        .trigger-text-wrap {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .trigger-heading {
          font-size: 0.875rem;
          color: var(--color-onyx);
          font-weight: 700;
        }

        .trigger-sub {
          font-size: 0.75rem;
          color: var(--color-text-muted);
        }
      }

      /* Slide-out Menu Dish Picker Drawer */
      .drawer-overlay {
        position: fixed;
        inset: 0;
        background: rgba(18, 18, 18, 0.6);
        backdrop-filter: blur(4px);
        z-index: 1200;
        display: flex;
        justify-content: flex-end;
        animation: fadeIn 0.2s ease;
      }

      .dish-picker-drawer {
        width: 100%;
        max-width: 480px;
        height: 100%;
        background: var(--color-surface);
        box-shadow: -6px 0 24px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        animation: slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 1201;

        .drawer-header {
          padding: 18px 20px;
          background: var(--color-bone-light);
          border-bottom: 1px solid var(--color-border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;

          .drawer-title-group {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
          }

          .drawer-crest-icon {
            width: 38px;
            height: 38px;
            border-radius: var(--radius-sm);
            background: rgba(212, 175, 55, 0.15);
            color: var(--color-gold);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            flex-shrink: 0;
          }

          .drawer-title {
            margin: 0;
            font-size: 1.125rem;
            font-weight: 700;
            color: var(--color-onyx);
          }

          .drawer-sub {
            margin: 2px 0 0 0;
            font-size: 0.75rem;
            color: var(--color-text-muted);
          }

          .drawer-close-btn {
            background: none;
            border: none;
            font-size: 1.25rem;
            cursor: pointer;
            color: var(--color-text-muted);
            width: 32px;
            height: 32px;
            border-radius: var(--radius-full);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all var(--transition-fast);

            &:hover {
              background: rgba(0, 0, 0, 0.08);
              color: var(--color-onyx);
            }
          }
        }

        .drawer-search-bar {
          padding: 14px 18px;
          border-bottom: 1px solid var(--color-border-subtle);
          display: flex;
          flex-direction: column;
          gap: 10px;
          background: var(--color-surface);

          .search-input-wrap {
            position: relative;
            display: flex;
            align-items: center;

            .search-ico {
              position: absolute;
              left: 14px;
              color: var(--color-text-muted);
              font-size: 1.125rem;
              pointer-events: none;
            }

            .search-input {
              width: 100%;
              height: 44px;
              padding-left: 42px;
              padding-right: 36px;
              font-size: 0.875rem;
              border: 1px solid var(--color-border);
              border-radius: var(--radius-md, 10px);
              background: var(--color-surface);
              color: var(--color-text-primary);
              transition: all var(--transition-fast, 0.15s ease);
              box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);

              &:focus {
                border-color: var(--color-primary);
                box-shadow: 0 0 0 3px rgba(194, 65, 12, 0.12);
                outline: none;
              }
            }

            .search-clear-btn {
              position: absolute;
              right: 10px;
              background: none;
              border: none;
              font-size: 0.875rem;
              color: var(--color-text-muted);
              cursor: pointer;

              &:hover {
                color: var(--color-onyx);
              }
            }
          }

          .drawer-cat-chips {
            display: flex;
            gap: 6px;
            overflow-x: auto;
            padding-bottom: 2px;
            scrollbar-width: none;
            &::-webkit-scrollbar {
              display: none;
            }

            .cat-chip {
              padding: 4px 10px;
              font-size: 0.75rem;
              font-weight: 600;
              border-radius: var(--radius-full);
              border: 1px solid var(--color-border);
              background: var(--color-bone-light);
              color: var(--color-text-secondary);
              cursor: pointer;
              white-space: nowrap;
              transition: all var(--transition-fast);

              &:hover {
                background: var(--color-border-subtle);
                color: var(--color-onyx);
              }

              &.active {
                background: var(--color-onyx);
                color: var(--color-bone);
                border-color: var(--color-onyx);
              }
            }
          }

          .drawer-diet-chips {
            display: flex;
            gap: 6px;

            .diet-filter-pill {
              display: inline-flex;
              align-items: center;
              gap: 5px;
              padding: 4px 10px;
              font-size: 0.75rem;
              font-weight: 600;
              border-radius: var(--radius-full);
              border: 1px solid var(--color-border);
              background: var(--color-surface);
              color: var(--color-text-secondary);
              cursor: pointer;
              transition: all var(--transition-fast);

              .diet-dot {
                width: 6px;
                height: 6px;
                border-radius: var(--radius-full);

                &.veg {
                  background: var(--color-success);
                }
                &.non-veg {
                  background: var(--color-danger);
                }
              }

              &.active {
                border-color: var(--color-gold);
                background: rgba(212, 175, 55, 0.1);
                color: var(--color-onyx);
                font-weight: 700;
              }
            }
          }
        }

        .drawer-dishes-stream {
          flex: 1;
          overflow-y: auto;
          padding: 12px 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;

          .drawer-dish-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 10px 14px;
            border: 1px solid var(--color-border-subtle);
            border-radius: var(--radius-md);
            background: var(--color-surface);
            cursor: pointer;
            transition: all var(--transition-fast);

            &:hover {
              border-color: var(--color-gold);
              background: rgba(212, 175, 55, 0.04);
              transform: translateX(2px);
            }

            &.is-selected {
              border-color: var(--color-gold);
              background: rgba(212, 175, 55, 0.12);
              box-shadow: inset 3px 0 0 var(--color-gold);
            }

            .dish-item-left {
              display: flex;
              align-items: center;
              gap: 10px;
              min-width: 0;
            }

            .dish-item-info {
              display: flex;
              flex-direction: column;
              gap: 2px;
              min-width: 0;
            }

            .dish-name {
              font-size: 0.875rem;
              color: var(--color-onyx);
              font-weight: 600;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .dish-meta {
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 0.75rem;
              color: var(--color-text-muted);
            }

            .dish-price {
              font-weight: 700;
              color: var(--color-onyx);
            }

            .dish-category {
              color: var(--color-text-secondary);
            }

            .sep-dot {
              opacity: 0.4;
              font-size: 0.65rem;
            }

            .dish-item-right {
              flex-shrink: 0;
            }
          }

          .drawer-empty-state {
            text-align: center;
            padding: 48px 16px;
            color: var(--color-text-muted);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;

            i {
              font-size: 2.25rem;
              opacity: 0.5;
            }

            p {
              font-size: 0.875rem;
              margin: 0;
            }
          }
        }
      }

      @keyframes slideInRight {
        from {
          transform: translateX(100%);
        }
        to {
          transform: translateX(0);
        }
      }
    `,
  ],
})
export class InventoryComponent {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);

  constructor() {
    this.dataService.loadInventory();
  }

  readonly isLoading = computed(
    () => this.dataService.isInventoryLoading() || !this.dataService.inventoryLoaded(),
  );

  readonly ingredients = this.mock.ingredients;
  readonly recipes = this.mock.recipes;
  readonly stockMovements = this.mock.stockMovements;
  readonly menuItems = this.mock.menuItems;

  // Active Tab
  readonly activeTab = signal<InventoryTab>('INGREDIENTS');

  // Filters
  readonly ingredientSearch = signal<string>('');
  readonly selectedCategory = signal<string>('ALL');
  readonly selectedStockFilter = signal<string>('ALL');

  readonly recipeSearch = signal<string>('');
  readonly ledgerSearch = signal<string>('');
  readonly selectedMovementType = signal<string>('ALL');

  // Modal States
  readonly showIngredientModal = signal<boolean>(false);
  readonly editingIngredientId = signal<string | null>(null);

  readonly showRestockModal = signal<boolean>(false);
  readonly showAdjustmentModal = signal<boolean>(false);

  readonly showRecipeModal = signal<boolean>(false);
  readonly editingRecipeId = signal<string | null>(null);

  // Dish Picker Drawer State (for Recipe Formulation)
  showDishPickerDrawer = false;
  readonly dishPickerSearch = signal<string>('');
  readonly dishPickerCategory = signal<string>('ALL');
  readonly dishPickerDietary = signal<string>('ALL');
  readonly categories = this.mock.categories;

  // Forms
  ingredientForm: {
    name: string;
    description: string;
    category: IngredientCategory;
    currentStock: number;
    unit: MeasurementUnit;
    minThreshold: number;
    targetStock: number;
    costPerUnit: number;
    supplierName: string;
  } = {
    name: '',
    description: '',
    category: 'PRODUCE',
    currentStock: 0,
    unit: 'kg',
    minThreshold: 5,
    targetStock: 20,
    costPerUnit: 50,
    supplierName: '',
  };

  restockForm = {
    ingredientId: '',
    quantity: 0,
    staffName: 'Inventory Supervisor',
    reason: '',
  };

  adjustForm = {
    ingredientId: '',
    type: 'WASTAGE' as StockMovementType,
    delta: 0,
    staffName: 'Chef De Cuisine',
    reason: '',
  };

  recipeForm: {
    menuItemId: string;
    items: RecipeItem[];
    instructions: string;
  } = {
    menuItemId: '',
    items: [],
    instructions: '',
  };

  // Computeds
  readonly valuationSummary = computed(() => this.mock.getInventoryValuationSummary());

  readonly filteredIngredients = computed(() => {
    let list = this.ingredients();

    const cat = this.selectedCategory();
    if (cat !== 'ALL') {
      list = list.filter((i) => i.category === cat);
    }

    const st = this.selectedStockFilter();
    if (st === 'OUT_OF_STOCK') {
      list = list.filter((i) => i.currentStock <= 0);
    } else if (st === 'LOW_STOCK') {
      list = list.filter((i) => i.currentStock > 0 && i.currentStock <= i.minThreshold);
    } else if (st === 'IN_STOCK') {
      list = list.filter((i) => i.currentStock > i.minThreshold);
    }

    const q = this.ingredientSearch().toLowerCase().trim();
    if (q) {
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.supplierName && i.supplierName.toLowerCase().includes(q)),
      );
    }

    return list;
  });

  readonly filteredRecipes = computed(() => {
    let list = this.recipes();
    const q = this.recipeSearch().toLowerCase().trim();
    if (q) {
      list = list.filter((r) => r.menuItemName.toLowerCase().includes(q));
    }
    return list;
  });

  readonly filteredPickerDishes = computed(() => {
    let list = this.menuItems();
    const cat = this.dishPickerCategory();
    if (cat !== 'ALL') {
      list = list.filter((d) => d.categoryId === cat);
    }
    const diet = this.dishPickerDietary();
    if (diet !== 'ALL') {
      list = list.filter((d) => d.dietary === diet);
    }
    const q = this.dishPickerSearch().toLowerCase().trim();
    if (q) {
      list = list.filter((d) => d.name.toLowerCase().includes(q));
    }
    return list;
  });

  readonly filteredMovements = computed(() => {
    let list = this.stockMovements();

    const type = this.selectedMovementType();
    if (type !== 'ALL') {
      list = list.filter((m) => m.type === type);
    }

    const q = this.ledgerSearch().toLowerCase().trim();
    if (q) {
      list = list.filter(
        (m) =>
          m.ingredientName.toLowerCase().includes(q) ||
          m.reason.toLowerCase().includes(q) ||
          (m.referenceId && m.referenceId.toLowerCase().includes(q)),
      );
    }

    return list;
  });

  // Helpers
  calcStockPercentage(current: number, target?: number): number {
    if (!target || target <= 0) return 100;
    return Math.min(100, Math.round((current / target) * 100));
  }

  calcIngredientValue(ing: Ingredient): number {
    try {
      const inCostUnit = convertUnit(ing.currentStock, ing.unit, ing.costUnit);
      return roundStock(inCostUnit * ing.costPerUnit, 2);
    } catch {
      return roundStock(ing.currentStock * ing.costPerUnit, 2);
    }
  }

  getIngredient(id: string): Ingredient | undefined {
    return this.ingredients().find((i) => i.id === id);
  }

  getReservedQuantity(id: string): number {
    return this.mock.getReservedQuantity(id);
  }

  getAvailableStock(id: string): number {
    return this.mock.getAvailableStock(id);
  }

  getDishPrice(menuItemId: string): number | null {
    const dish = this.menuItems().find((m) => m.id === menuItemId);
    return dish ? dish.price : null;
  }

  calcFoodCostPct(cost: number, price: number): number {
    if (!price || price <= 0) return 0;
    return Math.round((cost / price) * 100);
  }

  getRecipeAvailability(menuItemId: string) {
    return this.mock.checkMenuItemAvailability(menuItemId);
  }

  formatMovementType(type: StockMovementType): string {
    switch (type) {
      case 'OPENING_STOCK':
        return 'Opening Stock';
      case 'RESTOCK':
        return 'Restock / Purchase';
      case 'RECIPE_CONSUMPTION':
        return 'Recipe Consumption';
      case 'WASTAGE':
        return 'Wastage';
      case 'MANUAL_ADJUSTMENT':
        return 'Adjustment';
      case 'STOCK_CORRECTION':
        return 'Correction';
      case 'REVERSAL':
        return 'Reversal';
      default:
        return type;
    }
  }

  getMovementBadgeClass(type: StockMovementType): string {
    switch (type) {
      case 'RESTOCK':
        return 'badge-success';
      case 'OPENING_STOCK':
        return 'badge-info';
      case 'RECIPE_CONSUMPTION':
        return 'badge-neutral';
      case 'WASTAGE':
        return 'badge-danger';
      case 'MANUAL_ADJUSTMENT':
        return 'badge-warning';
      case 'REVERSAL':
        return 'badge-info';
      default:
        return 'badge-neutral';
    }
  }

  // --- Ingredient Modal Workflows ---
  openIngredientModal(ing?: Ingredient): void {
    if (ing) {
      this.editingIngredientId.set(ing.id);
      this.ingredientForm = {
        name: ing.name,
        description: ing.description || '',
        category: ing.category,
        currentStock: ing.currentStock,
        unit: ing.unit,
        minThreshold: ing.minThreshold,
        targetStock: ing.targetStock || 20,
        costPerUnit: ing.costPerUnit,
        supplierName: ing.supplierName || '',
      };
    } else {
      this.editingIngredientId.set(null);
      this.ingredientForm = {
        name: '',
        description: '',
        category: 'PRODUCE',
        currentStock: 10,
        unit: 'kg',
        minThreshold: 3,
        targetStock: 25,
        costPerUnit: 60,
        supplierName: '',
      };
    }
    this.showIngredientModal.set(true);
  }

  saveIngredient(): void {
    if (!this.ingredientForm.name.trim()) {
      this.toastService.warning('Please enter an ingredient name.');
      return;
    }

    if (this.ingredientForm.costPerUnit < 0 || this.ingredientForm.minThreshold < 0) {
      this.toastService.warning('Cost and minimum threshold cannot be negative.');
      return;
    }

    const editId = this.editingIngredientId();
    if (editId) {
      this.mock.updateIngredient(editId, {
        name: this.ingredientForm.name.trim(),
        description: this.ingredientForm.description.trim(),
        category: this.ingredientForm.category,
        unit: this.ingredientForm.unit,
        minThreshold: this.ingredientForm.minThreshold,
        targetStock: this.ingredientForm.targetStock,
        costPerUnit: this.ingredientForm.costPerUnit,
        costUnit: this.ingredientForm.unit,
        supplierName: this.ingredientForm.supplierName.trim(),
      });
      this.toastService.success(`Updated ingredient ${this.ingredientForm.name}`);
    } else {
      this.mock.createIngredient({
        name: this.ingredientForm.name.trim(),
        description: this.ingredientForm.description.trim(),
        category: this.ingredientForm.category,
        currentStock: this.ingredientForm.currentStock,
        unit: this.ingredientForm.unit,
        minThreshold: this.ingredientForm.minThreshold,
        targetStock: this.ingredientForm.targetStock,
        costPerUnit: this.ingredientForm.costPerUnit,
        costUnit: this.ingredientForm.unit,
        supplierName: this.ingredientForm.supplierName.trim(),
        isActive: true,
      });
      this.toastService.success(`Registered new ingredient ${this.ingredientForm.name}`);
    }

    this.showIngredientModal.set(false);
  }

  // --- Restock Workflows ---
  openRestockModal(targetIng?: Ingredient): void {
    this.restockForm = {
      ingredientId: targetIng ? targetIng.id : this.ingredients()[0]?.id || '',
      quantity: 5,
      staffName: 'Staff',
      reason: '',
    };
    this.showRestockModal.set(true);
  }

  quickRestock(ing: Ingredient): void {
    this.openRestockModal(ing);
  }

  submitRestock(): void {
    if (!this.restockForm.ingredientId) {
      this.toastService.warning('Please select an ingredient.');
      return;
    }
    if (this.restockForm.quantity <= 0) {
      this.toastService.warning('Restock quantity must be positive.');
      return;
    }

    const ing = this.getIngredient(this.restockForm.ingredientId);
    const res = this.mock.adjustStock({
      ingredientId: this.restockForm.ingredientId,
      delta: this.restockForm.quantity,
      type: 'RESTOCK',
      reason:
        this.restockForm.reason.trim() ||
        `Restock delivery (${this.restockForm.quantity} ${ing?.unit})`,
      staffName: this.restockForm.staffName.trim() || 'Staff',
    });

    if (res.success) {
      this.toastService.success(
        `Restocked ${this.restockForm.quantity} ${ing?.unit} of ${ing?.name}`,
      );
      this.showRestockModal.set(false);
    } else {
      this.toastService.error(res.error || 'Failed to record restock');
    }
  }

  // --- Adjustment / Wastage Workflows ---
  openAdjustmentModal(targetIng?: Ingredient): void {
    this.adjustForm = {
      ingredientId: targetIng ? targetIng.id : this.ingredients()[0]?.id || '',
      type: 'WASTAGE',
      delta: -1,
      staffName: 'Chef De Cuisine',
      reason: '',
    };
    this.showAdjustmentModal.set(true);
  }

  quickAdjust(ing: Ingredient): void {
    this.openAdjustmentModal(ing);
  }

  submitAdjustment(): void {
    if (!this.adjustForm.ingredientId) {
      this.toastService.warning('Please select an ingredient.');
      return;
    }
    if (this.adjustForm.delta === 0) {
      this.toastService.warning('Quantity delta cannot be zero.');
      return;
    }
    if (!this.adjustForm.reason.trim()) {
      this.toastService.warning(
        'A documented reason is mandatory for all manual adjustments and wastage.',
      );
      return;
    }

    const ing = this.getIngredient(this.adjustForm.ingredientId);
    const res = this.mock.adjustStock({
      ingredientId: this.adjustForm.ingredientId,
      delta: this.adjustForm.delta,
      type: this.adjustForm.type,
      reason: this.adjustForm.reason.trim(),
      staffName: this.adjustForm.staffName.trim() || 'Staff',
    });

    if (res.success) {
      this.toastService.success(
        `Recorded ${this.formatMovementType(this.adjustForm.type)} for ${ing?.name}`,
      );
      this.showAdjustmentModal.set(false);
    } else {
      this.toastService.error(res.error || 'Failed to record adjustment');
    }
  }

  // --- Recipe Workflows ---
  openRecipeModal(recipe?: Recipe): void {
    if (recipe) {
      this.editingRecipeId.set(recipe.id);
      this.recipeForm = {
        menuItemId: recipe.menuItemId,
        items: recipe.items.map((it) => ({ ...it })),
        instructions: recipe.instructions || '',
      };
    } else {
      this.editingRecipeId.set(null);
      const firstDish = this.menuItems()[0];
      this.recipeForm = {
        menuItemId: firstDish ? firstDish.id : '',
        items: [{ ingredientId: this.ingredients()[0]?.id || '', quantity: 0.2, unit: 'kg' }],
        instructions: '',
      };
    }
    this.showRecipeModal.set(true);
  }

  addRecipeItemRow(): void {
    const firstIng = this.ingredients()[0];
    this.recipeForm.items.push({
      ingredientId: firstIng ? firstIng.id : '',
      quantity: 0.1,
      unit: firstIng ? firstIng.unit : 'kg',
    });
  }

  removeRecipeItemRow(index: number): void {
    this.recipeForm.items.splice(index, 1);
  }

  onRecipeItemIngredientChange(it: RecipeItem): void {
    const ing = this.getIngredient(it.ingredientId);
    if (ing) {
      it.unit = ing.unit;
    }
  }

  calcItemCost(it: RecipeItem): number {
    const ing = this.getIngredient(it.ingredientId);
    if (!ing || !ing.costPerUnit || it.quantity <= 0) return 0;
    try {
      const converted = convertUnit(it.quantity, it.unit, ing.costUnit);
      return roundStock(converted * ing.costPerUnit, 2);
    } catch {
      return 0;
    }
  }

  previewCalculatedCost(): number {
    return this.mock.calculateRecipeCost(this.recipeForm.items);
  }

  saveRecipe(): void {
    if (!this.recipeForm.menuItemId) {
      this.toastService.warning('Please select a menu dish.');
      return;
    }

    if (this.recipeForm.items.length === 0) {
      this.toastService.warning('Recipe must contain at least one ingredient.');
      return;
    }

    const editId = this.editingRecipeId();
    if (editId) {
      const res = this.mock.updateRecipe(editId, {
        items: this.recipeForm.items,
        instructions: this.recipeForm.instructions.trim(),
      });

      if (res.success && res.recipe) {
        this.toastService.success(`Updated recipe formulation for ${res.recipe.menuItemName}`);
        this.showRecipeModal.set(false);
      } else {
        this.toastService.error(res.error || 'Failed to update recipe');
      }
    } else {
      const res = this.mock.createRecipe({
        menuItemId: this.recipeForm.menuItemId,
        menuItemName: '',
        items: this.recipeForm.items,
        instructions: this.recipeForm.instructions.trim(),
        isActive: true,
      });

      if (res.success && res.recipe) {
        this.toastService.success(`Formulation saved for ${res.recipe.menuItemName}`);
        this.showRecipeModal.set(false);
      } else {
        this.toastService.error(res.error || 'Failed to create recipe');
      }
    }
  }

  toggleRecipe(rec: Recipe): void {
    const updated = this.mock.toggleRecipeStatus(rec.id);
    if (updated) {
      this.toastService.info(
        `Recipe for ${rec.menuItemName} ${updated.isActive ? 'activated' : 'deactivated'}`,
      );
    }
  }

  onBackdropClick(event: MouseEvent, modalType: string): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      if (modalType === 'ingredient') this.showIngredientModal.set(false);
      if (modalType === 'restock') this.showRestockModal.set(false);
      if (modalType === 'adjust') this.showAdjustmentModal.set(false);
      if (modalType === 'recipe') this.showRecipeModal.set(false);
    }
  }

  // --- Dish Picker Drawer Workflows ---
  openDishPickerDrawer(): void {
    this.dishPickerSearch.set('');
    this.dishPickerCategory.set('ALL');
    this.dishPickerDietary.set('ALL');
    this.showDishPickerDrawer = true;
  }

  closeDishPickerDrawer(): void {
    this.showDishPickerDrawer = false;
  }

  selectDishForRecipe(dish: MenuItem): void {
    this.recipeForm.menuItemId = dish.id;
    this.showDishPickerDrawer = false;
  }

  getSelectedRecipeDish(): MenuItem | undefined {
    return this.menuItems().find((d) => d.id === this.recipeForm.menuItemId);
  }

  getDishCategoryName(categoryId: string): string {
    const cat = this.categories().find((c) => c.id === categoryId);
    return cat ? cat.name : 'General';
  }

  getRecipeForDish(menuItemId: string): Recipe | undefined {
    return this.recipes().find((r) => r.menuItemId === menuItemId);
  }

  onDishPickerBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('drawer-overlay')) {
      this.showDishPickerDrawer = false;
    }
  }
}
