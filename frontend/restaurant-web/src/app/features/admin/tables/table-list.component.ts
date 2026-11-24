import {
  Component,
  inject,
  signal,
  computed,
  ViewChild,
  ElementRef,
  OnInit,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import * as QRCode from 'qrcode';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import {
  Table,
  TableStatus,
  TableSection,
  FloorElement,
  FloorElementType,
} from '../../../core/models/table.model';
import { Reservation, ReservationStatus } from '../../../core/models/reservation.model';
import { Order, OrderStatus, OrderItem } from '../../../core/models/order.model';
import { SplitBill } from '../../../core/models/billing.model';
import { MenuItem } from '../../../core/models/menu.model';
import { MenuStockStatus } from '../../../core/models/inventory.model';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import { SkeletonLoaderComponent } from '../../../shared/components/loading/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThermalReceiptModalComponent } from '../../../shared/components/thermal-receipt-modal/thermal-receipt-modal.component';
import { DietaryBadgeComponent } from '../../../shared/components/dietary-badge/dietary-badge.component';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { ToastService } from '../../../core/services/toast.service';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-table-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    StatusBadgeComponent,
    ConfirmModalComponent,
    SkeletonLoaderComponent,
    EmptyStateComponent,
    ThermalReceiptModalComponent,
    DietaryBadgeComponent,
    CurrencyInrPipe,
  ],
  template: `
    <div
      class="tables-page"
      (pointermove)="onCanvasPointerMove($event)"
      (pointerup)="onCanvasPointerUp()"
      (pointercancel)="onCanvasPointerUp()"
    >
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1 class="heading-display">Dining Floor &amp; Tables</h1>
          <p class="text-muted">Live occupancy, section seating, and interactive floor layout.</p>
        </div>

        <div class="header-actions">
          <!-- View Switcher (Canvas / Grid) -->
          <div class="view-mode-toggle" role="tablist">
            <button
              type="button"
              class="toggle-btn"
              [class.active]="viewMode() === 'CANVAS'"
              (click)="viewMode.set('CANVAS')"
              title="Interactive Floor Plan Canvas"
            >
              <i class="ph ph-compass"></i>
              <span>Floor Canvas</span>
            </button>
            <button
              type="button"
              class="toggle-btn"
              [class.active]="viewMode() === 'GRID'"
              (click)="viewMode.set('GRID')"
              title="Classic Table Cards Grid"
            >
              <i class="ph ph-squares-four"></i>
              <span>Cards Grid</span>
            </button>
          </div>

          <button
            class="btn btn-secondary"
            (click)="openAddPlaceModal()"
            title="Create a new dining section"
          >
            <i class="ph ph-folder-plus"></i>
            <span>Add Section</span>
          </button>

          <button class="btn btn-primary" (click)="openAddTableModal()">
            <i class="ph ph-plus-circle"></i>
            <span>Add Table</span>
          </button>
        </div>
      </div>

      <!-- Places / Sections Navigation Bar -->
      <div class="toolbar-card places-toolbar">
        <div class="places-nav">
          <span class="places-label"><i class="ph ph-map-pin"></i> Sections:</span>
          <div class="tabs-group">
            <button
              class="tab-btn"
              [class.active]="selectedSection() === 'ALL'"
              (click)="selectPlace('ALL')"
            >
              <span>All Sections</span>
              <span class="tab-badge">{{ tables().length }}</span>
            </button>

            @for (place of places(); track place) {
              <div class="place-tab-wrap">
                <button
                  class="tab-btn"
                  [class.active]="selectedSection() === place"
                  (click)="selectPlace(place)"
                >
                  <span>{{ place }}</span>
                  <span class="tab-badge">{{ countByPlace(place) }}</span>
                </button>
                @if (isCustomPlace(place) && countByPlace(place) === 0) {
                  <button
                    class="btn-delete-place"
                    (click)="deletePlace(place); $event.stopPropagation()"
                    title="Remove empty section"
                  >
                    <i class="ph ph-x"></i>
                  </button>
                }
              </div>
            }

            <button
              class="tab-btn add-place-tab-btn"
              (click)="openAddPlaceModal()"
              title="Create Section"
            >
              <i class="ph ph-plus"></i>
              <span>New Section</span>
            </button>
          </div>
        </div>

        <div class="status-summary-pills">
          <span class="status-pill available" [class.is-zero]="countByStatus('AVAILABLE') === 0">
            <i class="ph ph-chair"></i> {{ countByStatus('AVAILABLE') }} Available
          </span>
          <span class="status-pill occupied" [class.is-zero]="countByStatus('OCCUPIED') === 0">
            <i class="ph ph-users"></i> {{ countByStatus('OCCUPIED') }} Occupied
          </span>
          <span class="status-pill reserved" [class.is-zero]="countByStatus('RESERVED') === 0">
            <i class="ph ph-calendar-check"></i> {{ countByStatus('RESERVED') }} Reserved
          </span>
          <span class="status-pill dirty" [class.is-zero]="countByStatus('DIRTY') === 0">
            <i class="ph ph-broom"></i> {{ countByStatus('DIRTY') }} Cleaning
          </span>
        </div>
      </div>

      <!-- ============================================================ -->
      <!-- RESERVATIONS & BOOKINGS DESK BLOCK                           -->
      <!-- ============================================================ -->
      <div class="toolbar-card reservation-desk-card">
        <div class="reservation-desk-header">
          <div class="desk-header-left">
            <div class="desk-icon-wrap">
              <i class="ph ph-calendar-check"></i>
            </div>
            <div class="desk-title-group">
              <div class="desk-title-row">
                <h3 class="desk-title">Floor Reservations &amp; Bookings</h3>
                @if (pendingReservationsCount() > 0) {
                  <span
                    class="live-pill"
                    [attr.title]="pendingReservationsCount() + ' active bookings'"
                  >
                    <span class="live-dot"></span>
                    {{ pendingReservationsCount() }} Incoming
                  </span>
                }
              </div>
              <p class="desk-subtitle">
                Manage upcoming table bookings, assign floor tables, and check-in arriving guests.
              </p>
            </div>
          </div>

          <div class="desk-header-actions">
            <button
              type="button"
              class="btn btn-sm btn-ghost toggle-desk-btn"
              (click)="isReservationsBlockOpen.set(!isReservationsBlockOpen())"
            >
              <span>{{
                isReservationsBlockOpen()
                  ? 'Hide Desk'
                  : 'Show Bookings (' + activeFloorReservations().length + ')'
              }}</span>
              <i
                class="ph"
                [class.ph-caret-up]="isReservationsBlockOpen()"
                [class.ph-caret-down]="!isReservationsBlockOpen()"
              ></i>
            </button>
            <a
              routerLink="/admin/reservations"
              class="btn btn-sm btn-secondary full-bookings-btn"
              title="Full Bookings Calendar & Management"
            >
              <i class="ph ph-arrow-up-right"></i>
              <span>Full Bookings</span>
            </a>
          </div>
        </div>

        @if (isReservationsBlockOpen()) {
          <div class="reservation-desk-body">
            @if (activeFloorReservations().length === 0) {
              <div class="empty-reservations-row">
                <div class="empty-icon-wrap">
                  <i class="ph ph-calendar-blank"></i>
                </div>
                <div class="empty-text-wrap">
                  <strong class="empty-title">All Tables Available</strong>
                  <span class="empty-desc"
                    >No active reservations pending. All floor tables are free for walk-in
                    dining.</span
                  >
                </div>
              </div>
            } @else {
              <div class="reservation-table-wrap">
                <table class="res-table">
                  <thead>
                    <tr>
                      <th class="th-guest">Guest</th>
                      <th class="th-arrival">Arrival Schedule</th>
                      <th class="th-party">Party Size</th>
                      <th class="th-table">Assigned Table</th>
                      <th class="th-status">Status</th>
                      <th class="th-actions text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (res of activeFloorReservations(); track res.id) {
                      <tr
                        class="res-row"
                        [class.is-seated]="res.status === 'SEATED'"
                        [class.is-unassigned]="!res.tableId"
                      >
                        <!-- Guest Column -->
                        <td class="td-guest">
                          <div class="guest-cell">
                            <span class="guest-name">{{ res.customerName }}</span>
                            @if (res.customerPhone) {
                              <span class="guest-phone">
                                <i class="ph ph-phone"></i>
                                {{ res.customerPhone }}
                              </span>
                            }
                            @if (res.specialRequests) {
                              <span class="guest-note" [title]="res.specialRequests">
                                <i class="ph ph-chat-circle-dots"></i>
                                {{ res.specialRequests }}
                              </span>
                            }
                          </div>
                        </td>

                        <!-- Arrival Column -->
                        <td class="td-arrival">
                          <div class="arrival-cell">
                            <div class="arrival-time-row">
                              <i class="ph ph-clock text-primary"></i>
                              <span class="arrival-time">{{
                                res.reservationTime || res.reservationDate | date: 'shortTime'
                              }}</span>
                              @let arrInfo = this.getReservationArrivalInfo(res);
                              <span
                                class="arrival-badge"
                                [class.badge-soon]="arrInfo.isSoon"
                                [class.badge-late]="arrInfo.isPast"
                              >
                                {{ arrInfo.label }}
                              </span>
                            </div>
                            <div class="arrival-date-row">
                              <i class="ph ph-calendar text-muted"></i>
                              <span>{{
                                res.reservationTime || res.reservationDate | date: 'mediumDate'
                              }}</span>
                            </div>
                          </div>
                        </td>

                        <!-- Party Size Column -->
                        <td class="td-party">
                          <span class="party-pill">
                            <i class="ph ph-users"></i>
                            {{ res.partySize }} Guests
                          </span>
                        </td>

                        <!-- Table Assignment (Admin Control) -->
                        <td class="td-table">
                          <div class="table-control-wrap">
                            <select
                              class="form-select form-select-sm table-select"
                              #tableSelect
                              (change)="assignReservationTable(res, tableSelect.value)"
                              [disabled]="res.status === 'SEATED'"
                              [title]="
                                res.status === 'SEATED'
                                  ? 'Guest is already seated'
                                  : 'Control table assignment'
                              "
                            >
                              <option value="" [selected]="!res.tableId">Unassigned</option>
                              @if (res.tableId) {
                                <option [value]="res.tableId" selected>
                                  Table {{ res.tableNumber || 'Assigned' }} (Current)
                                </option>
                              }
                              @for (tbl of availableTables(); track tbl.id) {
                                @if (tbl.id !== res.tableId) {
                                  <option [value]="tbl.id">
                                    Table {{ tbl.number }} (Cap: {{ tbl.capacity }}) -
                                    {{ tbl.section }}
                                  </option>
                                }
                              }
                            </select>
                          </div>
                        </td>

                        <!-- Status Column -->
                        <td class="td-status">
                          <span
                            class="badge status-pill"
                            [class.badge-success]="res.status === 'SEATED'"
                            [class.badge-primary]="res.status === 'CONFIRMED'"
                            [class.badge-warning]="res.status === 'PENDING'"
                          >
                            {{ res.status }}
                          </span>
                        </td>

                        <!-- Actions Column -->
                        <td class="td-actions text-right">
                          <div class="action-buttons-wrap">
                            @if (res.status === 'CONFIRMED' || res.status === 'PENDING') {
                              <button
                                type="button"
                                class="btn btn-sm btn-primary btn-seat-action"
                                (click)="seatReservationGuest(res)"
                                [disabled]="!res.tableId && availableTables().length === 0"
                                title="Seat guest at table and enable digital QR ordering"
                              >
                                <i class="ph ph-check-circle"></i>
                                <span>Seat</span>
                              </button>
                            } @else if (res.status === 'SEATED') {
                              <button
                                type="button"
                                class="btn btn-sm btn-secondary btn-done-action"
                                (click)="completeReservation(res)"
                                title="Mark reservation finished"
                              >
                                <i class="ph ph-check"></i>
                                <span>Done</span>
                              </button>
                            }

                            @if (res.status !== 'SEATED') {
                              <button
                                type="button"
                                class="btn btn-sm btn-ghost btn-cancel-action"
                                (click)="cancelReservation(res)"
                                title="Cancel Booking"
                              >
                                <i class="ph ph-x"></i>
                              </button>
                            }
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }
      </div>

      <!-- ============================================================ -->
      <!-- VIEW 1: INTERACTIVE RESTAURANT FLOOR PLAN CANVAS             -->
      <!-- ============================================================ -->
      @if (viewMode() === 'CANVAS') {
        <div class="canvas-workspace-card" [class.is-fullscreen]="isCanvasFullscreen()">
          <!-- Canvas Top Controls Toolbar -->
          <div class="canvas-toolbar">
            <div class="toolbar-left">
              <!-- Mode Toggle: Monitor vs Design -->
              <div class="mode-switch-group">
                <button
                  type="button"
                  class="mode-btn"
                  [class.active]="!isDesignMode()"
                  (click)="isDesignMode.set(false)"
                  title="Live Monitor: Click tables to view active dining orders & manage status"
                >
                  <i class="ph ph-hand-pointing"></i>
                  <span>Live Monitor</span>
                </button>
                <button
                  type="button"
                  class="mode-btn"
                  [class.active]="isDesignMode()"
                  (click)="isDesignMode.set(true)"
                  title="Design Mode: Drag & arrange tables and restaurant fixtures"
                >
                  <i class="ph ph-pencil-simple"></i>
                  <span>Design & Layout</span>
                </button>
              </div>

              <!-- Quick Section Creation directly from Canvas Toolbar -->
              <button
                type="button"
                class="btn btn-secondary btn-xs btn-add-section-toolbar"
                (click)="openCanvasCreateSectionModal()"
                title="Create a new dining section or room directly inside canvas"
              >
                <i class="ph ph-plus-circle"></i>
                <span>New Section</span>
              </button>

              @if (isDesignMode()) {
                <div class="element-picker-group">
                  <span class="group-label">Figures:</span>
                  <button
                    class="btn btn-secondary btn-xs"
                    (click)="addFloorElement('ENTRANCE')"
                    title="Add Entrance Door"
                  >
                    <i class="ph ph-door"></i> Entrance
                  </button>
                  <button
                    class="btn btn-secondary btn-xs"
                    (click)="addFloorElement('KITCHEN')"
                    title="Add Kitchen Pass"
                  >
                    <i class="ph ph-cooking-pot"></i> Kitchen
                  </button>
                  <button
                    class="btn btn-secondary btn-xs"
                    (click)="addFloorElement('BAR')"
                    title="Add Beverage Bar"
                  >
                    <i class="ph ph-martini"></i> Bar
                  </button>
                  <button
                    class="btn btn-secondary btn-xs"
                    (click)="addFloorElement('CASHIER')"
                    title="Add Cashier / Billing Counter"
                  >
                    <i class="ph ph-cash-register"></i> Cashier
                  </button>
                  <button
                    class="btn btn-secondary btn-xs"
                    (click)="addFloorElement('RESTROOM')"
                    title="Add Restroom Door"
                  >
                    <i class="ph ph-toilet"></i> Restroom
                  </button>
                  <button
                    class="btn btn-secondary btn-xs"
                    (click)="addFloorElement('WALL')"
                    title="Add Plant / Partition"
                  >
                    <i class="ph ph-plant"></i> Plant/Wall
                  </button>
                  <button
                    class="btn btn-secondary btn-xs btn-custom-fig-btn"
                    (click)="openCanvasCreateFixtureModal()"
                    title="Create custom architectural figure or decor marker"
                  >
                    <i class="ph ph-plus"></i> Custom Figure...
                  </button>
                </div>
              }
            </div>

            <div class="toolbar-right">
              <!-- Create Manual Walk-in Order from Canvas -->
              <button
                type="button"
                class="btn btn-primary btn-xs btn-canvas-order"
                (click)="openManualOrderModal()"
                title="Create manual order for any table directly from canvas"
              >
                <i class="ph ph-plus-circle"></i>
                <span>New Order</span>
              </button>

              @if (isDesignMode()) {
                <button
                  type="button"
                  class="btn btn-secondary btn-xs"
                  [class.btn-active-toggle]="snapToGrid()"
                  (click)="snapToGrid.set(!snapToGrid())"
                  title="Snap tables to 20px architectural grid"
                >
                  <i class="ph ph-grid-four"></i>
                  <span>Snap Grid (20px)</span>
                </button>

                <button
                  type="button"
                  class="btn btn-secondary btn-xs"
                  (click)="autoArrangeTables()"
                  title="Automatically align tables in neat rows"
                >
                  <i class="ph ph-magic-wand"></i>
                  <span>Auto-Arrange</span>
                </button>
              }

              <!-- Enlarge Canvas to Whole Window (Fullscreen) -->
              <button
                type="button"
                class="btn btn-secondary btn-xs btn-fullscreen-toggle"
                [class.btn-active-toggle]="isCanvasFullscreen()"
                (click)="toggleCanvasFullscreen()"
                title="Expand floor plan canvas to fill whole window"
              >
                <i
                  class="ph"
                  [class.ph-arrows-out-simple]="!isCanvasFullscreen()"
                  [class.ph-arrows-in-simple]="isCanvasFullscreen()"
                ></i>
                <span>{{ isCanvasFullscreen() ? 'Exit Full View' : 'Full Window' }}</span>
              </button>

              <!-- Zoom Controls -->
              <div class="zoom-controls">
                <button
                  type="button"
                  class="zoom-btn"
                  (click)="zoomOut()"
                  [disabled]="zoom() <= 0.6"
                  title="Zoom Out"
                >
                  <i class="ph ph-minus"></i>
                </button>
                <span class="zoom-label" (click)="resetZoom()" title="Click to reset zoom (100%)">
                  {{ Math.round(zoom() * 100) }}%
                </span>
                <button
                  type="button"
                  class="zoom-btn"
                  (click)="zoomIn()"
                  [disabled]="zoom() >= 1.6"
                  title="Zoom In"
                >
                  <i class="ph ph-plus"></i>
                </button>
              </div>
            </div>
          </div>

          <!-- Place Assignment Bar (Quick Table Move into this room) -->
          @if (selectedSection() !== 'ALL') {
            <div class="place-assign-strip">
              <span class="assign-strip-label">
                <i class="ph ph-arrows-merge"></i>
                <span
                  >Assign existing tables to <strong>{{ selectedSection() }}</strong
                  >:</span
                >
              </span>
              <div class="assign-chips-wrap">
                @for (otherTbl of tablesFromOtherPlaces(); track otherTbl.id) {
                  <button
                    type="button"
                    class="assign-tbl-btn"
                    (click)="reassignTableSection(otherTbl, selectedSection())"
                    [title]="
                      'Move ' +
                      otherTbl.number +
                      ' (currently in ' +
                      otherTbl.section +
                      ') to ' +
                      selectedSection()
                    "
                  >
                    <i class="ph ph-plus"></i>
                    <span>{{ otherTbl.number }}</span>
                    <span class="chip-curr-sec">({{ otherTbl.section }})</span>
                  </button>
                }
                @if (tablesFromOtherPlaces().length === 0) {
                  <span class="text-xs text-muted"
                    >All {{ tables().length }} restaurant tables are in this place.</span
                  >
                }
              </div>
            </div>
          }

          <!-- Canvas Viewport with Blueprint Architectural Grid -->
          <div class="canvas-viewport" #canvasViewport (click)="onCanvasBackgroundClick($event)">
            @if (isLoading()) {
              <div style="padding: 24px; width: 100%;">
                <app-skeleton variant="canvas-floor" />
              </div>
            } @else {
              <div
                class="floor-canvas"
                [style.transform]="'scale(' + zoom() + ')'"
                [class.design-mode]="isDesignMode()"
              >
                <!-- Area Watermark / Room Title -->
                <div class="canvas-area-watermark">
                  <i class="ph ph-map-pin"></i>
                  <span>{{
                    selectedSection() === 'ALL'
                      ? 'All Restaurant Areas (' + filteredTables().length + ' Tables)'
                      : selectedSection() + ' (' + filteredTables().length + ' Tables)'
                  }}</span>
                  @if (isDesignMode()) {
                    <span class="watermark-tip"
                      >• Drag items to position • Snap: {{ snapToGrid() ? 'ON' : 'OFF' }}</span
                    >
                  }
                </div>

                <!-- Architectural Floor Fixtures (Entrance, Kitchen Pass, Bar, Restroom, Cashier, Stage, etc.) -->
                @for (elem of visibleFloorElements(); track elem.id) {
                  <div
                    class="floor-element"
                    [class.elem-entrance]="elem.type === 'ENTRANCE'"
                    [class.elem-kitchen]="elem.type === 'KITCHEN'"
                    [class.elem-bar]="elem.type === 'BAR'"
                    [class.elem-restroom]="elem.type === 'RESTROOM'"
                    [class.elem-wall]="elem.type === 'WALL'"
                    [class.elem-stage]="elem.type === 'STAGE'"
                    [class.elem-cashier]="elem.type === 'CASHIER'"
                    [class.elem-window]="elem.type === 'WINDOW'"
                    [class.elem-buffet]="elem.type === 'BUFFET'"
                    [class.elem-stairs]="elem.type === 'STAIRS'"
                    [class.elem-custom]="elem.type === 'CUSTOM'"
                    [class.dragging]="draggingElementId() === elem.id"
                    [style.left.px]="elem.posX"
                    [style.top.px]="elem.posY"
                    (pointerdown)="onCanvasPointerDownElement($event, elem)"
                    [title]="
                      isDesignMode() ? 'Drag fixture to place anywhere on floor' : elem.label
                    "
                  >
                    <div class="elem-content">
                      <i class="ph" [class]="getElementIcon(elem)"></i>
                      <span class="elem-label">{{ elem.label }}</span>
                    </div>
                    @if (isDesignMode()) {
                      <button
                        type="button"
                        class="elem-delete-btn"
                        (click)="removeFloorElement(elem.id); $event.stopPropagation()"
                        title="Remove fixture"
                      >
                        <i class="ph ph-x"></i>
                      </button>
                    }
                  </div>
                }

                <!-- Section Room Boxes on Canvas -->
                @for (sec of visibleSections(); track sec) {
                  <div
                    class="canvas-section-box"
                    [class.is-dragging]="draggingSectionName() === sec"
                    [class.is-resizing]="resizingSectionName() === sec"
                    [class.design-mode]="isDesignMode()"
                    [style.left.px]="getSectionBoxX(sec)"
                    [style.top.px]="getSectionBoxY(sec)"
                    [style.width.px]="getSectionBoxWidth(sec)"
                    [style.height.px]="getSectionBoxHeight(sec)"
                  >
                    <!-- Section Box Header Bar -->
                    <div
                      class="section-box-header"
                      (pointerdown)="onCanvasPointerDownSection($event, sec)"
                      [title]="
                        isDesignMode()
                          ? 'Drag room header to move ' + sec + ' with all its tables'
                          : sec
                      "
                    >
                      <div class="sec-header-left">
                        <i class="ph" [class]="getSectionIcon(sec)"></i>
                        <span class="sec-name">{{ sec }}</span>
                        <span class="sec-badge">
                          {{ getTablesBySection(sec).length }} Tables
                          @if (getOccupiedCountBySection(sec) > 0) {
                            •
                            <strong class="text-crimson"
                              >{{ getOccupiedCountBySection(sec) }} Occupied</strong
                            >
                          }
                        </span>
                        @if (isDesignMode()) {
                          <span class="sec-dim-tag" title="Dimensions (Width × Height)">
                            {{ getSectionBoxWidth(sec) }}×{{ getSectionBoxHeight(sec) }}px
                          </span>
                        }
                      </div>

                      <div class="sec-header-right">
                        @if (isDesignMode()) {
                          <div class="sec-size-actions">
                            <button
                              type="button"
                              class="sec-size-btn"
                              (click)="adjustSectionSize(sec, -40, -40); $event.stopPropagation()"
                              title="Shrink Room (-40px)"
                            >
                              <i class="ph ph-minus"></i>
                            </button>
                            <button
                              type="button"
                              class="sec-size-btn"
                              (click)="adjustSectionSize(sec, 40, 40); $event.stopPropagation()"
                              title="Expand Room (+40px)"
                            >
                              <i class="ph ph-plus"></i>
                            </button>
                          </div>
                        }

                        <button
                          type="button"
                          class="sec-add-tbl-btn"
                          (click)="openAddTableModalForSection(sec); $event.stopPropagation()"
                          title="Add new table directly to {{ sec }}"
                        >
                          <i class="ph ph-plus"></i>
                          <span>Add Table</span>
                        </button>
                        @if (isDesignMode()) {
                          <span
                            class="sec-drag-pill"
                            title="Drag to move entire section room with its tables"
                          >
                            <i class="ph ph-hand-grabbing"></i>
                            <span>Move Room</span>
                          </span>
                        }
                      </div>
                    </div>

                    <!-- Dining Tables in this Section Box (Moveable Inside Room) -->
                    <div class="section-tables-grid">
                      @for (tbl of getTablesBySection(sec); track tbl.id) {
                        <div
                          class="canvas-table"
                          [class.is-round]="getTableShape(tbl) === 'ROUND'"
                          [class.is-rect]="getTableShape(tbl) === 'RECT'"
                          [class.status-available]="tbl.status === 'AVAILABLE'"
                          [class.status-occupied]="tbl.status === 'OCCUPIED'"
                          [class.status-reserved]="tbl.status === 'RESERVED'"
                          [class.status-dirty]="tbl.status === 'DIRTY'"
                          [class.is-selected]="selectedTableForInspector()?.id === tbl.id"
                          [class.disabled-order]="!tbl.orderingEnabled"
                          [class.dragging]="draggingTableId() === tbl.id"
                          [class.is-resizing]="resizingTableId() === tbl.id"
                          [style.position]="'absolute'"
                          [style.left.px]="getTableRelX(tbl)"
                          [style.top.px]="getTableRelY(tbl)"
                          [style.width.px]="getTableWidth(tbl)"
                          [style.height.px]="getTableHeight(tbl)"
                          (pointerdown)="onCanvasPointerDownTable($event, tbl)"
                          (click)="selectTable(tbl); $event.stopPropagation()"
                          [title]="
                            isDesignMode()
                              ? 'Drag Table ' +
                                tbl.number +
                                ' to reposition or drag corner handle to resize'
                              : 'Table ' + tbl.number + ' (' + tbl.status + ')'
                          "
                        >
                          <!-- Visual Chairs Around Table -->
                          <div class="table-chairs">
                            <span class="chair chair-top"></span>
                            <span class="chair chair-bottom"></span>
                            <span class="chair chair-left"></span>
                            <span class="chair chair-right"></span>
                            @if (tbl.capacity >= 6) {
                              <span class="chair chair-top-2"></span>
                              <span class="chair chair-bottom-2"></span>
                            }
                          </div>

                          <!-- Table Surface -->
                          <div
                            class="table-surface"
                            [style.width.px]="getTableSurfaceWidth(tbl)"
                            [style.height.px]="getTableSurfaceHeight(tbl)"
                          >
                            <span class="tbl-num">{{ tbl.number }}</span>
                            <span class="tbl-capacity">{{ tbl.capacity }}p</span>

                            @if (getActiveOrderByTable(tbl); as actOrd) {
                              <div
                                class="tbl-active-pill"
                                [class.pill-paid]="isOrderPaid(actOrd)"
                                title="Order #{{ actOrd.orderNumber }} ({{
                                  isOrderPaid(actOrd) ? 'PAID' : '₹' + actOrd.totalAmount
                                }})"
                              >
                                <i
                                  class="ph"
                                  [class.ph-check-circle]="isOrderPaid(actOrd)"
                                  [class.ph-receipt]="!isOrderPaid(actOrd)"
                                ></i>
                                <span>{{ actOrd.orderNumber }}</span>
                              </div>
                            } @else {
                              <span
                                class="tbl-status-dot"
                                [class]="tbl.status.toLowerCase()"
                              ></span>
                            }

                            @if (!tbl.orderingEnabled) {
                              <span class="tbl-lock-badge" title="QR Ordering Disabled">
                                <i class="ph ph-lock"></i>
                              </span>
                            }
                          </div>

                          <!-- Interactive Table Corner Resize Handle (Design Mode) -->
                          @if (isDesignMode()) {
                            <div
                              class="tbl-resize-handle"
                              (pointerdown)="onCanvasPointerDownTableResize($event, tbl)"
                              title="Drag to resize table {{ tbl.number }}"
                            ></div>
                          }
                        </div>
                      }

                      @if (getTablesBySection(sec).length === 0) {
                        <div class="empty-sec-placeholder">
                          <i class="ph ph-fork-knife"></i>
                          <span>No tables in {{ sec }} yet</span>
                          <button
                            type="button"
                            class="btn btn-secondary btn-xs"
                            (click)="openAddTableModalForSection(sec); $event.stopPropagation()"
                          >
                            <i class="ph ph-plus"></i>
                            <span>Add First Table</span>
                          </button>
                        </div>
                      }
                    </div>

                    <!-- Interactive Section Room Resize Handles (Design Mode) -->
                    @if (isDesignMode()) {
                      <div
                        class="sec-resize-handle sec-resize-se"
                        (pointerdown)="onCanvasPointerDownSectionResize($event, sec, 'se')"
                        title="Drag corner to resize {{ sec }} room"
                      ></div>
                      <div
                        class="sec-resize-handle sec-resize-e"
                        (pointerdown)="onCanvasPointerDownSectionResize($event, sec, 'e')"
                        title="Drag to change width of {{ sec }}"
                      ></div>
                      <div
                        class="sec-resize-handle sec-resize-s"
                        (pointerdown)="onCanvasPointerDownSectionResize($event, sec, 's')"
                        title="Drag to change height of {{ sec }}"
                      ></div>
                    }
                  </div>
                }

                <!-- Empty Room State -->
                @if (filteredTables().length === 0) {
                  <div
                    style="padding: 48px 24px; width: 100%; display: flex; justify-content: center;"
                  >
                    <app-empty-state
                      icon="ph-layout"
                      [title]="'No Tables Placed in ' + selectedSection()"
                      message="Design your floor layout by adding tables or dragging them into this room."
                      [actionText]="'Add Table to ' + selectedSection()"
                      actionIcon="ph-plus-circle"
                      (actionClick)="openAddTableModal()"
                    />
                  </div>
                }
              </div>
            }
          </div>

          <!-- MODAL: CREATE NEW SECTION / ROOM (INSIDE CANVAS WORKSPACE) -->
          @if (showCanvasCreateSectionModal()) {
            <div class="modal-overlay" (click)="showCanvasCreateSectionModal.set(false)">
              <div
                class="modal-card apple-canvas-dialog"
                (click)="$event.stopPropagation()"
                role="dialog"
                aria-modal="true"
              >
                <div class="modal-header">
                  <div class="dialog-icon-badge crimson-badge">
                    <i class="ph ph-squares-four"></i>
                  </div>
                  <div>
                    <h3 class="heading-card">Create Dining Section / Room</h3>
                    <span class="text-xs text-muted"
                      >Add a distinct seating room zone to the interactive floor plan</span
                    >
                  </div>
                  <button
                    type="button"
                    class="close-btn"
                    (click)="showCanvasCreateSectionModal.set(false)"
                    aria-label="Close"
                  >
                    <i class="ph ph-x"></i>
                  </button>
                </div>

                <div class="modal-body">
                  <div class="form-group">
                    <label class="form-label">Section Name *</label>
                    <input
                      type="text"
                      class="form-input"
                      placeholder="e.g. Rooftop Terrace, Private Dining, Poolside"
                      [value]="canvasNewSectionName()"
                      (input)="canvasNewSectionName.set($any($event.target).value)"
                      autofocus
                    />
                    <div class="quick-pills-row" style="margin-top: 8px;">
                      <span class="text-xs text-muted">Quick ideas:</span>
                      <button
                        type="button"
                        class="quick-pill"
                        (click)="canvasNewSectionName.set('Rooftop Lounge')"
                      >
                        Rooftop Lounge
                      </button>
                      <button
                        type="button"
                        class="quick-pill"
                        (click)="canvasNewSectionName.set('Private VIP Room')"
                      >
                        Private VIP
                      </button>
                      <button
                        type="button"
                        class="quick-pill"
                        (click)="canvasNewSectionName.set('Garden Patio')"
                      >
                        Garden Patio
                      </button>
                      <button
                        type="button"
                        class="quick-pill"
                        (click)="canvasNewSectionName.set('Courtyard Deck')"
                      >
                        Courtyard Deck
                      </button>
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Starting Room Dimensions</label>
                    <div class="preset-dimension-grid">
                      <button
                        type="button"
                        class="preset-dim-card"
                        [class.active]="
                          canvasNewSectionWidth() === 620 && canvasNewSectionHeight() === 420
                        "
                        (click)="canvasNewSectionWidth.set(620); canvasNewSectionHeight.set(420)"
                      >
                        <div class="dim-shape-icon std"></div>
                        <span class="dim-title">Standard</span>
                        <span class="dim-sub">620 × 420 px</span>
                      </button>
                      <button
                        type="button"
                        class="preset-dim-card"
                        [class.active]="
                          canvasNewSectionWidth() === 480 && canvasNewSectionHeight() === 340
                        "
                        (click)="canvasNewSectionWidth.set(480); canvasNewSectionHeight.set(340)"
                      >
                        <div class="dim-shape-icon sm"></div>
                        <span class="dim-title">Compact</span>
                        <span class="dim-sub">480 × 340 px</span>
                      </button>
                      <button
                        type="button"
                        class="preset-dim-card"
                        [class.active]="
                          canvasNewSectionWidth() === 840 && canvasNewSectionHeight() === 520
                        "
                        (click)="canvasNewSectionWidth.set(840); canvasNewSectionHeight.set(520)"
                      >
                        <div class="dim-shape-icon lg"></div>
                        <span class="dim-title">Grand Hall</span>
                        <span class="dim-sub">840 × 520 px</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div class="modal-footer">
                  <button
                    type="button"
                    class="btn btn-secondary"
                    (click)="showCanvasCreateSectionModal.set(false)"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary"
                    (click)="submitCanvasCreateSection()"
                  >
                    <i class="ph ph-plus"></i>
                    <span>Create Section</span>
                  </button>
                </div>
              </div>
            </div>
          }

          <!-- MODAL: CREATE NEW ARCHITECTURAL FIGURE / FIXTURE -->
          @if (showCanvasCreateFixtureModal()) {
            <div class="modal-overlay" (click)="showCanvasCreateFixtureModal.set(false)">
              <div
                class="modal-card apple-canvas-dialog"
                (click)="$event.stopPropagation()"
                role="dialog"
                aria-modal="true"
              >
                <div class="modal-header">
                  <div class="dialog-icon-badge amber-badge">
                    <i class="ph ph-shapes"></i>
                  </div>
                  <div>
                    <h3 class="heading-card">Add Architectural Figure</h3>
                    <span class="text-xs text-muted"
                      >Place architectural cues, service desks, or decor markers on canvas</span
                    >
                  </div>
                  <button
                    type="button"
                    class="close-btn"
                    (click)="showCanvasCreateFixtureModal.set(false)"
                    aria-label="Close"
                  >
                    <i class="ph ph-x"></i>
                  </button>
                </div>

                <div class="modal-body">
                  <div class="form-group">
                    <label class="form-label">Figure Type</label>
                    <div class="fixture-type-grid">
                      <button
                        type="button"
                        class="fig-type-btn"
                        [class.active]="canvasNewFixtureType() === 'CASHIER'"
                        (click)="
                          canvasNewFixtureType.set('CASHIER');
                          canvasNewFixtureLabel.set('Cashier / Billing Counter');
                          canvasNewFixtureIcon.set('ph-cash-register')
                        "
                      >
                        <i class="ph ph-cash-register"></i>
                        <span>Cashier</span>
                      </button>
                      <button
                        type="button"
                        class="fig-type-btn"
                        [class.active]="canvasNewFixtureType() === 'ENTRANCE'"
                        (click)="
                          canvasNewFixtureType.set('ENTRANCE');
                          canvasNewFixtureLabel.set('Entrance Door');
                          canvasNewFixtureIcon.set('ph-door')
                        "
                      >
                        <i class="ph ph-door"></i>
                        <span>Entrance</span>
                      </button>
                      <button
                        type="button"
                        class="fig-type-btn"
                        [class.active]="canvasNewFixtureType() === 'KITCHEN'"
                        (click)="
                          canvasNewFixtureType.set('KITCHEN');
                          canvasNewFixtureLabel.set('Kitchen Pass');
                          canvasNewFixtureIcon.set('ph-cooking-pot')
                        "
                      >
                        <i class="ph ph-cooking-pot"></i>
                        <span>Kitchen</span>
                      </button>
                      <button
                        type="button"
                        class="fig-type-btn"
                        [class.active]="canvasNewFixtureType() === 'BAR'"
                        (click)="
                          canvasNewFixtureType.set('BAR');
                          canvasNewFixtureLabel.set('Cocktail Bar');
                          canvasNewFixtureIcon.set('ph-martini')
                        "
                      >
                        <i class="ph ph-martini"></i>
                        <span>Bar</span>
                      </button>
                      <button
                        type="button"
                        class="fig-type-btn"
                        [class.active]="canvasNewFixtureType() === 'RESTROOM'"
                        (click)="
                          canvasNewFixtureType.set('RESTROOM');
                          canvasNewFixtureLabel.set('Restrooms');
                          canvasNewFixtureIcon.set('ph-toilet')
                        "
                      >
                        <i class="ph ph-toilet"></i>
                        <span>Restroom</span>
                      </button>
                      <button
                        type="button"
                        class="fig-type-btn"
                        [class.active]="canvasNewFixtureType() === 'STAGE'"
                        (click)="
                          canvasNewFixtureType.set('STAGE');
                          canvasNewFixtureLabel.set('Live Music / DJ Stage');
                          canvasNewFixtureIcon.set('ph-speaker-high')
                        "
                      >
                        <i class="ph ph-speaker-high"></i>
                        <span>Stage/DJ</span>
                      </button>
                      <button
                        type="button"
                        class="fig-type-btn"
                        [class.active]="canvasNewFixtureType() === 'BUFFET'"
                        (click)="
                          canvasNewFixtureType.set('BUFFET');
                          canvasNewFixtureLabel.set('Buffet Station');
                          canvasNewFixtureIcon.set('ph-bowl-food')
                        "
                      >
                        <i class="ph ph-bowl-food"></i>
                        <span>Buffet</span>
                      </button>
                      <button
                        type="button"
                        class="fig-type-btn"
                        [class.active]="canvasNewFixtureType() === 'WINDOW'"
                        (click)="
                          canvasNewFixtureType.set('WINDOW');
                          canvasNewFixtureLabel.set('Glass Window Wall');
                          canvasNewFixtureIcon.set('ph-sun-dim')
                        "
                      >
                        <i class="ph ph-sun-dim"></i>
                        <span>Window</span>
                      </button>
                      <button
                        type="button"
                        class="fig-type-btn"
                        [class.active]="canvasNewFixtureType() === 'STAIRS'"
                        (click)="
                          canvasNewFixtureType.set('STAIRS');
                          canvasNewFixtureLabel.set('Staircase / Elevator');
                          canvasNewFixtureIcon.set('ph-stairs')
                        "
                      >
                        <i class="ph ph-stairs"></i>
                        <span>Stairs</span>
                      </button>
                      <button
                        type="button"
                        class="fig-type-btn"
                        [class.active]="canvasNewFixtureType() === 'WALL'"
                        (click)="
                          canvasNewFixtureType.set('WALL');
                          canvasNewFixtureLabel.set('Partition / Planter');
                          canvasNewFixtureIcon.set('ph-plant')
                        "
                      >
                        <i class="ph ph-plant"></i>
                        <span>Plant/Wall</span>
                      </button>
                      <button
                        type="button"
                        class="fig-type-btn"
                        [class.active]="canvasNewFixtureType() === 'CUSTOM'"
                        (click)="
                          canvasNewFixtureType.set('CUSTOM');
                          canvasNewFixtureLabel.set('Custom Fixture');
                          canvasNewFixtureIcon.set('ph-cube')
                        "
                      >
                        <i class="ph ph-cube"></i>
                        <span>Custom...</span>
                      </button>
                    </div>
                  </div>

                  <div class="form-group">
                    <label class="form-label">Figure Label *</label>
                    <input
                      type="text"
                      class="form-input"
                      placeholder="e.g. Hostess Stand, Pizza Oven, Aquarium Wall"
                      [value]="canvasNewFixtureLabel()"
                      (input)="canvasNewFixtureLabel.set($any($event.target).value)"
                    />
                  </div>

                  <div class="form-group">
                    <label class="form-label">Place in Section / Scope</label>
                    <select
                      class="form-select"
                      [value]="canvasNewFixtureSection()"
                      (change)="canvasNewFixtureSection.set($any($event.target).value)"
                    >
                      <option value="ALL">All Floor Areas (Global Canvas)</option>
                      @for (p of places(); track p) {
                        <option [value]="p">{{ p }}</option>
                      }
                    </select>
                  </div>
                </div>

                <div class="modal-footer">
                  <button
                    type="button"
                    class="btn btn-secondary"
                    (click)="showCanvasCreateFixtureModal.set(false)"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary"
                    (click)="submitCanvasCreateFixture()"
                  >
                    <i class="ph ph-plus"></i>
                    <span>Place Figure on Canvas</span>
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- ============================================================ -->
      <!-- VIEW 2: CLASSIC TABLE CARDS GRID                             -->
      <!-- ============================================================ -->
      @if (viewMode() === 'GRID') {
        <div class="tables-grid">
          @if (isLoading()) {
            <app-skeleton variant="table-card" [count]="8" />
          } @else {
            @for (tbl of filteredTables(); track tbl.id) {
              <div
                class="table-card"
                [class.status-available]="tbl.status === 'AVAILABLE'"
                [class.status-occupied]="tbl.status === 'OCCUPIED'"
                [class.status-reserved]="tbl.status === 'RESERVED'"
                [class.status-dirty]="tbl.status === 'DIRTY'"
                [class.disabled-order]="!tbl.orderingEnabled"
                (click)="selectTable(tbl)"
              >
                <div class="table-card-top">
                  <div class="table-num-wrap">
                    <span class="table-number">{{ tbl.number }}</span>
                    <span class="table-capacity"
                      ><i class="ph ph-users"></i> {{ tbl.capacity }} Seats •
                      {{ getTableShape(tbl) }}</span
                    >
                  </div>
                  <app-status-badge [status]="tbl.status"></app-status-badge>
                </div>

                <div class="table-section-tag">
                  <i class="ph ph-map-pin"></i>
                  <span>{{ tbl.section }}</span>
                </div>

                <div class="table-token-box">
                  <span class="token-label">QR Token:</span>
                  <code class="token-code">{{ tbl.qrToken }}</code>
                </div>

                <!-- Host-Seating Quick Action (Pattern 3: Toast / OpenTable Model) -->
                @if (tbl.status === 'AVAILABLE') {
                  <button
                    type="button"
                    class="btn btn-sm btn-seat-action"
                    (click)="onStatusChange(tbl.id, 'OCCUPIED'); $event.stopPropagation()"
                    title="Seat incoming guests and unlock digital QR ordering for this table"
                  >
                    <i class="ph ph-hand-pointing"></i>
                    <span>Seat Guests (Open Table)</span>
                  </button>
                } @else if (tbl.status === 'DIRTY') {
                  <button
                    type="button"
                    class="btn btn-sm btn-clean-action"
                    (click)="onStatusChange(tbl.id, 'AVAILABLE'); $event.stopPropagation()"
                    title="Mark cleaned and ready for new guests"
                  >
                    <i class="ph ph-broom"></i>
                    <span>Mark Cleaned (Available)</span>
                  </button>
                } @else if (tbl.status === 'OCCUPIED') {
                  <div class="seated-badge-row">
                    <span class="seated-live-dot"></span>
                    <span class="seated-text">Seated &bull; QR Ordering Active</span>
                  </div>
                }

                <!-- Table Status Selector -->
                <div class="status-select-wrap">
                  <label class="text-xs text-muted" [attr.for]="'status-' + tbl.id"
                    >Change Status:</label
                  >
                  <select
                    [id]="'status-' + tbl.id"
                    class="form-select status-dropdown"
                    [ngModel]="tbl.status"
                    (ngModelChange)="onStatusChange(tbl.id, $event)"
                    (click)="$event.stopPropagation()"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="OCCUPIED">Occupied</option>
                    <option value="RESERVED">Reserved</option>
                    <option value="DIRTY">Cleaning</option>
                  </select>
                </div>

                <!-- Active Customer & Serving Staff -->
                @if (getActiveOrderByTable(tbl); as activeOrd) {
                  <div class="active-customer-box">
                    <div class="active-cust-header">
                      <span class="active-dot"></span>
                      <strong class="cust-name">{{
                        activeOrd.customerName || 'Walk-in Guest'
                      }}</strong>
                      <span class="order-chip">{{ activeOrd.orderNumber }}</span>
                    </div>
                    <div class="status-select-wrap">
                      <label class="text-xs text-muted" [attr.for]="'staff-' + tbl.id">
                        <i class="ph ph-user-check"></i> Serving Customer:
                      </label>
                      @if (isOrderPaid(activeOrd)) {
                        <div class="locked-server-row">
                          <span class="font-semibold text-xs">
                            <i class="ph ph-lock-key text-muted"></i>
                            {{ getServerStaffName(activeOrd.serverStaffId) || 'Unassigned' }}
                          </span>
                          <button
                            type="button"
                            class="btn-unlock-server"
                            (click)="promptChangePaidServer(activeOrd); $event.stopPropagation()"
                            title="Change serving staff on paid order"
                          >
                            <i class="ph ph-lock-key"></i>
                            <span>Change</span>
                          </button>
                        </div>
                      } @else {
                        <select
                          [id]="'staff-' + tbl.id"
                          class="form-select status-dropdown active-server-select"
                          [ngModel]="activeOrd.serverStaffId || ''"
                          (ngModelChange)="onAssignActiveOrderServer(activeOrd, $event)"
                          (click)="$event.stopPropagation()"
                        >
                          <option value="">Unassigned</option>
                          @for (s of staffMembers(); track s.id) {
                            <option [value]="s.id">{{ s.name }} ({{ s.role }})</option>
                          }
                        </select>
                      }
                    </div>
                  </div>
                } @else {
                  <div class="status-select-wrap">
                    <label class="text-xs text-muted" [attr.for]="'staff-' + tbl.id">
                      <i class="ph ph-user"></i> Default Server (Optional):
                    </label>
                    <select
                      [id]="'staff-' + tbl.id"
                      class="form-select status-dropdown"
                      [ngModel]="tbl.assignedStaffId || ''"
                      (ngModelChange)="onStaffAssign(tbl.id, $event)"
                      (click)="$event.stopPropagation()"
                    >
                      <option value="">Dynamic (Assigned per Order)</option>
                      @for (s of staffMembers(); track s.id) {
                        <option [value]="s.id">{{ s.name }} ({{ s.role }})</option>
                      }
                    </select>
                  </div>
                }

                <!-- Card Actions -->
                <div class="table-card-actions">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    (click)="openQrModal(tbl); $event.stopPropagation()"
                    title="View & Print QR"
                  >
                    <i class="ph ph-qr-code"></i>
                    <span>QR Code</span>
                  </button>

                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    (click)="toggleOrdering(tbl); $event.stopPropagation()"
                    [title]="tbl.orderingEnabled ? 'Disable Ordering' : 'Enable Ordering'"
                  >
                    <i
                      class="ph"
                      [class.ph-lock]="tbl.orderingEnabled"
                      [class.ph-lock-open]="!tbl.orderingEnabled"
                    ></i>
                  </button>

                  <button
                    type="button"
                    class="btn btn-secondary btn-sm btn-icon-danger"
                    (click)="confirmDeleteTable(tbl); $event.stopPropagation()"
                    title="Delete Table"
                  >
                    <i class="ph ph-trash"></i>
                  </button>
                </div>
              </div>
            } @empty {
              <div style="grid-column: 1 / -1; width: 100%;">
                <app-empty-state
                  icon="ph-table"
                  title="No Dining Tables Found"
                  message="No dining tables match your selected room or status filter."
                  actionText="Add New Table"
                  actionIcon="ph-plus-circle"
                  (actionClick)="openAddTableModal()"
                />
              </div>
            }
          }
        </div>
      }

      <!-- ============================================================ -->
      <!-- TABLE INSPECTOR DRAWER / POPUP CONTROLS                      -->
      <!-- ============================================================ -->
      @if (selectedTableForInspector(); as insTbl) {
        <div class="inspector-drawer-backdrop" (click)="selectedTableForInspector.set(null)">
          <div class="inspector-drawer" (click)="$event.stopPropagation()">
            <div class="drawer-header">
              <div class="drawer-title-wrap">
                <span class="drawer-shape-icon">
                  <i
                    class="ph"
                    [class.ph-circle]="getTableShape(insTbl) === 'ROUND'"
                    [class.ph-square]="getTableShape(insTbl) === 'RECT'"
                  ></i>
                </span>
                <div>
                  <h3 class="drawer-table-num">Table {{ insTbl.number }}</h3>
                  <span class="drawer-section-pill"
                    >{{ insTbl.section }} • {{ insTbl.capacity }} Seats</span
                  >
                </div>
              </div>
              <button type="button" class="close-btn" (click)="selectedTableForInspector.set(null)">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="drawer-body">
              <!-- Quick Status Selector -->
              <div class="drawer-section">
                <label class="drawer-label">Occupancy Status</label>
                <div class="status-quick-grid">
                  <button
                    type="button"
                    class="status-choice-btn available"
                    [class.selected]="insTbl.status === 'AVAILABLE'"
                    (click)="onStatusChange(insTbl.id, 'AVAILABLE')"
                  >
                    <span class="choice-dot"></span> Available
                  </button>
                  <button
                    type="button"
                    class="status-choice-btn occupied"
                    [class.selected]="insTbl.status === 'OCCUPIED'"
                    (click)="onStatusChange(insTbl.id, 'OCCUPIED')"
                  >
                    <span class="choice-dot"></span> Occupied
                  </button>
                  <button
                    type="button"
                    class="status-choice-btn reserved"
                    [class.selected]="insTbl.status === 'RESERVED'"
                    (click)="onStatusChange(insTbl.id, 'RESERVED')"
                  >
                    <span class="choice-dot"></span> Reserved
                  </button>
                  <button
                    type="button"
                    class="status-choice-btn dirty"
                    [class.selected]="insTbl.status === 'DIRTY'"
                    (click)="onStatusChange(insTbl.id, 'DIRTY')"
                  >
                    <span class="choice-dot"></span> Cleaning
                  </button>
                </div>

                @if (insTbl.status === 'AVAILABLE') {
                  <button
                    type="button"
                    class="btn btn-seat-action"
                    style="margin-top: 10px; width: 100%; justify-content: center;"
                    (click)="onStatusChange(insTbl.id, 'OCCUPIED')"
                  >
                    <i class="ph ph-hand-pointing"></i>
                    <span>Seat Guests (Activate QR Ordering)</span>
                  </button>
                } @else if (insTbl.status === 'DIRTY') {
                  <button
                    type="button"
                    class="btn btn-clean-action"
                    style="margin-top: 10px; width: 100%; justify-content: center;"
                    (click)="onStatusChange(insTbl.id, 'AVAILABLE')"
                  >
                    <i class="ph ph-broom"></i>
                    <span>Mark Cleaned (Available)</span>
                  </button>
                }
              </div>

              <!-- Active Dining Orders Cockpit & Lifecycle Control -->
              <div class="drawer-section active-orders-cockpit">
                <div class="active-orders-top-bar">
                  <span class="drawer-label" style="margin-bottom: 0;">
                    <i class="ph ph-receipt"></i> Active Dining Orders
                  </span>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="order-count-chip">
                      {{ getActiveOrdersByTable(insTbl).length }} Active
                    </span>
                    <button
                      type="button"
                      class="btn btn-primary btn-xs"
                      (click)="openManualOrderModal(insTbl)"
                      title="Add manual order for Table {{ insTbl.number }}"
                    >
                      <i class="ph ph-plus"></i> Add Order
                    </button>
                  </div>
                </div>

                @if (getActiveOrdersByTable(insTbl); as actOrders) {
                  @if (actOrders.length > 0) {
                    <div class="orders-accordion-list">
                      @for (actOrder of actOrders; track actOrder.id; let ordIdx = $index) {
                        <div
                          class="active-order-card"
                          [class.order-ready]="actOrder.status === 'READY'"
                          [class.order-served]="actOrder.status === 'SERVED'"
                        >
                          <!-- Apple Card Top Accent Strip -->
                          <div class="apple-card-accent"></div>

                          <!-- 1. Header: Table Pill + Round Badge + Order ID + Time + Status Badge -->
                          <div class="card-top apple-card-top">
                            <div class="header-left-cluster">
                              <span class="apple-table-pill">
                                <i class="ph ph-table"></i>
                                <span>Table {{ insTbl.number }}</span>
                              </span>
                              <span class="round-badge">Round {{ ordIdx + 1 }}</span>
                              <span class="ord-num apple-ord-num">#{{ actOrder.orderNumber }}</span>
                            </div>

                            <div class="header-right-cluster">
                              <span class="ord-time apple-ord-time">
                                <i class="ph ph-clock"></i>
                                {{ actOrder.createdAt | date: 'shortTime' }}
                              </span>
                              <app-status-badge [status]="actOrder.status"></app-status-badge>
                            </div>
                          </div>

                          <!-- 2. Guest & Server Info Strip (Apple Recessed Surface) -->
                          <div class="guest-server-recessed">
                            <div class="guest-compact-meta">
                              <div class="guest-avatar-disc">
                                {{ (actOrder.customerName || 'G').charAt(0).toUpperCase() }}
                              </div>
                              <div class="guest-text-col truncate">
                                <span
                                  class="cust-name-clean truncate"
                                  [title]="actOrder.customerName"
                                  >{{ actOrder.customerName || 'Walk-in Guest' }}</span
                                >
                                @if (actOrder.customerPhone) {
                                  <span class="phone-sub-clean">
                                    <i class="ph ph-phone"></i> {{ actOrder.customerPhone }}
                                  </span>
                                }
                              </div>
                            </div>

                            <div
                              class="server-inline-picker"
                              [class.server-bar-locked]="isOrderPaid(actOrder)"
                            >
                              @if (isOrderPaid(actOrder)) {
                                <div class="server-completed-pill" title="Serving Staff">
                                  <i class="ph ph-lock-key"></i>
                                  <span class="truncate">{{
                                    getServerStaffName(actOrder.serverStaffId) || 'Staff'
                                  }}</span>
                                  <button
                                    type="button"
                                    class="btn-unlock-inline"
                                    (click)="
                                      promptChangePaidServer(actOrder); $event.stopPropagation()
                                    "
                                    title="Change serving staff on paid order"
                                  >
                                    <i class="ph ph-pencil-simple"></i>
                                  </button>
                                </div>
                              } @else {
                                <div class="server-select-pill">
                                  <i class="ph ph-user-check"></i>
                                  <select
                                    [id]="'server-' + actOrder.id"
                                    class="server-select-clean"
                                    [class.is-unassigned]="!actOrder.serverStaffId"
                                    [ngModel]="actOrder.serverStaffId || ''"
                                    (ngModelChange)="onAssignActiveOrderServer(actOrder, $event)"
                                    (click)="$event.stopPropagation()"
                                    title="Assign staff handling this order"
                                  >
                                    <option value="">Server...</option>
                                    @for (s of staffMembers(); track s.id) {
                                      <option [value]="s.id">{{ s.name }} ({{ s.role }})</option>
                                    }
                                  </select>
                                  <i class="ph ph-caret-down pill-caret"></i>
                                </div>
                              }
                            </div>
                          </div>

                          <!-- 3. Arrived Order Items Stream (Editorial Receipt Style) -->
                          <div class="session-receipt-stream">
                            <div class="receipt-stream-header">
                              <span class="receipt-stream-title">
                                <i class="ph ph-receipt"></i>
                                Ordered Items ({{ actOrder.items.length }}
                                {{ actOrder.items.length === 1 ? 'Item' : 'Items' }})
                              </span>
                              <span class="receipt-stream-subtotal">
                                {{ actOrder.subtotal || actOrder.totalAmount | currencyInr }}
                              </span>
                            </div>

                            <div class="receipt-rounds-body">
                              <div
                                class="receipt-round-segment"
                                [class.round-pending-soft]="actOrder.status === 'PENDING'"
                              >
                                <div class="round-items-clean">
                                  @for (it of actOrder.items; track it.id) {
                                    <div class="receipt-item-row">
                                      <div class="item-name-cluster">
                                        <span class="qty-bubble">{{ it.quantity }}×</span>
                                        <span class="item-title truncate" [title]="it.name">{{
                                          it.name
                                        }}</span>
                                        @if (it.selectedPortion) {
                                          <span class="portion-tag">{{
                                            it.selectedPortion.label
                                          }}</span>
                                        }
                                      </div>
                                      <span class="item-price">{{
                                        it.itemTotal || it.unitPrice * it.quantity | currencyInr
                                      }}</span>
                                    </div>
                                  }
                                </div>
                              </div>
                            </div>
                          </div>

                          <!-- 4. Grand Total Financial Breakdown Strip -->
                          <div class="bill-strip grand-bill-strip-apple">
                            <div class="sub-line">
                              <span class="bill-label">Subtotal</span>
                              <span class="bill-val">{{
                                actOrder.subtotal || actOrder.totalAmount | currencyInr
                              }}</span>
                            </div>
                            @if (actOrder.discountAmount && actOrder.discountAmount > 0) {
                              <div class="sub-line discount">
                                <span class="bill-label"
                                  ><i class="ph ph-tag"></i>
                                  {{ actOrder.appliedCouponCode || 'Discount' }}</span
                                >
                                <span class="bill-val"
                                  >-{{ actOrder.discountAmount | currencyInr }}</span
                                >
                              </div>
                            }
                            <div class="total-row-apple">
                              <div class="total-meta-left">
                                <span class="total-label-apple">Payable Total</span>
                                @if (isOrderPaid(actOrder)) {
                                  <span class="status-pill-chip paid"
                                    ><i class="ph ph-check-circle"></i> PAID</span
                                  >
                                } @else {
                                  <span class="status-pill-chip unpaid"
                                    ><i class="ph ph-clock"></i> UNPAID</span
                                  >
                                }
                              </div>
                              <span class="payable-val-apple">{{
                                actOrder.totalAmount | currencyInr
                              }}</span>
                            </div>
                          </div>

                          <!-- 5. Tactile Action Controls -->
                          <div class="card-footer-actions-apple">
                            @if (!isOrderPaid(actOrder)) {
                              <div class="action-row-primary">
                                <button
                                  type="button"
                                  class="apple-btn-primary"
                                  (click)="
                                    openCanvasSettleModal(actOrder); $event.stopPropagation()
                                  "
                                  title="Settle payment for Order #{{ actOrder.orderNumber }}"
                                >
                                  <i class="ph ph-credit-card"></i>
                                  <span
                                    >Settle Bill ({{ actOrder.totalAmount | currencyInr }})</span
                                  >
                                </button>
                              </div>
                            }

                            <div class="apple-util-grid" [class.is-settled]="isOrderPaid(actOrder)">
                              <a
                                [routerLink]="['/admin/orders']"
                                class="apple-util-btn"
                                title="View in Live Order Queue"
                              >
                                <i class="ph ph-list-dashes"></i>
                                <span>Queue</span>
                              </a>

                              @if (isOrderPaid(actOrder) && actOrder.status !== 'CANCELLED') {
                                <button
                                  type="button"
                                  class="apple-util-btn"
                                  (click)="printBillForOrder(actOrder); $event.stopPropagation()"
                                  title="Print customer receipt"
                                >
                                  <i class="ph ph-printer"></i>
                                  <span>Print Bill</span>
                                </button>
                              }
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  } @else {
                    <div class="no-orders-box">
                      <i class="ph ph-tray text-muted"></i>
                      <span>No active food orders for Table {{ insTbl.number }}.</span>
                    </div>
                  }
                }
              </div>

              <!-- Change Room / Section -->
              <div class="drawer-section">
                <label class="drawer-label" for="drawerPlaceSelect">Assigned Place / Room</label>
                <select
                  id="drawerPlaceSelect"
                  class="form-select"
                  [ngModel]="insTbl.section"
                  (ngModelChange)="reassignTableSection(insTbl, $event)"
                >
                  @for (p of places(); track p) {
                    <option [value]="p">{{ p }}</option>
                  }
                </select>
              </div>

              <!-- Table Shape & Customization (ONLY IN DESIGN MODE) -->
              @if (isDesignMode()) {
                <div class="drawer-section">
                  <label class="drawer-label">Visual Table Shape</label>
                  <div class="shape-toggle-group">
                    <button
                      type="button"
                      class="shape-btn"
                      [class.active]="getTableShape(insTbl) === 'ROUND'"
                      (click)="toggleTableShape(insTbl)"
                    >
                      <i class="ph ph-circle"></i> Round Table
                    </button>
                    <button
                      type="button"
                      class="shape-btn"
                      [class.active]="getTableShape(insTbl) === 'RECT'"
                      (click)="toggleTableShape(insTbl)"
                    >
                      <i class="ph ph-rectangle"></i> Rectangular Table
                    </button>
                  </div>
                </div>

                <!-- Table Dimensions & Size (ONLY IN DESIGN MODE) -->
                <div class="drawer-section">
                  <div
                    style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;"
                  >
                    <label class="drawer-label" style="margin-bottom: 0;"
                      >Table Dimensions & Size</label
                    >
                    <span class="text-xs text-muted"
                      >{{ getTableWidth(insTbl) }} × {{ getTableHeight(insTbl) }} px</span
                    >
                  </div>
                  <div class="table-size-preset-grid">
                    <button
                      type="button"
                      class="size-chip-btn"
                      [class.active]="getTableWidth(insTbl) <= 80"
                      (click)="updateTableSize(insTbl, 76, 76)"
                      title="Compact Size (76px)"
                    >
                      <span class="chip-title">S</span>
                      <span class="chip-sub">Compact</span>
                    </button>
                    <button
                      type="button"
                      class="size-chip-btn"
                      [class.active]="getTableWidth(insTbl) > 80 && getTableWidth(insTbl) <= 105"
                      (click)="
                        updateTableSize(insTbl, getTableShape(insTbl) === 'ROUND' ? 96 : 136, 96)
                      "
                      title="Standard Size"
                    >
                      <span class="chip-title">M</span>
                      <span class="chip-sub">Standard</span>
                    </button>
                    <button
                      type="button"
                      class="size-chip-btn"
                      [class.active]="getTableWidth(insTbl) > 105 && getTableWidth(insTbl) <= 140"
                      (click)="
                        updateTableSize(
                          insTbl,
                          getTableShape(insTbl) === 'ROUND' ? 120 : 160,
                          getTableShape(insTbl) === 'ROUND' ? 120 : 110
                        )
                      "
                      title="Spacious Size"
                    >
                      <span class="chip-title">L</span>
                      <span class="chip-sub">Spacious</span>
                    </button>
                    <button
                      type="button"
                      class="size-chip-btn"
                      [class.active]="getTableWidth(insTbl) > 140"
                      (click)="
                        updateTableSize(
                          insTbl,
                          getTableShape(insTbl) === 'ROUND' ? 150 : 200,
                          getTableShape(insTbl) === 'ROUND' ? 150 : 130
                        )
                      "
                      title="VIP Large Banquet"
                    >
                      <span class="chip-title">XL</span>
                      <span class="chip-sub">VIP Hall</span>
                    </button>
                  </div>

                  <div
                    class="size-sliders-row"
                    style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;"
                  >
                    <div
                      style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8125rem;"
                    >
                      <span
                        >Width: <strong>{{ getTableWidth(insTbl) }}px</strong></span
                      >
                      <input
                        type="range"
                        min="64"
                        max="260"
                        step="10"
                        [value]="getTableWidth(insTbl)"
                        (input)="onTableWidthSliderInput(insTbl, $event)"
                        style="width: 140px; accent-color: var(--color-crimson, #dc2626);"
                      />
                    </div>
                    @if (getTableShape(insTbl) === 'RECT') {
                      <div
                        style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8125rem;"
                      >
                        <span
                          >Height: <strong>{{ getTableHeight(insTbl) }}px</strong></span
                        >
                        <input
                          type="range"
                          min="64"
                          max="200"
                          step="10"
                          [value]="getTableHeight(insTbl)"
                          (input)="onTableHeightSliderInput(insTbl, $event)"
                          style="width: 140px; accent-color: var(--color-crimson, #dc2626);"
                        />
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- QR Code & Ordering -->
              <div class="drawer-section">
                <label class="drawer-label">QR Standee & Mobile Ordering</label>
                <div class="drawer-action-buttons">
                  <button
                    type="button"
                    class="btn btn-secondary w-100"
                    (click)="openQrModal(insTbl)"
                  >
                    <i class="ph ph-qr-code"></i> View & Print Table QR Standee
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary w-100"
                    (click)="toggleOrdering(insTbl)"
                  >
                    <i
                      class="ph"
                      [class.ph-lock]="insTbl.orderingEnabled"
                      [class.ph-lock-open]="!insTbl.orderingEnabled"
                    ></i>
                    <span>{{
                      insTbl.orderingEnabled ? 'Disable Mobile Ordering' : 'Enable Mobile Ordering'
                    }}</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="drawer-footer">
              <button
                type="button"
                class="btn btn-secondary btn-icon-danger"
                (click)="confirmDeleteTable(insTbl)"
              >
                <i class="ph ph-trash"></i> Delete Table
              </button>
              <button
                type="button"
                class="btn btn-primary"
                (click)="selectedTableForInspector.set(null)"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ============================================================ -->
      <!-- MODAL: ADD NEW PLACE / SECTION                              -->
      <!-- ============================================================ -->
      @if (showAddPlaceModal()) {
        <div class="modal-overlay" (click)="showAddPlaceModal.set(false)">
          <div
            class="modal-card add-place-card"
            role="dialog"
            aria-modal="true"
            (click)="$event.stopPropagation()"
          >
            <div class="modal-header">
              <div class="modal-title-with-icon">
                <div class="icon-circle"><i class="ph ph-folder-plus"></i></div>
                <div>
                  <h3 class="heading-card">Add Restaurant Place</h3>
                  <p class="text-xs text-muted" style="margin: 2px 0 0;">
                    Create a new room, floor, or outdoor dining zone
                  </p>
                </div>
              </div>
              <button type="button" class="close-btn" (click)="showAddPlaceModal.set(false)">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <div class="form-group">
                <label class="form-label" for="placeNameInput">Place / Room Name *</label>
                <input
                  id="placeNameInput"
                  type="text"
                  class="form-input"
                  placeholder="e.g. Terrace Garden, Rooftop Deck, Poolside Patio"
                  [ngModel]="newPlaceName()"
                  (ngModelChange)="newPlaceName.set($event)"
                  (keydown.enter)="saveNewPlace()"
                  autofocus
                />
              </div>

              <div class="place-suggestions">
                <span class="text-xs text-muted d-block" style="margin-bottom: 6px;"
                  >Suggested Places:</span
                >
                <div class="suggestion-pills">
                  <button
                    type="button"
                    class="sug-pill"
                    (click)="newPlaceName.set('Terrace Garden')"
                  >
                    Terrace Garden
                  </button>
                  <button
                    type="button"
                    class="sug-pill"
                    (click)="newPlaceName.set('Rooftop Lounge')"
                  >
                    Rooftop Lounge
                  </button>
                  <button
                    type="button"
                    class="sug-pill"
                    (click)="newPlaceName.set('Poolside Patio')"
                  >
                    Poolside Patio
                  </button>
                  <button
                    type="button"
                    class="sug-pill"
                    (click)="newPlaceName.set('VIP Banquet Hall')"
                  >
                    VIP Banquet Hall
                  </button>
                  <button
                    type="button"
                    class="sug-pill"
                    (click)="newPlaceName.set('Courtyard Dining')"
                  >
                    Courtyard Dining
                  </button>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                (click)="showAddPlaceModal.set(false)"
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-primary"
                (click)="saveNewPlace()"
                [disabled]="!newPlaceName().trim()"
              >
                <i class="ph ph-plus-circle"></i> Create Place
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ============================================================ -->
      <!-- MODAL: ADD DINING TABLE                                      -->
      <!-- ============================================================ -->
      @if (showAddModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div
            class="modal-card"
            role="dialog"
            aria-modal="true"
            (click)="$event.stopPropagation()"
          >
            <div class="modal-header">
              <h3 class="heading-card">Add Dining Table</h3>
              <button type="button" class="close-btn" (click)="showAddModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label" for="addTableNum">Table Number / Label *</label>
                  <input
                    id="addTableNum"
                    type="text"
                    class="form-input"
                    placeholder="e.g. T-13 or Rooftop-01"
                    [(ngModel)]="newTableNumber"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label" for="addTableCap">Seating Capacity *</label>
                  <input
                    id="addTableCap"
                    type="number"
                    class="form-input"
                    min="1"
                    max="24"
                    [(ngModel)]="newTableCapacity"
                  />
                </div>
              </div>

              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label" for="addTableSec">Dining Place / Room *</label>
                  <select id="addTableSec" class="form-select" [(ngModel)]="newTableSection">
                    @for (p of places(); track p) {
                      <option [value]="p">{{ p }}</option>
                    }
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="addTableShape">Table Shape</label>
                  <select id="addTableShape" class="form-select" [(ngModel)]="newTableShape">
                    <option value="ROUND">Round (Circular)</option>
                    <option value="RECT">Rectangular</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="addTableInitStatus">Initial Occupancy Status</label>
                <select id="addTableInitStatus" class="form-select" [(ngModel)]="newTableStatus">
                  <option value="AVAILABLE">Available</option>
                  <option value="OCCUPIED">Occupied</option>
                  <option value="RESERVED">Reserved</option>
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="showAddModal = false">
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-primary"
                (click)="saveNewTable()"
                [disabled]="!newTableNumber.trim() || newTableCapacity < 1"
              >
                Create Table & QR
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ============================================================ -->
      <!-- MODAL: QR CODE PREVIEW & PRINT STANDEE                       -->
      <!-- ============================================================ -->
      @if (activeQrTable) {
        <div class="modal-overlay qr-modal-overlay" (click)="onBackdropClick($event)">
          <div
            class="modal-card qr-preview-card"
            role="dialog"
            aria-modal="true"
            (click)="$event.stopPropagation()"
          >
            <div class="modal-header no-print">
              <div class="modal-title-wrap">
                <div class="qr-header-icon"><i class="ph ph-qr-code"></i></div>
                <div>
                  <h3 class="heading-card">Table {{ activeQrTable.number }} QR Standee</h3>
                  <p class="modal-subtext">Table tent standee &amp; instant contactless menu</p>
                </div>
              </div>
              <button type="button" class="close-btn" (click)="activeQrTable = null">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <!-- Print-Ready Standee Tent Card -->
            <div class="qr-standee" #printContainer>
              <div class="standee-inner-frame">
                <!-- Corner Ornamental Brackets -->
                <div class="frame-corner corner-tl"></div>
                <div class="frame-corner corner-tr"></div>
                <div class="frame-corner corner-bl"></div>
                <div class="frame-corner corner-br"></div>

                <div class="standee-header">
                  <div class="standee-crest">
                    <i class="ph-fill ph-crown"></i>
                  </div>
                  <div class="standee-brand font-display">
                    {{ restaurant()?.name || 'GuruKripa Dhaba' }}
                  </div>
                  <div class="standee-sub">
                    Pure Veg Punjabi Dhaba • {{ activeQrTable.section }}
                  </div>
                  <div class="standee-divider">
                    <span class="divider-line"></span>
                    <span class="divider-gem">◆</span>
                    <span class="divider-line"></span>
                  </div>
                </div>

                <div class="qr-center-block">
                  <div class="scan-pill">
                    <i class="ph-bold ph-camera"></i>
                    <span>SCAN TO ORDER</span>
                  </div>

                  <div class="qr-image-container">
                    @if (qrDataUrl) {
                      <img [src]="qrDataUrl" alt="Table QR Code" class="qr-canvas-img" />
                    } @else {
                      <div class="qr-loading">Generating QR Code...</div>
                    }
                  </div>
                </div>

                <div class="standee-footer">
                  <div class="standee-table-badge font-display">
                    TABLE {{ activeQrTable.number }}
                  </div>

                  <div class="standee-steps">
                    <span class="step-badge"><span class="step-num">1</span> Scan QR</span>
                    <span class="step-sep">•</span>
                    <span class="step-badge"><span class="step-num">2</span> View Menu</span>
                    <span class="step-sep">•</span>
                    <span class="step-badge"><span class="step-num">3</span> Order Directly</span>
                  </div>

                  <div class="standee-meta">
                    <span class="meta-dot"></span>
                    <span>Instant Kitchen KOT • Contactless Service</span>
                  </div>

                  <div class="standee-print-cut-line">
                    <span class="cut-icon">✂</span>
                    <span>Cut along outer border for acrylic stand or table tent</span>
                  </div>
                </div>

                <!-- Live Hosted Mobile Link Preview -->
                <div class="standee-url-preview no-print">
                  <span class="url-preview-label"
                    ><i class="ph ph-globe"></i> Customer Menu Mobile Link</span
                  >
                  <div class="url-preview-pill">
                    <a
                      [href]="activeQrFullUrl()"
                      target="_blank"
                      rel="noopener"
                      class="url-preview-link"
                      title="Open and test customer menu in browser"
                    >
                      <code>{{ activeQrFullUrl() }}</code>
                      <i class="ph ph-arrow-square-out"></i>
                    </a>
                    <button
                      type="button"
                      class="btn-copy-url"
                      (click)="copyQrUrl()"
                      title="Copy link to clipboard"
                    >
                      <i class="ph ph-copy"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="modal-footer no-print">
              <button type="button" class="btn btn-secondary" (click)="downloadQrImage()">
                <i class="ph ph-download-simple"></i>
                <span>Download Standee PNG</span>
              </button>
              <button type="button" class="btn btn-primary" (click)="printQrStandee()">
                <i class="ph ph-printer"></i>
                <span>Print Table Tent</span>
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Delete Confirmation Modal -->
      <app-confirm-modal
        [isOpen]="!!tableToDelete"
        title="Remove Dining Table"
        [message]="
          'Are you sure you want to remove ' +
          (tableToDelete?.number || 'this table') +
          '? Its QR ordering link will become inactive.'
        "
        confirmText="Remove Table"
        confirmVariant="danger"
        (confirm)="executeDeleteTable()"
        (cancel)="tableToDelete = null"
      ></app-confirm-modal>

      <!-- Admin Password Modal for Server Staff Reassignment on Paid Orders -->
      @if (showServerAdminModal()) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div
            class="modal-card auth-modal-card"
            role="dialog"
            aria-modal="true"
            (click)="$event.stopPropagation()"
          >
            <div class="modal-header">
              <div class="auth-modal-title-wrap">
                <div class="auth-icon-badge"><i class="ph ph-lock-key"></i></div>
                <div>
                  <h3 class="heading-card">Admin Authorization Required</h3>
                  <p class="text-xs text-muted" style="margin: 2px 0 0;">
                    Reassign server staff for paid Order #{{ targetServerOrder()?.orderNumber }}
                  </p>
                </div>
              </div>
              <button type="button" class="close-btn" (click)="cancelServerAdminModal()">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body auth-dialog-body">
              <div class="auth-warning-box">
                <i class="ph ph-warning-circle"></i>
                <p>
                  This order has already been paid and finalized. Changing the assigned server staff
                  affects shift reporting and server commission tracking. Enter the Admin Password
                  to proceed.
                </p>
              </div>

              <div class="form-group">
                <label class="form-label" for="newTableServerSelect">Assign New Server Staff</label>
                <select
                  id="newTableServerSelect"
                  class="form-select"
                  [ngModel]="selectedServerStaffId()"
                  (ngModelChange)="selectedServerStaffId.set($event || null)"
                >
                  <option [ngValue]="null">Unassigned</option>
                  @for (s of staffMembers(); track s.id) {
                    <option [value]="s.id">{{ s.name }} ({{ s.role }})</option>
                  }
                </select>
              </div>

              <div class="form-group" style="margin-top: 12px;">
                <label class="form-label" for="tblAdminPasswordInput">Admin Master Password</label>
                <div class="input-with-icon">
                  <i class="ph ph-key"></i>
                  <input
                    id="tblAdminPasswordInput"
                    type="password"
                    class="form-input"
                    placeholder="Enter admin password"
                    [ngModel]="serverAdminPassword()"
                    (ngModelChange)="serverAdminPassword.set($event); serverAdminError.set('')"
                    (keydown.enter)="confirmServerAdminChange()"
                    autofocus
                  />
                </div>
                <span class="hint-text">Default master password: <code>admin123</code></span>
              </div>

              @if (serverAdminError()) {
                <div class="auth-error-banner">
                  <i class="ph ph-warning-octagon"></i>
                  <span>{{ serverAdminError() }}</span>
                </div>
              }
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="cancelServerAdminModal()">
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-primary"
                (click)="confirmServerAdminChange()"
                [disabled]="!serverAdminPassword().trim()"
              >
                <i class="ph ph-check"></i>
                <span>Authorize & Update Server</span>
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Floor Canvas Quick Settle Modal -->
      @if (showCanvasSettleModal() && orderToSettle(); as ord) {
        <div class="modal-overlay" (click)="closeCanvasSettleModal()">
          <div
            class="modal-card settle-modal canvas-settle-card"
            (click)="$event.stopPropagation()"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settle-order-title"
          >
            <div class="modal-header">
              <div>
                <h3 id="settle-order-title" class="heading-card">
                  {{
                    ord.isSplit
                      ? 'Split Bills Settlement'
                      : ord.orderType === 'TAKEAWAY'
                        ? 'Settle Takeaway Bill'
                        : 'Settle Dining Bill'
                  }}
                </h3>
                <span class="text-xs text-muted">
                  {{ ord.orderNumber }} •
                  {{
                    ord.orderType === 'TAKEAWAY'
                      ? 'Takeaway (' + (ord.pickupReference || ord.orderNumber) + ')'
                      : 'Table ' + (ord.tableNumber || selectedTableForInspector()?.number)
                  }}
                </span>
              </div>
              <button
                class="close-btn"
                (click)="closeCanvasSettleModal()"
                aria-label="Close settle modal"
              >
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <!-- Mode Tabs if order is not split yet -->
              @if (!ord.isSplit && getOrderSplitBills(ord.id).length === 0) {
                <div class="settle-mode-tabs">
                  <button
                    type="button"
                    class="mode-tab-btn"
                    [class.active]="settleMode() === 'FULL'"
                    (click)="settleMode.set('FULL')"
                  >
                    <i class="ph ph-receipt"></i>
                    <span>Full Bill Settle</span>
                  </button>
                  <button
                    type="button"
                    class="mode-tab-btn"
                    [class.active]="settleMode() === 'SPLIT'"
                    (click)="settleMode.set('SPLIT')"
                  >
                    <i class="ph ph-split-horizontal"></i>
                    <span>Split Bill (Equal)</span>
                  </button>
                </div>
              }

              <!-- 1. FULL BILL SETTLEMENT VIEW -->
              @if (!ord.isSplit && settleMode() === 'FULL') {
                <div class="settle-summary-box">
                  <div class="settle-row">
                    <span>Guest Name</span>
                    <strong>{{ ord.customerName || 'Walk-in Guest' }}</strong>
                  </div>

                  <!-- Itemized dishes breakdown -->
                  <div class="settle-items-section">
                    <div class="settle-items-header">
                      <span>Ordered Dishes</span>
                      <span class="text-xs text-muted">{{ (ord.items || []).length }} items</span>
                    </div>
                    <div class="settle-items-list">
                      @for (item of ord.items || []; track $index) {
                        <div class="settle-item-row">
                          <div class="settle-item-left">
                            <span class="item-qty-pill">{{ item.quantity }}x</span>
                            <div class="item-text-group">
                              <span class="item-name-text">{{ item.name }}</span>
                              @if (item.notes || item.specialInstructions) {
                                <span class="item-instruction-text">{{
                                  item.notes || item.specialInstructions
                                }}</span>
                              }
                            </div>
                          </div>
                          <span class="item-total-price">{{
                            item.itemTotal || item.unitPrice * item.quantity | currencyInr
                          }}</span>
                        </div>
                      }
                    </div>
                  </div>

                  <div class="settle-divider"></div>

                  <div class="settle-row">
                    <span>Item Subtotal</span>
                    <span class="font-semibold">{{
                      ord.subtotal || ord.totalAmount | currencyInr
                    }}</span>
                  </div>
                  @if (settleDiscountMode() === 'COUPON' && getEffectiveDiscount(ord) > 0) {
                    <div class="settle-row discount">
                      <span>Coupon Discount ({{ selectedCouponCode() }})</span>
                      <span class="text-success font-semibold"
                        >-{{ getEffectiveDiscount(ord) | currencyInr }}</span
                      >
                    </div>
                  }
                  <div class="settle-row">
                    <span>Taxes (CGST + SGST)</span>
                    <span>{{ getSettlementTax(ord) | currencyInr }}</span>
                  </div>
                  @if (settleDiscountMode() === 'CUSTOM' && getEffectiveDiscount(ord) > 0) {
                    <div class="settle-row discount">
                      <span>Admin Discount / Round-off</span>
                      <span class="text-success font-semibold"
                        >-{{ getEffectiveDiscount(ord) | currencyInr }}</span
                      >
                    </div>
                  }
                  <div class="settle-divider"></div>
                  <div class="settle-row total-highlight">
                    <span>Net Payable Total</span>
                    <span class="amount-large">{{ getSettlementTotal(ord) | currencyInr }}</span>
                  </div>
                </div>

                <!-- Counter Discount & Coupons Block -->
                <div class="settle-discount-card">
                  <div class="discount-header-row">
                    <span class="discount-title">
                      <i class="ph ph-tag"></i> Discount &amp; Offers
                    </span>
                    <div class="discount-segmented-control">
                      <button
                        type="button"
                        class="seg-btn"
                        [class.active]="settleDiscountMode() === 'CUSTOM'"
                        (click)="settleDiscountMode.set('CUSTOM')"
                      >
                        <i class="ph ph-currency-inr"></i> Flat ₹ Off
                      </button>
                      <button
                        type="button"
                        class="seg-btn"
                        [class.active]="settleDiscountMode() === 'COUPON'"
                        (click)="settleDiscountMode.set('COUPON')"
                      >
                        <i class="ph ph-ticket"></i> Coupon
                      </button>
                    </div>
                  </div>

                  @if (settleDiscountMode() === 'CUSTOM') {
                    <div class="custom-disc-pane">
                      <div class="inr-input-wrapper">
                        <span class="inr-prefix">₹</span>
                        <input
                          type="number"
                          min="0"
                          [max]="(ord.subtotal || ord.totalAmount) + (ord.taxAmount || 0)"
                          class="inr-input"
                          placeholder="Enter rupees off..."
                          [value]="customDiscountRupees() || ''"
                          (input)="
                            onCustomDiscountChange(
                              $event,
                              (ord.subtotal || ord.totalAmount) + (ord.taxAmount || 0)
                            )
                          "
                        />
                        @if (customDiscountRupees() > 0) {
                          <button
                            type="button"
                            class="btn-disc-clear"
                            (click)="clearDiscount()"
                            title="Clear discount"
                          >
                            <i class="ph ph-x"></i> Clear
                          </button>
                        }
                      </div>
                      <div class="quick-disc-chips">
                        <button
                          type="button"
                          class="disc-chip"
                          [class.chip-active]="customDiscountRupees() === 20"
                          (click)="
                            applyQuickRupees(
                              20,
                              (ord.subtotal || ord.totalAmount) + (ord.taxAmount || 0)
                            )
                          "
                        >
                          -₹20
                        </button>
                        <button
                          type="button"
                          class="disc-chip"
                          [class.chip-active]="customDiscountRupees() === 50"
                          (click)="
                            applyQuickRupees(
                              50,
                              (ord.subtotal || ord.totalAmount) + (ord.taxAmount || 0)
                            )
                          "
                        >
                          -₹50
                        </button>
                        <button
                          type="button"
                          class="disc-chip"
                          [class.chip-active]="customDiscountRupees() === 100"
                          (click)="
                            applyQuickRupees(
                              100,
                              (ord.subtotal || ord.totalAmount) + (ord.taxAmount || 0)
                            )
                          "
                        >
                          -₹100
                        </button>
                        <button
                          type="button"
                          class="disc-chip chip-round"
                          (click)="applyRoundOffDiscount(ord)"
                          title="Round total down to nearest ₹10"
                        >
                          Round Off
                        </button>
                      </div>
                    </div>
                  }

                  @if (settleDiscountMode() === 'COUPON') {
                    <div class="coupon-disc-pane">
                      <div class="coupon-select-wrapper">
                        <select
                          class="coupon-select"
                          [ngModel]="selectedCouponCode()"
                          (ngModelChange)="onSelectCoupon($event, ord.subtotal || ord.totalAmount)"
                        >
                          <option value="">-- Select Active Coupon --</option>
                          @for (c of activeCoupons(); track c.id) {
                            <option [value]="c.code">
                              {{ c.code }} ({{
                                c.discountType === 'PERCENTAGE'
                                  ? c.discountValue + '% OFF'
                                  : '₹' + c.discountValue + ' OFF'
                              }}{{ c.minOrderValue ? ', min ₹' + c.minOrderValue : '' }})
                            </option>
                          }
                        </select>
                        <i class="ph ph-caret-down coupon-caret"></i>
                      </div>
                      @if (selectedCouponCode()) {
                        <div class="applied-coupon-badge">
                          <i class="ph ph-seal-check"></i>
                          <span
                            >Coupon <strong>{{ selectedCouponCode() }}</strong> applied: -{{
                              getEffectiveDiscount(ord) | currencyInr
                            }}</span
                          >
                          <button
                            type="button"
                            class="btn-disc-clear-pill"
                            (click)="clearDiscount()"
                          >
                            <i class="ph ph-x"></i>
                          </button>
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- Payment selector group with method options grid -->
                <div class="payment-selector-group">
                  <label class="form-label">Payment Method Tendered *</label>
                  <div class="method-options-grid">
                    <button
                      type="button"
                      class="method-tile"
                      [class.selected]="canvasPaymentMethod() === 'UPI'"
                      (click)="canvasPaymentMethod.set('UPI')"
                    >
                      <i class="ph ph-qr-code tile-icon"></i>
                      <div class="tile-info">
                        <span class="tile-title">UPI / QR Scan</span>
                        <span class="tile-sub">GPay, PhonePe, Paytm, BHIM</span>
                      </div>
                      @if (canvasPaymentMethod() === 'UPI') {
                        <i class="ph ph-check-circle tile-check"></i>
                      }
                    </button>

                    <button
                      type="button"
                      class="method-tile"
                      [class.selected]="canvasPaymentMethod() === 'CASH'"
                      (click)="canvasPaymentMethod.set('CASH')"
                    >
                      <i class="ph ph-money tile-icon"></i>
                      <div class="tile-info">
                        <span class="tile-title">Cash Settlement</span>
                        <span class="tile-sub">Physical Currency Tender</span>
                      </div>
                      @if (canvasPaymentMethod() === 'CASH') {
                        <i class="ph ph-check-circle tile-check"></i>
                      }
                    </button>

                    <button
                      type="button"
                      class="method-tile"
                      [class.selected]="canvasPaymentMethod() === 'CARD'"
                      (click)="canvasPaymentMethod.set('CARD')"
                    >
                      <i class="ph ph-credit-card tile-icon"></i>
                      <div class="tile-info">
                        <span class="tile-title">Card / POS</span>
                        <span class="tile-sub">Swipe / Tap Terminal</span>
                      </div>
                      @if (canvasPaymentMethod() === 'CARD') {
                        <i class="ph ph-check-circle tile-check"></i>
                      }
                    </button>
                  </div>
                </div>
              }

              <!-- 2. SPLIT BILL CREATION VIEW -->
              @if (!ord.isSplit && settleMode() === 'SPLIT') {
                <div class="split-create-workspace">
                  <div class="settle-row total-highlight" style="margin-bottom: 12px;">
                    <span>Total Bill to Split:</span>
                    <strong class="text-crimson" style="font-size: 1.15rem;">{{
                      ord.totalAmount | currencyInr
                    }}</strong>
                  </div>

                  <div class="split-stepper-box">
                    <span class="stepper-label">Number of Split Bills</span>
                    <div class="stepper-controls">
                      <button
                        type="button"
                        class="stepper-btn"
                        (click)="decrementSplitCount()"
                        [disabled]="splitCount() <= 2"
                      >
                        -
                      </button>
                      <span class="stepper-val">{{ splitCount() }} Bills</span>
                      <button
                        type="button"
                        class="stepper-btn"
                        (click)="incrementSplitCount()"
                        [disabled]="splitCount() >= 6"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div class="split-preview-grid">
                    @for (idx of getSplitPreviewIndices(); track idx) {
                      <div class="split-preview-item">
                        <span class="p-num">Part #{{ idx + 1 }}</span>
                        <strong class="p-val">{{
                          getEqualSplitPartAmount(ord, idx) | currencyInr
                        }}</strong>
                      </div>
                    }
                  </div>

                  <p class="text-xs text-muted" style="margin-top: 10px;">
                    Splitting will create {{ splitCount() }} independent payable bills for
                    individual guests at this table.
                  </p>
                </div>
              }

              <!-- 3. SPLIT BILLS MANAGEMENT & SETTLEMENT VIEW -->
              @if (ord.isSplit) {
                <div class="split-bills-live-box">
                  <div class="split-banner-notice">
                    <i class="ph ph-split-horizontal"></i>
                    <span
                      >This dining order is split into
                      {{ getOrderSplitBills(ord.id).length }} individual bills.</span
                    >
                  </div>

                  <div class="split-cards-stream">
                    @for (split of getOrderSplitBills(ord.id); track split.id) {
                      <div class="split-card-row" [class.is-paid]="split.paymentStatus === 'PAID'">
                        <div class="split-card-info">
                          <strong
                            >Part #{{ split.splitIndex }} of {{ split.splitTotalCount }}</strong
                          >
                          <span class="split-amount">{{ split.totalAmount | currencyInr }}</span>
                        </div>
                        <div class="split-card-actions">
                          @if (split.paymentStatus === 'PAID') {
                            <span class="badge badge-success"
                              ><i class="ph ph-check"></i> Paid ({{
                                split.paymentMethod || 'PAID'
                              }})</span
                            >
                          } @else {
                            <button
                              type="button"
                              class="btn btn-secondary btn-xs"
                              (click)="settleSplitPart(ord, split, 'UPI')"
                              [disabled]="isSettling()"
                              title="Settle with UPI"
                            >
                              <i class="ph ph-qr-code"></i> UPI
                            </button>
                            <button
                              type="button"
                              class="btn btn-secondary btn-xs"
                              (click)="settleSplitPart(ord, split, 'CASH')"
                              [disabled]="isSettling()"
                              title="Settle with Cash"
                            >
                              <i class="ph ph-money"></i> Cash
                            </button>
                            <button
                              type="button"
                              class="btn btn-secondary btn-xs"
                              (click)="settleSplitPart(ord, split, 'CARD')"
                              [disabled]="isSettling()"
                              title="Settle with Card"
                            >
                              <i class="ph ph-credit-card"></i> Card
                            </button>
                          }
                        </div>
                      </div>
                    }
                  </div>

                  @if (areAllSplitBillsPaid(ord.id)) {
                    <div class="alert-box success" style="margin-top: 12px;">
                      <i class="ph ph-check-circle"></i>
                      <span>All split parts have been paid in full! Ready to complete order.</span>
                    </div>
                  }
                </div>
              }
            </div>

            <div class="modal-footer">
              <div class="footer-left-action">
                <button
                  type="button"
                  class="btn btn-ghost text-crimson"
                  (click)="cancelOrderFromSettle(ord)"
                >
                  <i class="ph ph-x-circle"></i>
                  <span>Cancel Order</span>
                </button>
              </div>

              <div class="footer-right-actions">
                <button
                  class="btn btn-secondary"
                  (click)="closeCanvasSettleModal()"
                  [disabled]="isSettling()"
                >
                  Close
                </button>

                @if (!ord.isSplit && settleMode() === 'FULL') {
                  <button
                    class="btn btn-primary"
                    (click)="confirmCanvasSettlement()"
                    [disabled]="isSettling()"
                  >
                    @if (isSettling()) {
                      <i class="ph ph-spinner ph-spin"></i>
                      <span>Settling &amp; Releasing...</span>
                    } @else {
                      <i class="ph ph-check"></i>
                      <span>Confirm {{ canvasPaymentMethod() }} Settlement</span>
                    }
                  </button>
                }

                @if (!ord.isSplit && settleMode() === 'SPLIT') {
                  <button
                    class="btn btn-primary"
                    (click)="confirmCreateSplit(ord)"
                    [disabled]="isSettling()"
                  >
                    <i class="ph ph-split-horizontal"></i>
                    <span>Divide Bill into {{ splitCount() }} Parts</span>
                  </button>
                }

                @if (ord.isSplit) {
                  @if (areAllSplitBillsPaid(ord.id)) {
                    <button
                      class="btn btn-success"
                      (click)="confirmCanvasSettlement()"
                      [disabled]="isSettling()"
                    >
                      <i class="ph ph-check"></i>
                      <span>Complete Order &amp; Release Table</span>
                    </button>
                  } @else {
                    <button class="btn btn-secondary" disabled>
                      <span>Awaiting Split Payments</span>
                    </button>
                  }
                }
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Standalone Thermal Receipt Modal (Rendered Over Fullscreen Floor Canvas) -->
      <app-thermal-receipt-modal
        [isOpen]="showThermalModal()"
        [order]="orderForThermal()"
        [restaurant]="restaurant()"
        (close)="closeThermalModal()"
      />

      <!-- ============================================================ -->
      <!-- MODAL: CREATE MANUAL ORDER DIRECTLY FROM CANVAS              -->
      <!-- ============================================================ -->
      @if (showManualOrderModal()) {
        <div class="modal-overlay" (click)="closeManualOrderModal()">
          <div
            class="modal-card manual-order-modal-canvas"
            role="dialog"
            aria-modal="true"
            (click)="$event.stopPropagation()"
          >
            <div class="modal-header">
              <div class="modal-title-with-icon">
                <div class="icon-circle"><i class="ph ph-receipt"></i></div>
                <div>
                  <h3 class="heading-card">Create Dining Order</h3>
                  <p class="text-xs text-muted" style="margin: 2px 0 0;">
                    Direct entry for walk-in dining guests on the floor.
                  </p>
                </div>
              </div>
              <button class="close-btn" (click)="closeManualOrderModal()" type="button">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body manual-order-workspace">
              <!-- LEFT SIDE: DISH CATALOG SIDE PANEL -->
              <aside class="pos-dish-catalog-panel">
                <div class="catalog-panel-top">
                  <div class="catalog-search-wrap">
                    <i class="ph ph-magnifying-glass search-ico"></i>
                    <input
                      type="text"
                      class="form-input catalog-search-input"
                      placeholder="Search dishes by name..."
                      [ngModel]="manualDishSearch()"
                      (ngModelChange)="manualDishSearch.set($event)"
                    />
                    @if (manualDishSearch()) {
                      <button
                        type="button"
                        class="search-clear-btn"
                        (click)="manualDishSearch.set('')"
                      >
                        <i class="ph ph-x"></i>
                      </button>
                    }
                  </div>

                  <!-- Category Filter Scroll Chips -->
                  <div class="catalog-cat-chips">
                    <button
                      type="button"
                      class="cat-chip"
                      [class.active]="manualDishCategory() === 'ALL'"
                      (click)="manualDishCategory.set('ALL')"
                    >
                      All ({{ menuItems().length }})
                    </button>
                    @for (cat of categories(); track cat.id) {
                      <button
                        type="button"
                        class="cat-chip"
                        [class.active]="manualDishCategory() === cat.id"
                        (click)="manualDishCategory.set(cat.id)"
                      >
                        {{ cat.name }}
                      </button>
                    }
                  </div>

                  <!-- Dietary Filter Chips -->
                  <div class="catalog-diet-chips">
                    <button
                      type="button"
                      class="diet-filter-pill"
                      [class.active]="manualDishDietary() === 'ALL'"
                      (click)="manualDishDietary.set('ALL')"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      class="diet-filter-pill veg"
                      [class.active]="manualDishDietary() === 'VEG'"
                      (click)="manualDishDietary.set('VEG')"
                    >
                      <span class="diet-dot veg"></span> Veg
                    </button>
                    <button
                      type="button"
                      class="diet-filter-pill non-veg"
                      [class.active]="manualDishDietary() === 'NON_VEG'"
                      (click)="manualDishDietary.set('NON_VEG')"
                    >
                      <span class="diet-dot non-veg"></span> Non-Veg
                    </button>
                  </div>
                </div>

                <!-- Dish List Stream -->
                <div class="catalog-dishes-stream">
                  @for (dish of filteredManualDishes(); track dish.id) {
                    @let inTray = getItemCountInManualOrder(dish.id);
                    @let avail = getDishAvailability(dish.id);
                    <div
                      class="pos-dish-card"
                      [class.in-tray]="inTray > 0"
                      [class.is-out-of-stock]="avail === 'OUT_OF_STOCK' || !dish.isAvailable"
                      (click)="
                        avail !== 'OUT_OF_STOCK' && dish.isAvailable && addDishToManualOrder(dish)
                      "
                    >
                      <div class="dish-card-details">
                        <div class="dish-name-row">
                          <app-dietary-badge [type]="dish.dietary"></app-dietary-badge>
                          <span class="dish-title">{{ dish.name }}</span>
                        </div>
                        <div class="dish-sub-row">
                          <strong class="dish-cost">{{ dish.price | currencyInr }}</strong>
                          @if (avail === 'LOW_STOCK') {
                            <span class="stock-tag low">Low Stock</span>
                          } @else if (avail === 'OUT_OF_STOCK' || !dish.isAvailable) {
                            <span class="stock-tag out">Out of Stock</span>
                          }
                        </div>
                      </div>

                      <div class="dish-card-action">
                        @if (inTray > 0) {
                          <span class="tray-counter-pill">{{ inTray }} in tray</span>
                        }
                        <button
                          type="button"
                          class="quick-add-btn"
                          [disabled]="avail === 'OUT_OF_STOCK' || !dish.isAvailable"
                          title="Add dish to order"
                        >
                          <i class="ph ph-plus"></i>
                        </button>
                      </div>
                    </div>
                  } @empty {
                    <div class="empty-catalog-msg">
                      <i class="ph ph-magnifying-glass"></i>
                      <p>No dishes match filter.</p>
                    </div>
                  }
                </div>
              </aside>

              <!-- RIGHT SIDE: ORDER DETAILS & TRAY SUMMARY -->
              <section class="pos-order-summary-panel">
                <!-- Dining Context & Guest Details -->
                <div class="pos-context-card">
                  <!-- Active Table Showcase & Switcher -->
                  <div class="table-assignment-banner">
                    <div class="assignment-meta">
                      <div class="assignment-label-row">
                        <span class="context-eyebrow">
                          <i class="ph ph-armchair"></i> Assigned Table
                        </span>
                        @if (selectedManualTable(); as tbl) {
                          <span class="table-status-pill" [class]="tbl.status.toLowerCase()">
                            <span class="status-dot"></span> {{ tbl.status }}
                          </span>
                        }
                      </div>

                      @if (selectedManualTable(); as tbl) {
                        <div class="selected-table-showcase">
                          <span class="tbl-badge">Table {{ tbl.number }}</span>
                          <span class="tbl-detail-pill">
                            <i class="ph ph-map-pin"></i> {{ tbl.section }}
                          </span>
                          <span class="tbl-detail-pill">
                            <i class="ph ph-users"></i> {{ tbl.capacity }} Seats
                          </span>
                        </div>
                      }
                    </div>

                    <div class="table-picker-control">
                      <label class="picker-label" for="manualOrderTableSelect">Change Table</label>
                      <select
                        id="manualOrderTableSelect"
                        class="form-select custom-table-select"
                        [ngModel]="manualOrderTableId()"
                        (ngModelChange)="manualOrderTableId.set($event)"
                      >
                        <option value="" disabled>-- Select Table --</option>
                        @for (tbl of tables(); track tbl.id) {
                          <option [value]="tbl.id">
                            Table {{ tbl.number }} ({{ tbl.section }} • {{ tbl.capacity }}p) —
                            {{ tbl.status }}
                          </option>
                        }
                      </select>
                    </div>
                  </div>

                  <!-- Guest Information Inputs -->
                  <div class="guest-details-grid">
                    <div class="form-group compact">
                      <label class="form-label-compact" for="manualOrderCustName">
                        <i class="ph ph-user"></i> Guest Name
                      </label>
                      <div class="input-icon-wrap">
                        <i class="ph ph-user-circle input-prefix-icon"></i>
                        <input
                          id="manualOrderCustName"
                          type="text"
                          class="form-input custom-input"
                          placeholder="e.g. Rahul Verma / Walk-in"
                          [ngModel]="manualOrderCustomerName()"
                          (ngModelChange)="manualOrderCustomerName.set($event)"
                        />
                      </div>
                    </div>
                    <div class="form-group compact">
                      <label class="form-label-compact" for="manualOrderCustPhone">
                        <i class="ph ph-phone"></i> Guest Phone
                      </label>
                      <div class="input-icon-wrap">
                        <i class="ph ph-phone-call input-prefix-icon"></i>
                        <input
                          id="manualOrderCustPhone"
                          type="tel"
                          class="form-input custom-input"
                          placeholder="+91 98765 00000"
                          [ngModel]="manualOrderCustomerPhone()"
                          (ngModelChange)="manualOrderCustomerPhone.set($event)"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Selected Items List -->
                <div class="manual-items-box">
                  <div class="tray-header">
                    <div class="tray-title-group">
                      <span class="tray-title">Order Items Tray</span>
                      <span class="tray-badge" [class.has-items]="manualItems.length > 0">
                        {{ manualItems.length }} {{ manualItems.length === 1 ? 'item' : 'items' }}
                      </span>
                    </div>
                    @if (manualItems.length > 0) {
                      <button
                        type="button"
                        class="clear-tray-btn"
                        (click)="clearManualTray()"
                        title="Clear all dishes from tray"
                      >
                        <i class="ph ph-trash"></i>
                        <span>Clear Tray</span>
                      </button>
                    }
                  </div>

                  @if (manualItems.length === 0) {
                    <div class="empty-tray-state">
                      <div class="empty-tray-icon">
                        <i class="ph ph-hand-pointing"></i>
                      </div>
                      <h4 class="empty-tray-title">Tray is empty</h4>
                      <p class="empty-tray-subtitle">
                        Click any dish from the catalog on the left to add it to this order.
                      </p>
                    </div>
                  } @else {
                    <div class="manual-items-table custom-scrollbar">
                      @for (item of manualItems; track item.id; let idx = $index) {
                        <div class="m-item-row">
                          <div class="m-item-details">
                            <strong class="m-item-title">{{ item.name }}</strong>
                            <span class="m-item-rate">{{ item.unitPrice | currencyInr }} each</span>
                          </div>

                          <div class="m-qty-stepper">
                            <button
                              type="button"
                              class="stepper-btn minus"
                              (click)="updateManualItemQty(item, -1)"
                              title="Decrease"
                            >
                              <i class="ph ph-minus"></i>
                            </button>
                            <span class="stepper-count">{{ item.quantity }}</span>
                            <button
                              type="button"
                              class="stepper-btn plus"
                              (click)="updateManualItemQty(item, 1)"
                              title="Increase"
                            >
                              <i class="ph ph-plus"></i>
                            </button>
                          </div>

                          <div class="m-item-right">
                            <span class="m-item-total">{{ item.itemTotal | currencyInr }}</span>
                            <button
                              type="button"
                              class="m-remove-btn"
                              (click)="removeManualItem(idx)"
                              title="Remove {{ item.name }}"
                            >
                              <i class="ph ph-x"></i>
                            </button>
                          </div>
                        </div>
                      }
                    </div>

                    <div class="order-math-summary">
                      <div class="math-row">
                        <span class="math-label">Item Subtotal</span>
                        <strong class="math-value">{{ manualSubtotal() | currencyInr }}</strong>
                      </div>
                      <div class="math-row tax-line">
                        <span class="math-label">
                          <span>Taxes &amp; Levies</span>
                          <span class="tax-rate-pill">
                            CGST {{ restaurant()?.taxSettings?.cgstRate ?? 2.5 }}% + SGST
                            {{ restaurant()?.taxSettings?.sgstRate ?? 2.5 }}%
                          </span>
                        </span>
                        <span class="math-value">{{ manualTax() | currencyInr }}</span>
                      </div>
                      <div class="math-divider"></div>
                      <div class="math-row total-highlight">
                        <div class="total-text-group">
                          <span class="total-main-label">Net Payable Total</span>
                          <span class="total-sub-label">Includes all taxes &amp; fees</span>
                        </div>
                        <span class="total-grand-amount">{{ manualTotal() | currencyInr }}</span>
                      </div>
                    </div>
                  }
                </div>
              </section>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="closeManualOrderModal()" type="button">
                Cancel
              </button>
              <button
                class="btn btn-primary"
                (click)="submitManualOrder()"
                [disabled]="manualItems.length === 0"
                type="button"
              >
                <i class="ph ph-check"></i>
                <span>Dispatch Order ({{ manualTotal() | currencyInr }})</span>
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .tables-page {
        display: flex;
        flex-direction: column;
        gap: 20px;
        user-select: none;
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
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      .view-mode-toggle {
        display: inline-flex;
        background: var(--color-bone-light, #f1f5f9);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-sm, 8px);
        padding: 3px;
        gap: 3px;

        .toggle-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--color-text-secondary, #64748b);
          border: none;
          background: transparent;
          border-radius: 6px;
          cursor: pointer;
          transition: all var(--transition-fast, 0.15s ease);

          &:hover {
            color: var(--color-text-primary, #1e293b);
          }

          &.active {
            background: var(--color-surface, #ffffff);
            color: var(--color-crimson, #dc2626);
            box-shadow: var(--shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.05));
          }
        }
      }

      /* Places / Room Toolbar */
      .places-toolbar {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 12px);
        padding: 10px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }

      .places-nav {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;

        .places-label {
          font-size: 0.8125rem;
          font-weight: 700;
          color: var(--color-text-muted, #64748b);
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
      }

      .tabs-group {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      .place-tab-wrap {
        display: inline-flex;
        align-items: center;
        position: relative;

        .btn-delete-place {
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          color: var(--color-text-muted, #94a3b8);
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 0.6875rem;

          &:hover {
            background: rgba(220, 38, 38, 0.1);
            color: #dc2626;
          }
        }
      }

      .tab-btn {
        padding: 6px 12px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary, #64748b);
        border: 1px solid transparent;
        background: transparent;
        border-radius: var(--radius-sm, 8px);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        transition: all var(--transition-fast, 0.15s ease);

        .tab-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.6875rem;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: var(--radius-full, 9999px);
          background: rgba(148, 163, 184, 0.15);
          color: var(--color-text-secondary, #64748b);
          min-width: 18px;
          line-height: 1.2;
          transition: all var(--transition-fast, 0.15s ease);
        }

        &:hover {
          background: var(--color-bone-light, #f1f5f9);
          color: var(--color-text-primary, #1e293b);
        }

        &.active {
          background: var(--color-onyx, #1e293b);
          color: #ffffff;

          .tab-badge {
            background: rgba(255, 255, 255, 0.22);
            color: #ffffff;
          }
        }

        &.add-place-tab-btn {
          border: 1px dashed var(--color-border, #cbd5e1);
          color: var(--color-crimson, #dc2626);

          &:hover {
            border-color: var(--color-crimson, #dc2626);
            background: rgba(220, 38, 38, 0.05);
          }
        }
      }

      .status-summary-pills {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        align-items: center;
      }

      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: var(--radius-full, 9999px);
        transition: all var(--transition-fast, 0.15s ease);

        i {
          font-size: 0.8125rem;
        }

        &.is-zero {
          opacity: 0.55;
        }

        &.available {
          background: var(--color-success-bg, #ecfdf5);
          color: var(--color-success, #059669);
          border: 1px solid rgba(5, 150, 105, 0.2);
        }
        &.occupied {
          background: var(--color-warning-bg, #fef2f2);
          color: var(--color-crimson, #dc2626);
          border: 1px solid rgba(220, 38, 38, 0.2);
        }
        &.reserved {
          background: var(--color-info-bg, #eff6ff);
          color: var(--color-info, #2563eb);
          border: 1px solid rgba(37, 99, 235, 0.2);
        }
        &.dirty {
          background: var(--color-bone-light, #f1f5f9);
          color: var(--color-text-muted, #64748b);
          border: 1px solid rgba(148, 163, 184, 0.25);
        }
      }

      /* ============================================================ */
      /* RESERVATIONS & BOOKINGS DESK CARD (APPLE DATA-TABLE DESIGN)  */
      /* ============================================================ */
      .reservation-desk-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 16px;
        padding: 14px 18px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-shadow:
          0 4px 16px -2px rgba(0, 0, 0, 0.04),
          0 2px 4px -1px rgba(0, 0, 0, 0.02);
        position: relative;
        overflow: hidden;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .reservation-desk-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        width: 100%;

        .desk-header-left {
          display: flex;
          align-items: center;
          gap: 12px;

          .desk-icon-wrap {
            width: 38px;
            height: 38px;
            border-radius: 10px;
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.16), rgba(5, 150, 105, 0.08));
            color: #059669;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            flex-shrink: 0;
            box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.6);
          }

          .desk-title-group {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .desk-title-row {
            display: flex;
            align-items: center;
            gap: 10px;

            .desk-title {
              font-size: 1rem;
              font-weight: 700;
              color: var(--color-text-primary, #0f172a);
              letter-spacing: -0.015em;
              margin: 0;
            }

            .live-pill {
              display: inline-flex;
              align-items: center;
              gap: 5px;
              padding: 2px 9px;
              border-radius: 9999px;
              font-size: 0.7rem;
              font-weight: 600;
              letter-spacing: 0.02em;
              background: rgba(16, 185, 129, 0.12);
              color: #047857;
              border: 1px solid rgba(16, 185, 129, 0.25);

              .live-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #10b981;
                box-shadow: 0 0 6px rgba(16, 185, 129, 0.8);
                animation: apple-live-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
              }
            }
          }

          .desk-subtitle {
            font-size: 0.78rem;
            color: var(--color-text-muted, #64748b);
            margin: 0;
            letter-spacing: -0.01em;
          }
        }

        .desk-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;

          .toggle-desk-btn {
            border-radius: 9999px;
            padding: 5px 12px;
            font-size: 0.78rem;
            font-weight: 600;
            background: var(--color-bone-light, #f8fafc);
            border: 1px solid var(--color-border, #e2e8f0);
            color: var(--color-text-secondary, #334155);
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);

            &:hover {
              background: var(--color-surface, #ffffff);
              border-color: #cbd5e1;
              color: var(--color-text-primary, #0f172a);
            }

            &:active {
              transform: scale(0.96);
            }
          }

          .full-bookings-btn {
            border-radius: 9999px;
            padding: 5px 12px;
            font-size: 0.78rem;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);

            &:active {
              transform: scale(0.96);
            }
          }
        }
      }

      .reservation-desk-body {
        padding-top: 4px;
        animation: apple-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .empty-reservations-row {
        padding: 20px;
        border-radius: 12px;
        background: var(--color-bone-light, #f8fafc);
        border: 1px dashed var(--color-border, #cbd5e1);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;

        .empty-icon-wrap {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(100, 116, 139, 0.08);
          color: var(--color-text-muted, #64748b);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
          flex-shrink: 0;
        }

        .empty-text-wrap {
          display: flex;
          flex-direction: column;
          gap: 2px;

          .empty-title {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--color-text-primary, #0f172a);
          }

          .empty-desc {
            font-size: 0.78rem;
            color: var(--color-text-muted, #64748b);
          }
        }
      }

      .reservation-table-wrap {
        width: 100%;
        overflow-x: auto;
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 12px;
        background: var(--color-surface, #ffffff);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);

        .res-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.8125rem;

          thead {
            background: var(--color-bone-light, #f8fafc);
            border-bottom: 1px solid var(--color-border, #e2e8f0);

            th {
              padding: 9px 14px;
              font-size: 0.7rem;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              color: var(--color-text-muted, #64748b);
              white-space: nowrap;

              &.text-right {
                text-align: right;
              }
            }
          }

          tbody {
            tr.res-row {
              border-bottom: 1px solid var(--color-border-subtle, #f1f5f9);
              transition: background-color 0.15s ease;

              &:last-child {
                border-bottom: none;
              }

              &:hover {
                background: var(--color-bone-light, #f8fafc);
              }

              &.is-seated {
                background: rgba(16, 185, 129, 0.03);
              }

              &.is-unassigned {
                background: rgba(245, 158, 11, 0.02);
              }

              td {
                padding: 10px 14px;
                vertical-align: middle;
              }
            }
          }
        }

        .guest-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;

          .guest-name {
            font-weight: 700;
            color: var(--color-text-primary, #0f172a);
            font-size: 0.875rem;
            letter-spacing: -0.01em;
          }

          .guest-phone {
            font-size: 0.72rem;
            color: var(--color-text-muted, #64748b);
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-variant-numeric: tabular-nums;
          }

          .guest-note {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 0.68rem;
            color: #b45309;
            background: rgba(245, 158, 11, 0.08);
            padding: 1px 6px;
            border-radius: 4px;
            max-width: 220px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-top: 2px;
          }
        }

        .arrival-cell {
          display: flex;
          flex-direction: column;
          gap: 2px;

          .arrival-time-row {
            display: flex;
            align-items: center;
            gap: 6px;

            i {
              font-size: 0.85rem;
            }

            .arrival-time {
              font-weight: 700;
              font-size: 0.875rem;
              color: var(--color-primary, #c21807);
              font-variant-numeric: tabular-nums;
            }

            .arrival-badge {
              font-size: 0.65rem;
              font-weight: 600;
              padding: 1px 6px;
              border-radius: 9999px;
              background: var(--color-bone-light, #f1f5f9);
              color: var(--color-text-secondary, #475569);

              &.badge-soon {
                background: rgba(16, 185, 129, 0.12);
                color: #047857;
                border: 1px solid rgba(16, 185, 129, 0.25);
              }

              &.badge-late {
                background: rgba(239, 68, 68, 0.1);
                color: #b91c1c;
                border: 1px solid rgba(239, 68, 68, 0.2);
              }
            }
          }

          .arrival-date-row {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 0.72rem;
            color: var(--color-text-muted, #64748b);
          }
        }

        .party-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          background: var(--color-bone-light, #f1f5f9);
          color: var(--color-text-secondary, #334155);
          white-space: nowrap;
        }

        .table-control-wrap {
          min-width: 150px;
          max-width: 200px;

          .table-select {
            padding: 4px 8px;
            font-size: 0.75rem;
            font-weight: 600;
            border-radius: 8px;
            border: 1px solid var(--color-border, #cbd5e1);
            background-color: var(--color-surface, #ffffff);
            color: var(--color-text-primary, #0f172a);
            width: 100%;
            cursor: pointer;
            transition: all 0.15s ease;

            &:focus {
              border-color: var(--color-primary, #c21807);
              outline: none;
              box-shadow: 0 0 0 2px rgba(194, 24, 7, 0.12);
            }

            &:disabled {
              background: var(--color-bone-light, #f8fafc);
              color: var(--color-text-muted, #94a3b8);
              cursor: not-allowed;
            }
          }
        }

        .status-pill {
          display: inline-flex;
          align-items: center;
          padding: 3px 9px;
          border-radius: 9999px;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;

          &.badge-primary {
            background: rgba(37, 99, 235, 0.1);
            color: #2563eb;
            border: 1px solid rgba(37, 99, 235, 0.2);
          }

          &.badge-success {
            background: rgba(16, 185, 129, 0.12);
            color: #059669;
            border: 1px solid rgba(16, 185, 129, 0.25);
          }

          &.badge-warning {
            background: rgba(245, 158, 11, 0.12);
            color: #d97706;
            border: 1px solid rgba(245, 158, 11, 0.25);
          }
        }

        .action-buttons-wrap {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;

          .btn-seat-action {
            border-radius: 7px;
            padding: 5px 11px;
            font-size: 0.72rem;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            transition:
              transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
              background-color 0.15s ease;

            &:active {
              transform: scale(0.96);
            }
          }

          .btn-done-action {
            border-radius: 7px;
            padding: 5px 11px;
            font-size: 0.72rem;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);

            &:active {
              transform: scale(0.96);
            }
          }

          .btn-cancel-action {
            width: 28px;
            height: 28px;
            padding: 0;
            border-radius: 7px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: var(--color-danger, #a91c12);
            transition:
              background-color 0.15s ease,
              transform 0.15s ease;

            &:hover {
              background: rgba(169, 28, 18, 0.08);
            }

            &:active {
              transform: scale(0.92);
            }
          }
        }
      }

      @keyframes apple-fade-in {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes apple-live-pulse {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.35;
          transform: scale(0.8);
        }
      }

      /* ============================================================ */
      /* CANVAS WORKSPACE & BLUEPRINT FLOOR PLAN                      */
      /* ============================================================ */
      .canvas-workspace-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: var(--radius-md, 12px);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.05));
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);

        &.is-fullscreen {
          position: fixed;
          inset: 0;
          z-index: 1100;
          width: 100vw;
          height: 100vh;
          max-width: none;
          border-radius: 0;
          margin: 0;
          border: none;
          box-shadow: none;

          .canvas-toolbar {
            border-radius: 0;
            padding: 10px 20px;
          }

          .canvas-viewport {
            max-height: calc(100vh - 65px);
            height: calc(100vh - 65px);
          }
        }
      }

      .canvas-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 18px;
        background: var(--color-surface-card, #fafafa);
        border-bottom: 1px solid var(--color-border, #e5e7eb);
        flex-wrap: wrap;
        gap: 12px;

        .toolbar-left,
        .toolbar-right {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
      }

      .mode-switch-group {
        display: inline-flex;
        background: var(--color-bone, #e5e7eb);
        padding: 2px;
        border-radius: 6px;
        gap: 2px;

        .mode-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--color-text-secondary, #4b5563);
          border: none;
          background: transparent;
          border-radius: 4px;
          cursor: pointer;

          &.active {
            background: var(--color-surface, #ffffff);
            color: var(--color-text-primary, #111827);
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
          }
        }
      }

      .element-picker-group {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;

        .group-label {
          font-size: 0.6875rem;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--color-text-muted, #6b7280);
          margin-right: 2px;
        }
      }

      .btn-xs {
        padding: 4px 10px;
        font-size: 0.75rem;
        height: 28px;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        gap: 4px;

        &.btn-active-toggle {
          background: var(--color-onyx, #121212);
          color: #ffffff;
          border-color: var(--color-onyx, #121212);
        }
      }

      .btn-fullscreen-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        font-size: 0.75rem;
        font-weight: 700;
        border-radius: 6px;
        border: 1px solid var(--color-border, #d1d5db);
        background: var(--color-surface, #ffffff);
        color: var(--color-text-primary, #111827);
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover {
          border-color: var(--color-crimson, #dc2626);
          color: var(--color-crimson, #dc2626);
          background: rgba(220, 38, 38, 0.04);
        }

        &.btn-active-toggle {
          background: var(--color-onyx, #121212);
          color: #ffffff;
          border-color: var(--color-onyx, #121212);
        }
      }

      .zoom-controls {
        display: inline-flex;
        align-items: center;
        background: var(--color-bone-light, #f3f4f6);
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: 6px;
        overflow: hidden;

        .zoom-btn {
          border: none;
          background: transparent;
          color: var(--color-text-secondary, #4b5563);
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;

          &:hover:not(:disabled) {
            background: var(--color-bone, #e5e7eb);
          }
          &:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }
        }

        .zoom-label {
          font-size: 0.6875rem;
          font-weight: 700;
          padding: 0 8px;
          min-width: 44px;
          text-align: center;
          cursor: pointer;
        }
      }

      /* Place Assignment Strip */
      .place-assign-strip {
        background: var(--color-surface-card, #f8fafc);
        border-bottom: 1px solid var(--color-border, #e5e7eb);
        padding: 8px 18px;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;

        .assign-strip-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-text-secondary, #4b5563);
          display: inline-flex;
          align-items: center;
          gap: 6px;

          strong {
            color: var(--color-crimson, #dc2626);
          }
        }

        .assign-chips-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .assign-tbl-btn {
          background: var(--color-surface, #ffffff);
          border: 1px solid var(--color-border, #d1d5db);
          border-radius: 9999px;
          padding: 3px 10px;
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--color-text-primary, #111827);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s ease;

          .chip-curr-sec {
            font-size: 0.625rem;
            color: var(--color-text-muted, #6b7280);
            font-weight: 500;
          }

          &:hover {
            border-color: var(--color-crimson, #dc2626);
            color: var(--color-crimson, #dc2626);
            background: rgba(220, 38, 38, 0.05);
          }
        }
      }

      /* Viewport & Canvas Layout */
      .canvas-viewport {
        overflow: auto;
        min-height: 620px;
        max-height: calc(100vh - 280px);
        background-color: var(--color-surface, #ffffff);
        position: relative;
        cursor: default;

        /* Blueprint grid pattern */
        background-image: radial-gradient(var(--color-border, #e5e7eb) 1.5px, transparent 1.5px);
        background-size: 24px 24px;
      }

      .floor-canvas {
        position: relative;
        min-width: 1500px;
        min-height: 1100px;
        transform-origin: top left;
        transition: transform 0.1s ease-out;

        &.design-mode {
          cursor: crosshair;
        }
      }

      .canvas-area-watermark {
        position: absolute;
        top: 14px;
        left: 20px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 1rem;
        font-weight: 800;
        color: var(--color-text-muted, #9ca3af);
        opacity: 0.6;
        letter-spacing: -0.01em;
        pointer-events: none;
        z-index: 5;

        .watermark-tip {
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--color-crimson, #dc2626);
        }
      }

      /* ============================================================ */
      /* SECTION ROOM BOX CONTAINERS                                  */
      /* ============================================================ */
      .canvas-section-box {
        position: absolute;
        box-sizing: border-box;
        min-width: 360px;
        min-height: 220px;
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(8px);
        border: 2px dashed rgba(148, 163, 184, 0.65);
        border-radius: 18px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease;
        display: flex;
        flex-direction: column;
        user-select: none;
        z-index: 10;

        &:hover {
          border-color: rgba(100, 116, 139, 0.85);
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.07);
        }

        &.is-dragging {
          opacity: 0.85;
          border-color: var(--color-crimson, #dc2626);
          box-shadow: 0 12px 32px rgba(220, 38, 38, 0.22);
          z-index: 100;
        }

        &.is-resizing {
          border-color: var(--color-crimson, #dc2626);
          box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.25);
        }

        .sec-resize-handle {
          position: absolute;
          z-index: 45;
          opacity: 0;
          transition:
            opacity 0.15s ease,
            background 0.15s ease;

          &.sec-resize-se {
            right: -6px;
            bottom: -6px;
            width: 18px;
            height: 18px;
            cursor: se-resize;
            border-radius: 4px;
            background: #ffffff;
            border: 2px solid var(--color-crimson, #dc2626);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
            display: flex;
            align-items: center;
            justify-content: center;

            &::after {
              content: '';
              width: 5px;
              height: 5px;
              background: var(--color-crimson, #dc2626);
              border-radius: 1px;
            }
          }

          &.sec-resize-e {
            right: -5px;
            top: 50%;
            transform: translateY(-50%);
            width: 8px;
            height: 40px;
            cursor: e-resize;
            border-radius: 4px;
            background: #ffffff;
            border: 2px solid var(--color-crimson, #dc2626);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
          }

          &.sec-resize-s {
            bottom: -5px;
            left: 50%;
            transform: translateX(-50%);
            width: 40px;
            height: 8px;
            cursor: s-resize;
            border-radius: 4px;
            background: #ffffff;
            border: 2px solid var(--color-crimson, #dc2626);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
          }
        }

        &.design-mode:hover .sec-resize-handle,
        &.is-resizing .sec-resize-handle {
          opacity: 1;
        }

        .section-box-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;
          background: rgba(241, 245, 249, 0.92);
          border-bottom: 1px solid rgba(226, 232, 240, 0.95);
          border-top-left-radius: 16px;
          border-top-right-radius: 16px;
          cursor: default;

          .sec-header-left {
            display: flex;
            align-items: center;
            gap: 10px;

            i {
              font-size: 1.125rem;
              color: var(--color-crimson, #dc2626);
            }

            .sec-name {
              font-size: 0.9375rem;
              font-weight: 700;
              color: var(--color-text-primary, #1e293b);
              letter-spacing: -0.01em;
            }

            .sec-badge {
              font-size: 0.75rem;
              background: #ffffff;
              border: 1px solid #cbd5e1;
              padding: 2px 8px;
              border-radius: 999px;
              color: #475569;
            }

            .sec-dim-tag {
              font-size: 0.6875rem;
              font-weight: 600;
              font-family: monospace;
              background: rgba(15, 23, 42, 0.07);
              color: #334155;
              padding: 2px 6px;
              border-radius: 4px;
            }
          }

          .sec-header-right {
            display: flex;
            align-items: center;
            gap: 8px;

            .sec-size-actions {
              display: inline-flex;
              align-items: center;
              gap: 2px;
              background: #ffffff;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 1px;

              .sec-size-btn {
                border: none;
                background: transparent;
                width: 22px;
                height: 22px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                cursor: pointer;
                color: #475569;
                font-size: 0.75rem;
                transition: all 0.1s ease;

                &:hover {
                  background: #f1f5f9;
                  color: var(--color-crimson, #dc2626);
                }
              }
            }

            .sec-add-tbl-btn {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              font-size: 0.75rem;
              font-weight: 600;
              color: var(--color-crimson, #dc2626);
              background: #ffffff;
              border: 1px solid rgba(220, 38, 38, 0.35);
              padding: 4px 10px;
              border-radius: 6px;
              cursor: pointer;
              transition: all 0.15s ease;

              &:hover {
                background: #fef2f2;
                border-color: var(--color-crimson, #dc2626);
              }
            }

            .sec-drag-pill {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              font-size: 0.6875rem;
              font-weight: 600;
              color: #475569;
              background: #ffffff;
              border: 1px solid #cbd5e1;
              padding: 3px 8px;
              border-radius: 6px;
              cursor: grab;
              transition: all 0.15s ease;

              &:hover {
                background: #f8fafc;
                border-color: var(--color-crimson, #dc2626);
                color: var(--color-crimson, #dc2626);
              }
            }
          }
        }

        &.design-mode .section-box-header {
          cursor: grab;
          &:active {
            cursor: grabbing;
          }
        }

        .section-fixtures-bar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 8px 16px;
          background: rgba(248, 250, 252, 0.7);
          border-bottom: 1px solid rgba(226, 232, 240, 0.8);
        }

        .section-tables-grid {
          position: relative;
          width: 100%;
          min-height: 240px;
          padding: 16px;
          flex: 1;
        }

        .empty-sec-placeholder {
          grid-column: 1 / -1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 28px 16px;
          color: #94a3b8;
          font-size: 0.875rem;
          font-weight: 500;

          i {
            font-size: 1.75rem;
          }
        }
      }

      /* ============================================================ */
      /* ARCHITECTURAL FLOOR FIXTURES                                */
      /* ============================================================ */
      .floor-element {
        position: absolute;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 0.75rem;
        font-weight: 700;
        border: 1px dashed;
        background: var(--color-surface, #ffffff);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
        cursor: grab;
        z-index: 25;
        transition: box-shadow 0.15s ease;

        &.dragging {
          cursor: grabbing;
          z-index: 60;
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.12);
          opacity: 0.9;
        }

        .elem-content {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .elem-delete-btn {
          background: transparent;
          border: none;
          color: var(--color-text-muted, #9ca3af);
          font-size: 0.75rem;
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;

          &:hover {
            color: #dc2626;
            background: rgba(220, 38, 38, 0.1);
          }
        }

        &.elem-entrance {
          border-color: #059669;
          color: #047857;
          background: #ecfdf5;
        }
        &.elem-kitchen {
          border-color: #ea580c;
          color: #c2410c;
          background: #fff7ed;
        }
        &.elem-bar {
          border-color: #7c3aed;
          color: #6d28d9;
          background: #f5f3ff;
        }
        &.elem-restroom {
          border-color: #2563eb;
          color: #1d4ed8;
          background: #eff6ff;
        }
        &.elem-wall {
          border-color: #4b5563;
          color: #374151;
          background: #f3f4f6;
        }
        &.elem-stage {
          border-color: #9333ea;
          color: #7e22ce;
          background: #faf5ff;
        }
        &.elem-cashier {
          border-color: #0d9488;
          color: #0f766e;
          background: #f0fdfa;
        }
        &.elem-window {
          border-color: #0284c7;
          color: #0369a1;
          background: #f0f9ff;
        }
        &.elem-buffet {
          border-color: #d97706;
          color: #b45309;
          background: #fffbeb;
        }
        &.elem-stairs {
          border-color: #4f46e5;
          color: #4338ca;
          background: #eef2ff;
        }
        &.elem-custom {
          border-color: #475569;
          color: #334155;
          background: #f8fafc;
        }

        &.elem-inline {
          position: relative;
          top: auto !important;
          left: auto !important;
        }
      }

      /* ============================================================ */
      /* DINING TABLES ON CANVAS                                     */
      /* ============================================================ */
      .canvas-table {
        position: relative;
        cursor: pointer;
        z-index: 20;
        display: flex;
        align-items: center;
        justify-content: center;
        transition:
          box-shadow 0.15s ease,
          transform 0.15s ease;

        &.dragging {
          cursor: grabbing;
          z-index: 50;
          opacity: 0.85;
          transform: scale(1.05);
        }

        &.is-selected {
          z-index: 35;
          .table-surface {
            outline: 3px solid var(--color-crimson, #dc2626);
            outline-offset: 3px;
          }
        }

        /* Round Table */
        &.is-round {
          width: 96px;
          height: 96px;

          .table-surface {
            width: 80px;
            height: 80px;
            border-radius: 50%;
          }

          .chair-top {
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 22px;
            height: 10px;
          }
          .chair-bottom {
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 22px;
            height: 10px;
          }
          .chair-left {
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 10px;
            height: 22px;
          }
          .chair-right {
            right: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 10px;
            height: 22px;
          }
        }

        /* Rectangular Table */
        &.is-rect {
          width: 136px;
          height: 96px;

          .table-surface {
            width: 120px;
            height: 80px;
            border-radius: 14px;
          }

          .chair-top {
            top: 0;
            left: 36%;
            transform: translateX(-50%);
            width: 24px;
            height: 10px;
          }
          .chair-top-2 {
            top: 0;
            left: 64%;
            transform: translateX(-50%);
            width: 24px;
            height: 10px;
          }
          .chair-bottom {
            bottom: 0;
            left: 36%;
            transform: translateX(-50%);
            width: 24px;
            height: 10px;
          }
          .chair-bottom-2 {
            bottom: 0;
            left: 64%;
            transform: translateX(-50%);
            width: 24px;
            height: 10px;
          }
          .chair-left {
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 10px;
            height: 24px;
          }
          .chair-right {
            right: 0;
            top: 50%;
            transform: translateY(-50%);
            width: 10px;
            height: 24px;
          }
        }

        /* Chairs */
        .table-chairs {
          position: absolute;
          inset: 0;
          pointer-events: none;

          .chair {
            position: absolute;
            background: var(--color-bone, #d1d5db);
            border: 1px solid var(--color-border, #9ca3af);
            border-radius: 4px;
          }
        }

        /* Table Surface Styling */
        .table-surface {
          position: relative;
          background: var(--color-surface, #ffffff);
          border: 2px solid var(--color-border, #d1d5db);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.06);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          transition: all 0.2s ease;

          .tbl-num {
            font-size: 0.875rem;
            font-weight: 800;
            color: var(--color-text-primary, #111827);
            letter-spacing: -0.02em;
          }

          .tbl-capacity {
            font-size: 0.625rem;
            color: var(--color-text-muted, #6b7280);
            font-weight: 600;
          }

          .tbl-status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            margin-top: 1px;

            &.available {
              background: #10b981;
            }
            &.occupied {
              background: #dc2626;
            }
            &.reserved {
              background: #f59e0b;
            }
            &.dirty {
              background: #6b7280;
            }
          }

          .tbl-active-pill {
            font-size: 0.625rem;
            font-weight: 700;
            padding: 1px 5px;
            background: #dc2626;
            color: #ffffff;
            border-radius: 4px;
            max-width: 60px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .tbl-lock-badge {
            position: absolute;
            top: 4px;
            right: 4px;
            font-size: 0.625rem;
            color: #dc2626;
          }
        }

        /* Status Border & Shadow Accents */
        &.status-available {
          .table-surface {
            background: #f0fdf4;
            border-color: #10b981;
            box-shadow: 0 4px 10px rgba(16, 185, 129, 0.15);
            .tbl-num {
              color: #065f46;
            }
            .tbl-capacity {
              color: #047857;
            }
          }
          .chair {
            background: #a7f3d0;
            border-color: #10b981;
          }
        }
        &.status-occupied {
          .table-surface {
            background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%) !important;
            border: 2.5px solid #ef4444 !important;
            box-shadow:
              0 0 0 3px rgba(239, 68, 68, 0.22),
              0 8px 18px rgba(239, 68, 68, 0.32) !important;
            .tbl-num {
              color: #991b1b !important;
              font-weight: 800;
            }
            .tbl-capacity {
              color: #b91c1c !important;
              font-weight: 600;
            }
          }
          .chair {
            background: #ef4444 !important;
            border-color: #b91c1c !important;
            box-shadow: 0 1px 3px rgba(220, 38, 38, 0.4);
          }
          .tbl-active-pill {
            background: #dc2626 !important;
            color: #ffffff !important;
            font-weight: 700;
            box-shadow: 0 2px 6px rgba(220, 38, 38, 0.4);
          }
        }
        &.status-reserved {
          .table-surface {
            background: #fffbeb;
            border-color: #f59e0b;
            box-shadow: 0 4px 10px rgba(245, 158, 11, 0.15);
            .tbl-num {
              color: #92400e;
            }
          }
          .chair {
            background: #fde68a;
            border-color: #f59e0b;
          }
        }
        &.status-dirty {
          .table-surface {
            background: #f3f4f6;
            border-color: #6b7280;
            box-shadow: 0 4px 10px rgba(107, 114, 128, 0.12);
            .tbl-num {
              color: #374151;
            }
          }
          .chair {
            background: #d1d5db;
            border-color: #6b7280;
          }
        }

        /* Drag Handle in Design Mode */
        .table-drag-handle {
          position: absolute;
          bottom: -4px;
          right: -4px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--color-onyx, #121212);
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.625rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
      }

      .canvas-empty-notice {
        position: absolute;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
        background: var(--color-surface, #ffffff);
        border: 1px dashed var(--color-border, #d1d5db);
        padding: 32px 40px;
        border-radius: 12px;
        box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.05));

        .empty-icon-box {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: rgba(220, 38, 38, 0.08);
          color: var(--color-crimson, #dc2626);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          margin: 0 auto 12px;
        }

        h4 {
          margin: 0 0 4px;
          font-size: 1rem;
          font-weight: 700;
        }
        p {
          margin: 0 0 16px;
          font-size: 0.8125rem;
          color: var(--color-text-muted, #6b7280);
        }
      }

      /* ============================================================ */
      /* TABLE INSPECTOR DRAWER & ORDER LIFECYCLE COCKPIT            */
      /* ============================================================ */
      .inspector-drawer-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(2px);
        z-index: 2100;
        display: flex;
        justify-content: flex-end;
      }

      .inspector-drawer {
        width: 440px;
        max-width: 92vw;
        height: 100%;
        background: var(--color-surface, #ffffff);
        border-left: 1px solid var(--color-border, #e5e7eb);
        box-shadow: -6px 0 30px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        animation: slideInRight 0.2s ease-out;

        .drawer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 20px;
          border-bottom: 1px solid var(--color-border, #e5e7eb);
          background: var(--color-surface-card, #fafafa);

          .drawer-title-wrap {
            display: flex;
            align-items: center;
            gap: 12px;

            .drawer-shape-icon {
              width: 38px;
              height: 38px;
              border-radius: 8px;
              background: rgba(220, 38, 38, 0.1);
              color: var(--color-crimson, #dc2626);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1.25rem;
            }

            .drawer-table-num {
              margin: 0;
              font-size: 1.125rem;
              font-weight: 800;
              color: var(--color-text-primary, #0f172a);
            }

            .drawer-section-pill {
              font-size: 0.6875rem;
              color: var(--color-text-muted, #6b7280);
              font-weight: 600;
            }
          }

          .close-btn {
            background: transparent;
            border: none;
            color: var(--color-text-muted, #94a3b8);
            font-size: 1.25rem;
            cursor: pointer;
            padding: 4px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;

            &:hover {
              color: var(--color-text-primary, #0f172a);
              background: rgba(0, 0, 0, 0.05);
            }
          }
        }

        .drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .drawer-section {
          display: flex;
          flex-direction: column;
          gap: 8px;

          .drawer-label {
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--color-text-muted, #6b7280);
            display: flex;
            align-items: center;
            gap: 6px;
          }
        }

        .status-quick-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;

          .status-choice-btn {
            padding: 8px 12px;
            font-size: 0.8125rem;
            font-weight: 700;
            border-radius: 8px;
            border: 1px solid var(--color-border, #e5e7eb);
            background: var(--color-surface, #ffffff);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.15s ease;

            .choice-dot {
              width: 8px;
              height: 8px;
              border-radius: 50%;
            }

            &.available .choice-dot {
              background: #10b981;
            }
            &.occupied .choice-dot {
              background: #dc2626;
            }
            &.reserved .choice-dot {
              background: #f59e0b;
            }
            &.dirty .choice-dot {
              background: #6b7280;
            }

            &.selected {
              border-color: currentColor;
              box-shadow: 0 0 0 2px currentColor;
            }

            &.available.selected {
              color: #059669;
              background: #ecfdf5;
            }
            &.occupied.selected {
              color: #dc2626;
              background: #fef2f2;
            }
            &.reserved.selected {
              color: #d97706;
              background: #fffbeb;
            }
            &.dirty.selected {
              color: #4b5563;
              background: #f3f4f6;
            }
          }
        }

        /* Active Orders Cockpit in Drawer */
        .active-orders-cockpit {
          background: #fafafa;
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: 12px;
          padding: 14px;

          .active-orders-top-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 8px;

            .order-count-chip {
              font-size: 0.6875rem;
              font-weight: 800;
              background: rgba(220, 38, 38, 0.12);
              color: var(--color-crimson, #dc2626);
              padding: 2px 8px;
              border-radius: 999px;
            }
          }
        }

        .orders-accordion-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .active-order-card {
          position: relative;
          background: var(--color-surface, #ffffff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: 18px;
          padding: 14px;
          box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.04));
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
          overflow: hidden;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

          &:hover {
            border-color: rgba(186, 12, 47, 0.3);
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
          }

          &.order-ready {
            border-color: rgba(16, 185, 129, 0.4);
            background: #f0fdf4;
          }

          &.order-served {
            border-color: rgba(59, 130, 246, 0.3);
            background: #f8fafc;
          }

          .apple-card-accent {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, var(--color-crimson, #ba0c2f), #e11d48, #f59e0b);
            border-top-left-radius: 18px;
            border-top-right-radius: 18px;
          }

          .apple-card-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            padding-top: 2px;
            flex-wrap: wrap;

            .header-left-cluster {
              display: flex;
              align-items: center;
              gap: 6px;
              flex-wrap: wrap;
            }

            .header-right-cluster {
              display: flex;
              align-items: center;
              gap: 6px;
              flex-wrap: wrap;
            }

            .apple-table-pill {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              font-size: 0.75rem;
              font-weight: 700;
              color: #065f46;
              background: rgba(16, 185, 129, 0.12);
              border: 1px solid rgba(16, 185, 129, 0.25);
              padding: 2px 8px;
              border-radius: 999px;
            }

            .round-badge {
              font-size: 0.6875rem;
              font-weight: 800;
              color: var(--color-crimson, #dc2626);
              background: rgba(220, 38, 38, 0.1);
              border: 1px solid rgba(220, 38, 38, 0.2);
              padding: 2px 7px;
              border-radius: 999px;
              letter-spacing: 0.02em;
            }

            .apple-ord-num {
              font-family: var(--font-mono, monospace);
              font-size: 0.75rem;
              font-weight: 800;
              color: var(--color-text-secondary, #475569);
            }

            .apple-ord-time {
              font-size: 0.6875rem;
              color: var(--color-text-muted, #94a3b8);
              display: inline-flex;
              align-items: center;
              gap: 3px;
              font-weight: 500;
            }
          }

          /* Apple Recessed Meta Surface */
          .guest-server-recessed {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            background: rgba(0, 0, 0, 0.025);
            border: 1px solid rgba(0, 0, 0, 0.05);
            border-radius: 12px;
            padding: 7px 10px;

            .guest-compact-meta {
              display: flex;
              align-items: center;
              gap: 8px;
              min-width: 0;

              .guest-avatar-disc {
                width: 26px;
                height: 26px;
                border-radius: 50%;
                background: rgba(0, 0, 0, 0.07);
                color: var(--color-text-primary, #0f172a);
                font-size: 0.6875rem;
                font-weight: 800;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
              }

              .guest-text-col {
                display: flex;
                flex-direction: column;
                line-height: 1.2;

                .cust-name-clean {
                  font-size: 0.75rem;
                  font-weight: 700;
                  color: var(--color-text-primary, #0f172a);
                }

                .phone-sub-clean {
                  font-size: 0.6875rem;
                  color: var(--color-text-muted, #94a3b8);
                  display: inline-flex;
                  align-items: center;
                  gap: 3px;
                }
              }
            }

            .server-inline-picker {
              flex-shrink: 0;

              .server-select-pill,
              .server-completed-pill {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 0.7rem;
                color: var(--color-text-secondary, #64748b);
                background: rgba(255, 255, 255, 0.85);
                border: 1px solid rgba(0, 0, 0, 0.08);
                border-radius: 999px;
                padding: 2px 6px 2px 8px;
              }

              .server-select-clean {
                background: transparent;
                border: none;
                font-size: 0.7rem;
                font-weight: 600;
                color: var(--color-text-primary, #0f172a);
                outline: none;
                cursor: pointer;
                padding-right: 2px;
                max-width: 105px;

                &.is-unassigned {
                  color: var(--color-text-muted, #94a3b8);
                  font-weight: 500;
                }
              }

              .pill-caret {
                font-size: 0.625rem;
                color: var(--color-text-muted, #94a3b8);
                pointer-events: none;
              }

              .btn-unlock-inline {
                background: transparent;
                border: none;
                color: var(--color-text-muted, #94a3b8);
                cursor: pointer;
                padding: 1px 3px;
                font-size: 0.6875rem;

                &:hover {
                  color: var(--color-crimson, #ba0c2f);
                }
              }
            }
          }

          /* Editorial Receipt Stream */
          .session-receipt-stream {
            display: flex;
            flex-direction: column;
            gap: 6px;

            .receipt-stream-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 0.6875rem;
              font-weight: 700;
              color: var(--color-text-muted, #94a3b8);
              text-transform: uppercase;
              letter-spacing: 0.04em;
              padding: 0 2px;

              .receipt-stream-title {
                display: inline-flex;
                align-items: center;
                gap: 4px;
              }

              .receipt-stream-subtotal {
                font-family: var(--font-mono, monospace);
                font-size: 0.75rem;
                color: var(--color-text-secondary, #64748b);
              }
            }

            .receipt-rounds-body {
              display: flex;
              flex-direction: column;
              gap: 4px;
            }

            .receipt-round-segment {
              display: flex;
              flex-direction: column;
              gap: 3px;
              border-radius: 8px;
              padding: 2px;

              &.round-pending-soft {
                background: rgba(186, 12, 47, 0.02);
                border-left: 2px solid var(--color-crimson, #ba0c2f);
                padding-left: 6px;
              }
            }

            .round-items-clean {
              display: flex;
              flex-direction: column;
              gap: 3px;
            }

            .receipt-item-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 2px 0;
              font-size: 0.75rem;

              .item-name-cluster {
                display: flex;
                align-items: center;
                gap: 6px;
                min-width: 0;

                .qty-bubble {
                  font-family: var(--font-mono, monospace);
                  font-size: 0.6875rem;
                  font-weight: 700;
                  background: rgba(0, 0, 0, 0.05);
                  color: var(--color-text-primary, #0f172a);
                  padding: 1px 5px;
                  border-radius: 4px;
                  flex-shrink: 0;
                }

                .item-title {
                  font-weight: 600;
                  color: var(--color-text-primary, #0f172a);
                }

                .portion-tag {
                  font-size: 0.625rem;
                  background: rgba(0, 0, 0, 0.04);
                  color: var(--color-text-secondary, #64748b);
                  padding: 1px 4px;
                  border-radius: 4px;
                  flex-shrink: 0;
                }
              }

              .item-price {
                font-family: var(--font-mono, monospace);
                font-size: 0.75rem;
                font-weight: 600;
                color: var(--color-text-secondary, #64748b);
                flex-shrink: 0;
              }
            }
          }

          /* Apple Financial Strip */
          .grand-bill-strip-apple {
            padding: 8px 10px;
            background: rgba(0, 0, 0, 0.02);
            border: 1px solid rgba(0, 0, 0, 0.05);
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            gap: 4px;

            .sub-line {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 0.75rem;
              color: var(--color-text-secondary, #64748b);

              .bill-val {
                font-family: var(--font-mono, monospace);
                font-weight: 600;
              }

              &.discount {
                color: #15803d;
              }
            }

            .total-row-apple {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding-top: 6px;
              margin-top: 2px;
              border-top: 1px solid rgba(0, 0, 0, 0.06);

              .total-meta-left {
                display: flex;
                align-items: center;
                gap: 6px;

                .total-label-apple {
                  font-size: 0.8125rem;
                  font-weight: 700;
                  color: var(--color-text-primary, #0f172a);
                }

                .status-pill-chip {
                  display: inline-flex;
                  align-items: center;
                  gap: 3px;
                  font-size: 0.625rem;
                  font-weight: 800;
                  padding: 1px 6px;
                  border-radius: 999px;
                  letter-spacing: 0.03em;

                  &.paid {
                    background: #dcfce7;
                    color: #15803d;
                  }

                  &.unpaid {
                    background: #fef3c7;
                    color: #b45309;
                  }
                }
              }

              .payable-val-apple {
                font-family: var(--font-mono, monospace);
                font-size: 1.0625rem;
                font-weight: 800;
                color: var(--color-crimson, #ba0c2f);
                letter-spacing: -0.02em;
              }
            }
          }

          /* Apple Action Controls */
          .card-footer-actions-apple {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding-top: 2px;

            .action-row-primary {
              width: 100%;
            }

            .apple-btn-primary {
              width: 100%;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              padding: 8px 12px;
              border-radius: 10px;
              background: var(--color-crimson, #ba0c2f);
              color: #ffffff;
              font-size: 0.8125rem;
              font-weight: 700;
              border: none;
              cursor: pointer;
              box-shadow: 0 2px 6px rgba(186, 12, 47, 0.2);
              transition:
                transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
                background-color 0.15s ease;

              &:hover {
                background: #960a26;
                box-shadow: 0 4px 10px rgba(186, 12, 47, 0.3);
              }

              &:active {
                transform: scale(0.98);
              }
            }

            .apple-util-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 6px;

              .apple-util-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                padding: 6px 10px;
                border-radius: 8px;
                background: rgba(0, 0, 0, 0.03);
                border: 1px solid rgba(0, 0, 0, 0.06);
                color: var(--color-text-secondary, #64748b);
                font-size: 0.75rem;
                font-weight: 600;
                text-decoration: none;
                cursor: pointer;
                transition:
                  transform 0.15s cubic-bezier(0.16, 1, 0.3, 1),
                  background-color 0.15s ease,
                  color 0.15s ease;

                i {
                  font-size: 0.875rem;
                }

                &:hover {
                  background: rgba(0, 0, 0, 0.06);
                  color: var(--color-text-primary, #0f172a);
                }

                &:active {
                  transform: scale(0.97);
                }
              }
            }
          }
        }

        .no-orders-box {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: var(--color-surface, #ffffff);
          border: 1px dashed var(--color-border, #cbd5e1);
          border-radius: 8px;
          font-size: 0.75rem;
          color: var(--color-text-muted, #6b7280);
        }

        .shape-toggle-group {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;

          .shape-btn {
            padding: 8px;
            font-size: 0.75rem;
            font-weight: 700;
            border-radius: 6px;
            border: 1px solid var(--color-border, #e5e7eb);
            background: var(--color-surface, #ffffff);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;

            &.active {
              background: var(--color-onyx, #121212);
              color: #ffffff;
              border-color: var(--color-onyx, #121212);
            }
          }
        }

        .drawer-action-buttons {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .drawer-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          border-top: 1px solid var(--color-border, #e5e7eb);
          background: var(--color-surface-card, #fafafa);
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

      /* Add Place Modal */
      .add-place-card {
        max-width: 440px;
        width: 90vw;

        .modal-title-with-icon {
          display: flex;
          align-items: center;
          gap: 10px;

          .icon-circle {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: rgba(220, 38, 38, 0.1);
            color: var(--color-crimson, #dc2626);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.125rem;
          }
        }

        .place-suggestions {
          margin-top: 14px;

          .suggestion-pills {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;

            .sug-pill {
              font-size: 0.6875rem;
              font-weight: 600;
              padding: 4px 10px;
              border-radius: 9999px;
              border: 1px solid var(--color-border, #e5e7eb);
              background: var(--color-bone-light, #f9fafb);
              cursor: pointer;

              &:hover {
                border-color: var(--color-crimson, #dc2626);
                color: var(--color-crimson, #dc2626);
              }
            }
          }
        }
      }

      /* Floor Canvas Quick Settle Modal (Apple Fluid Settle Modal) */
      .canvas-settle-card,
      .settle-modal {
        max-width: 540px;
        width: 95vw;
        max-height: calc(100vh - 40px);
        max-height: calc(100dvh - 40px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: var(--radius-lg, 16px);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
        border: 1px solid var(--color-border);
        background: var(--color-surface, #ffffff);

        .modal-header {
          flex-shrink: 0;
        }

        .modal-body {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 16px 20px;
          overscroll-behavior: contain;

          /* Apple sleek scrollbar */
          &::-webkit-scrollbar {
            width: 6px;
          }
          &::-webkit-scrollbar-track {
            background: transparent;
          }
          &::-webkit-scrollbar-thumb {
            background: rgba(0, 0, 0, 0.16);
            border-radius: 999px;
            &:hover {
              background: rgba(0, 0, 0, 0.28);
            }
          }
        }

        .modal-footer {
          flex-shrink: 0;
        }

        .settle-mode-tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          background: var(--color-bone-light, #f8fafc);
          padding: 4px;
          border-radius: var(--radius-sm, 8px);
          border: 1px solid var(--color-border, #e2e8f0);
        }

        .mode-tab-btn {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 12px;
          border: none;
          border-radius: var(--radius-xs, 6px);
          background: transparent;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--color-text-secondary, #64748b);
          cursor: pointer;
          transition: all var(--transition-fast, 0.15s ease);

          &.active {
            background: var(--color-surface, #ffffff);
            color: var(--color-onyx, #0f172a);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
            font-weight: 700;
          }
        }

        .settle-summary-box {
          background: var(--color-bone-light, #f8fafc);
          border: 1px solid var(--color-border, #e2e8f0);
          border-radius: var(--radius-sm, 8px);
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 14px;
          font-size: 0.8125rem;

          .settle-items-section {
            background: var(--color-surface, #ffffff);
            border: 1px solid var(--color-border, #e2e8f0);
            border-radius: 6px;
            padding: 8px 10px;
            margin: 2px 0 4px;
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .settle-items-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.72rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--color-text-muted, #94a3b8);
            padding-bottom: 4px;
            border-bottom: 1px solid var(--color-border, #f1f5f9);
          }

          .settle-items-list {
            max-height: 160px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 5px;
            padding-right: 2px;
          }

          .settle-item-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            font-size: 0.8125rem;
            padding: 2px 0;
          }

          .settle-item-left {
            display: flex;
            align-items: flex-start;
            gap: 6px;
            flex: 1;
            min-width: 0;
          }

          .item-qty-pill {
            font-size: 0.7rem;
            font-weight: 700;
            background: rgba(99, 102, 241, 0.1);
            color: var(--color-primary, #6366f1);
            padding: 1px 5px;
            border-radius: 4px;
            flex-shrink: 0;
            margin-top: 1px;
          }

          .item-text-group {
            display: flex;
            flex-direction: column;
            min-width: 0;
          }

          .item-name-text {
            font-weight: 600;
            color: var(--color-onyx, #1e293b);
            line-height: 1.25;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .item-instruction-text {
            font-size: 0.6875rem;
            color: var(--color-text-muted, #64748b);
            line-height: 1.2;
            margin-top: 1px;
            font-style: italic;
          }

          .item-total-price {
            font-weight: 600;
            color: var(--color-text-primary, #0f172a);
            font-family: 'SF Mono', Consolas, monospace;
            font-size: 0.8125rem;
            flex-shrink: 0;
            margin-left: 8px;
          }

          .settle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;

            &.discount {
              color: var(--color-crimson, #ba0c2f);
            }

            &.total-highlight {
              font-size: 0.9375rem;
              font-weight: 800;
              color: var(--color-onyx, #0f172a);
              padding-top: 2px;

              .amount-large {
                font-size: 1.25rem;
                font-weight: 800;
                color: var(--color-crimson, #ba0c2f);
              }
            }
          }

          .settle-divider {
            height: 1px;
            border-bottom: 1px dashed var(--color-border, #e2e8f0);
            margin: 4px 0;
          }
        }

        .settle-discount-card {
          margin-bottom: 16px;
          padding: 12px 14px;
          background: var(--color-bone-light, #f8fafc);
          border: 1px solid var(--color-border, #e2e8f0);
          border-radius: var(--radius-sm, 8px);
          display: flex;
          flex-direction: column;
          gap: 10px;

          .discount-header-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
          }

          .discount-title {
            font-size: 0.8rem;
            font-weight: 700;
            color: var(--color-onyx, #1e293b);
            display: inline-flex;
            align-items: center;
            gap: 6px;

            i {
              color: var(--color-primary, #6366f1);
              font-size: 0.95rem;
            }
          }

          .discount-segmented-control {
            display: inline-flex;
            background: var(--color-surface, #ffffff);
            border: 1px solid var(--color-border, #e2e8f0);
            border-radius: 6px;
            padding: 2px;
            gap: 2px;
          }

          .seg-btn {
            background: transparent;
            border: none;
            padding: 3px 9px;
            font-size: 0.72rem;
            font-weight: 600;
            color: var(--color-text-secondary, #64748b);
            border-radius: 4px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            transition: all var(--transition-fast, 0.15s ease);

            &:hover {
              color: var(--color-text-primary, #1e293b);
            }

            &.active {
              background: var(--color-primary, #6366f1);
              color: #ffffff;
            }
          }

          .custom-disc-pane {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .inr-input-wrapper {
            position: relative;
            display: flex;
            align-items: center;
          }

          .inr-prefix {
            position: absolute;
            left: 10px;
            font-size: 0.85rem;
            font-weight: 700;
            color: var(--color-text-muted, #94a3b8);
            pointer-events: none;
          }

          .inr-input {
            width: 100%;
            padding: 6px 12px 6px 26px;
            font-size: 0.825rem;
            font-weight: 600;
            border: 1px solid var(--color-border, #e2e8f0);
            border-radius: 6px;
            background: var(--color-surface, #ffffff);
            color: var(--color-text-primary, #1e293b);
            outline: none;
            transition: all var(--transition-fast, 0.15s ease);

            &:focus {
              border-color: var(--color-primary, #6366f1);
              box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12);
            }
          }

          .btn-disc-clear {
            position: absolute;
            right: 8px;
            background: transparent;
            border: none;
            color: var(--color-text-muted, #94a3b8);
            font-size: 0.72rem;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 2px;
            padding: 2px 4px;

            &:hover {
              color: var(--color-danger, #ef4444);
            }
          }

          .quick-disc-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
          }

          .disc-chip {
            background: var(--color-surface, #ffffff);
            border: 1px solid var(--color-border, #e2e8f0);
            border-radius: 5px;
            padding: 3px 8px;
            font-size: 0.72rem;
            font-weight: 600;
            color: var(--color-text-secondary, #475569);
            cursor: pointer;
            transition: all var(--transition-fast, 0.15s ease);

            &:hover {
              background: #f1f5f9;
              border-color: #cbd5e1;
              color: var(--color-text-primary, #1e293b);
            }

            &.chip-active {
              background: #eff6ff;
              border-color: #3b82f6;
              color: #1d4ed8;
              font-weight: 700;
            }

            &.chip-round {
              color: #047857;
              border-color: #a7f3d0;
              background: #ecfdf5;

              &:hover {
                background: #d1fae5;
              }
            }
          }

          .coupon-disc-pane {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .coupon-select-wrapper {
            position: relative;
            display: flex;
            align-items: center;
          }

          .coupon-select {
            width: 100%;
            appearance: none;
            -webkit-appearance: none;
            padding: 6px 26px 6px 10px;
            font-size: 0.78rem;
            font-weight: 500;
            border: 1px solid var(--color-border, #e2e8f0);
            border-radius: 6px;
            background: var(--color-surface, #ffffff);
            color: var(--color-text-primary, #1e293b);
            outline: none;
            cursor: pointer;
            transition: all var(--transition-fast, 0.15s ease);

            &:focus {
              border-color: var(--color-primary, #6366f1);
              box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12);
            }
          }

          .coupon-caret {
            position: absolute;
            right: 9px;
            font-size: 0.72rem;
            color: var(--color-text-muted, #94a3b8);
            pointer-events: none;
          }

          .applied-coupon-badge {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            background: #ecfdf5;
            border: 1px solid #a7f3d0;
            border-radius: 6px;
            padding: 5px 8px;
            font-size: 0.72rem;
            color: #065f46;

            i {
              font-size: 0.85rem;
              color: #059669;
            }
          }

          .btn-disc-clear-pill {
            background: transparent;
            border: none;
            color: #065f46;
            cursor: pointer;
            padding: 2px 4px;
            display: inline-flex;
            align-items: center;

            &:hover {
              color: #ef4444;
            }
          }
        }

        .payment-selector-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 6px;
        }

        .method-options-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;

          @media (max-width: 600px) {
            grid-template-columns: 1fr;
          }
        }

        .method-tile {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          padding: 12px;
          border: 2px solid var(--color-border, #e2e8f0);
          border-radius: var(--radius-md, 12px);
          background: var(--color-surface, #ffffff);
          cursor: pointer;
          position: relative;
          transition: all var(--transition-fast, 0.15s ease);
          text-align: left;
          font-family: inherit;

          &:hover {
            border-color: #cbd5e1;
            background: var(--color-bone-light, #f8fafc);
          }

          &.selected {
            border-color: var(--color-crimson, #ba0c2f);
            background: #fef2f2;
          }

          .tile-icon {
            font-size: 1.5rem;
            color: var(--color-onyx, #0f172a);
          }

          .tile-info {
            display: flex;
            flex-direction: column;
            gap: 2px;

            .tile-title {
              font-size: 0.8125rem;
              font-weight: 700;
              color: var(--color-onyx, #0f172a);
            }

            .tile-sub {
              font-size: 0.65rem;
              color: var(--color-text-muted, #64748b);
            }
          }

          .tile-check {
            position: absolute;
            top: 8px;
            right: 8px;
            font-size: 1rem;
            color: var(--color-crimson, #ba0c2f);
          }
        }

        .split-create-workspace {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 10px;
        }

        .split-stepper-box {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--color-bone-light, #f8fafc);
          border: 1px solid var(--color-border, #e2e8f0);
          border-radius: var(--radius-sm, 8px);

          .stepper-label {
            font-weight: 600;
            font-size: 0.875rem;
            color: var(--color-onyx, #0f172a);
          }

          .stepper-controls {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .stepper-btn {
            width: 32px;
            height: 32px;
            border: 1px solid var(--color-border, #cbd5e1);
            border-radius: var(--radius-sm, 6px);
            background: var(--color-surface, #ffffff);
            font-weight: 700;
            font-size: 1.1rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;

            &:disabled {
              opacity: 0.4;
              cursor: not-allowed;
            }

            &:hover:not(:disabled) {
              border-color: var(--color-gold, #f59e0b);
              background: #faf7f2;
            }
          }

          .stepper-val {
            font-weight: 700;
            font-size: 0.9375rem;
            color: var(--color-onyx, #0f172a);
            min-width: 54px;
            text-align: center;
          }
        }

        .split-preview-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
          gap: 8px;

          .split-preview-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            padding: 8px;
            background: var(--color-surface, #ffffff);
            border: 1px solid var(--color-border, #e2e8f0);
            border-radius: var(--radius-sm, 6px);

            .p-num {
              font-size: 0.6875rem;
              color: var(--color-text-muted, #64748b);
              text-transform: uppercase;
            }

            .p-val {
              font-size: 0.875rem;
              color: var(--color-crimson, #ba0c2f);
              font-weight: 800;
            }
          }
        }

        .split-bills-live-box {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .split-banner-notice {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: rgba(212, 175, 55, 0.1);
          border: 1px solid rgba(212, 175, 55, 0.3);
          border-radius: var(--radius-sm, 6px);
          color: var(--color-onyx, #0f172a);
          font-size: 0.8125rem;
          font-weight: 600;
        }

        .split-cards-stream {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 240px;
          overflow-y: auto;
        }

        .split-card-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border: 1px solid var(--color-border, #e2e8f0);
          border-radius: var(--radius-sm, 6px);
          background: var(--color-surface, #ffffff);

          &.is-paid {
            background: rgba(27, 99, 62, 0.05);
            border-color: rgba(27, 99, 62, 0.2);
          }

          .split-card-info {
            display: flex;
            flex-direction: column;
            gap: 2px;

            .split-amount {
              font-weight: 700;
              color: var(--color-crimson, #ba0c2f);
              font-size: 0.875rem;
            }
          }

          .split-card-actions {
            display: flex;
            gap: 6px;
          }
        }

        .modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          gap: 12px;

          .footer-left-action {
            display: flex;
            align-items: center;
          }

          .footer-right-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: auto;
          }
        }
      }

      /* ============================================================ */
      /* CLASSIC GRID STYLES (PRESERVED)                              */
      /* ============================================================ */
      .tables-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 20px;
      }

      .table-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 18px;
        box-shadow: var(--shadow-xs);
        display: flex;
        flex-direction: column;
        gap: 12px;
        transition: all var(--transition-fast);
        cursor: pointer;

        &:hover {
          border-color: var(--color-taupe);
          box-shadow: var(--shadow-sm);
        }

        &.disabled-order {
          opacity: 0.7;
          background: var(--color-bone-light);
        }

        &.status-occupied {
          background: linear-gradient(180deg, #fff5f5 0%, #ffffff 100%);
          border: 2px solid #ef4444;
          box-shadow: 0 4px 16px rgba(239, 68, 68, 0.16);

          .table-number {
            color: #dc2626;
            font-weight: 800;
          }

          .table-section-tag {
            background: #fee2e2;
            color: #b91c1c;
            border: 1px solid #fca5a5;
          }

          .active-customer-box {
            background: #fef2f2;
            border-color: #fca5a5;
          }
        }
      }

      .table-card-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }

      .table-num-wrap {
        display: flex;
        flex-direction: column;
      }

      .table-number {
        font-size: 1.5rem;
        font-weight: 800;
        letter-spacing: -0.02em;
      }

      .table-capacity {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .table-section-tag {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
      }

      .table-token-box {
        background: var(--color-bone);
        padding: 6px 10px;
        border-radius: var(--radius-xs);
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.75rem;
      }

      .token-label {
        color: var(--color-text-muted);
      }
      .token-code {
        font-weight: 700;
        color: var(--color-crimson);
      }

      .active-customer-box {
        background: rgba(22, 101, 52, 0.06);
        border: 1px solid rgba(22, 101, 52, 0.25);
        border-radius: var(--radius-xs);
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .active-cust-header {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
      }

      .active-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #166534;
        animation: pulse 2s infinite;
      }

      .cust-name {
        color: #166534;
        font-weight: 700;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .order-chip {
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 1px 6px;
        background: #166534;
        color: #ffffff;
        border-radius: 4px;
      }

      .active-server-select {
        border-color: rgba(22, 101, 52, 0.4);
      }

      .locked-server-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 8px;
        background: #fef3c7;
        border: 1px solid #fde68a;
        border-radius: var(--radius-sm);
        margin-top: 2px;
      }

      .btn-unlock-server {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: #ffffff;
        border: 1px solid #d97706;
        color: #b45309;
        font-size: 0.6875rem;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        cursor: pointer;
        &:hover {
          background: #fffbeb;
        }
      }

      .auth-modal-card {
        max-width: 480px;
        width: 90vw;
      }
      .auth-modal-title-wrap {
        display: flex;
        align-items: center;
        gap: 12px;
        .auth-icon-badge {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(184, 134, 11, 0.15);
          color: #b8860b;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
        }
      }

      .auth-dialog-body {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .auth-warning-box {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        background: #fffbeb;
        border: 1px solid #fde68a;
        border-radius: var(--radius-sm);
        color: #92400e;
        font-size: 0.8125rem;
        line-height: 1.4;

        i {
          font-size: 1.125rem;
          margin-top: 1px;
          flex-shrink: 0;
        }
        p {
          margin: 0;
        }
      }

      .input-with-icon {
        position: relative;
        display: flex;
        align-items: center;

        i {
          position: absolute;
          left: 12px;
          color: var(--color-text-muted);
          pointer-events: none;
        }

        .form-input {
          padding-left: 36px;
          width: 100%;
        }
      }

      .hint-text {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        margin-top: 4px;
        display: block;

        code {
          background: var(--color-bone);
          padding: 1px 4px;
          border-radius: 3px;
          font-family: monospace;
          color: var(--color-crimson);
        }
      }

      .auth-error-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: #fef2f2;
        border: 1px solid rgba(220, 38, 38, 0.25);
        border-radius: var(--radius-sm);
        color: #dc2626;
        font-size: 0.8125rem;
        font-weight: 600;
      }

      .btn-seat-action {
        background: linear-gradient(135deg, #059669 0%, #10b981 100%);
        color: #ffffff;
        border: none;
        font-weight: 700;
        font-size: 0.8125rem;
        padding: 7px 12px;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);
        cursor: pointer;
        transition: all 0.2s ease;
        &:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
        }
        &:active {
          transform: translateY(0);
        }
      }

      .btn-clean-action {
        background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
        color: #ffffff;
        border: none;
        font-weight: 700;
        font-size: 0.8125rem;
        padding: 7px 12px;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        box-shadow: 0 2px 6px rgba(245, 158, 11, 0.25);
        cursor: pointer;
        transition: all 0.2s ease;
        &:hover {
          filter: brightness(1.08);
        }
      }

      .seated-badge-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 9px;
        border-radius: var(--radius-sm);
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.25);
        font-size: 0.75rem;
        font-weight: 700;
        color: #059669;
      }

      .seated-live-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #10b981;
        animation: pulseSeatedDot 2s infinite;
      }

      @keyframes pulseSeatedDot {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.4;
          transform: scale(1.2);
        }
      }

      .status-select-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .status-dropdown {
        padding: 6px 10px;
        font-size: 0.8125rem;
        font-weight: 600;
      }

      .table-card-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: auto;
        padding-top: 8px;
        border-top: 1px solid var(--color-bone);
      }

      .btn-icon-danger {
        color: var(--color-danger);
        &:hover {
          background: var(--color-danger-bg);
          border-color: var(--color-danger);
        }
      }

      /* Modal Base Styles (Layered above fullscreen canvas z-index: 1100) */
      .modal-overlay,
      ::ng-deep .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2200 !important;
        padding: 20px;
        overflow-y: auto;
      }

      /* Manual Order POS Modal Styling on Floor Canvas */
      .modal-card.manual-order-modal-canvas {
        max-width: 1040px !important;
        width: 95vw;
        height: 88vh;
        max-height: 840px;
        display: flex;
        flex-direction: column;
        border-radius: 16px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        overflow: hidden;

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 22px;
          border-bottom: 1px solid var(--color-border);
          background: var(--color-surface);

          .modal-title-with-icon {
            display: flex;
            align-items: center;
            gap: 12px;

            .icon-circle {
              width: 38px;
              height: 38px;
              border-radius: 10px;
              background: var(--color-bone-light, #f1f5f9);
              color: var(--color-crimson, #dc2626);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 1.25rem;
              border: 1px solid var(--color-border);
            }

            .heading-card {
              font-size: 1.125rem;
              font-weight: 700;
              margin: 0;
              color: var(--color-text-primary);
            }
          }

          .close-btn {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            border: 1px solid var(--color-border);
            background: var(--color-surface);
            color: var(--color-text-muted);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1rem;
            transition: all 0.15s ease;

            &:hover {
              background: var(--color-bone-light, #f1f5f9);
              color: var(--color-text-primary);
            }
          }
        }

        .manual-order-workspace {
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 20px;
          padding: 20px 24px;
          flex: 1;
          min-height: 0;
          overflow: hidden;

          @media (max-width: 860px) {
            grid-template-columns: 1fr;
            overflow-y: auto;
          }
        }

        /* LEFT SIDE: DISH CATALOG */
        .pos-dish-catalog-panel {
          border-right: 1px solid var(--color-border);
          padding-right: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-height: 0;
          overflow: hidden;

          @media (max-width: 860px) {
            border-right: none;
            padding-right: 0;
            border-bottom: 1px solid var(--color-border);
            padding-bottom: 16px;
            max-height: 360px;
          }

          .catalog-panel-top {
            display: flex;
            flex-direction: column;
            gap: 10px;
            flex-shrink: 0;
          }

          .catalog-search-wrap {
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

            .catalog-search-input {
              padding-left: 42px;
              padding-right: 36px;
              width: 100%;
              font-size: 0.875rem;
              height: 44px;
              border-radius: var(--radius-md, 10px);
              border: 1px solid var(--color-border);
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
              cursor: pointer;
              color: var(--color-text-muted);
              padding: 4px;
              border-radius: 4px;
              display: flex;
              align-items: center;

              &:hover {
                color: var(--color-text-primary);
              }
            }
          }

          .catalog-cat-chips {
            display: flex;
            gap: 6px;
            overflow-x: auto;
            padding-bottom: 4px;
            scrollbar-width: none;
            &::-webkit-scrollbar {
              display: none;
            }

            .cat-chip {
              padding: 5px 12px;
              border-radius: 999px;
              font-size: 0.75rem;
              font-weight: 600;
              border: 1px solid var(--color-border);
              background: var(--color-surface);
              color: var(--color-text-secondary);
              cursor: pointer;
              white-space: nowrap;
              transition: all 0.15s ease;

              &:hover {
                border-color: var(--color-text-muted);
                color: var(--color-text-primary);
              }

              &.active {
                background: var(--color-crimson, #dc2626);
                color: #ffffff;
                border-color: var(--color-crimson, #dc2626);
                box-shadow: 0 2px 8px rgba(220, 38, 38, 0.25);
              }
            }
          }

          .catalog-diet-chips {
            display: flex;
            gap: 6px;

            .diet-filter-pill {
              display: inline-flex;
              align-items: center;
              gap: 5px;
              padding: 4px 10px;
              font-size: 0.71875rem;
              font-weight: 600;
              border-radius: 6px;
              border: 1px solid var(--color-border);
              background: var(--color-surface);
              color: var(--color-text-secondary);
              cursor: pointer;
              transition: all 0.15s ease;

              &:hover {
                border-color: var(--color-text-muted);
              }

              &.active {
                border-color: var(--color-text-primary);
                color: var(--color-text-primary);
                background: var(--color-bone-light, #f8fafc);
                font-weight: 700;
              }

              .diet-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                &.veg {
                  background: #16a34a;
                }
                &.non-veg {
                  background: #dc2626;
                }
              }
            }
          }

          .catalog-dishes-stream {
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding-right: 6px;
            flex: 1;
            min-height: 0;

            .pos-dish-card {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 10px 14px;
              background: var(--color-surface);
              border: 1px solid var(--color-border);
              border-radius: 10px;
              cursor: pointer;
              transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);

              &:hover {
                border-color: var(--color-crimson, #dc2626);
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
              }

              &.in-tray {
                border-color: #10b981;
                background: rgba(16, 185, 129, 0.05);
              }

              &.is-out-of-stock {
                opacity: 0.55;
                cursor: not-allowed;
                pointer-events: none;
                filter: grayscale(0.6);
              }

              .dish-card-details {
                display: flex;
                flex-direction: column;
                gap: 3px;
                min-width: 0;

                .dish-name-row {
                  display: flex;
                  align-items: center;
                  gap: 6px;

                  .dish-title {
                    font-size: 0.84375rem;
                    font-weight: 600;
                    color: var(--color-text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 220px;
                  }
                }

                .dish-sub-row {
                  display: flex;
                  align-items: center;
                  gap: 8px;

                  .dish-cost {
                    font-size: 0.8125rem;
                    color: var(--color-text-secondary);
                    font-weight: 600;
                  }

                  .stock-tag {
                    font-size: 0.625rem;
                    font-weight: 700;
                    padding: 1px 6px;
                    border-radius: 4px;
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                    &.low {
                      background: #fef3c7;
                      color: #b45309;
                    }
                    &.out {
                      background: #fee2e2;
                      color: #b91c1c;
                    }
                  }
                }
              }

              .dish-card-action {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;

                .tray-counter-pill {
                  font-size: 0.6875rem;
                  font-weight: 700;
                  background: #10b981;
                  color: #ffffff;
                  padding: 2px 8px;
                  border-radius: 999px;
                  box-shadow: 0 1px 4px rgba(16, 185, 129, 0.3);
                }

                .quick-add-btn {
                  width: 30px;
                  height: 30px;
                  border-radius: 8px;
                  border: 1px solid var(--color-border);
                  background: var(--color-surface);
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: var(--color-crimson, #dc2626);
                  font-size: 0.9375rem;
                  transition: all 0.15s ease;

                  &:hover {
                    background: var(--color-crimson, #dc2626);
                    color: #ffffff;
                    border-color: var(--color-crimson, #dc2626);
                  }
                }
              }
            }

            .empty-catalog-msg {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 40px 16px;
              color: var(--color-text-muted);
              font-size: 0.8125rem;
              text-align: center;
              gap: 8px;

              i {
                font-size: 1.75rem;
                opacity: 0.7;
              }
            }
          }
        }

        /* RIGHT SIDE: ORDER DETAILS & TRAY SUMMARY */
        .pos-order-summary-panel {
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-height: 0;
          overflow: hidden;

          /* Table & Guest Context Card */
          .pos-context-card {
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: 12px;
            padding: 14px 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);

            .table-assignment-banner {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              padding-bottom: 12px;
              border-bottom: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.06));

              @media (max-width: 640px) {
                flex-direction: column;
                align-items: stretch;
              }

              .assignment-meta {
                display: flex;
                flex-direction: column;
                gap: 6px;

                .assignment-label-row {
                  display: flex;
                  align-items: center;
                  gap: 8px;

                  .context-eyebrow {
                    font-size: 0.6875rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: var(--color-text-muted);
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;

                    i {
                      font-size: 0.8125rem;
                    }
                  }

                  .table-status-pill {
                    font-size: 0.625rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    padding: 2px 7px;
                    border-radius: 999px;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    letter-spacing: 0.04em;

                    .status-dot {
                      width: 5px;
                      height: 5px;
                      border-radius: 50%;
                    }

                    &.available {
                      background: rgba(22, 163, 74, 0.12);
                      color: #16a34a;
                      .status-dot {
                        background: #16a34a;
                      }
                    }

                    &.occupied {
                      background: rgba(220, 38, 38, 0.12);
                      color: #dc2626;
                      .status-dot {
                        background: #dc2626;
                      }
                    }

                    &.reserved {
                      background: rgba(217, 119, 6, 0.12);
                      color: #d97706;
                      .status-dot {
                        background: #d97706;
                      }
                    }

                    &.dirty {
                      background: rgba(100, 116, 139, 0.14);
                      color: #64748b;
                      .status-dot {
                        background: #64748b;
                      }
                    }
                  }
                }

                .selected-table-showcase {
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  flex-wrap: wrap;

                  .tbl-badge {
                    font-size: 1rem;
                    font-weight: 800;
                    color: var(--color-text-primary);
                    background: var(--color-bone-light, #f1f5f9);
                    padding: 3px 10px;
                    border-radius: 8px;
                    border: 1px solid var(--color-border);
                  }

                  .tbl-detail-pill {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--color-text-secondary);
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;

                    i {
                      font-size: 0.8125rem;
                      color: var(--color-text-muted);
                    }
                  }
                }
              }

              .table-picker-control {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 4px;

                @media (max-width: 640px) {
                  align-items: stretch;
                }

                .picker-label {
                  font-size: 0.6875rem;
                  font-weight: 600;
                  color: var(--color-text-muted);
                }

                .custom-table-select {
                  min-width: 200px;
                  max-width: 260px;
                  height: 34px;
                  font-size: 0.75rem;
                  font-weight: 600;
                  padding: 4px 10px;
                  border-radius: 8px;
                  border: 1px solid var(--color-border);
                  background: var(--color-surface);
                  color: var(--color-text-primary);
                  cursor: pointer;
                }
              }
            }

            .guest-details-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;

              @media (max-width: 540px) {
                grid-template-columns: 1fr;
              }

              .form-group.compact {
                display: flex;
                flex-direction: column;
                gap: 4px;

                .form-label-compact {
                  font-size: 0.6875rem;
                  font-weight: 700;
                  color: var(--color-text-muted);
                  text-transform: uppercase;
                  letter-spacing: 0.04em;
                  display: flex;
                  align-items: center;
                  gap: 4px;

                  i {
                    font-size: 0.75rem;
                  }
                }

                .input-icon-wrap {
                  position: relative;
                  display: flex;
                  align-items: center;

                  .input-prefix-icon {
                    position: absolute;
                    left: 10px;
                    color: var(--color-text-muted);
                    font-size: 0.875rem;
                    pointer-events: none;
                  }

                  .custom-input {
                    padding-left: 32px;
                    height: 34px;
                    font-size: 0.8125rem;
                    border-radius: 8px;
                    border: 1px solid var(--color-border);
                    background: var(--color-surface);
                    color: var(--color-text-primary);
                    width: 100%;

                    &:focus {
                      border-color: var(--color-crimson, #dc2626);
                      box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.1);
                      outline: none;
                    }
                  }
                }
              }
            }
          }

          /* Items Tray Box */
          .manual-items-box {
            display: flex;
            flex-direction: column;
            background: var(--color-bone-light, #f8fafc);
            border: 1px solid var(--color-border);
            border-radius: 12px;
            padding: 14px;
            flex: 1;
            min-height: 0;
            overflow: hidden;

            .tray-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding-bottom: 10px;
              border-bottom: 1px solid var(--color-border);
              flex-shrink: 0;

              .tray-title-group {
                display: flex;
                align-items: center;
                gap: 8px;

                .tray-title {
                  font-size: 0.75rem;
                  font-weight: 700;
                  color: var(--color-text-primary);
                  text-transform: uppercase;
                  letter-spacing: 0.05em;
                }

                .tray-badge {
                  font-size: 0.6875rem;
                  font-weight: 700;
                  padding: 2px 7px;
                  border-radius: 999px;
                  background: var(--color-border);
                  color: var(--color-text-muted);

                  &.has-items {
                    background: #10b981;
                    color: #ffffff;
                  }
                }
              }

              .clear-tray-btn {
                background: none;
                border: none;
                color: var(--color-text-muted);
                cursor: pointer;
                font-size: 0.6875rem;
                font-weight: 600;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 3px 6px;
                border-radius: 4px;
                transition: all 0.15s ease;

                &:hover {
                  color: var(--color-danger, #dc2626);
                  background: rgba(220, 38, 38, 0.08);
                }
              }
            }

            .empty-tray-state {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 32px 16px;
              text-align: center;
              gap: 8px;
              margin: auto 0;

              .empty-tray-icon {
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: var(--color-surface);
                border: 1px solid var(--color-border);
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--color-text-muted);
                font-size: 1.25rem;
              }

              .empty-tray-title {
                font-size: 0.875rem;
                font-weight: 700;
                color: var(--color-text-primary);
                margin: 0;
              }

              .empty-tray-subtitle {
                font-size: 0.75rem;
                color: var(--color-text-muted);
                margin: 0;
                max-width: 260px;
                line-height: 1.4;
              }
            }

            .manual-items-table {
              overflow-y: auto;
              display: flex;
              flex-direction: column;
              gap: 8px;
              padding: 10px 4px 10px 0;
              flex: 1;
              min-height: 0;

              .m-item-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 8px 12px;
                background: var(--color-surface);
                border: 1px solid var(--color-border);
                border-radius: 8px;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
                transition: border-color 0.15s ease;

                &:hover {
                  border-color: rgba(220, 38, 38, 0.3);
                }

                .m-item-details {
                  display: flex;
                  flex-direction: column;
                  gap: 2px;
                  flex: 1;
                  min-width: 0;

                  .m-item-title {
                    font-size: 0.8125rem;
                    font-weight: 600;
                    color: var(--color-text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                  }

                  .m-item-rate {
                    font-size: 0.6875rem;
                    color: var(--color-text-muted);
                    font-weight: 500;
                  }
                }

                .m-qty-stepper {
                  display: inline-flex;
                  align-items: center;
                  gap: 2px;
                  background: var(--color-bone-light, #f1f5f9);
                  border: 1px solid var(--color-border);
                  border-radius: 6px;
                  padding: 2px;

                  .stepper-btn {
                    width: 24px;
                    height: 24px;
                    border: none;
                    background: transparent;
                    color: var(--color-text-primary);
                    border-radius: 4px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.75rem;
                    transition: background 0.15s ease;

                    &:hover {
                      background: var(--color-surface);
                      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
                    }
                  }

                  .stepper-count {
                    min-width: 24px;
                    text-align: center;
                    font-size: 0.75rem;
                    font-weight: 700;
                    font-variant-numeric: tabular-nums;
                    color: var(--color-text-primary);
                  }
                }

                .m-item-right {
                  display: flex;
                  align-items: center;
                  gap: 8px;
                  flex-shrink: 0;

                  .m-item-total {
                    font-size: 0.8125rem;
                    font-weight: 700;
                    font-family: monospace;
                    color: var(--color-text-primary);
                    min-width: 54px;
                    text-align: right;
                  }

                  .m-remove-btn {
                    width: 22px;
                    height: 22px;
                    border-radius: 4px;
                    border: none;
                    background: transparent;
                    color: var(--color-text-muted);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.875rem;
                    transition: all 0.15s ease;

                    &:hover {
                      background: rgba(220, 38, 38, 0.1);
                      color: #dc2626;
                    }
                  }
                }
              }
            }

            .order-math-summary {
              margin-top: auto;
              padding: 12px 14px;
              background: var(--color-surface);
              border: 1px solid var(--color-border);
              border-radius: 8px;
              display: flex;
              flex-direction: column;
              gap: 6px;
              flex-shrink: 0;

              .math-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 0.75rem;
                color: var(--color-text-secondary);

                .math-label {
                  display: inline-flex;
                  align-items: center;
                  gap: 6px;
                }

                .tax-rate-pill {
                  font-size: 0.625rem;
                  font-weight: 600;
                  padding: 1px 5px;
                  background: var(--color-bone-light, #f1f5f9);
                  border: 1px solid var(--color-border);
                  border-radius: 4px;
                  color: var(--color-text-muted);
                }

                .math-value {
                  font-weight: 600;
                  color: var(--color-text-primary);
                }

                &.total-highlight {
                  padding-top: 6px;
                  border-top: 1px solid var(--color-border);
                  margin-top: 2px;

                  .total-text-group {
                    display: flex;
                    flex-direction: column;

                    .total-main-label {
                      font-size: 0.875rem;
                      font-weight: 700;
                      color: var(--color-text-primary);
                    }

                    .total-sub-label {
                      font-size: 0.625rem;
                      color: var(--color-text-muted);
                    }
                  }

                  .total-grand-amount {
                    font-size: 1.1875rem;
                    font-weight: 800;
                    color: var(--color-crimson, #dc2626);
                    font-family: monospace;
                    letter-spacing: -0.02em;
                  }
                }
              }

              .math-divider {
                height: 1px;
                background: var(--color-border-subtle, rgba(0, 0, 0, 0.05));
                margin: 2px 0;
              }
            }
          }
        }

        .modal-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          padding: 14px 22px;
          border-top: 1px solid var(--color-border);
          background: var(--color-surface);
          flex-shrink: 0;

          .btn-primary {
            min-width: 160px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            font-weight: 600;
          }
        }
      }

      .modal-card {
        background: var(--color-surface);
        border-radius: var(--radius-lg);
        width: 100%;
        max-width: 460px;
        box-shadow: var(--shadow-lg);
        overflow: hidden;
      }

      .modal-header {
        padding: 16px 20px;
        border-bottom: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .close-btn {
        background: transparent;
        border: none;
        font-size: 1.25rem;
        cursor: pointer;
        color: var(--color-text-muted);
        &:hover {
          color: var(--color-text-primary);
        }
      }

      .modal-body {
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .form-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }

      .modal-footer {
        padding: 14px 20px;
        border-top: 1px solid var(--color-border);
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        background: var(--color-surface-card, #f9fafb);
      }

      /* QR Standee Styles */
      .qr-preview-card {
        max-width: 440px;
        width: 100%;
      }

      .qr-header-icon {
        width: 38px;
        height: 38px;
        border-radius: var(--radius-sm);
        background: rgba(194, 24, 7, 0.1);
        color: var(--color-crimson);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
      }

      .modal-subtext {
        font-size: 0.75rem;
        color: var(--color-text-muted);
        margin-top: 2px;
      }

      /* QR Standee Styles (Guaranteed Light-Mode Presentation) */
      .qr-standee {
        background: #faf8f5 !important;
        color: #14161b !important;
        border: 2px solid #14161b;
        border-radius: var(--radius-lg);
        padding: 8px;
        text-align: center;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.22);
        margin: 12px 0;
        position: relative;
        color-scheme: light !important;
      }

      .standee-inner-frame {
        position: relative;
        border: 1.5px dashed rgba(212, 175, 55, 0.7);
        border-radius: calc(var(--radius-lg) - 4px);
        padding: 20px 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        background: #ffffff !important;
        color: #14161b !important;
      }

      .frame-corner {
        position: absolute;
        width: 14px;
        height: 14px;
        border-color: #d4af37;
        border-style: solid;
        pointer-events: none;

        &.corner-tl {
          top: 6px;
          left: 6px;
          border-width: 2px 0 0 2px;
        }
        &.corner-tr {
          top: 6px;
          right: 6px;
          border-width: 2px 2px 0 0;
        }
        &.corner-bl {
          bottom: 6px;
          left: 6px;
          border-width: 0 0 2px 2px;
        }
        &.corner-br {
          bottom: 6px;
          right: 6px;
          border-width: 0 2px 2px 0;
        }
      }

      .standee-crest {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #d4af37 !important;
        color: #121212 !important;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.3rem;
        margin: 0 auto 6px auto;
        box-shadow: 0 2px 8px rgba(212, 175, 55, 0.35);
      }

      .standee-brand {
        font-family: var(--font-display);
        font-size: 1.35rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        color: #c21807 !important;
        line-height: 1.2;
      }

      .standee-sub {
        font-size: 0.6875rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #525252 !important;
        font-weight: 600;
        margin-top: 2px;
      }

      .standee-divider {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 70%;
        margin: 4px auto 0 auto;

        .divider-line {
          flex: 1;
          height: 1px;
          background: rgba(212, 175, 55, 0.45);
        }

        .divider-gem {
          font-size: 8px;
          color: #d4af37;
          line-height: 1;
        }
      }

      .qr-center-block {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        width: 100%;
      }

      .scan-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #14161b !important;
        color: #ffffff !important;
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        padding: 4px 12px;
        border-radius: var(--radius-full);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
      }

      .qr-image-container {
        padding: 10px;
        background: #ffffff !important;
        border: 1.5px solid #e5ded4;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
      }

      .qr-canvas-img {
        width: 200px;
        height: 200px;
        display: block;
        image-rendering: pixelated;
      }

      .qr-loading {
        width: 200px;
        height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.8125rem;
        color: #737373 !important;
      }

      .standee-footer {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        width: 100%;
      }

      .standee-table-badge {
        font-family: var(--font-display);
        background: #c21807 !important;
        color: #ffffff !important;
        font-size: 1.15rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        padding: 6px 24px;
        border-radius: var(--radius-sm);
        width: 85%;
        box-shadow: 0 3px 8px rgba(194, 24, 7, 0.25);
      }

      .standee-steps {
        font-size: 0.72rem;
        font-weight: 600;
        color: #262626 !important;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 4px;

        .step-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .step-num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          background: #d4af37 !important;
          color: #121212 !important;
          border-radius: 50%;
          font-size: 0.625rem;
          font-weight: 800;
        }

        .step-sep {
          color: #9ca3af;
        }
      }

      .standee-meta {
        font-size: 0.625rem;
        color: #525252 !important;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 5px;

        .meta-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #10b981 !important;
        }
      }

      .standee-print-cut-line {
        display: none;
        align-items: center;
        justify-content: center;
        gap: 6px;
        font-size: 0.58rem;
        font-weight: 600;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: #78716c;
        margin-top: 4px;
        padding-top: 6px;
        border-top: 1px dashed #dcd7ce;
        width: 90%;
      }

      @media print {
        @page {
          size: portrait;
          margin: 10mm;
        }

        html,
        body {
          background: #ffffff !important;
          color: #14161b !important;
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          height: auto !important;
          min-height: auto !important;
          overflow: visible !important;
          color-scheme: light !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /* Crucial: Completely remove background page content from layout so it causes ZERO extra pages */
        .tables-page > *:not(.qr-modal-overlay) {
          display: none !important;
        }

        .no-print,
        .modal-header,
        .modal-footer {
          display: none !important;
        }

        .qr-modal-overlay {
          position: static !important;
          inset: auto !important;
          width: 100% !important;
          height: auto !important;
          min-height: auto !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          background: transparent !important;
          padding: 0 !important;
          margin: 0 !important;
          box-shadow: none !important;
          border: none !important;
          overflow: visible !important;
        }

        .qr-preview-card {
          border: none !important;
          box-shadow: none !important;
          background: transparent !important;
          padding: 0 !important;
          margin: 0 auto !important;
          max-width: 100% !important;
          width: 100% !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
        }

        .qr-standee {
          display: flex !important;
          flex-direction: column !important;
          position: relative !important;
          left: auto !important;
          top: auto !important;
          transform: none !important;
          margin: 6mm auto !important;
          width: 100mm !important; /* Standard Table Tent Standee format */
          max-width: 100mm !important;
          border: 2.5px solid #14161b !important;
          border-radius: 12px !important;
          padding: 6px !important;
          box-shadow: none !important;
          background: #faf8f5 !important;
          color: #14161b !important;
          color-scheme: light !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          page-break-after: avoid !important;
          break-after: avoid !important;
          page-break-before: avoid !important;
          break-before: avoid !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .standee-inner-frame {
          border: 2px dashed #b8860b !important;
          padding: 14px 10px !important;
          background: #ffffff !important;
          color: #14161b !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .frame-corner {
          display: block !important;
          border-color: #b8860b !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .standee-crest {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          background: #d4af37 !important;
          color: #121212 !important;
        }

        .standee-brand {
          color: #c21807 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .standee-sub {
          color: #525252 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .standee-divider {
          display: flex !important;
          .divider-line {
            background: #b8860b !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .divider-gem {
            color: #b8860b !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        .scan-pill {
          background: #14161b !important;
          color: #ffffff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .qr-image-container {
          background: #ffffff !important;
          border: 1.5px solid #dcd7ce !important;
          padding: 6px !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .qr-canvas-img {
          width: 50mm !important;
          height: 50mm !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .standee-table-badge {
          background: #c21807 !important;
          color: #ffffff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        .standee-steps {
          color: #262626 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;

          .step-num {
            background: #d4af37 !important;
            color: #121212 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        .standee-meta {
          color: #525252 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;

          .meta-dot {
            background: #10b981 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        .standee-print-cut-line {
          display: flex !important;
          color: #78716c !important;
          border-color: #dcd7ce !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }

      .standee-url-preview {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 14px;
        padding: 10px 14px;
        background: #f8f6f2;
        border: 1px solid #e7e0d5;
        border-radius: 8px;
        text-align: left;
      }

      .url-preview-label {
        font-size: 0.6875rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #78716c;
        display: flex;
        align-items: center;
        gap: 5px;
      }

      .url-preview-pill {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        background: #ffffff;
        border: 1px solid #dcd7ce;
        border-radius: 6px;
        padding: 6px 10px;
      }

      .url-preview-link {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #c21807;
        text-decoration: none;
        font-size: 0.75rem;
        font-family: monospace;
        word-break: break-all;
        flex: 1;
      }

      .url-preview-link:hover {
        text-decoration: underline;
      }

      .btn-copy-url {
        background: none;
        border: none;
        color: #78716c;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 4px;
        transition: all 0.15s ease;
      }

      .btn-copy-url:hover {
        color: #1c1917;
        background: #f3f0e6;
      }

      /* Canvas Toolbar Add Buttons */
      .btn-add-section-toolbar {
        background: #f1f5f9;
        color: #0f172a;
        font-weight: 700;
        border: 1px solid #cbd5e1;
        transition: all 0.15s ease;

        &:hover {
          background: #e2e8f0;
          border-color: #94a3b8;
          color: #000000;
        }
      }

      .btn-custom-fig-btn {
        background: rgba(99, 102, 241, 0.08);
        border-color: rgba(99, 102, 241, 0.3);
        color: #4f46e5;
        font-weight: 600;

        &:hover {
          background: rgba(99, 102, 241, 0.18);
          border-color: #6366f1;
        }
      }

      /* Table Corner Resize Handle */
      .tbl-resize-handle {
        position: absolute;
        right: -3px;
        bottom: -3px;
        width: 14px;
        height: 14px;
        cursor: se-resize;
        border-radius: 50%;
        background: #ffffff;
        border: 2px solid #2563eb;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        z-index: 60;
        opacity: 0;
        transition:
          opacity 0.15s ease,
          transform 0.15s ease;

        &:hover {
          transform: scale(1.25);
          background: #2563eb;
        }
      }

      .canvas-table:hover .tbl-resize-handle,
      .canvas-table.is-selected .tbl-resize-handle,
      .canvas-table.is-resizing .tbl-resize-handle {
        opacity: 1;
      }

      /* Apple Canvas Dialog (Section & Fixture Creation) */
      .apple-canvas-dialog {
        max-width: 520px;
        border-radius: 20px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
        backdrop-filter: blur(16px);

        .dialog-icon-badge {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          flex-shrink: 0;

          &.crimson-badge {
            background: rgba(220, 38, 38, 0.12);
            color: #dc2626;
          }

          &.amber-badge {
            background: rgba(245, 158, 11, 0.15);
            color: #d97706;
          }
        }

        .quick-pills-row {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;

          .quick-pill {
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            border-radius: 999px;
            font-size: 0.72rem;
            padding: 3px 10px;
            cursor: pointer;
            color: #334155;
            transition: all 0.12s ease;

            &:hover {
              background: #e2e8f0;
              color: #000;
              border-color: #cbd5e1;
            }
          }
        }

        .preset-dimension-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;

          .preset-dim-card {
            border: 2px solid #e2e8f0;
            background: #f8fafc;
            border-radius: 12px;
            padding: 12px 8px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            cursor: pointer;
            transition: all 0.15s ease;

            .dim-shape-icon {
              background: #cbd5e1;
              border-radius: 4px;
              margin-bottom: 4px;

              &.std {
                width: 32px;
                height: 22px;
              }
              &.sm {
                width: 24px;
                height: 18px;
              }
              &.lg {
                width: 40px;
                height: 26px;
              }
            }

            .dim-title {
              font-size: 0.8125rem;
              font-weight: 700;
              color: #1e293b;
            }

            .dim-sub {
              font-size: 0.6875rem;
              color: #64748b;
            }

            &:hover {
              border-color: #94a3b8;
              background: #ffffff;
            }

            &.active {
              border-color: var(--color-crimson, #dc2626);
              background: rgba(220, 38, 38, 0.05);

              .dim-shape-icon {
                background: var(--color-crimson, #dc2626);
              }

              .dim-title {
                color: var(--color-crimson, #dc2626);
              }
            }
          }
        }

        .fixture-type-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;

          .fig-type-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 10px 4px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            cursor: pointer;
            font-size: 0.72rem;
            font-weight: 600;
            color: #334155;
            transition: all 0.15s ease;

            i {
              font-size: 1.25rem;
              color: #64748b;
            }

            &:hover {
              background: #ffffff;
              border-color: #cbd5e1;
              transform: translateY(-1px);
            }

            &.active {
              border-color: #d97706;
              background: #fffbeb;
              color: #92400e;

              i {
                color: #d97706;
              }
            }
          }
        }
      }

      /* Table Inspector Size Preset Grid */
      .table-size-preset-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;

        .size-chip-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px 4px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          cursor: pointer;
          transition: all 0.12s ease;

          .chip-title {
            font-size: 0.875rem;
            font-weight: 700;
            color: #1e293b;
          }

          .chip-sub {
            font-size: 0.625rem;
            color: #64748b;
          }

          &:hover {
            border-color: #cbd5e1;
            background: #ffffff;
          }

          &.active {
            border-color: var(--color-crimson, #dc2626);
            background: rgba(220, 38, 38, 0.06);

            .chip-title {
              color: var(--color-crimson, #dc2626);
            }
          }
        }
      }
    `,
  ],
})
export class TableListComponent implements OnInit {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);
  private adminAuth = inject(AdminAuthService);
  private router = inject(Router);

  readonly isLoading = computed(
    () => this.dataService.isTablesLoading() || !this.dataService.tablesLoaded(),
  );

  readonly Math = Math;

  tables = this.mock.tables;
  restaurant = this.mock.restaurant;
  staffMembers = this.dataService.staffMembers;
  menuItems = this.mock.menuItems;
  categories = this.mock.categories;

  // Floor Reservations Desk State
  readonly isReservationsBlockOpen = signal<boolean>(false);
  readonly reservations = computed(() => this.mock.reservations());
  readonly activeFloorReservations = computed(() => {
    return this.mock
      .reservations()
      .filter(
        (r) =>
          r.status === 'CONFIRMED' || (r.status as string) === 'PENDING' || r.status === 'SEATED',
      );
  });
  readonly pendingReservationsCount = computed(() => {
    return this.mock
      .reservations()
      .filter((r) => r.status === 'CONFIRMED' || (r.status as string) === 'PENDING').length;
  });
  readonly availableTables = computed(() => {
    return this.mock.tables().filter((t) => t.status === 'AVAILABLE');
  });

  getReservationArrivalInfo(res: Reservation): { label: string; isPast: boolean; isSoon: boolean } {
    const timeStr = res.reservationTime || res.reservationDate;
    if (!timeStr) return { label: 'Scheduled', isPast: false, isSoon: false };
    const resDate = new Date(timeStr);
    const now = new Date();
    const diffMs = resDate.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / (60 * 1000));

    if (diffMins < -30) {
      return { label: 'Late', isPast: true, isSoon: false };
    }
    if (diffMins < 0) {
      return { label: 'Due Now', isPast: false, isSoon: true };
    }
    if (diffMins <= 45) {
      return { label: `In ${diffMins}m`, isPast: false, isSoon: true };
    }
    const isToday =
      resDate.getDate() === now.getDate() &&
      resDate.getMonth() === now.getMonth() &&
      resDate.getFullYear() === now.getFullYear();

    if (isToday) {
      return { label: 'Today', isPast: false, isSoon: false };
    }
    return { label: 'Upcoming', isPast: false, isSoon: false };
  }

  // View & Mode State
  viewMode = signal<'CANVAS' | 'GRID'>('CANVAS');
  isDesignMode = signal<boolean>(false);
  snapToGrid = signal<boolean>(true);
  zoom = signal<number>(1);

  // Places / Sections State
  customPlaces = signal<string[]>([]);
  selectedSection = signal<string>('ALL');
  showAddPlaceModal = signal<boolean>(false);
  newPlaceName = signal<string>('');

  places = computed(() => {
    const list: string[] = [];
    // 1. Live sections from tables in the restaurant
    for (const t of this.tables()) {
      const sec = (t.section || '').trim();
      if (sec && !list.includes(sec)) {
        list.push(sec);
      }
    }
    // 2. Custom places created by admin
    for (const cp of this.customPlaces()) {
      const sec = cp.trim();
      if (sec && !list.includes(sec)) {
        list.push(sec);
      }
    }
    // 3. Fallback standard place only if completely empty
    if (list.length === 0) {
      list.push('Main Hall');
    }
    return list;
  });

  tablesFromOtherPlaces = computed(() => {
    const current = this.selectedSection();
    if (current === 'ALL') return [];
    return this.tables().filter((t) => t.section !== current);
  });

  // Table Inspector Drawer State
  selectedTableForInspector = signal<Table | null>(null);

  // Section Boxes (Room Zones) State
  sectionBoxes = signal<Record<string, { x: number; y: number; width: number; height: number }>>(
    {},
  );
  draggingSectionName = signal<string | null>(null);

  // Resizing state
  resizingSectionName = signal<string | null>(null);
  resizingSectionHandle = signal<'se' | 'e' | 's' | null>(null);
  resizingTableId = signal<string | null>(null);

  private dragInitialW = 0;
  private dragInitialH = 0;

  // Canvas Section Creation Modal State
  showCanvasCreateSectionModal = signal<boolean>(false);
  canvasNewSectionName = signal<string>('');
  canvasNewSectionIcon = signal<string>('ph-fork-knife');
  canvasNewSectionWidth = signal<number>(620);
  canvasNewSectionHeight = signal<number>(420);

  // Canvas Fixture Creation Modal State
  showCanvasCreateFixtureModal = signal<boolean>(false);
  canvasNewFixtureType = signal<FloorElementType>('CASHIER');
  canvasNewFixtureLabel = signal<string>('Cashier / Billing Counter');
  canvasNewFixtureSection = signal<string>('ALL');
  canvasNewFixtureIcon = signal<string>('ph-cash-register');

  // Computed layout for section boxes to prevent any overlap
  computedSectionLayout = computed(() => {
    const placesList = this.places();
    const boxes = this.sectionBoxes();
    const layout: Record<string, { x: number; y: number; width: number; height: number }> = {};

    // Track column bottom positions: col 0 at left 40px, col 1 at left 700px
    const colStarts = [40, 700];
    const colY = [60, 60];

    placesList.forEach((sec, idx) => {
      const explicitBox = boxes[sec];
      // Compute estimated dimensions based on table count
      const tables = this.tables().filter(
        (t) => (t.section || 'Main Hall').trim().toLowerCase() === sec.trim().toLowerCase(),
      );
      const rowCount = Math.max(1, Math.ceil(tables.length / 3));
      const width =
        explicitBox?.width && !isNaN(explicitBox.width) ? Math.max(380, explicitBox.width) : 620;
      const height =
        explicitBox?.height && !isNaN(explicitBox.height)
          ? Math.max(260, explicitBox.height)
          : Math.max(420, 65 + rowCount * 155 + 50);

      if (
        explicitBox &&
        explicitBox.x !== undefined &&
        explicitBox.y !== undefined &&
        !isNaN(explicitBox.x) &&
        !isNaN(explicitBox.y)
      ) {
        layout[sec] = {
          x: explicitBox.x,
          y: explicitBox.y,
          width,
          height,
        };
      } else {
        // Automatically place in alternating columns with guaranteed non-overlapping Y gap
        const col = idx % 2;
        const x = colStarts[col];
        const y = colY[col];
        layout[sec] = { x, y, width, height };
        colY[col] += height + 40; // 40px vertical clearance
      }
    });

    return layout;
  });

  // Canvas Layout Persistence
  tableCoords = signal<
    Record<
      string,
      {
        x: number;
        y: number;
        relX?: number;
        relY?: number;
        shape?: 'ROUND' | 'RECT';
        width?: number;
        height?: number;
      }
    >
  >({});
  floorElements = signal<FloorElement[]>([]);

  // Dragging State
  draggingTableId = signal<string | null>(null);
  draggingElementId = signal<string | null>(null);
  private dragStartX = 0;
  private dragStartY = 0;
  private dragInitialX = 0;
  private dragInitialY = 0;
  private hasDragged = false;

  constructor() {
    effect(() => {
      const tbls = this.tables();
      if (tbls && tbls.length > 0) {
        this.ensureNonOverlappingCoords();
      }
    });
  }

  // Add Table Form State
  showAddModal = false;
  newTableNumber = '';
  newTableCapacity = 4;
  newTableSection: TableSection = 'Main Hall';
  newTableStatus: TableStatus = 'AVAILABLE';
  newTableShape: 'ROUND' | 'RECT' = 'ROUND';

  tableToDelete: Table | null = null;
  activeQrTable: Table | null = null;
  qrDataUrl: string | null = null;
  activeQrFullUrl = signal<string>('');

  showServerAdminModal = signal<boolean>(false);
  serverAdminPassword = signal<string>('');
  serverAdminError = signal<string>('');
  targetServerOrder = signal<Order | null>(null);
  selectedServerStaffId = signal<string | null>(null);

  visibleSections = computed(() => {
    const sel = this.selectedSection();
    if (sel === 'ALL') return this.places();
    return [sel];
  });

  filteredTables = computed(() => {
    if (this.selectedSection() === 'ALL') return this.tables();
    return this.tables().filter((t) => t.section === this.selectedSection());
  });

  visibleFloorElements = computed(() => {
    const sel = this.selectedSection();
    if (sel === 'ALL') return this.floorElements();
    return this.floorElements().filter((e) => {
      const s = (e.section || '').trim().toLowerCase();
      return s === sel.trim().toLowerCase() || s === 'all' || !s;
    });
  });

  ngOnInit(): void {
    this.dataService.loadStaff();
    this.loadCustomPlaces();
    this.loadFloorElements();
    this.loadSavedCoords();
    this.loadSectionBoxes();
  }

  // --- Places & Sections Management ---
  loadCustomPlaces(): void {
    try {
      const saved = localStorage.getItem('restaurant_floorplan_custom_places');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.customPlaces.set(parsed);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved places', e);
    }
  }

  saveCustomPlaces(list: string[]): void {
    this.customPlaces.set(list);
    try {
      localStorage.setItem('restaurant_floorplan_custom_places', JSON.stringify(list));
    } catch (e) {}
  }

  isCustomPlace(place: string): boolean {
    return this.customPlaces().includes(place);
  }

  selectPlace(place: string): void {
    this.selectedSection.set(place);
    this.selectedTableForInspector.set(null);
  }

  openAddPlaceModal(): void {
    this.newPlaceName.set('');
    this.showAddPlaceModal.set(true);
  }

  saveNewPlace(): void {
    const name = this.newPlaceName().trim();
    if (!name) return;
    if (this.places().includes(name)) {
      this.toastService.warning(`Place "${name}" already exists`);
      this.selectedSection.set(name);
      this.showAddPlaceModal.set(false);
      return;
    }
    const updated = [...this.customPlaces(), name];
    this.saveCustomPlaces(updated);
    this.selectedSection.set(name);
    this.showAddPlaceModal.set(false);
    this.toastService.success(`Created place "${name}". You can now add and arrange tables here.`);
  }

  deletePlace(place: string): void {
    if (this.countByPlace(place) > 0) {
      this.toastService.warning(`Cannot delete place "${place}" because it contains tables.`);
      return;
    }
    const updated = this.customPlaces().filter((p) => p !== place);
    this.saveCustomPlaces(updated);
    if (this.selectedSection() === place) {
      this.selectedSection.set('ALL');
    }
    this.toastService.info(`Place "${place}" removed.`);
  }

  countByPlace(place: string): number {
    return this.tables().filter((t) => t.section === place).length;
  }

  countByStatus(status: TableStatus): number {
    return this.tables().filter((t) => t.status === status).length;
  }

  // --- Table Coordinates & Canvas Layout ---
  loadSavedCoords(): void {
    try {
      const saved = localStorage.getItem('restaurant_table_coords');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          this.tableCoords.set(parsed);
          return;
        }
      }
    } catch (e) {}
    this.tableCoords.set({});
  }

  saveCoords(coords: Record<string, { x: number; y: number; shape?: 'ROUND' | 'RECT' }>): void {
    this.tableCoords.set({ ...coords });
    try {
      localStorage.setItem('restaurant_table_coords', JSON.stringify(coords));
    } catch (e) {}
  }

  // --- Section Boxes (Room Zones) Management ---
  loadSectionBoxes(): void {
    try {
      const saved = localStorage.getItem('restaurant_section_boxes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          this.sectionBoxes.set(parsed);
          return;
        }
      }
    } catch (e) {}
    this.sectionBoxes.set({});
  }

  saveSectionBoxes(
    boxes: Record<string, { x: number; y: number; width: number; height: number }>,
  ): void {
    this.sectionBoxes.set({ ...boxes });
    try {
      localStorage.setItem('restaurant_section_boxes', JSON.stringify(boxes));
    } catch (e) {}
  }

  getTablesBySection(section: string): Table[] {
    return this.tables().filter((t) => {
      const s = (t.section || 'Main Hall').trim().toLowerCase();
      return s === section.trim().toLowerCase();
    });
  }

  getOccupiedCountBySection(section: string): number {
    return this.tables().filter((t) => {
      const s = (t.section || 'Main Hall').trim().toLowerCase();
      return s === section.trim().toLowerCase() && t.status === 'OCCUPIED';
    }).length;
  }

  getFloorElementsBySection(section: string): FloorElement[] {
    return this.floorElements().filter((e) => e.section === section);
  }

  getSectionIcon(section: string): string {
    const s = (section || '').toLowerCase();
    if (s.includes('terrace') || s.includes('garden') || s.includes('patio')) return 'ph-plant';
    if (s.includes('bar') || s.includes('drink') || s.includes('cocktail')) return 'ph-martini';
    if (s.includes('vip') || s.includes('lounge')) return 'ph-crown';
    if (s.includes('family')) return 'ph-users-three';
    return 'ph-fork-knife';
  }

  getSectionBoxX(section: string): number {
    const layout = this.computedSectionLayout();
    if (layout[section] && layout[section].x !== undefined) return layout[section].x;
    const box = this.sectionBoxes()[section];
    if (box && box.x !== undefined && !isNaN(box.x)) return box.x;
    const idx = Math.max(0, this.places().indexOf(section));
    const col = idx % 2;
    return 40 + col * 700;
  }

  getSectionBoxY(section: string): number {
    const layout = this.computedSectionLayout();
    if (layout[section] && layout[section].y !== undefined) return layout[section].y;
    const box = this.sectionBoxes()[section];
    if (box && box.y !== undefined && !isNaN(box.y)) return box.y;
    const idx = Math.max(0, this.places().indexOf(section));
    const row = Math.floor(idx / 2);
    return 60 + row * 480;
  }

  getSectionBoxWidth(section: string): number {
    const layout = this.computedSectionLayout();
    if (layout[section] && layout[section].width !== undefined) return layout[section].width;
    const box = this.sectionBoxes()[section];
    if (box && box.width !== undefined && !isNaN(box.width)) return Math.max(380, box.width);
    const tables = this.getTablesBySection(section);
    let maxX = 450;
    for (const t of tables) {
      const tx = this.getTableRelX(t);
      const tw = this.getTableWidth(t);
      if (tx + tw + 20 > maxX) maxX = tx + tw + 20;
    }
    return Math.max(480, maxX + 20);
  }

  getSectionBoxHeight(section: string): number {
    const layout = this.computedSectionLayout();
    if (layout[section] && layout[section].height !== undefined) return layout[section].height;
    const box = this.sectionBoxes()[section];
    if (box && box.height !== undefined && !isNaN(box.height)) return Math.max(260, box.height);
    const tables = this.getTablesBySection(section);
    let maxY = 220;
    for (const t of tables) {
      const ty = this.getTableRelY(t);
      const th = this.getTableHeight(t);
      if (ty + th + 20 > maxY) maxY = ty + th + 20;
    }
    return Math.max(320, maxY + 20);
  }

  getTableWidth(table: Table): number {
    const c = this.tableCoords()[table.id] || this.tableCoords()[table.number];
    if (c?.width && !isNaN(c.width) && c.width >= 60) return c.width;
    const shape = this.getTableShape(table);
    return shape === 'ROUND' ? 96 : 136;
  }

  getTableHeight(table: Table): number {
    const c = this.tableCoords()[table.id] || this.tableCoords()[table.number];
    const shape = this.getTableShape(table);
    if (shape === 'ROUND') {
      return this.getTableWidth(table);
    }
    if (c?.height && !isNaN(c.height) && c.height >= 60) return c.height;
    return 96;
  }

  getTableSurfaceWidth(table: Table): number {
    return Math.max(48, this.getTableWidth(table) - 16);
  }

  getTableSurfaceHeight(table: Table): number {
    return Math.max(48, this.getTableHeight(table) - 16);
  }

  updateTableSize(table: Table, width: number, height?: number): void {
    const shape = this.getTableShape(table);
    const safeWidth = Math.max(64, Math.min(300, width));
    const safeHeight =
      shape === 'ROUND' ? safeWidth : Math.max(64, Math.min(220, height ?? safeWidth));
    const coords = { ...this.tableCoords() };
    coords[table.id] = {
      ...coords[table.id],
      relX: this.getTableRelX(table),
      relY: this.getTableRelY(table),
      x: this.getTableRelX(table),
      y: this.getTableRelY(table),
      shape,
      width: safeWidth,
      height: safeHeight,
    };
    this.saveCoords(coords);
    if (this.selectedTableForInspector()?.id === table.id) {
      this.selectedTableForInspector.set({
        ...this.selectedTableForInspector()!,
        width: safeWidth,
        height: safeHeight,
      });
    }
    this.toastService.success(
      `Table ${table.number} size updated (${safeWidth} × ${safeHeight}px)`,
    );
  }

  adjustSectionSize(section: string, deltaW: number, deltaH: number): void {
    const currW = this.getSectionBoxWidth(section);
    const currH = this.getSectionBoxHeight(section);
    const newW = Math.max(380, Math.min(2000, currW + deltaW));
    const newH = Math.max(260, Math.min(1500, currH + deltaH));
    const boxes = { ...this.sectionBoxes() };
    boxes[section] = {
      x: this.getSectionBoxX(section),
      y: this.getSectionBoxY(section),
      width: newW,
      height: newH,
    };
    this.saveSectionBoxes(boxes);
    this.toastService.info(`Room ${section} resized to ${newW} × ${newH}px`);
  }

  onTableWidthSliderInput(table: Table, event: Event): void {
    const val = Number((event.target as HTMLInputElement).value);
    if (!isNaN(val)) {
      this.updateTableSize(table, val, this.getTableHeight(table));
    }
  }

  onTableHeightSliderInput(table: Table, event: Event): void {
    const val = Number((event.target as HTMLInputElement).value);
    if (!isNaN(val)) {
      this.updateTableSize(table, this.getTableWidth(table), val);
    }
  }

  getTableRelX(table: Table): number {
    const c = this.tableCoords()[table.id] || this.tableCoords()[table.number];
    if (c?.relX !== undefined && !isNaN(c.relX)) return c.relX;
    if (c?.x !== undefined && !isNaN(c.x) && c.x < 500) return c.x;
    const secTables = this.getTablesBySection(table.section);
    const idx = Math.max(
      0,
      secTables.findIndex((t) => t.id === table.id || t.number === table.number),
    );
    const col = idx % 3;
    return 35 + col * 175;
  }

  getTableRelY(table: Table): number {
    const c = this.tableCoords()[table.id] || this.tableCoords()[table.number];
    if (c?.relY !== undefined && !isNaN(c.relY)) return c.relY;
    if (c?.y !== undefined && !isNaN(c.y) && c.y < 350) return c.y;
    const secTables = this.getTablesBySection(table.section);
    const idx = Math.max(
      0,
      secTables.findIndex((t) => t.id === table.id || t.number === table.number),
    );
    const row = Math.floor(idx / 3);
    return 65 + row * 155;
  }

  getTablePosX(table: Table): number {
    return this.getSectionBoxX(table.section) + this.getTableRelX(table);
  }

  getTablePosY(table: Table): number {
    return this.getSectionBoxY(table.section) + this.getTableRelY(table);
  }

  ensureNonOverlappingCoords(): void {
    const coords = { ...this.tableCoords() };
    const all = this.tables();
    let changed = false;

    // Check non-overlapping coordinates within each section box
    for (const place of this.places()) {
      const secTables = all.filter((t) => t.section === place);
      const occupiedInSec = new Set<string>();

      secTables.forEach((t, i) => {
        let c = coords[t.id] || coords[t.number];
        const defaultCol = i % 3;
        const defaultRow = Math.floor(i / 3);
        const defaultRelX = 35 + defaultCol * 175;
        const defaultRelY = 65 + defaultRow * 155;

        if (!c || c.relX === undefined || c.relY === undefined || isNaN(c.relX) || isNaN(c.relY)) {
          const rx = c?.x !== undefined && !isNaN(c.x) && c.x < 500 ? c.x : defaultRelX;
          const ry = c?.y !== undefined && !isNaN(c.y) && c.y < 350 ? c.y : defaultRelY;
          c = {
            ...c,
            x: rx,
            y: ry,
            relX: rx,
            relY: ry,
            shape: c?.shape || (t.capacity > 4 ? 'RECT' : 'ROUND'),
          };
          coords[t.id] = c;
          changed = true;
        }

        const posKey = `${c.relX},${c.relY}`;
        if (occupiedInSec.has(posKey)) {
          c = { ...c, relX: defaultRelX, relY: defaultRelY, x: defaultRelX, y: defaultRelY };
          coords[t.id] = c;
          changed = true;
        }
        occupiedInSec.add(`${c.relX},${c.relY}`);
      });
    }

    if (changed) {
      this.tableCoords.set(coords);
      try {
        localStorage.setItem('restaurant_table_coords', JSON.stringify(coords));
      } catch (e) {}
    }
  }

  getTableShape(table: Table): 'ROUND' | 'RECT' {
    const c = this.tableCoords()[table.id] || this.tableCoords()[table.number];
    if (c?.shape) return c.shape;
    if (table.shape) return table.shape;
    return table.capacity > 4 ? 'RECT' : 'ROUND';
  }

  // --- Floor Elements (Fixtures) ---
  loadFloorElements(): void {
    try {
      const saved = localStorage.getItem('restaurant_floor_elements');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.floorElements.set(parsed);
          return;
        }
      }
    } catch (e) {}

    const defaults: FloorElement[] = [
      {
        id: 'elem-entry-main',
        type: 'ENTRANCE',
        label: 'Main Entrance',
        section: 'ALL',
        posX: 40,
        posY: 20,
      },
      {
        id: 'elem-kitchen-main',
        type: 'KITCHEN',
        label: 'Kitchen Pass',
        section: 'ALL',
        posX: 220,
        posY: 20,
      },
      {
        id: 'elem-bar-main',
        type: 'BAR',
        label: 'Beverage Bar',
        section: 'ALL',
        posX: 400,
        posY: 20,
      },
      {
        id: 'elem-restroom-main',
        type: 'RESTROOM',
        label: 'Restrooms',
        section: 'ALL',
        posX: 580,
        posY: 20,
      },
    ];
    this.saveFloorElements(defaults);
  }

  saveFloorElements(elements: FloorElement[]): void {
    this.floorElements.set([...elements]);
    try {
      localStorage.setItem('restaurant_floor_elements', JSON.stringify(elements));
    } catch (e) {}
  }

  addFloorElement(type: FloorElementType): void {
    const sec = this.selectedSection();
    const count = this.floorElements().length;
    const labels: Record<FloorElementType, string> = {
      ENTRANCE: 'Entrance Door',
      KITCHEN: 'Kitchen Dispatch',
      BAR: 'Beverage Bar',
      RESTROOM: 'Restrooms',
      WALL: 'Partition / Plant',
      STAGE: 'Stage / DJ Booth',
      CASHIER: 'Cashier / Billing Counter',
      WINDOW: 'Window / Balcony',
      BUFFET: 'Buffet Counter',
      STAIRS: 'Stairs / Elevator',
      CUSTOM: 'Custom Fixture',
    };
    const newElem: FloorElement = {
      id: `elem-${Date.now().toString().slice(-5)}`,
      type,
      label: labels[type] || 'Floor Fixture',
      section: sec,
      posX: 40 + (count % 4) * 180,
      posY: 20 + Math.floor(count / 4) * 50,
    };
    const updated = [...this.floorElements(), newElem];
    this.saveFloorElements(updated);
    this.toastService.success(`Added ${newElem.label}. Drag to place it anywhere on the canvas.`);
  }

  removeFloorElement(id: string): void {
    const updated = this.floorElements().filter((e) => e.id !== id);
    this.saveFloorElements(updated);
    this.toastService.info('Fixture removed');
  }

  getElementIcon(elem: FloorElement | FloorElementType): string {
    if (typeof elem === 'object' && elem.icon) return elem.icon;
    const type = typeof elem === 'object' ? elem.type : elem;
    switch (type) {
      case 'ENTRANCE':
        return 'ph-door';
      case 'KITCHEN':
        return 'ph-cooking-pot';
      case 'BAR':
        return 'ph-martini';
      case 'RESTROOM':
        return 'ph-toilet';
      case 'WALL':
        return 'ph-plant';
      case 'STAGE':
        return 'ph-speaker-high';
      case 'CASHIER':
        return 'ph-cash-register';
      case 'WINDOW':
        return 'ph-sun-dim';
      case 'BUFFET':
        return 'ph-bowl-food';
      case 'STAIRS':
        return 'ph-stairs';
      case 'CUSTOM':
        return 'ph-cube';
      default:
        return 'ph-square';
    }
  }

  // --- Canvas Creation Modals (Sections & Fixtures) ---
  openCanvasCreateSectionModal(): void {
    this.canvasNewSectionName.set('');
    this.canvasNewSectionIcon.set('ph-fork-knife');
    this.canvasNewSectionWidth.set(620);
    this.canvasNewSectionHeight.set(420);
    this.showCanvasCreateSectionModal.set(true);
  }

  submitCanvasCreateSection(): void {
    const name = this.canvasNewSectionName().trim();
    if (!name) {
      this.toastService.warning('Please enter a section or room name');
      return;
    }
    if (this.places().some((p) => p.trim().toLowerCase() === name.toLowerCase())) {
      this.toastService.warning(`Section "${name}" already exists`);
      this.selectedSection.set(name);
      this.showCanvasCreateSectionModal.set(false);
      return;
    }

    const updatedPlaces = [...this.customPlaces(), name];
    this.saveCustomPlaces(updatedPlaces);

    const count = this.places().length;
    const col = count % 2;
    const colX = col === 0 ? 40 : 700;
    let maxY = 60;
    for (const p of this.places()) {
      const bX = this.getSectionBoxX(p);
      if (Math.abs(bX - colX) < 100) {
        const bY = this.getSectionBoxY(p);
        const bH = this.getSectionBoxHeight(p);
        if (bY + bH + 40 > maxY) maxY = bY + bH + 40;
      }
    }

    const boxes = { ...this.sectionBoxes() };
    boxes[name] = {
      x: colX,
      y: maxY,
      width: this.canvasNewSectionWidth(),
      height: this.canvasNewSectionHeight(),
    };
    this.saveSectionBoxes(boxes);

    this.showCanvasCreateSectionModal.set(false);
    this.toastService.success(
      `Created "${name}" (${this.canvasNewSectionWidth()} × ${this.canvasNewSectionHeight()}px). You can now add tables and fixtures!`,
    );
  }

  openCanvasCreateFixtureModal(type?: FloorElementType): void {
    const t = type || 'CASHIER';
    this.canvasNewFixtureType.set(t);
    const defaultLabels: Record<FloorElementType, string> = {
      ENTRANCE: 'Entrance Door',
      KITCHEN: 'Kitchen Pass',
      BAR: 'Beverage Bar',
      RESTROOM: 'Restrooms',
      WALL: 'Partition / Planter',
      STAGE: 'Live Music / DJ Stage',
      CASHIER: 'Cashier / Billing Counter',
      WINDOW: 'Glass Window Wall',
      BUFFET: 'Buffet Station',
      STAIRS: 'Staircase / Elevator',
      CUSTOM: 'Custom Fixture',
    };
    this.canvasNewFixtureLabel.set(defaultLabels[t] || 'Floor Element');
    this.canvasNewFixtureSection.set(
      this.selectedSection() === 'ALL' ? 'ALL' : this.selectedSection(),
    );
    this.canvasNewFixtureIcon.set(this.getElementIcon(t));
    this.showCanvasCreateFixtureModal.set(true);
  }

  submitCanvasCreateFixture(): void {
    const label = this.canvasNewFixtureLabel().trim();
    if (!label) {
      this.toastService.warning('Please enter a label for this figure');
      return;
    }

    const count = this.floorElements().length;
    const type = this.canvasNewFixtureType();
    const newElem: FloorElement = {
      id: `elem-${Date.now().toString().slice(-6)}`,
      type,
      label,
      section: this.canvasNewFixtureSection(),
      posX: 40 + (count % 5) * 180,
      posY: 30 + Math.floor(count / 5) * 60,
      icon: this.canvasNewFixtureIcon(),
    };

    const updated = [...this.floorElements(), newElem];
    this.saveFloorElements(updated);
    this.showCanvasCreateFixtureModal.set(false);
    this.toastService.success(`Added "${label}" to floor plan. Drag to place it anywhere.`);
  }

  // --- Pointer & Drag Handlers ---
  onCanvasPointerDownSectionResize(
    e: PointerEvent,
    section: string,
    handle: 'se' | 'e' | 's',
  ): void {
    if (!this.isDesignMode()) return;
    e.stopPropagation();
    this.hasDragged = false;
    this.resizingSectionName.set(section);
    this.resizingSectionHandle.set(handle);
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragInitialW = this.getSectionBoxWidth(section);
    this.dragInitialH = this.getSectionBoxHeight(section);
  }

  onCanvasPointerDownTableResize(e: PointerEvent, table: Table): void {
    if (!this.isDesignMode()) return;
    e.stopPropagation();
    this.hasDragged = false;
    this.resizingTableId.set(table.id);
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragInitialW = this.getTableWidth(table);
    this.dragInitialH = this.getTableHeight(table);
  }

  onCanvasPointerDownSection(e: PointerEvent, section: string): void {
    if (!this.isDesignMode()) return;
    this.hasDragged = false;
    this.draggingSectionName.set(section);
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragInitialX = this.getSectionBoxX(section);
    this.dragInitialY = this.getSectionBoxY(section);
  }

  onCanvasPointerDownTable(e: PointerEvent, table: Table): void {
    if (!this.isDesignMode()) return;
    this.hasDragged = false;
    this.draggingTableId.set(table.id);
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragInitialX = this.getTableRelX(table);
    this.dragInitialY = this.getTableRelY(table);
  }

  onCanvasPointerDownElement(e: PointerEvent, elem: FloorElement): void {
    if (!this.isDesignMode()) return;
    this.hasDragged = false;
    this.draggingElementId.set(elem.id);
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragInitialX = elem.posX;
    this.dragInitialY = elem.posY;
  }

  onCanvasPointerMove(e: PointerEvent): void {
    const resizeSec = this.resizingSectionName();
    const resizeTblId = this.resizingTableId();
    const secName = this.draggingSectionName();
    const tableId = this.draggingTableId();
    const elemId = this.draggingElementId();
    if (!resizeSec && !resizeTblId && !secName && !tableId && !elemId) return;

    this.hasDragged = true;
    const deltaX = (e.clientX - this.dragStartX) / this.zoom();
    const deltaY = (e.clientY - this.dragStartY) / this.zoom();

    // 1. Resizing section box
    if (resizeSec) {
      const handle = this.resizingSectionHandle() || 'se';
      let newW = this.dragInitialW;
      let newH = this.dragInitialH;

      if (handle === 'se' || handle === 'e') {
        newW = Math.max(380, Math.min(2200, this.dragInitialW + deltaX));
      }
      if (handle === 'se' || handle === 's') {
        newH = Math.max(260, Math.min(1600, this.dragInitialH + deltaY));
      }

      if (this.snapToGrid()) {
        newW = Math.round(newW / 20) * 20;
        newH = Math.round(newH / 20) * 20;
      }

      const boxes = { ...this.sectionBoxes() };
      boxes[resizeSec] = {
        x: this.getSectionBoxX(resizeSec),
        y: this.getSectionBoxY(resizeSec),
        width: newW,
        height: newH,
      };
      this.sectionBoxes.set(boxes);
      return;
    }

    // 2. Resizing dining table
    if (resizeTblId) {
      const table = this.tables().find((t) => t.id === resizeTblId);
      const shape = table ? this.getTableShape(table) : 'ROUND';

      let newW = Math.max(64, Math.min(280, this.dragInitialW + deltaX));
      let newH = shape === 'ROUND' ? newW : Math.max(64, Math.min(220, this.dragInitialH + deltaY));

      if (this.snapToGrid()) {
        newW = Math.round(newW / 10) * 10;
        newH = shape === 'ROUND' ? newW : Math.round(newH / 10) * 10;
      }

      const coords = { ...this.tableCoords() };
      coords[resizeTblId] = {
        ...coords[resizeTblId],
        relX: this.getTableRelX(table!),
        relY: this.getTableRelY(table!),
        x: this.getTableRelX(table!),
        y: this.getTableRelY(table!),
        shape,
        width: newW,
        height: newH,
      };
      this.tableCoords.set(coords);
      return;
    }

    // 3. Moving entire section
    if (secName) {
      let newX = Math.max(10, Math.min(3000, this.dragInitialX + deltaX));
      let newY = Math.max(10, Math.min(3000, this.dragInitialY + deltaY));
      if (this.snapToGrid()) {
        newX = Math.round(newX / 20) * 20;
        newY = Math.round(newY / 20) * 20;
      }
      const boxes = { ...this.sectionBoxes() };
      boxes[secName] = {
        x: newX,
        y: newY,
        width: this.getSectionBoxWidth(secName),
        height: this.getSectionBoxHeight(secName),
      };
      this.sectionBoxes.set(boxes);
      return;
    }

    // 4. Moving table
    if (tableId) {
      const table = this.tables().find((t) => t.id === tableId);
      const secWidth = table ? this.getSectionBoxWidth(table.section) : 600;
      const secHeight = table ? this.getSectionBoxHeight(table.section) : 420;
      const tblWidth = table ? this.getTableWidth(table) : 96;
      const tblHeight = table ? this.getTableHeight(table) : 96;

      let newX = Math.max(10, Math.min(secWidth - tblWidth - 10, this.dragInitialX + deltaX));
      let newY = Math.max(50, Math.min(secHeight - tblHeight - 10, this.dragInitialY + deltaY));
      if (this.snapToGrid()) {
        newX = Math.round(newX / 20) * 20;
        newY = Math.round(newY / 20) * 20;
      }
      const coords = { ...this.tableCoords() };
      coords[tableId] = {
        ...coords[tableId],
        relX: newX,
        relY: newY,
        x: newX,
        y: newY,
        shape: coords[tableId]?.shape || 'ROUND',
        width: tblWidth,
        height: tblHeight,
      };
      this.tableCoords.set(coords);
      return;
    }

    // 5. Moving floor fixture
    if (elemId) {
      let newX = Math.max(10, Math.min(2500, this.dragInitialX + deltaX));
      let newY = Math.max(10, Math.min(2000, this.dragInitialY + deltaY));
      if (this.snapToGrid()) {
        newX = Math.round(newX / 20) * 20;
        newY = Math.round(newY / 20) * 20;
      }
      const elems = this.floorElements().map((el) =>
        el.id === elemId ? { ...el, posX: newX, posY: newY } : el,
      );
      this.floorElements.set(elems);
    }
  }

  resolveSectionCollisions(targetSection: string): void {
    const boxes = { ...this.sectionBoxes() };
    const allSecs = this.places();
    const targetBox = boxes[targetSection];
    if (!targetBox) return;

    const SAFE_GAP = 40; // minimum separation buffer in pixels

    for (const otherSec of allSecs) {
      if (otherSec === targetSection) continue;
      const otherBox = boxes[otherSec];
      if (!otherBox) continue;

      // Check AABB overlap between target and other
      const targetRight = targetBox.x + targetBox.width;
      const targetBottom = targetBox.y + targetBox.height;
      const otherRight = otherBox.x + otherBox.width;
      const otherBottom = otherBox.y + otherBox.height;

      const overlapX = Math.min(targetRight, otherRight) - Math.max(targetBox.x, otherBox.x);
      const overlapY = Math.min(targetBottom, otherBottom) - Math.max(targetBox.y, otherBox.y);

      if (overlapX > 0 && overlapY > 0) {
        // They are overlapping! Separate otherBox away from targetBox with safe distance
        if (overlapX < overlapY) {
          // Push horizontally
          if (targetBox.x < otherBox.x) {
            otherBox.x = targetRight + SAFE_GAP;
          } else {
            otherBox.x = Math.max(10, targetBox.x - otherBox.width - SAFE_GAP);
          }
        } else {
          // Push vertically
          if (targetBox.y < otherBox.y) {
            otherBox.y = targetBottom + SAFE_GAP;
          } else {
            otherBox.y = Math.max(60, targetBox.y - otherBox.height - SAFE_GAP);
          }
        }
        boxes[otherSec] = { ...otherBox };
      }
    }

    this.sectionBoxes.set(boxes);
  }

  onCanvasPointerUp(): void {
    const secResized = this.resizingSectionName();
    if (secResized) {
      this.resolveSectionCollisions(secResized);
      this.saveSectionBoxes(this.sectionBoxes());
      this.resizingSectionName.set(null);
      this.resizingSectionHandle.set(null);
    }
    const tblResized = this.resizingTableId();
    if (tblResized) {
      this.saveCoords(this.tableCoords());
      this.resizingTableId.set(null);
    }
    const secDragged = this.draggingSectionName();
    if (secDragged) {
      this.resolveSectionCollisions(secDragged);
      this.saveSectionBoxes(this.sectionBoxes());
      this.draggingSectionName.set(null);
    }
    if (this.draggingTableId()) {
      this.saveCoords(this.tableCoords());
      this.draggingTableId.set(null);
    }
    if (this.draggingElementId()) {
      this.saveFloorElements(this.floorElements());
      this.draggingElementId.set(null);
    }
  }

  onCanvasBackgroundClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.classList.contains('floor-canvas') || target.classList.contains('canvas-viewport')) {
      this.selectedTableForInspector.set(null);
    }
  }

  selectTable(table: Table): void {
    if (this.hasDragged) return;
    this.selectedTableForInspector.set(table);
  }

  // --- Inspector & Table Actions ---
  toggleTableShape(table: Table): void {
    const current = this.getTableShape(table);
    const next: 'ROUND' | 'RECT' = current === 'ROUND' ? 'RECT' : 'ROUND';
    const coords = { ...this.tableCoords() };
    coords[table.id] = {
      ...coords[table.id],
      relX: this.getTableRelX(table),
      relY: this.getTableRelY(table),
      x: this.getTableRelX(table),
      y: this.getTableRelY(table),
      shape: next,
    };
    this.saveCoords(coords);
    this.toastService.info(
      `Table ${table.number} set to ${next === 'ROUND' ? 'Round' : 'Rectangle'}`,
    );
  }

  reassignTableSection(table: Table, newSection: string): void {
    if (table.section === newSection) return;
    const updated = this.mock
      .tables()
      .map((t) => (t.id === table.id ? { ...t, section: newSection } : t));
    this.mock.tables.set(updated);
    this.mock.saveLocal('tables', updated);

    // Give it a neat non-overlapping spot in the destination section box
    const coords = { ...this.tableCoords() };
    const secTables = updated.filter((t) => t.section === newSection);
    const idx = Math.max(
      0,
      secTables.findIndex((t) => t.id === table.id),
    );
    const relX = 35 + (idx % 3) * 175;
    const relY = 65 + Math.floor(idx / 3) * 155;
    coords[table.id] = {
      x: relX,
      y: relY,
      relX,
      relY,
      shape: coords[table.id]?.shape || (table.capacity > 4 ? 'RECT' : 'ROUND'),
    };
    this.saveCoords(coords);

    const updatedTbl = updated.find((t) => t.id === table.id) || null;
    this.selectedTableForInspector.set(updatedTbl);
    this.toastService.success(`Assigned Table ${table.number} to ${newSection}`);
  }

  autoArrangeTables(): void {
    const sec = this.selectedSection();
    const targetTables = this.filteredTables();
    if (targetTables.length === 0) {
      this.toastService.info('No tables to arrange in this place');
      return;
    }

    const coords = { ...this.tableCoords() };
    const secBoxUpdates = { ...this.sectionBoxes() };

    // Group tables by section and arrange neatly inside each section box with non-overlapping column clearance
    const sectionsToArrange = sec === 'ALL' ? this.places() : [sec];
    const colStarts = [40, 700];
    const colY = [60, 60];

    sectionsToArrange.forEach((section, sIdx) => {
      const tablesInSection = this.tables().filter((t) => t.section === section);
      tablesInSection.forEach((t, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const relX = 35 + col * 175;
        const relY = 65 + row * 155;
        coords[t.id] = {
          x: relX,
          y: relY,
          relX,
          relY,
          shape: coords[t.id]?.shape || (t.capacity > 4 ? 'RECT' : 'ROUND'),
        };
      });

      const rowCount = Math.max(1, Math.ceil(tablesInSection.length / 3));
      const width = Math.max(620, 35 + 3 * 175 + 40);
      const height = Math.max(420, 65 + rowCount * 155 + 50);

      const col = sIdx % 2;
      const x = colStarts[col];
      const y = colY[col];
      colY[col] += height + 40;

      secBoxUpdates[section] = {
        x,
        y,
        width,
        height,
      };
    });

    this.saveCoords(coords);
    this.saveSectionBoxes(secBoxUpdates);
    this.toastService.success(
      `Neatly arranged tables into section rooms for ${sec === 'ALL' ? 'All Places' : sec}`,
    );
  }

  zoomIn(): void {
    if (this.zoom() < 1.6) {
      this.zoom.update((z) => Math.min(1.6, Math.round((z + 0.1) * 10) / 10));
    }
  }

  zoomOut(): void {
    if (this.zoom() > 0.6) {
      this.zoom.update((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10));
    }
  }

  resetZoom(): void {
    this.zoom.set(1);
  }

  // --- Core Table Operations (Preserved) ---
  onStatusChange(tableId: string, status: TableStatus): void {
    const res = this.mock.updateTableStatus(tableId, status);
    if (!res.success) {
      this.toastService.warning(res.error || 'Cannot update table status');
      this.mock.tables.set([...this.mock.tables()]);
      return;
    }
    // Update inspector view if open
    const currentIns = this.selectedTableForInspector();
    if (currentIns && currentIns.id === tableId) {
      this.selectedTableForInspector.set({ ...currentIns, status });
    }
    const targetTable = this.mock.tables().find((t) => t.id === tableId);
    const tableNum = targetTable ? targetTable.number : 'Table';
    if (status === 'OCCUPIED') {
      this.toastService.success(
        `Table ${tableNum} opened! QR digital ordering is now ACTIVE for seated guests.`,
      );
    } else if (status === 'AVAILABLE') {
      this.toastService.info(
        `Table ${tableNum} marked Available. QR ordering is LOCKED to read-only browsing.`,
      );
    } else if (status === 'DIRTY') {
      this.toastService.warning(`Table ${tableNum} set to Cleaning. QR ordering is locked.`);
    } else {
      this.toastService.success(`Table ${tableNum} status updated to ${status}`);
    }
  }

  onStaffAssign(tableId: string, staffIdStr: string): void {
    const staffId = staffIdStr && staffIdStr.trim().length > 0 ? staffIdStr : null;
    this.dataService.assignTableStaff(tableId, staffId);
    this.toastService.success('Table staff assignment updated');
  }

  isCanvasFullscreen = signal<boolean>(false);

  toggleCanvasFullscreen(): void {
    this.isCanvasFullscreen.set(!this.isCanvasFullscreen());
  }

  showCanvasSettleModal = signal<boolean>(false);
  orderToSettle = signal<Order | null>(null);
  canvasPaymentMethod = signal<'CASH' | 'UPI' | 'CARD'>('UPI');
  settleMode = signal<'FULL' | 'SPLIT'>('FULL');
  splitCount = signal<number>(2);
  isSettling = signal<boolean>(false);
  customDiscountRupees = signal<number>(0);
  selectedCouponCode = signal<string>('');
  settleDiscountMode = signal<'CUSTOM' | 'COUPON'>('CUSTOM');
  activeCoupons = computed(() =>
    this.mock.coupons ? this.mock.coupons().filter((c) => c.isActive) : [],
  );

  // Direct In-Canvas Thermal Receipt Modal State
  showThermalModal = signal<boolean>(false);
  orderForThermal = signal<Order | null>(null);

  printBillForOrder(order: Order): void {
    const freshOrd = this.mock.orders().find((o) => o.id === order.id) || order;
    if (!this.isOrderPaid(freshOrd) || freshOrd.status === 'CANCELLED') {
      this.toastService.warning('Cannot print bill for an unpaid or cancelled order.');
      return;
    }
    this.router.navigate(['/admin/billing', freshOrd.id], {
      queryParams: { from: 'canvas', preview: 'thermal' },
    });
  }

  closeThermalModal(): void {
    this.showThermalModal.set(false);
    this.orderForThermal.set(null);
  }

  // --- In-Canvas Manual Order Creation State & Methods ---
  showManualOrderModal = signal<boolean>(false);
  manualOrderTableId = signal<string>('');
  manualOrderCustomerName = signal<string>('Walk-in Guest');
  manualOrderCustomerPhone = signal<string>('');
  manualDishSearch = signal<string>('');
  manualDishCategory = signal<string>('ALL');
  manualDishDietary = signal<string>('ALL');
  manualItems: OrderItem[] = [];

  readonly selectedManualTable = computed(() => {
    const tid = this.manualOrderTableId();
    return this.tables().find((t) => t.id === tid) || null;
  });

  clearManualTray(): void {
    this.manualItems = [];
  }

  readonly filteredManualDishes = computed(() => {
    let list = this.menuItems();
    const cat = this.manualDishCategory();
    if (cat !== 'ALL') {
      list = list.filter((m) => m.categoryId === cat);
    }
    const diet = this.manualDishDietary();
    if (diet !== 'ALL') {
      list = list.filter((m) => m.dietary === diet);
    }
    const q = this.manualDishSearch().trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.description && m.description.toLowerCase().includes(q)),
      );
    }
    return list;
  });

  getItemCountInManualOrder(menuItemId: string): number {
    const item = this.manualItems.find((i) => i.menuItemId === menuItemId);
    return item ? item.quantity : 0;
  }

  getDishAvailability(dishId: string): MenuStockStatus {
    return this.mock.getMenuItemAvailability(dishId);
  }

  openManualOrderModal(table?: Table): void {
    const targetTableId = table
      ? table.id
      : this.tables().find((t) => t.status === 'AVAILABLE')?.id || (this.tables()[0]?.id ?? '');
    this.manualOrderTableId.set(targetTableId);
    this.manualOrderCustomerName.set('Walk-in Guest');
    this.manualOrderCustomerPhone.set('');
    this.manualDishSearch.set('');
    this.manualDishCategory.set('ALL');
    this.manualDishDietary.set('ALL');
    this.manualItems = [];
    this.showManualOrderModal.set(true);
  }

  closeManualOrderModal(): void {
    this.showManualOrderModal.set(false);
    this.manualItems = [];
  }

  addDishToManualOrder(dish: MenuItem): void {
    const avail = this.mock.getMenuItemAvailability(dish.id);
    if (avail === 'OUT_OF_STOCK' || !dish.isAvailable) {
      this.toastService.warning(`${dish.name} is currently out of stock.`);
      return;
    }

    const existing = this.manualItems.find((i) => i.menuItemId === dish.id);
    if (existing) {
      existing.quantity++;
      existing.itemTotal = existing.quantity * existing.unitPrice;
    } else {
      this.manualItems.push({
        id: `oi-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        menuItemId: dish.id,
        name: dish.name,
        unitPrice: dish.price,
        quantity: 1,
        itemTotal: dish.price,
        selectedVariants: [],
        selectedAddons: [],
      });
    }

    this.toastService.info(`Added ${dish.name} to order`);
  }

  updateManualItemQty(item: OrderItem, delta: number): void {
    item.quantity += delta;
    if (item.quantity <= 0) {
      this.manualItems = this.manualItems.filter((i) => i !== item);
    } else {
      item.itemTotal = item.quantity * item.unitPrice;
    }
  }

  removeManualItem(index: number): void {
    this.manualItems.splice(index, 1);
  }

  manualSubtotal(): number {
    return this.manualItems.reduce((acc, curr) => acc + curr.itemTotal, 0);
  }

  manualTax(): number {
    const cgstRate = this.restaurant()?.taxSettings?.cgstRate ?? 2.5;
    const sgstRate = this.restaurant()?.taxSettings?.sgstRate ?? 2.5;
    const totalGstRate = cgstRate + sgstRate;
    return Math.round(this.manualSubtotal() * (totalGstRate / 100) * 100) / 100;
  }

  manualTotal(): number {
    return Math.round((this.manualSubtotal() + this.manualTax()) * 100) / 100;
  }

  private isSubmittingManualOrder = false;

  submitManualOrder(): void {
    if (this.isSubmittingManualOrder) return;
    if (this.manualItems.length === 0) {
      this.toastService.warning('Please select at least one dish for the order');
      return;
    }
    this.isSubmittingManualOrder = true;
    try {
      const selectedTable = this.tables().find((t) => t.id === this.manualOrderTableId());
      if (!selectedTable) {
        this.toastService.error('Please select a dining table for this order.');
        return;
      }

      const validation = this.mock.validateOrderStockAvailability(this.manualItems);
      if (!validation.isValid) {
        this.toastService.error(`Cannot place order: ${validation.errors.join('; ')}`);
        return;
      }

      const sub = this.manualSubtotal();
      const cgstRate = this.restaurant()?.taxSettings?.cgstRate ?? 2.5;
      const sgstRate = this.restaurant()?.taxSettings?.sgstRate ?? 2.5;
      const cgstAmt = Math.round(sub * (cgstRate / 100) * 100) / 100;
      const sgstAmt = Math.round(sub * (sgstRate / 100) * 100) / 100;
      const tax = Math.round((cgstAmt + sgstAmt) * 100) / 100;
      const tot = this.manualTotal();

      const existingActiveTableOrder = this.mock
        .orders()
        .find(
          (o) =>
            (o.tableId === selectedTable.id || o.tableNumber === selectedTable.number) &&
            o.status !== 'CANCELLED' &&
            o.paymentStatus !== 'PAID' &&
            o.seatingSessionId,
        );

      const generateUuid = () =>
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });

      const assignedSessionId =
        existingActiveTableOrder?.seatingSessionId ||
        selectedTable?.currentSeatingSessionId ||
        generateUuid();

      if (!selectedTable.currentSeatingSessionId && assignedSessionId) {
        selectedTable.currentSeatingSessionId = assignedSessionId;
      }

      const orderNum = `#ORD-${Math.floor(100 + Math.random() * 900)}`;
      const orderUuid = generateUuid();

      const newOrder: Order = {
        id: orderUuid,
        orderNumber: orderNum,
        orderType: 'DINE_IN',
        restaurantSlug: 'gurukripa-dhaba',
        tableId: selectedTable.id,
        tableNumber: selectedTable.number,
        seatingSessionId: assignedSessionId,
        customerName: this.manualOrderCustomerName().trim() || 'Walk-in Guest',
        customerPhone: this.manualOrderCustomerPhone().replace(/\s+/g, '').trim() || '',
        items: [...this.manualItems],
        subtotal: sub,
        discountAmount: 0,
        taxAmount: tax,
        cgstRate,
        sgstRate,
        cgstAmount: cgstAmt,
        sgstAmount: sgstAmt,
        totalAmount: tot,
        status: 'ACCEPTED',
        paymentStatus: 'UNPAID',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timeline: [
          {
            status: 'ACCEPTED',
            timestamp: new Date().toISOString(),
            note: `Manual order created for Table ${selectedTable.number} via Floor Canvas`,
          },
        ],
      };

      // Sync to data service backend and local storage
      this.dataService.addOrder(newOrder);

      // Reserve stock for newly accepted order
      this.mock.reserveStockForOrder(newOrder.id);

      // Mark table as OCCUPIED and link order
      const updatedTables = this.mock
        .tables()
        .map((t) =>
          t.id === selectedTable.id
            ? { ...t, status: 'OCCUPIED' as const, activeOrderId: newOrder.id }
            : t,
        );
      this.mock.tables.set(updatedTables);
      this.mock.saveLocal('tables', updatedTables);
      this.mock.updateTableStatus(selectedTable.id, 'OCCUPIED');

      this.toastService.success(
        `Manual order ${newOrder.orderNumber} placed for Table ${newOrder.tableNumber}`,
      );
      this.closeManualOrderModal();
    } finally {
      this.isSubmittingManualOrder = false;
    }
  }

  openCanvasSettleModal(order: Order): void {
    this.orderToSettle.set(order);
    const defaultMethod =
      order.paymentMethod === 'CARD' ? 'CARD' : order.paymentMethod === 'CASH' ? 'CASH' : 'UPI';
    this.canvasPaymentMethod.set(defaultMethod);
    this.settleMode.set('FULL');
    this.splitCount.set(2);
    this.isSettling.set(false);
    this.customDiscountRupees.set(order.discountAmount || 0);
    this.selectedCouponCode.set(order.appliedCouponCode || '');
    this.settleDiscountMode.set(order.appliedCouponCode ? 'COUPON' : 'CUSTOM');
    this.showCanvasSettleModal.set(true);
  }

  closeCanvasSettleModal(): void {
    this.showCanvasSettleModal.set(false);
    this.orderToSettle.set(null);
    this.isSettling.set(false);
    this.customDiscountRupees.set(0);
    this.selectedCouponCode.set('');
  }

  getEffectiveDiscount(ord: Order | null): number {
    if (!ord) return 0;
    const subtotal = ord.subtotal || ord.totalAmount || 0;
    const cgstRate = this.restaurant()?.taxSettings?.cgstRate ?? 2.5;
    const sgstRate = this.restaurant()?.taxSettings?.sgstRate ?? 2.5;
    const taxRate = cgstRate + sgstRate;
    if (this.settleDiscountMode() === 'CUSTOM') {
      const tax = Math.round(subtotal * (taxRate / 100) * 100) / 100;
      const grossTotal = Math.round((subtotal + tax) * 100) / 100;
      const disc = Math.max(0, this.customDiscountRupees() || 0);
      return Math.min(grossTotal, Math.round(disc * 100) / 100);
    } else {
      const code = this.selectedCouponCode();
      if (!code) return 0;
      const coup = this.activeCoupons().find((c) => c.code.toUpperCase() === code.toUpperCase());
      if (!coup) return 0;
      if (coup.minOrderValue && subtotal < coup.minOrderValue) return 0;

      let disc = 0;
      if (coup.discountType === 'PERCENTAGE') {
        disc = (subtotal * coup.discountValue) / 100;
        if (coup.maxDiscountAmount && disc > coup.maxDiscountAmount) {
          disc = coup.maxDiscountAmount;
        }
      } else {
        disc = coup.discountValue;
      }
      return Math.min(subtotal, Math.round(disc * 100) / 100);
    }
  }

  getSettlementTax(ord: Order | null): number {
    if (!ord) return 0;
    const subtotal = ord.subtotal || ord.totalAmount || 0;
    const cgstRate = this.restaurant()?.taxSettings?.cgstRate ?? 2.5;
    const sgstRate = this.restaurant()?.taxSettings?.sgstRate ?? 2.5;
    const taxRate = cgstRate + sgstRate;
    if (this.settleDiscountMode() === 'COUPON') {
      const couponDisc = this.getEffectiveDiscount(ord);
      const taxable = Math.max(0, subtotal - couponDisc);
      return Math.round(taxable * (taxRate / 100) * 100) / 100;
    } else {
      return Math.round(subtotal * (taxRate / 100) * 100) / 100;
    }
  }

  getSettlementTotal(ord: Order | null): number {
    if (!ord) return 0;
    const subtotal = ord.subtotal || ord.totalAmount || 0;
    const tax = this.getSettlementTax(ord);
    if (this.settleDiscountMode() === 'COUPON') {
      const couponDisc = this.getEffectiveDiscount(ord);
      const taxable = Math.max(0, subtotal - couponDisc);
      return Math.round(Math.max(0, taxable + tax));
    } else {
      const grossTotal = subtotal + tax;
      const adminDisc = this.getEffectiveDiscount(ord);
      return Math.round(Math.max(0, grossTotal - adminDisc));
    }
  }

  onCustomDiscountChange(event: Event, maxLimit: number): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    if (isNaN(val) || val < 0) {
      this.customDiscountRupees.set(0);
    } else {
      this.customDiscountRupees.set(Math.min(maxLimit, Math.round(val)));
    }
    this.selectedCouponCode.set('');
  }

  applyQuickRupees(amount: number, maxLimit: number): void {
    this.settleDiscountMode.set('CUSTOM');
    this.customDiscountRupees.set(Math.min(maxLimit, amount));
    this.selectedCouponCode.set('');
  }

  applyRoundOffDiscount(ord: Order): void {
    this.settleDiscountMode.set('CUSTOM');
    const subtotal = ord.subtotal || ord.totalAmount || 0;
    const cgstRate = this.restaurant()?.taxSettings?.cgstRate ?? 2.5;
    const sgstRate = this.restaurant()?.taxSettings?.sgstRate ?? 2.5;
    const taxRate = cgstRate + sgstRate;
    const tax = Math.round(subtotal * (taxRate / 100) * 100) / 100;
    const grossTotal = Math.round((subtotal + tax) * 100) / 100;
    const roundedDown = Math.floor(grossTotal / 10) * 10;
    const neededOff = Math.max(0, Math.round((grossTotal - roundedDown) * 100) / 100);
    this.customDiscountRupees.set(neededOff);
    this.selectedCouponCode.set('');
  }

  onSelectCoupon(code: string, subtotal: number): void {
    this.selectedCouponCode.set(code);
    if (code) {
      this.customDiscountRupees.set(0);
    }
  }

  clearDiscount(): void {
    this.customDiscountRupees.set(0);
    this.selectedCouponCode.set('');
  }

  getOrderSplitBills(orderId: string): SplitBill[] {
    return this.mock.splitBills ? this.mock.splitBills().filter((b) => b.orderId === orderId) : [];
  }

  areAllSplitBillsPaid(orderId: string): boolean {
    const splits = this.getOrderSplitBills(orderId);
    return splits.length > 0 && splits.every((s) => s.paymentStatus === 'PAID');
  }

  getSplitPreviewIndices(): number[] {
    const count = this.splitCount();
    const arr: number[] = [];
    for (let i = 0; i < count; i++) arr.push(i);
    return arr;
  }

  getEqualSplitPartAmount(order: Order, index: number): number {
    const n = this.splitCount();
    const totalCents = Math.round(order.totalAmount * 100);
    const baseCents = Math.floor(totalCents / n);
    const rem = totalCents % n;
    return (baseCents + (index < rem ? 1 : 0)) / 100;
  }

  incrementSplitCount(): void {
    if (this.splitCount() < 6) {
      this.splitCount.update((c) => c + 1);
    }
  }

  decrementSplitCount(): void {
    if (this.splitCount() > 2) {
      this.splitCount.update((c) => c - 1);
    }
  }

  confirmCreateSplit(order: Order): void {
    this.isSettling.set(true);
    const res = this.mock.splitOrderEqual({
      orderId: order.id,
      splitCount: this.splitCount(),
    });
    this.isSettling.set(false);

    if (res.success) {
      this.toastService.success(
        `Order ${order.orderNumber} successfully divided into ${this.splitCount()} equal bills.`,
      );
      const updatedOrder = this.mock.orders().find((o) => o.id === order.id);
      if (updatedOrder) {
        this.orderToSettle.set(updatedOrder);
      }
    } else {
      this.toastService.error(res.error || 'Failed to split bill');
    }
  }

  settleSplitPart(order: Order, split: SplitBill, method?: 'CASH' | 'UPI' | 'CARD'): void {
    const tender = method || this.canvasPaymentMethod();
    this.isSettling.set(true);
    const res = this.mock.settleSplitBill({
      orderId: order.id,
      splitBillId: split.id,
      paymentMethod: tender,
    });
    this.isSettling.set(false);

    if (res.success) {
      this.toastService.success(
        `Part #${split.splitIndex} (${split.totalAmount}) settled via ${tender}.`,
      );
      if (this.areAllSplitBillsPaid(order.id)) {
        this.toastService.info('All split bills are paid! You can now complete the order.');
      }
    } else {
      this.toastService.error(res.error || 'Failed to settle split bill');
    }
  }

  cancelOrderFromSettle(ord: Order): void {
    if (confirm(`Are you sure you want to cancel Order #${ord.orderNumber}?`)) {
      this.mock.updateOrderStatusAtomic(ord.id, 'CANCELLED', {
        note: 'Cancelled from Floor Table Settlement',
      });
      this.toastService.info(`Order #${ord.orderNumber} has been cancelled.`);
      this.closeCanvasSettleModal();
      if (ord.tableId || ord.tableNumber) {
        this.mock.recalculateTableStatus(ord.tableId || ord.tableNumber!);
      }
    }
  }

  confirmCanvasSettlement(): void {
    const ord = this.orderToSettle();
    if (!ord || this.isSettling()) return;

    this.isSettling.set(true);
    const method = this.canvasPaymentMethod();
    const finalDiscount = this.getEffectiveDiscount(ord);
    const appliedCode = this.settleDiscountMode() === 'COUPON' ? this.selectedCouponCode() : '';

    if (ord.paymentStatus !== 'PAID' && !ord.isSplit) {
      const res = this.mock.settleOrder({
        orderId: ord.id,
        paymentMethod: method,
        discountAmount: finalDiscount,
        appliedCouponCode: appliedCode,
      });

      if (!res.success) {
        this.toastService.warning(res.error || 'Failed to settle order');
        this.isSettling.set(false);
        this.closeCanvasSettleModal();
        return;
      }
    }

    if (ord.tableId || ord.tableNumber) {
      this.mock.recalculateTableStatus(ord.tableId || ord.tableNumber!);
    }

    this.toastService.success(
      `Order #${ord.orderNumber} successfully settled & marked COMPLETED via ${method}`,
    );
    setTimeout(() => {
      this.isSettling.set(false);
      this.closeCanvasSettleModal();
      this.router.navigate(['/admin/billing', ord.id], {
        queryParams: { from: 'canvas', preview: 'thermal' },
      });
    }, 350);
  }

  getActiveOrdersByTable(table: Table): Order[] {
    return this.mock
      .orders()
      .filter(
        (o) =>
          Boolean(o.id) &&
          Array.isArray(o.items) &&
          o.items.length > 0 &&
          (o.tableId === table.id || o.tableNumber === table.number) &&
          !['COMPLETED', 'CANCELLED'].includes(o.status),
      );
  }

  getNextOrderStatus(current: OrderStatus): OrderStatus | null {
    switch (current) {
      case 'PENDING':
        return 'ACCEPTED';
      case 'ACCEPTED':
        return 'PREPARING';
      case 'PREPARING':
        return 'READY';
      case 'READY':
        return 'SERVED';
      case 'SERVED':
        return 'COMPLETED';
      default:
        return null;
    }
  }

  getNextOrderStatusLabel(current: OrderStatus): string {
    switch (current) {
      case 'PENDING':
        return 'Accept Order';
      case 'ACCEPTED':
        return 'Start Cooking';
      case 'PREPARING':
        return 'Ready to Serve';
      case 'READY':
        return 'Served to Table';
      case 'SERVED':
        return 'Completed';
      default:
        return '';
    }
  }

  isStagePassed(current: OrderStatus, stage: string): boolean {
    const orderRanks: Record<string, number> = {
      PENDING: 1,
      ACCEPTED: 2,
      PREPARING: 3,
      READY: 4,
      DISPATCHED: 4,
      SERVED: 5,
      COMPLETED: 6,
    };
    return (orderRanks[current] || 0) > (orderRanks[stage] || 0);
  }

  advanceOrderStatus(order: Order): void {
    const nextStatus = this.getNextOrderStatus(order.status);
    if (!nextStatus) return;

    const res = this.mock.updateOrderStatusAtomic(order.id, nextStatus, {
      note: `Advanced to ${nextStatus} via Floor Canvas Cockpit`,
    });
    if (!res.success) {
      this.toastService.warning(res.error || `Cannot advance order to ${nextStatus}`);
      return;
    }
    this.toastService.success(`Order #${order.orderNumber} advanced to ${nextStatus}`);
    if (nextStatus === 'COMPLETED' && (order.tableId || order.tableNumber)) {
      this.mock.recalculateTableStatus(order.tableId || order.tableNumber!);
    }
  }

  getActiveOrderByTable(table: Table): Order | undefined {
    return this.mock
      .orders()
      .find(
        (o) =>
          Boolean(o.id) &&
          Array.isArray(o.items) &&
          o.items.length > 0 &&
          (o.tableId === table.id || o.tableNumber === table.number) &&
          !['COMPLETED', 'CANCELLED'].includes(o.status),
      );
  }

  isOrderPaid(order: Order | null | undefined): boolean {
    if (!order) return false;
    const ps = (order.paymentStatus || '').toUpperCase();
    if (ps === 'PAID' || ps === 'COMPLETED') return true;
    if (order.status === 'COMPLETED' || !!order.settledAt) return true;
    return false;
  }

  getServerStaffName(staffId: string | null | undefined): string {
    if (!staffId) return '';
    return this.staffMembers().find((s) => s.id === staffId)?.name || '';
  }

  promptChangePaidServer(order: Order): void {
    this.targetServerOrder.set(order);
    this.selectedServerStaffId.set(order.serverStaffId || null);
    this.serverAdminPassword.set('');
    this.serverAdminError.set('');
    this.showServerAdminModal.set(true);
  }

  cancelServerAdminModal(): void {
    this.showServerAdminModal.set(false);
    this.targetServerOrder.set(null);
    this.serverAdminPassword.set('');
    this.serverAdminError.set('');
  }

  confirmServerAdminChange(): void {
    const pwd = this.serverAdminPassword();
    if (!this.adminAuth.verifyAdminPassword(pwd)) {
      this.serverAdminError.set('Incorrect admin password. Cannot reassign server on paid order.');
      return;
    }
    const ord = this.targetServerOrder();
    if (!ord) return;
    const newStaffId = this.selectedServerStaffId();
    const res = this.dataService.assignOrderServer(ord.id, newStaffId, pwd);
    if (!res.success) {
      this.serverAdminError.set(res.error || 'Failed to update server staff');
      return;
    }
    this.toastService.success(
      `Serving staff updated to ${this.getServerStaffName(newStaffId) || 'Unassigned'} (Admin Authorized).`,
    );
    this.cancelServerAdminModal();
  }

  onAssignActiveOrderServer(order: Order, staffIdStr: string): void {
    if (this.isOrderPaid(order)) {
      this.promptChangePaidServer(order);
      return;
    }
    const staffId = staffIdStr && staffIdStr.trim().length > 0 ? staffIdStr.trim() : null;
    const res = this.dataService.assignOrderServer(order.id, staffId);
    if (!res.success) {
      this.toastService.warning(res.error || 'Failed to assign staff to customer order');
      return;
    }
    const staffName = this.staffMembers().find((s) => s.id === staffId)?.name || 'Unassigned';
    this.toastService.success(`Assigned ${staffName} to ${order.customerName || 'customer order'}`);
  }

  toggleOrdering(table: Table): void {
    const newState = !table.orderingEnabled;
    this.mock.toggleTableOrdering(table.id, newState);

    const currentIns = this.selectedTableForInspector();
    if (currentIns && currentIns.id === table.id) {
      this.selectedTableForInspector.set({ ...currentIns, orderingEnabled: newState });
    }

    this.toastService.info(
      `Ordering ${newState ? 'enabled' : 'disabled'} for Table ${table.number}`,
    );
  }

  openAddTableModal(): void {
    const nextNum = `T-${(this.tables().length + 1).toString().padStart(2, '0')}`;
    this.newTableNumber = nextNum;
    this.newTableCapacity = 4;
    const currentPlaces = this.places();
    this.newTableSection =
      this.selectedSection() !== 'ALL' && currentPlaces.includes(this.selectedSection())
        ? this.selectedSection()
        : currentPlaces[0] || 'Main Hall';
    this.newTableStatus = 'AVAILABLE';
    this.newTableShape = 'ROUND';
    this.showAddModal = true;
  }

  openAddTableModalForSection(sec: string): void {
    const nextNum = `T-${(this.tables().length + 1).toString().padStart(2, '0')}`;
    this.newTableNumber = nextNum;
    this.newTableCapacity = 4;
    this.newTableSection = sec || 'Main Hall';
    this.newTableStatus = 'AVAILABLE';
    this.newTableShape = 'ROUND';
    this.showAddModal = true;
  }

  saveNewTable(): void {
    if (!this.newTableNumber.trim() || this.newTableCapacity < 1) return;

    const res = this.mock.createTable({
      number: this.newTableNumber.trim(),
      capacity: this.newTableCapacity,
      section: this.newTableSection,
      shape: this.newTableShape,
    });

    const newTbl = res.table;
    if (newTbl) {
      const idx = this.tables().length;
      const posX = 70 + (idx % 5) * 180;
      const posY = 90 + Math.floor(idx / 5) * 160;

      const coords = { ...this.tableCoords() };
      coords[newTbl.id] = { x: posX, y: posY, shape: this.newTableShape };
      this.saveCoords(coords);

      this.toastService.success(`Created Table ${newTbl.number} with QR Code in ${newTbl.section}`);
    }
    this.showAddModal = false;
  }

  confirmDeleteTable(table: Table): void {
    this.tableToDelete = table;
  }

  executeDeleteTable(): void {
    if (!this.tableToDelete) return;
    const id = this.tableToDelete.id;
    const num = this.tableToDelete.number;
    this.mock.deleteTable(id);

    if (this.selectedTableForInspector()?.id === id) {
      this.selectedTableForInspector.set(null);
    }

    this.toastService.success(`Table ${num} removed`);
    this.tableToDelete = null;
  }

  getCustomerMenuBaseUrl(): string {
    const hostedDefault = 'https://gurukripadhaba-menu.vercel.app';
    let base = localStorage.getItem('hotel_crm_customer_menu_url')?.trim();

    // Enforce hosted production link: If base is missing, invalid, or contains localhost/127.0.0.1/tauri, reset to hosted URL
    if (
      !base ||
      base.includes('localhost') ||
      base.includes('127.0.0.1') ||
      base.startsWith('tauri:') ||
      !base.startsWith('http')
    ) {
      base = environment.customerMenuUrl?.trim() || hostedDefault;
      if (base.includes('localhost') || base.includes('127.0.0.1') || !base.startsWith('http')) {
        base = hostedDefault;
      }
      localStorage.setItem('hotel_crm_customer_menu_url', base);
    }
    return base.replace(/\/+$/, '');
  }

  copyQrUrl(): void {
    const url = this.activeQrFullUrl();
    if (!url) return;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        this.toastService.success('Customer menu link copied to clipboard');
      });
    }
  }

  async openQrModal(table: Table): Promise<void> {
    this.activeQrTable = table;
    this.qrDataUrl = null;
    const base = this.getCustomerMenuBaseUrl();
    const token = table.qrToken || table.number;
    const fullUrl = `${base}/table/${encodeURIComponent(token)}`;
    this.activeQrFullUrl.set(fullUrl);

    try {
      this.qrDataUrl = await QRCode.toDataURL(fullUrl, {
        width: 480,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#0c0e12',
          light: '#ffffff',
        },
      });
    } catch (e) {
      console.error('QR generation failed', e);
      this.toastService.error('Failed to generate table QR code');
    }
  }

  async downloadQrImage(): Promise<void> {
    if (!this.qrDataUrl || !this.activeQrTable) return;

    const table = this.activeQrTable;
    const brandName = (this.restaurant()?.name || 'GuruKripa Dhaba').toUpperCase();
    const section = (table.section || 'Main Dining Floor').toUpperCase();
    const tableNum = `TABLE ${table.number}`.toUpperCase();
    const scanUrl =
      this.activeQrFullUrl() ||
      `${this.getCustomerMenuBaseUrl()}/table/${encodeURIComponent(table.qrToken || table.number)}`;

    try {
      // 1. Create high-resolution 300 DPI Standee canvas (800 x 1160 px)
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 1160;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context not available');

      // Warm Bone / Fine Dhaba Parchment background
      ctx.fillStyle = '#faf8f4';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Outer Solid Frame
      ctx.strokeStyle = '#14161b';
      ctx.lineWidth = 4;
      ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);

      // Inner Royal Gold Frame
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 2;
      ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

      // Corner gold bracket decorations
      const corner = 28;
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(40, 40, corner, 4);
      ctx.fillRect(40, 40, 4, corner);
      ctx.fillRect(canvas.width - 40 - corner, 40, corner, 4);
      ctx.fillRect(canvas.width - 44, 40, 4, corner);
      ctx.fillRect(40, canvas.height - 44, corner, 4);
      ctx.fillRect(40, canvas.height - 40 - corner, 4, corner);
      ctx.fillRect(canvas.width - 40 - corner, canvas.height - 44, corner, 4);
      ctx.fillRect(canvas.width - 44, canvas.height - 40 - corner, 4, corner);

      // Crest Icon Badge with Restaurant Logo
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => resolve();
        logoImg.src = '/logo.svg';
      });

      if (logoImg.complete && logoImg.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(400, 110, 32, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logoImg, 400 - 32, 110 - 32, 64, 64);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(400, 110, 32, 0, Math.PI * 2);
        ctx.fillStyle = '#d4af37';
        ctx.fill();
        ctx.fillStyle = '#14161b';
        ctx.font = 'bold 24px "Cinzel", Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GK', 400, 110);
      }

      // Restaurant Brand Header
      ctx.font = 'bold 36px "Crimson Text", Georgia, serif';
      ctx.fillStyle = '#c21807';
      ctx.fillText(brandName, 400, 178);

      // Subtitle
      ctx.font = '600 16px "Source Sans 3", "Source Sans Pro", sans-serif';
      ctx.fillStyle = '#737373';
      ctx.fillText(`PURE VEG DHABA  •  ${section}`, 400, 215);

      // Thin divider
      ctx.strokeStyle = '#e5ded4';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(120, 245);
      ctx.lineTo(680, 245);
      ctx.stroke();

      // "SCAN WITH CAMERA" dark pill
      ctx.fillStyle = '#14161b';
      ctx.beginPath();
      ctx.roundRect(260, 270, 280, 38, 19);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px "Source Sans 3", "Source Sans Pro", sans-serif';
      ctx.fillText('SCAN WITH CAMERA', 400, 289);

      // White Well behind QR Code
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#e5ded4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(165, 330, 470, 470, 24);
      ctx.fill();
      ctx.stroke();

      // Load and draw QR matrix
      const qrImg = new Image();
      qrImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        qrImg.onload = () => resolve();
        qrImg.onerror = reject;
        qrImg.src = this.qrDataUrl!;
      });
      ctx.drawImage(qrImg, 185, 350, 430, 430);

      // Table Number Crimson Banner
      ctx.fillStyle = '#c21807';
      ctx.beginPath();
      ctx.roundRect(190, 830, 420, 62, 16);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px "Crimson Text", Georgia, serif';
      ctx.fillText(tableNum, 400, 861);

      // Ordering 3-Step Guide
      ctx.fillStyle = '#262626';
      ctx.font = '600 18px "Source Sans 3", "Source Sans Pro", sans-serif';
      ctx.fillText('1. Scan QR   •   2. Browse Menu   •   3. Place Order', 400, 935);

      // Scan detail note
      ctx.fillStyle = '#737373';
      ctx.font = '400 15px "Source Sans 3", "Source Sans Pro", sans-serif';
      ctx.fillText('Instant kitchen KOT • Contactless Ordering • Live Kitchen Queue', 400, 975);

      // Footer note
      ctx.fillStyle = '#9ca3af';
      ctx.font = '500 13px "Source Sans 3", sans-serif';
      ctx.fillText(
        `Customer Web: ${this.getCustomerMenuBaseUrl()}  •  GuruKripa Dhaba Management`,
        400,
        1035,
      );

      // Download triggered via dataURL
      const standeePng = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `GuruKripa_Table_${table.number}_Standee.png`;
      link.href = standeePng;
      link.click();
      this.toastService.success(`Downloaded Table ${table.number} Standee PNG`);
    } catch (err) {
      console.warn('Canvas export failed, falling back to raw QR PNG', err);
      const link = document.createElement('a');
      link.download = `GuruKripa_Table_${table.number}_QR.png`;
      link.href = this.qrDataUrl;
      link.click();
      this.toastService.success(`Downloaded QR PNG for Table ${table.number}`);
    }
  }

  printQrStandee(): void {
    if (!this.activeQrTable) return;
    document.body.classList.add('is-printing-qr-standee');
    const cleanup = () => {
      document.body.classList.remove('is-printing-qr-standee');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      window.print();
      setTimeout(cleanup, 2000);
    }, 60);
  }

  assignReservationTable(res: Reservation, tableId: string): void {
    if (!tableId) {
      this.mock.assignTableToReservation(res.id, '', '');
      this.toastService.info(`Unassigned table for ${res.customerName}`);
      return;
    }
    const targetTable = this.mock.tables().find((t) => t.id === tableId);
    if (!targetTable) return;
    this.mock.assignTableToReservation(res.id, tableId, targetTable.number);
    this.toastService.success(`Assigned Table ${targetTable.number} to ${res.customerName}`);
  }

  seatReservationGuest(res: Reservation): void {
    let targetTableId = res.tableId;
    if (!targetTableId) {
      const avail = this.availableTables();
      if (avail.length === 0) {
        this.toastService.warning('No available tables on the floor to seat this guest.');
        return;
      }
      targetTableId = avail[0].id;
      this.assignReservationTable(res, targetTableId);
    }
    this.mock.updateReservationStatus(res.id, 'SEATED');
    this.onStatusChange(targetTableId, 'OCCUPIED');
    const tbl = this.mock.tables().find((t) => t.id === targetTableId);
    this.toastService.success(
      `Seated ${res.customerName} at Table ${tbl?.number || ''}. QR ordering active.`,
    );
  }

  completeReservation(res: Reservation): void {
    this.mock.updateReservationStatus(res.id, 'COMPLETED');
    this.toastService.info(`Reservation for ${res.customerName} marked completed.`);
  }

  cancelReservation(res: Reservation): void {
    if (!confirm(`Cancel reservation for ${res.customerName}?`)) return;
    this.mock.updateReservationStatus(res.id, 'CANCELLED');
    if (res.tableId) {
      const tbl = this.mock.tables().find((t) => t.id === res.tableId);
      if (tbl && tbl.status === 'RESERVED') {
        this.onStatusChange(res.tableId, 'AVAILABLE');
      }
    }
    this.toastService.info(`Reservation for ${res.customerName} has been cancelled.`);
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.showAddModal = false;
      this.activeQrTable = null;
      this.cancelServerAdminModal();
      this.showAddPlaceModal.set(false);
    }
  }
}
