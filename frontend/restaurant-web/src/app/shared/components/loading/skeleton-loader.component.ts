import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SkeletonVariant =
  | 'text'
  | 'title'
  | 'circle'
  | 'rect'
  | 'card'
  | 'stat-card'
  | 'table-row'
  | 'chart'
  | 'order-card'
  | 'table-card'
  | 'canvas-floor'
  | 'food-card'
  | 'customer-row'
  | 'reservation-row'
  | 'billing-row'
  | 'ingredient-row'
  | 'menu-card'
  | 'staff-card'
  | 'coupon-card';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [CommonModule],
  host: {
    '[class.skeleton-contents]': 'isContentsLayout()',
    '[class.skeleton-block]': '!isContentsLayout()',
  },
  template: `
    <div
      class="skeleton-host"
      [class.layout-contents]="isContentsLayout()"
      [class.shimmer-active]="shimmer()"
      role="status"
      aria-busy="true"
      aria-label="Loading content..."
    >
      @for (item of items(); track $index) {
        @switch (variant()) {
          @case ('text') {
            <div
              class="skeleton-base skeleton-text"
              [style.width]="width() || '100%'"
              [style.height]="height() || '14px'"
              [style.border-radius]="borderRadius() || '4px'"
            ></div>
          }

          @case ('title') {
            <div
              class="skeleton-base skeleton-title"
              [style.width]="width() || '65%'"
              [style.height]="height() || '24px'"
              [style.border-radius]="borderRadius() || '6px'"
            ></div>
          }

          @case ('circle') {
            <div
              class="skeleton-base skeleton-circle"
              [style.width]="width() || '40px'"
              [style.height]="height() || width() || '40px'"
              [style.border-radius]="'50%'"
            ></div>
          }

          @case ('rect') {
            <div
              class="skeleton-base skeleton-rect"
              [style.width]="width() || '100%'"
              [style.height]="height() || '120px'"
              [style.border-radius]="borderRadius() || '8px'"
            ></div>
          }

          @case ('stat-card') {
            <div class="skeleton-stat-card">
              <div class="stat-header">
                <div
                  class="skeleton-base"
                  style="width: 45%; height: 14px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base skeleton-circle"
                  style="width: 32px; height: 32px; border-radius: 8px;"
                ></div>
              </div>
              <div
                class="skeleton-base"
                style="width: 65%; height: 28px; margin: 14px 0 10px 0; border-radius: 6px;"
              ></div>
              <div
                class="skeleton-base"
                style="width: 50%; height: 12px; border-radius: 4px;"
              ></div>
            </div>
          }

          @case ('order-card') {
            <div class="skeleton-order-card">
              <!-- Top Row: ID + Status -->
              <div class="order-card-top">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div
                    class="skeleton-base"
                    style="width: 80px; height: 20px; border-radius: 4px;"
                  ></div>
                  <div
                    class="skeleton-base"
                    style="width: 50px; height: 14px; border-radius: 4px;"
                  ></div>
                </div>
                <div
                  class="skeleton-base"
                  style="width: 70px; height: 22px; border-radius: 9999px;"
                ></div>
              </div>
              <!-- Guest Bar -->
              <div class="order-card-guest">
                <div
                  class="skeleton-base"
                  style="width: 88px; height: 26px; border-radius: 6px;"
                ></div>
                <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                  <div
                    class="skeleton-base"
                    style="width: 55%; height: 14px; border-radius: 4px;"
                  ></div>
                  <div
                    class="skeleton-base"
                    style="width: 35%; height: 11px; border-radius: 4px;"
                  ></div>
                </div>
              </div>
              <!-- Dishes Summary -->
              <div class="order-card-dishes">
                <div
                  class="skeleton-base"
                  style="width: 90%; height: 13px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 75%; height: 13px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Pricing Row -->
              <div class="order-card-pricing">
                <div
                  class="skeleton-base"
                  style="width: 30%; height: 12px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 60px; height: 20px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Stepper bar -->
              <div class="order-card-stepper">
                <div class="skeleton-base skeleton-circle" style="width: 22px; height: 22px;"></div>
                <div class="skeleton-base" style="flex: 1; height: 4px;"></div>
                <div class="skeleton-base skeleton-circle" style="width: 22px; height: 22px;"></div>
                <div class="skeleton-base" style="flex: 1; height: 4px;"></div>
                <div class="skeleton-base skeleton-circle" style="width: 22px; height: 22px;"></div>
              </div>
              <!-- Action Button -->
              <div class="order-card-btn">
                <div
                  class="skeleton-base"
                  style="width: 100%; height: 36px; border-radius: 6px;"
                ></div>
              </div>
            </div>
          }

          @case ('table-card') {
            <div class="skeleton-table-card">
              <div class="tbl-top">
                <div>
                  <div
                    class="skeleton-base"
                    style="width: 60px; height: 26px; border-radius: 4px; margin-bottom: 6px;"
                  ></div>
                  <div
                    class="skeleton-base"
                    style="width: 90px; height: 12px; border-radius: 4px;"
                  ></div>
                </div>
                <div
                  class="skeleton-base"
                  style="width: 75px; height: 24px; border-radius: 9999px;"
                ></div>
              </div>
              <div class="tbl-mid">
                <div
                  class="skeleton-base"
                  style="width: 100%; height: 42px; border-radius: 8px;"
                ></div>
              </div>
              <div class="tbl-actions">
                <div
                  class="skeleton-base"
                  style="width: 65%; height: 32px; border-radius: 6px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 32px; height: 32px; border-radius: 6px;"
                ></div>
              </div>
            </div>
          }

          @case ('food-card') {
            <div class="skeleton-food-card">
              <div class="food-card-left">
                <div style="display: flex; gap: 6px; margin-bottom: 8px;">
                  <div
                    class="skeleton-base"
                    style="width: 18px; height: 18px; border-radius: 3px;"
                  ></div>
                  <div
                    class="skeleton-base"
                    style="width: 70px; height: 18px; border-radius: 4px;"
                  ></div>
                </div>
                <div
                  class="skeleton-base"
                  style="width: 75%; height: 20px; border-radius: 4px; margin-bottom: 6px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 50px; height: 16px; border-radius: 4px; margin-bottom: 8px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 95%; height: 12px; border-radius: 4px; margin-bottom: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 80%; height: 12px; border-radius: 4px;"
                ></div>
              </div>
              <div class="food-card-right">
                <div
                  class="skeleton-base"
                  style="width: 96px; height: 96px; border-radius: 10px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 64px; height: 28px; border-radius: 6px; margin-top: -14px;"
                ></div>
              </div>
            </div>
          }

          @case ('canvas-floor') {
            <div class="skeleton-canvas-floor">
              <!-- Architectural fixtures corridor -->
              <div class="canvas-corridor">
                <div
                  class="skeleton-base"
                  style="width: 120px; height: 32px; border-radius: 6px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 130px; height: 32px; border-radius: 6px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 110px; height: 32px; border-radius: 6px;"
                ></div>
              </div>
              <!-- Room Sections Grid -->
              <div class="canvas-rooms-grid">
                <div class="canvas-room-box">
                  <div
                    class="skeleton-base room-title-skel"
                    style="width: 140px; height: 20px; border-radius: 4px;"
                  ></div>
                  <div class="room-tables-wrap">
                    <div class="canvas-tbl-skel skeleton-base"></div>
                    <div class="canvas-tbl-skel skeleton-base"></div>
                    <div class="canvas-tbl-skel skeleton-base"></div>
                    <div class="canvas-tbl-skel skeleton-base"></div>
                  </div>
                </div>
                <div class="canvas-room-box">
                  <div
                    class="skeleton-base room-title-skel"
                    style="width: 120px; height: 20px; border-radius: 4px;"
                  ></div>
                  <div class="room-tables-wrap">
                    <div class="canvas-tbl-skel skeleton-base"></div>
                    <div class="canvas-tbl-skel skeleton-base"></div>
                  </div>
                </div>
              </div>
            </div>
          }

          @case ('customer-row') {
            <div class="skeleton-table-row customer-row-layout">
              <!-- Col 1: Avatar + Name + Points -->
              <div style="display: flex; align-items: center; gap: 10px; width: 22%;">
                <div class="skeleton-base skeleton-circle" style="width: 32px; height: 32px;"></div>
                <div style="display: flex; flex-direction: column; gap: 4px; flex: 1;">
                  <div
                    class="skeleton-base"
                    style="width: 70%; height: 14px; border-radius: 4px;"
                  ></div>
                  <div
                    class="skeleton-base"
                    style="width: 40%; height: 11px; border-radius: 4px;"
                  ></div>
                </div>
              </div>
              <!-- Col 2: Phone & Email -->
              <div style="display: flex; flex-direction: column; gap: 4px; width: 18%;">
                <div
                  class="skeleton-base"
                  style="width: 75%; height: 13px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 55%; height: 11px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Col 3: Loyalty Tier -->
              <div style="width: 12%;">
                <div
                  class="skeleton-base"
                  style="width: 68px; height: 22px; border-radius: 9999px;"
                ></div>
              </div>
              <!-- Col 4: Status -->
              <div style="width: 10%;">
                <div
                  class="skeleton-base"
                  style="width: 55px; height: 20px; border-radius: 9999px;"
                ></div>
              </div>
              <!-- Col 5: Visits -->
              <div style="width: 8%;">
                <div
                  class="skeleton-base"
                  style="width: 28px; height: 14px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Col 6: Lifetime Spend -->
              <div style="width: 12%;">
                <div
                  class="skeleton-base"
                  style="width: 60px; height: 14px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Col 7: Last Dining -->
              <div style="width: 10%;">
                <div
                  class="skeleton-base"
                  style="width: 64px; height: 12px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Col 8: Actions -->
              <div style="width: 8%; display: flex; gap: 6px; justify-content: flex-end;">
                <div
                  class="skeleton-base"
                  style="width: 28px; height: 28px; border-radius: 6px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 28px; height: 28px; border-radius: 6px;"
                ></div>
              </div>
            </div>
          }

          @case ('reservation-row') {
            <div class="skeleton-table-row reservation-row-layout">
              <!-- Guest Details -->
              <div style="display: flex; flex-direction: column; gap: 4px; width: 22%;">
                <div
                  class="skeleton-base"
                  style="width: 70%; height: 14px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 50%; height: 11px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Date & Time -->
              <div style="width: 18%;">
                <div
                  class="skeleton-base"
                  style="width: 80%; height: 14px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Party Size -->
              <div style="width: 14%;">
                <div
                  class="skeleton-base"
                  style="width: 70px; height: 22px; border-radius: 9999px;"
                ></div>
              </div>
              <!-- Table & Section -->
              <div style="display: flex; flex-direction: column; gap: 4px; width: 16%;">
                <div
                  class="skeleton-base"
                  style="width: 60%; height: 14px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 45%; height: 11px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Special Requests -->
              <div style="width: 12%;">
                <div
                  class="skeleton-base"
                  style="width: 75%; height: 12px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Status -->
              <div style="width: 10%;">
                <div
                  class="skeleton-base"
                  style="width: 65px; height: 22px; border-radius: 9999px;"
                ></div>
              </div>
              <!-- Actions -->
              <div style="width: 8%; display: flex; justify-content: flex-end;">
                <div
                  class="skeleton-base"
                  style="width: 72px; height: 28px; border-radius: 6px;"
                ></div>
              </div>
            </div>
          }

          @case ('billing-row') {
            <div class="skeleton-table-row billing-row-layout">
              <!-- Order & Table -->
              <div style="display: flex; flex-direction: column; gap: 4px; width: 18%;">
                <div
                  class="skeleton-base"
                  style="width: 70px; height: 20px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 85px; height: 12px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Guest Details -->
              <div style="display: flex; flex-direction: column; gap: 4px; width: 16%;">
                <div
                  class="skeleton-base"
                  style="width: 80%; height: 14px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 60%; height: 11px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Items Summary -->
              <div style="width: 20%;">
                <div
                  class="skeleton-base"
                  style="width: 85%; height: 13px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Subtotal -->
              <div style="width: 10%;">
                <div
                  class="skeleton-base"
                  style="width: 55px; height: 14px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Taxes -->
              <div style="width: 10%;">
                <div
                  class="skeleton-base"
                  style="width: 45px; height: 14px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Total -->
              <div style="width: 10%;">
                <div
                  class="skeleton-base"
                  style="width: 60px; height: 16px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Payment Status -->
              <div style="width: 8%;">
                <div
                  class="skeleton-base"
                  style="width: 60px; height: 22px; border-radius: 9999px;"
                ></div>
              </div>
              <!-- Actions -->
              <div style="width: 8%; display: flex; justify-content: flex-end; gap: 6px;">
                <div
                  class="skeleton-base"
                  style="width: 64px; height: 28px; border-radius: 6px;"
                ></div>
              </div>
            </div>
          }

          @case ('ingredient-row') {
            <div class="skeleton-table-row ingredient-row-layout">
              <!-- Spec & Supplier -->
              <div style="display: flex; flex-direction: column; gap: 4px; width: 22%;">
                <div
                  class="skeleton-base"
                  style="width: 75%; height: 14px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 50%; height: 11px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Category -->
              <div style="width: 12%;">
                <div
                  class="skeleton-base"
                  style="width: 65px; height: 20px; border-radius: 9999px;"
                ></div>
              </div>
              <!-- Current Stock + bar -->
              <div style="display: flex; flex-direction: column; gap: 4px; width: 16%;">
                <div
                  class="skeleton-base"
                  style="width: 55px; height: 14px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 80px; height: 5px; border-radius: 3px;"
                ></div>
              </div>
              <!-- Min Threshold -->
              <div style="width: 12%;">
                <div
                  class="skeleton-base"
                  style="width: 45px; height: 13px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Unit Rate -->
              <div style="width: 12%;">
                <div
                  class="skeleton-base"
                  style="width: 55px; height: 13px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Valuation -->
              <div style="width: 12%;">
                <div
                  class="skeleton-base"
                  style="width: 60px; height: 14px; border-radius: 4px;"
                ></div>
              </div>
              <!-- Status -->
              <div style="width: 8%;">
                <div
                  class="skeleton-base"
                  style="width: 55px; height: 20px; border-radius: 9999px;"
                ></div>
              </div>
              <!-- Actions -->
              <div style="width: 6%; display: flex; justify-content: flex-end; gap: 4px;">
                <div
                  class="skeleton-base"
                  style="width: 24px; height: 24px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 24px; height: 24px; border-radius: 4px;"
                ></div>
              </div>
            </div>
          }

          @case ('card') {
            <div class="skeleton-card">
              <div
                class="card-thumb skeleton-base"
                style="width: 100%; height: 140px; border-radius: 8px 8px 0 0;"
              ></div>
              <div class="card-body">
                <div
                  class="skeleton-base"
                  style="width: 70%; height: 18px; margin-bottom: 8px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 40%; height: 14px; margin-bottom: 12px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 100%; height: 12px; margin-bottom: 6px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 85%; height: 12px; border-radius: 4px;"
                ></div>
              </div>
            </div>
          }

          @case ('table-row') {
            <div class="skeleton-table-row">
              <div
                class="skeleton-base cell-1"
                style="width: 28%; height: 14px; border-radius: 4px;"
              ></div>
              <div
                class="skeleton-base cell-2"
                style="width: 20%; height: 14px; border-radius: 4px;"
              ></div>
              <div
                class="skeleton-base cell-3"
                style="width: 15%; height: 14px; border-radius: 4px;"
              ></div>
              <div
                class="skeleton-base cell-4"
                style="width: 12%; height: 14px; border-radius: 4px;"
              ></div>
              <div
                class="skeleton-base cell-5"
                style="width: 15%; height: 14px; border-radius: 4px;"
              ></div>
            </div>
          }

          @case ('chart') {
            <div class="skeleton-chart-panel">
              <div class="chart-header">
                <div
                  class="skeleton-base"
                  style="width: 35%; height: 20px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 20%; height: 14px; border-radius: 4px;"
                ></div>
              </div>
              <div class="chart-bars-wrap">
                <div class="skeleton-bar" style="height: 45%;"></div>
                <div class="skeleton-bar" style="height: 70%;"></div>
                <div class="skeleton-bar" style="height: 35%;"></div>
                <div class="skeleton-bar" style="height: 85%;"></div>
                <div class="skeleton-bar" style="height: 60%;"></div>
                <div class="skeleton-bar" style="height: 95%;"></div>
                <div class="skeleton-bar" style="height: 50%;"></div>
              </div>
              <div class="chart-axis-line skeleton-base" style="width: 100%; height: 2px;"></div>
            </div>
          }

          @case ('menu-card') {
            <div class="skeleton-dish-card">
              <div
                class="skeleton-base dish-thumb"
                style="width: 100%; height: 160px; border-radius: 8px 8px 0 0;"
              ></div>
              <div
                class="dish-content-pad"
                style="padding: 16px; display: flex; flex-direction: column; gap: 10px;"
              >
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div
                    class="skeleton-base"
                    style="width: 55%; height: 18px; border-radius: 4px;"
                  ></div>
                  <div
                    class="skeleton-base"
                    style="width: 25%; height: 18px; border-radius: 4px;"
                  ></div>
                </div>
                <div
                  class="skeleton-base"
                  style="width: 85px; height: 22px; border-radius: 9999px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 90%; height: 12px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 65%; height: 12px; border-radius: 4px;"
                ></div>
                <div style="display: flex; gap: 8px; margin-top: 4px;">
                  <div
                    class="skeleton-base"
                    style="width: 65px; height: 20px; border-radius: 4px;"
                  ></div>
                  <div
                    class="skeleton-base"
                    style="width: 60px; height: 20px; border-radius: 4px;"
                  ></div>
                </div>
                <div
                  style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.05));"
                >
                  <div
                    class="skeleton-base"
                    style="width: 80px; height: 30px; border-radius: 6px;"
                  ></div>
                  <div style="display: flex; gap: 6px;">
                    <div
                      class="skeleton-base"
                      style="width: 30px; height: 30px; border-radius: 6px;"
                    ></div>
                    <div
                      class="skeleton-base"
                      style="width: 30px; height: 30px; border-radius: 6px;"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          }

          @case ('staff-card') {
            <div class="skeleton-staff-card">
              <div style="display: flex; gap: 14px; align-items: center;">
                <div
                  class="skeleton-base skeleton-circle"
                  style="width: 48px; height: 48px; border-radius: 50%;"
                ></div>
                <div style="display: flex; flex-direction: column; gap: 6px; flex: 1;">
                  <div
                    class="skeleton-base"
                    style="width: 60%; height: 18px; border-radius: 4px;"
                  ></div>
                  <div
                    class="skeleton-base"
                    style="width: 35%; height: 14px; border-radius: 4px;"
                  ></div>
                </div>
              </div>
              <div
                class="skeleton-base"
                style="width: 100%; height: 44px; border-radius: 8px; margin: 12px 0;"
              ></div>
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <div
                  class="skeleton-base"
                  style="width: 70%; height: 14px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 60%; height: 14px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 80%; height: 14px; border-radius: 4px;"
                ></div>
              </div>
              <div
                style="display: flex; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.05));"
              >
                <div class="skeleton-base" style="flex: 1; height: 32px; border-radius: 6px;"></div>
                <div class="skeleton-base" style="flex: 1; height: 32px; border-radius: 6px;"></div>
              </div>
            </div>
          }

          @case ('coupon-card') {
            <div class="skeleton-coupon-card">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div
                  class="skeleton-base"
                  style="width: 90px; height: 26px; border-radius: 6px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 50px; height: 22px; border-radius: 9999px;"
                ></div>
              </div>
              <div
                class="skeleton-base"
                style="width: 70%; height: 20px; border-radius: 4px; margin: 12px 0 6px 0;"
              ></div>
              <div
                class="skeleton-base"
                style="width: 90%; height: 13px; border-radius: 4px;"
              ></div>
              <div
                class="skeleton-base"
                style="width: 100%; height: 42px; border-radius: 8px; margin: 14px 0;"
              ></div>
              <div
                style="display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.05));"
              >
                <div
                  class="skeleton-base"
                  style="width: 80px; height: 14px; border-radius: 4px;"
                ></div>
                <div
                  class="skeleton-base"
                  style="width: 65px; height: 28px; border-radius: 6px;"
                ></div>
              </div>
            </div>
          }
        }
      }
      <span class="sr-only">Loading content</span>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      :host.skeleton-contents {
        display: contents !important;
      }

      .skeleton-host {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .skeleton-host.layout-contents {
        display: contents !important;
      }

      .skeleton-base {
        position: relative;
        overflow: hidden;
        background-color: var(--skeleton-bg, rgba(0, 0, 0, 0.06));
        border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.04));
      }

      .shimmer-active .skeleton-base,
      .shimmer-active .skeleton-bar {
        position: relative;
        overflow: hidden;
      }

      .shimmer-active .skeleton-base::after,
      .shimmer-active .skeleton-bar::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          var(--skeleton-shimmer, rgba(255, 255, 255, 0.5)) 50%,
          transparent 100%
        );
        animation: shimmerSweep 1.5s ease-in-out infinite;
      }

      /* Stat Card Variant */
      .skeleton-stat-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e5ded4);
        border-radius: var(--radius-md, 12px);
        padding: 20px;
        box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.05));
      }

      .stat-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      /* Order Board Card Variant */
      .skeleton-order-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e5ded4);
        border-radius: var(--radius-md, 12px);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-shadow: var(--shadow-card, 0 2px 6px rgba(0, 0, 0, 0.05));
      }

      .order-card-top,
      .order-card-guest,
      .order-card-pricing {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .order-card-dishes {
        background: var(--color-bone-light, #faf8f4);
        border: 1px solid var(--color-border-subtle, #f0eae1);
        border-radius: 8px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .order-card-stepper {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 0;
      }

      /* Table Card Variant */
      .skeleton-table-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e5ded4);
        border-radius: var(--radius-md, 12px);
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.05));
      }

      .tbl-top,
      .tbl-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      /* Horizontal Food Card Variant */
      .skeleton-food-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e5ded4);
        border-radius: var(--radius-md, 12px);
        padding: 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
      }

      .food-card-left {
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .food-card-right {
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      /* Canvas Floor Plan Variant */
      .skeleton-canvas-floor {
        background: var(--color-bone-light, #faf8f4);
        border: 2px dashed var(--color-border, #e5ded4);
        border-radius: 12px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 24px;
        min-height: 440px;
      }

      .canvas-corridor {
        display: flex;
        gap: 16px;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--color-border-subtle, #f0eae1);
      }

      .canvas-rooms-grid {
        display: grid;
        grid-template-columns: 2fr 1.2fr;
        gap: 20px;
        flex: 1;

        @media (max-width: 768px) {
          grid-template-columns: 1fr;
        }
      }

      .canvas-room-box {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e5ded4);
        border-radius: 10px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .room-tables-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
        padding: 12px;
      }

      .canvas-tbl-skel {
        width: 64px;
        height: 64px;
        border-radius: 10px;
      }

      /* Generic Card Variant */
      .skeleton-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e5ded4);
        border-radius: var(--radius-md, 12px);
        overflow: hidden;
      }

      .card-body {
        padding: 16px;
      }

      /* Table Row Variants */
      .skeleton-table-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--color-border-subtle, #f0eae1);
        background: var(--color-surface, #ffffff);
      }

      /* Chart Variant */
      .skeleton-chart-panel {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e5ded4);
        border-radius: var(--radius-md, 12px);
        padding: 20px;
      }

      .chart-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 24px;
      }

      .chart-bars-wrap {
        display: flex;
        align-items: flex-end;
        justify-content: space-around;
        height: 140px;
        padding: 0 16px;
      }

      .skeleton-bar {
        width: 28px;
        background-color: var(--skeleton-bg, rgba(0, 0, 0, 0.06));
        border-radius: 4px 4px 0 0;
      }

      /* Card Grid Items */
      .skeleton-dish-card,
      .skeleton-staff-card,
      .skeleton-coupon-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e5ded4);
        border-radius: var(--radius-md, 12px);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: var(--shadow-xs, 0 1px 3px rgba(0, 0, 0, 0.05));
      }

      .skeleton-staff-card,
      .skeleton-coupon-card {
        padding: 20px;
      }

      .chart-axis-line {
        margin-top: 4px;
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

      @keyframes shimmerSweep {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .shimmer-active .skeleton-base::after,
        .shimmer-active .skeleton-bar::after {
          animation: none !important;
          display: none !important;
        }

        .skeleton-base,
        .skeleton-bar {
          opacity: 0.7;
        }
      }
    `,
  ],
})
export class SkeletonLoaderComponent {
  variant = input<SkeletonVariant>('text');
  layout = input<'auto' | 'contents' | 'column' | 'grid'>('auto');
  width = input<string>();
  height = input<string>();
  borderRadius = input<string>();
  count = input<number>(1);
  shimmer = input<boolean>(true);

  readonly isContentsLayout = computed(() => {
    const l = this.layout();
    if (l === 'contents' || l === 'grid') return true;
    if (l === 'column') return false;
    const v = this.variant();
    return (
      v === 'order-card' ||
      v === 'table-card' ||
      v === 'food-card' ||
      v === 'stat-card' ||
      v === 'card' ||
      v === 'menu-card' ||
      v === 'staff-card' ||
      v === 'coupon-card'
    );
  });

  readonly items = computed(() => Array.from({ length: Math.max(1, this.count()) }));
}
