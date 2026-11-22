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
import { RouterModule } from '@angular/router';
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
import { Order, OrderStatus } from '../../../core/models/order.model';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ConfirmModalComponent } from '../../../shared/components/confirm-modal/confirm-modal.component';
import { SkeletonLoaderComponent } from '../../../shared/components/loading/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
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
            <div>
              <div class="desk-title-row">
                <h3 class="desk-title">Floor Reservations &amp; Bookings</h3>
                @if (pendingReservationsCount() > 0) {
                  <span
                    class="live-pill"
                    [attr.title]="pendingReservationsCount() + ' active bookings'"
                  >
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
              class="btn btn-sm btn-secondary"
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
                <i class="ph ph-calendar-blank"></i>
                <span
                  >No active table bookings at the moment. All floor tables are free for walk-in
                  dining.</span
                >
              </div>
            } @else {
              <div class="reservation-cards-scroll">
                @for (res of activeFloorReservations(); track res.id) {
                  <div class="res-item-card" [class.is-seated]="res.status === 'SEATED'">
                    <div class="res-item-top">
                      <div class="res-customer-info">
                        <strong class="res-name">{{ res.customerName }}</strong>
                        <span class="res-phone text-muted text-xs">{{ res.customerPhone }}</span>
                      </div>
                      <span
                        class="badge"
                        [class.badge-success]="res.status === 'SEATED'"
                        [class.badge-primary]="res.status === 'CONFIRMED'"
                      >
                        {{ res.status }}
                      </span>
                    </div>

                    <div class="res-item-details">
                      <div class="res-detail-pill">
                        <i class="ph ph-calendar text-primary"></i>
                        <span>{{
                          res.reservationTime || res.reservationDate | date: 'mediumDate'
                        }}</span>
                      </div>
                      <div class="res-detail-pill">
                        <i class="ph ph-clock text-primary"></i>
                        <span class="font-bold">{{
                          res.reservationTime || res.reservationDate | date: 'shortTime'
                        }}</span>
                      </div>
                      <div class="res-detail-pill">
                        <i class="ph ph-users"></i>
                        <span>{{ res.partySize }} Guests</span>
                      </div>
                      <div class="res-detail-pill table-assign-pill">
                        <i class="ph ph-chair"></i>
                        @if (res.tableNumber) {
                          <span class="font-bold">Table {{ res.tableNumber }}</span>
                        } @else {
                          <span class="text-amber-500 font-bold">Unassigned</span>
                        }
                      </div>
                    </div>

                    @if (res.specialRequests) {
                      <div class="res-notes text-xs text-muted">
                        <i class="ph ph-chat-circle-dots"></i>
                        <span>{{ res.specialRequests }}</span>
                      </div>
                    }

                    <div class="res-item-actions">
                      @if (!res.tableId && res.status !== 'SEATED') {
                        <div class="quick-assign-wrap">
                          <select
                            class="form-select form-select-sm"
                            #assignSelect
                            (change)="assignReservationTable(res, assignSelect.value)"
                          >
                            <option value="">Assign Table...</option>
                            @for (tbl of availableTables(); track tbl.id) {
                              <option [value]="tbl.id">
                                Table {{ tbl.number }} (Cap: {{ tbl.capacity }}) - {{ tbl.section }}
                              </option>
                            }
                          </select>
                        </div>
                      }

                      @if (res.status === 'CONFIRMED' || res.status === 'PENDING') {
                        <button
                          type="button"
                          class="btn btn-sm btn-primary btn-seat"
                          (click)="seatReservationGuest(res)"
                          [disabled]="!res.tableId && availableTables().length === 0"
                          title="Seat guest at table and enable digital QR ordering"
                        >
                          <i class="ph ph-check-circle"></i>
                          <span>Seat Guest</span>
                        </button>
                      } @else if (res.status === 'SEATED') {
                        <button
                          type="button"
                          class="btn btn-sm btn-secondary"
                          (click)="completeReservation(res)"
                        >
                          <i class="ph ph-check"></i>
                          <span>Done</span>
                        </button>
                      }

                      @if (res.status !== 'SEATED') {
                        <button
                          type="button"
                          class="btn btn-sm btn-ghost text-crimson"
                          (click)="cancelReservation(res)"
                          title="Cancel Booking"
                        >
                          <i class="ph ph-x"></i>
                        </button>
                      }
                    </div>
                  </div>
                }
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

              @if (isDesignMode()) {
                <div class="element-picker-group">
                  <span class="group-label">Add Fixture:</span>
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
                    <i class="ph ph-cooking-pot"></i> Kitchen Pass
                  </button>
                  <button
                    class="btn btn-secondary btn-xs"
                    (click)="addFloorElement('BAR')"
                    title="Add Beverage Bar"
                  >
                    <i class="ph ph-martini"></i> Bar Counter
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
                    <i class="ph ph-plant"></i> Partition/Plant
                  </button>
                </div>
              }
            </div>

            <div class="toolbar-right">
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

                <!-- Architectural Floor Fixtures (Entrance, Kitchen Pass, Bar, Restroom) -->
                @for (elem of visibleFloorElements(); track elem.id) {
                  <div
                    class="floor-element"
                    [class.elem-entrance]="elem.type === 'ENTRANCE'"
                    [class.elem-kitchen]="elem.type === 'KITCHEN'"
                    [class.elem-bar]="elem.type === 'BAR'"
                    [class.elem-restroom]="elem.type === 'RESTROOM'"
                    [class.elem-wall]="elem.type === 'WALL'"
                    [class.elem-stage]="elem.type === 'STAGE'"
                    [class.dragging]="draggingElementId() === elem.id"
                    [style.left.px]="elem.posX"
                    [style.top.px]="elem.posY"
                    (pointerdown)="onCanvasPointerDownElement($event, elem)"
                    [title]="
                      isDesignMode() ? 'Drag fixture to place anywhere on floor' : elem.label
                    "
                  >
                    <div class="elem-content">
                      <i class="ph" [class]="getElementIcon(elem.type)"></i>
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
                    [class.design-mode]="isDesignMode()"
                    [style.left.px]="getSectionBoxX(sec)"
                    [style.top.px]="getSectionBoxY(sec)"
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
                      </div>

                      <div class="sec-header-right">
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

                    <!-- Dining Tables in this Section Box (Auto-growing Grid) -->
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
                          (click)="selectTable(tbl); $event.stopPropagation()"
                          [title]="'Table ' + tbl.number + ' (' + tbl.status + ')'"
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
                          <div class="table-surface">
                            <span class="tbl-num">{{ tbl.number }}</span>
                            <span class="tbl-capacity">{{ tbl.capacity }}p</span>

                            @if (getActiveOrderByTable(tbl); as actOrd) {
                              <div
                                class="tbl-active-pill"
                                title="Order #{{ actOrd.orderNumber }} is active"
                              >
                                {{ actOrd.orderNumber }}
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
                  <span class="order-count-chip">
                    {{ getActiveOrdersByTable(insTbl).length }} Active
                  </span>
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
                          <div class="active-order-header">
                            <div class="order-header-left">
                              <span class="round-badge">Round {{ ordIdx + 1 }}</span>
                              <span class="order-id-chip">#{{ actOrder.orderNumber }}</span>
                            </div>
                            <span
                              class="status-pill-badge"
                              [ngClass]="'status-' + actOrder.status.toLowerCase()"
                            >
                              {{ actOrder.status }}
                            </span>
                          </div>

                          <!-- Order Details Grid -->
                          <div class="order-details-grid">
                            <div>
                              <span class="text-xs text-muted">Customer:</span>
                              <strong class="d-block">{{
                                actOrder.customerName || 'Walk-in Guest'
                              }}</strong>
                            </div>
                            <div>
                              <span class="text-xs text-muted">Amount:</span>
                              <strong class="d-block text-crimson"
                                >₹{{ actOrder.totalAmount }}</strong
                              >
                            </div>
                            <div>
                              <span class="text-xs text-muted">Payment:</span>
                              <span class="d-block text-xs font-semibold">{{
                                actOrder.paymentStatus
                              }}</span>
                            </div>
                            <div>
                              <span class="text-xs text-muted">Dishes:</span>
                              <span class="d-block text-xs font-semibold"
                                >{{ actOrder.items.length }} items</span
                              >
                            </div>
                          </div>

                          <!-- Compact Items List -->
                          <div class="order-items-compact-list">
                            @for (it of actOrder.items; track it.id) {
                              <div class="compact-item-row">
                                <span class="item-qty">{{ it.quantity }}x</span>
                                <span class="item-name truncate">{{ it.name }}</span>
                                <span class="item-price">₹{{ it.itemTotal }}</span>
                              </div>
                            }
                          </div>

                          <!-- Serving Staff Assigned INSIDE THIS ORDER COCKPIT BLOCK -->
                          <div class="drawer-inline-server">
                            <label class="text-xs text-muted" [attr.for]="'server-' + actOrder.id">
                              <i class="ph ph-user-check"></i> Serving Staff for this Order:
                            </label>
                            @if (isOrderPaid(actOrder)) {
                              <div class="locked-server-row">
                                <span class="font-semibold text-xs">
                                  <i class="ph ph-lock-key text-muted"></i>
                                  {{ getServerStaffName(actOrder.serverStaffId) || 'Unassigned' }}
                                </span>
                                <button
                                  type="button"
                                  class="btn-unlock-server"
                                  (click)="
                                    promptChangePaidServer(actOrder); $event.stopPropagation()
                                  "
                                  title="Change serving staff on paid order"
                                >
                                  <i class="ph ph-lock-key"></i>
                                  <span>Change</span>
                                </button>
                              </div>
                            } @else {
                              <select
                                [id]="'server-' + actOrder.id"
                                class="form-select form-select-xs status-dropdown active-server-select"
                                [ngModel]="actOrder.serverStaffId || ''"
                                (ngModelChange)="onAssignActiveOrderServer(actOrder, $event)"
                                (click)="$event.stopPropagation()"
                              >
                                <option value="">Unassigned</option>
                                @for (s of staffMembers(); track s.id) {
                                  <option [value]="s.id">{{ s.name }} ({{ s.role }})</option>
                                }
                              </select>
                            }
                          </div>

                          <!-- Order Lifecycle Control Stepper (Icons) & Quick Action -->
                          <div class="lifecycle-control-box">
                            <div class="stepper-track">
                              <span
                                class="step-pill"
                                [class.active]="actOrder.status === 'PENDING'"
                                [class.passed]="isStagePassed(actOrder.status, 'PENDING')"
                                title="Pending Order"
                              >
                                <i class="ph ph-clock"></i>
                              </span>
                              <span class="step-arrow">&rsaquo;</span>
                              <span
                                class="step-pill"
                                [class.active]="actOrder.status === 'ACCEPTED'"
                                [class.passed]="isStagePassed(actOrder.status, 'ACCEPTED')"
                                title="Accepted"
                              >
                                <i class="ph ph-check-circle"></i>
                              </span>
                              <span class="step-arrow">&rsaquo;</span>
                              <span
                                class="step-pill"
                                [class.active]="actOrder.status === 'PREPARING'"
                                [class.passed]="isStagePassed(actOrder.status, 'PREPARING')"
                                title="Cooking in Kitchen"
                              >
                                <i class="ph ph-cooking-pot"></i>
                              </span>
                              <span class="step-arrow">&rsaquo;</span>
                              <span
                                class="step-pill"
                                [class.active]="actOrder.status === 'READY'"
                                [class.passed]="isStagePassed(actOrder.status, 'READY')"
                                title="Food Ready to Serve"
                              >
                                <i class="ph ph-bell"></i>
                              </span>
                              <span class="step-arrow">&rsaquo;</span>
                              <span
                                class="step-pill"
                                [class.active]="actOrder.status === 'SERVED'"
                                [class.passed]="isStagePassed(actOrder.status, 'SERVED')"
                                title="Served to Table"
                              >
                                <i class="ph ph-bowl-food"></i>
                              </span>
                            </div>

                            <!-- Advance Status Button -->
                            @if (getNextOrderStatus(actOrder.status); as nextSt) {
                              <button
                                type="button"
                                class="btn btn-sm btn-advance-order"
                                (click)="advanceOrderStatus(actOrder); $event.stopPropagation()"
                              >
                                <i class="ph ph-fast-forward"></i>
                                <span
                                  >Advance to {{ getNextOrderStatusLabel(actOrder.status) }}</span
                                >
                              </button>
                            }
                          </div>

                          <!-- Actions: View in Queue, Settle Bill & GATED View & Print Bill -->
                          <div class="active-order-actions">
                            <a [routerLink]="['/admin/orders']" class="btn btn-secondary btn-xs">
                              <i class="ph ph-receipt"></i> View in Queue
                            </a>

                            <!-- Gated: Only visible/active once lifecycle reaches SERVED or COMPLETED -->
                            @if (actOrder.status === 'SERVED' || actOrder.status === 'COMPLETED') {
                              @if (!isOrderPaid(actOrder)) {
                                <button
                                  type="button"
                                  class="btn btn-xs btn-settle-action"
                                  (click)="
                                    openCanvasSettleModal(actOrder); $event.stopPropagation()
                                  "
                                  title="Settle payment for Table {{ insTbl.number }}"
                                >
                                  <i class="ph ph-credit-card"></i> Settle Bill
                                </button>
                              }
                              <a
                                [routerLink]="['/admin/billing', actOrder.id]"
                                [queryParams]="{ from: 'canvas' }"
                                class="btn btn-primary btn-xs btn-bill-ready"
                              >
                                <i class="ph ph-printer"></i> View &amp; Print Bill
                              </a>
                            } @else {
                              <div
                                class="bill-gated-badge"
                                title="Cooking/Prep in progress. Bill available once food is served to table."
                              >
                                <i class="ph ph-lock-key"></i>
                                <span>Bill Locked (Status: {{ actOrder.status }})</span>
                              </div>
                            }
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
            class="modal-card canvas-settle-card"
            (click)="$event.stopPropagation()"
            role="dialog"
            aria-modal="true"
          >
            <div class="modal-header">
              <div>
                <h3 class="heading-card">Settle Table Bill</h3>
                <span class="text-xs text-muted">
                  Order #{{ ord.orderNumber }} • Table
                  {{ ord.tableNumber || selectedTableForInspector()?.number }}
                </span>
              </div>
              <button type="button" class="close-btn" (click)="closeCanvasSettleModal()">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body">
              <div class="settle-summary-box">
                <div class="settle-row">
                  <span>Guest Name:</span>
                  <strong>{{ ord.customerName || 'Walk-in Guest' }}</strong>
                </div>
                <div class="settle-row">
                  <span>Dishes ({{ ord.items.length }} items):</span>
                  <span>₹{{ ord.subtotal || ord.totalAmount }}</span>
                </div>
                <div class="settle-row">
                  <span>Taxes (GST):</span>
                  <span>₹{{ ord.taxAmount || 0 }}</span>
                </div>
                <div class="settle-divider"></div>
                <div class="settle-row total-highlight">
                  <span>Net Payable Total:</span>
                  <span class="amount-large text-crimson">₹{{ ord.totalAmount }}</span>
                </div>
              </div>

              <div class="settle-payment-section">
                <label class="drawer-label">Select Payment Method</label>
                <div class="payment-method-grid">
                  <button
                    type="button"
                    class="pay-choice-btn"
                    [class.active]="canvasPaymentMethod() === 'CASH'"
                    (click)="canvasPaymentMethod.set('CASH')"
                  >
                    <i class="ph ph-money"></i> Cash
                  </button>
                  <button
                    type="button"
                    class="pay-choice-btn"
                    [class.active]="canvasPaymentMethod() === 'UPI'"
                    (click)="canvasPaymentMethod.set('UPI')"
                  >
                    <i class="ph ph-qr-code"></i> UPI / QR
                  </button>
                  <button
                    type="button"
                    class="pay-choice-btn"
                    [class.active]="canvasPaymentMethod() === 'CARD'"
                    (click)="canvasPaymentMethod.set('CARD')"
                  >
                    <i class="ph ph-credit-card"></i> Card / POS
                  </button>
                </div>
              </div>
            </div>

            <div class="modal-footer">
              <a
                [routerLink]="['/admin/billing', ord.id]"
                [queryParams]="{ from: 'canvas' }"
                class="btn btn-secondary btn-sm"
                (click)="closeCanvasSettleModal()"
              >
                <i class="ph ph-printer"></i> View &amp; Print Bill
              </a>
              <button
                type="button"
                class="btn btn-primary btn-sm btn-confirm-settle"
                (click)="confirmCanvasSettlement()"
              >
                <i class="ph ph-check"></i> Settle &amp; Release Table
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
      /* RESERVATIONS & BOOKINGS DESK CARD                            */
      /* ============================================================ */
      .reservation-desk-card {
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: var(--radius-md, 12px);
        padding: 14px 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
      }

      .reservation-desk-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;

        .desk-header-left {
          display: flex;
          align-items: center;
          gap: 12px;

          .desk-icon-wrap {
            width: 38px;
            height: 38px;
            border-radius: 10px;
            background: rgba(16, 185, 129, 0.12);
            color: #10b981;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.25rem;
            flex-shrink: 0;
          }

          .desk-title-row {
            display: flex;
            align-items: center;
            gap: 8px;

            .desk-title {
              font-size: 1rem;
              font-weight: 800;
              color: var(--color-text-primary, #0f172a);
              margin: 0;
            }
          }

          .desk-subtitle {
            font-size: 0.75rem;
            color: var(--color-text-muted, #64748b);
            margin: 2px 0 0 0;
          }
        }

        .desk-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      }

      .empty-reservations-row {
        padding: 16px;
        border-radius: 10px;
        background: var(--color-bone-light, #f8fafc);
        border: 1px dashed var(--color-border, #cbd5e1);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 0.8125rem;
        color: var(--color-text-muted, #64748b);
      }

      .reservation-cards-scroll {
        display: flex;
        gap: 12px;
        overflow-x: auto;
        padding-bottom: 6px;
        scrollbar-width: thin;

        &::-webkit-scrollbar {
          height: 6px;
        }
        &::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.3);
          border-radius: 3px;
        }

        .res-item-card {
          flex: 0 0 290px;
          background: var(--color-surface, #ffffff);
          border: 1px solid var(--color-border, #e2e8f0);
          border-radius: 12px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 10px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
          transition:
            border-color 0.15s ease,
            transform 0.15s ease;

          &:hover {
            border-color: #cbd5e1;
            transform: translateY(-1px);
          }

          &.is-seated {
            border-left: 3px solid #10b981;
          }

          .res-item-top {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 8px;

            .res-customer-info {
              display: flex;
              flex-direction: column;

              .res-name {
                font-size: 0.875rem;
                font-weight: 700;
                color: var(--color-text-primary, #0f172a);
              }
              .res-phone {
                font-size: 0.6875rem;
              }
            }
          }

          .res-item-details {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;

            .res-detail-pill {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              font-size: 0.6875rem;
              background: var(--color-bone-light, #f1f5f9);
              padding: 3px 7px;
              border-radius: 6px;
              color: var(--color-text-secondary, #334155);

              &.table-assign-pill {
                background: rgba(234, 88, 12, 0.08);
                color: #ea580c;
              }
            }
          }

          .res-notes {
            display: flex;
            align-items: center;
            gap: 5px;
            font-style: italic;
            background: rgba(245, 158, 11, 0.06);
            padding: 4px 8px;
            border-radius: 6px;
          }

          .res-item-actions {
            display: flex;
            align-items: center;
            gap: 6px;
            padding-top: 6px;
            border-top: 1px solid var(--color-border, #f1f5f9);

            .quick-assign-wrap {
              flex: 1;

              .form-select-sm {
                padding: 4px 8px;
                font-size: 0.6875rem;
                border-radius: 6px;
                width: 100%;
              }
            }

            .btn-seat {
              flex-shrink: 0;
            }
          }
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
        width: 490px;
        min-width: 440px;
        height: auto;
        min-height: 200px;
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
          }

          .sec-header-right {
            display: flex;
            align-items: center;
            gap: 8px;

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
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px 16px;
          padding: 24px 18px;
          justify-items: center;
          align-items: center;
          min-height: 160px;
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
        z-index: 1200;
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
          background: var(--color-surface, #ffffff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-left: 4px solid var(--color-crimson, #dc2626);
          border-radius: 10px;
          padding: 12px 14px;
          box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.04));
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: all 0.15s ease;

          &.order-ready {
            border-left-color: #10b981;
            background: #f0fdf4;
          }

          &.order-served {
            border-left-color: #3b82f6;
            background: #f8fafc;
          }

          .active-order-header {
            display: flex;
            align-items: center;
            justify-content: space-between;

            .order-header-left {
              display: flex;
              align-items: center;
              gap: 6px;
            }

            .round-badge {
              font-size: 0.6875rem;
              font-weight: 800;
              color: var(--color-crimson, #dc2626);
              background: rgba(220, 38, 38, 0.1);
              padding: 2px 6px;
              border-radius: 4px;
            }

            .order-id-chip {
              font-size: 0.75rem;
              font-weight: 800;
              color: var(--color-text-primary, #111827);
            }

            .status-pill-badge {
              font-size: 0.6875rem;
              font-weight: 800;
              letter-spacing: 0.04em;
              text-transform: uppercase;
              padding: 2px 8px;
              border-radius: 999px;

              &.status-pending {
                background: #fef3c7;
                color: #b45309;
              }
              &.status-accepted {
                background: #e0e7ff;
                color: #4338ca;
              }
              &.status-preparing {
                background: #ffedd5;
                color: #c2410c;
              }
              &.status-ready {
                background: #dcfce7;
                color: #15803d;
              }
              &.status-served {
                background: #e0f2fe;
                color: #0369a1;
              }
              &.status-completed {
                background: #f3f4f6;
                color: #4b5563;
              }
            }
          }

          .order-details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px 12px;
            padding: 8px 10px;
            background: var(--color-surface-card, #f8fafc);
            border-radius: 6px;
            font-size: 0.75rem;

            .text-xs {
              font-size: 0.6875rem;
            }
          }

          .order-items-compact-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 4px 0;
            border-top: 1px dashed var(--color-border, #e5e7eb);
            border-bottom: 1px dashed var(--color-border, #e5e7eb);

            .compact-item-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-size: 0.75rem;

              .item-qty {
                font-weight: 700;
                color: var(--color-crimson, #dc2626);
                min-width: 24px;
              }

              .item-name {
                flex: 1;
                color: var(--color-text-primary, #1e293b);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                padding-right: 8px;
              }

              .item-price {
                font-weight: 600;
                color: var(--color-text-secondary, #4b5563);
              }
            }
          }

          /* Serving Staff inside Order Cockpit Card */
          .drawer-inline-server {
            display: flex;
            flex-direction: column;
            gap: 4px;
            background: rgba(241, 245, 249, 0.6);
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 6px 8px;

            label {
              display: flex;
              align-items: center;
              gap: 4px;
              font-size: 0.6875rem;
              font-weight: 600;
            }

            .active-server-select {
              width: 100%;
              font-size: 0.75rem;
              height: 28px;
              padding: 2px 8px;
              border-radius: 4px;
              border-color: #cbd5e1;
              background-color: #ffffff;
            }

            .locked-server-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-size: 0.75rem;

              .btn-unlock-server {
                background: #ffffff;
                border: 1px solid #cbd5e1;
                font-size: 0.6875rem;
                font-weight: 600;
                padding: 2px 6px;
                border-radius: 4px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 4px;

                &:hover {
                  border-color: var(--color-crimson, #dc2626);
                  color: var(--color-crimson, #dc2626);
                }
              }
            }
          }

          /* Stepper (Icons) & Advance Action */
          .lifecycle-control-box {
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: #fff5f5;
            border: 1px dashed rgba(220, 38, 38, 0.35);
            border-radius: 8px;
            padding: 8px 10px;

            .stepper-track {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 4px;

              .step-pill {
                width: 32px;
                height: 32px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 8px;
                background: #e2e8f0;
                color: #64748b;
                font-size: 1rem;
                cursor: default;
                transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

                &.active {
                  background: var(--color-crimson, #dc2626);
                  color: #ffffff;
                  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.35);
                  transform: scale(1.08);
                }

                &.passed {
                  background: #10b981;
                  color: #ffffff;
                }
              }

              .step-arrow {
                font-size: 0.75rem;
                color: #94a3b8;
                font-weight: 700;
              }
            }

            .btn-advance-order {
              width: 100%;
              background: var(--color-crimson, #dc2626);
              color: #ffffff;
              border: none;
              border-radius: 6px;
              padding: 6px 12px;
              font-size: 0.75rem;
              font-weight: 700;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              transition: background 0.15s ease;

              &:hover {
                background: #b91c1c;
              }
            }
          }

          .active-order-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 4px;

            .btn-settle-action {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              font-size: 0.75rem;
              font-weight: 700;
              background: #059669;
              color: #ffffff;
              border: none;
              border-radius: 6px;
              padding: 4px 10px;
              cursor: pointer;
              transition: background 0.15s ease;

              &:hover {
                background: #047857;
              }
            }

            .bill-gated-badge {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              font-size: 0.6875rem;
              font-weight: 700;
              color: #b45309;
              background: #fef3c7;
              border: 1px solid #fde68a;
              border-radius: 6px;
              padding: 4px 8px;
              flex: 1;
            }

            .btn-bill-ready {
              display: inline-flex;
              align-items: center;
              gap: 5px;
              font-size: 0.75rem;
              font-weight: 700;
              background: #059669;
              color: #ffffff;
              border: none;
              border-radius: 6px;
              padding: 4px 10px;
              text-decoration: none;
              transition: background 0.15s ease;

              &:hover {
                background: #047857;
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

      /* Floor Canvas Quick Settle Modal */
      .canvas-settle-card {
        max-width: 460px;
        width: 92vw;

        .settle-summary-box {
          background: var(--color-surface-card, #f8fafc);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: 8px;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 0.8125rem;

          .settle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;

            &.total-highlight {
              font-size: 0.9375rem;
              font-weight: 800;

              .amount-large {
                font-size: 1.125rem;
              }
            }
          }

          .settle-divider {
            height: 1px;
            background: var(--color-border, #e5e7eb);
            margin: 2px 0;
          }
        }

        .settle-payment-section {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;

          .payment-method-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;

            .pay-choice-btn {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 6px;
              padding: 10px 8px;
              font-size: 0.75rem;
              font-weight: 700;
              border-radius: 8px;
              border: 1px solid var(--color-border, #e5e7eb);
              background: var(--color-surface, #ffffff);
              cursor: pointer;
              transition: all 0.15s ease;

              i {
                font-size: 1.25rem;
              }

              &.active {
                background: var(--color-onyx, #121212);
                color: #ffffff;
                border-color: var(--color-onyx, #121212);
              }
            }
          }
        }

        .modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 18px;

          .btn-confirm-settle {
            background: var(--color-crimson, #dc2626);
            border-color: var(--color-crimson, #dc2626);
            color: #ffffff;

            &:hover {
              background: #b91c1c;
            }
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

      /* Modal Base Styles */
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(2px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
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
    `,
  ],
})
export class TableListComponent implements OnInit {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);
  private adminAuth = inject(AdminAuthService);

  readonly isLoading = computed(
    () => this.dataService.isTablesLoading() || !this.dataService.tablesLoaded(),
  );

  readonly Math = Math;

  tables = this.mock.tables;
  restaurant = this.mock.restaurant;
  staffMembers = this.dataService.staffMembers;

  // Floor Reservations Desk State
  readonly isReservationsBlockOpen = signal<boolean>(true);
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

  // Canvas Layout Persistence
  tableCoords = signal<
    Record<string, { x: number; y: number; relX?: number; relY?: number; shape?: 'ROUND' | 'RECT' }>
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
    const box = this.sectionBoxes()[section];
    if (box && box.x !== undefined && !isNaN(box.x)) return box.x;
    const idx = Math.max(0, this.places().indexOf(section));
    const col = idx % 2;
    return 40 + col * 540;
  }

  getSectionBoxY(section: string): number {
    const box = this.sectionBoxes()[section];
    if (box && box.y !== undefined && !isNaN(box.y)) return box.y;
    const idx = Math.max(0, this.places().indexOf(section));
    const row = Math.floor(idx / 2);
    return 80 + row * 520;
  }

  getSectionBoxWidth(section: string): number {
    const box = this.sectionBoxes()[section];
    if (box && box.width !== undefined && !isNaN(box.width)) return Math.max(540, box.width);
    const tables = this.getTablesBySection(section);
    let maxX = 500;
    for (const t of tables) {
      const tx = this.getTableRelX(t);
      if (tx + 140 > maxX) maxX = tx + 140;
    }
    return Math.max(620, maxX + 40);
  }

  getSectionBoxHeight(section: string): number {
    const box = this.sectionBoxes()[section];
    if (box && box.height !== undefined && !isNaN(box.height)) return Math.max(380, box.height);
    const tables = this.getTablesBySection(section);
    let maxY = 320;
    for (const t of tables) {
      const ty = this.getTableRelY(t);
      if (ty + 140 > maxY) maxY = ty + 140;
    }
    return Math.max(420, maxY + 40);
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

  getElementIcon(type: FloorElementType): string {
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
      default:
        return 'ph-square';
    }
  }

  // --- Pointer & Drag Handlers ---
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
    const secName = this.draggingSectionName();
    const tableId = this.draggingTableId();
    const elemId = this.draggingElementId();
    if (!secName && !tableId && !elemId) return;

    this.hasDragged = true;
    const deltaX = (e.clientX - this.dragStartX) / this.zoom();
    const deltaY = (e.clientY - this.dragStartY) / this.zoom();

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

    if (tableId) {
      const table = this.tables().find((t) => t.id === tableId);
      const secWidth = table ? this.getSectionBoxWidth(table.section) : 600;
      const secHeight = table ? this.getSectionBoxHeight(table.section) : 420;

      let newX = Math.max(10, Math.min(secWidth - 110, this.dragInitialX + deltaX));
      let newY = Math.max(50, Math.min(secHeight - 110, this.dragInitialY + deltaY));
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
      };
      this.tableCoords.set(coords);
      return;
    }

    if (elemId) {
      let newX = Math.max(10, Math.min(1250, this.dragInitialX + deltaX));
      let newY = Math.max(10, Math.min(750, this.dragInitialY + deltaY));
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

  onCanvasPointerUp(): void {
    if (this.draggingSectionName()) {
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

    // Group tables by section and arrange neatly inside each section box
    const sectionsToArrange = sec === 'ALL' ? this.places() : [sec];
    for (const section of sectionsToArrange) {
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
      secBoxUpdates[section] = {
        x: this.getSectionBoxX(section),
        y: this.getSectionBoxY(section),
        width: Math.max(620, 35 + 3 * 175 + 40),
        height: Math.max(420, 65 + rowCount * 155 + 50),
      };
    }

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

  openCanvasSettleModal(order: Order): void {
    this.orderToSettle.set(order);
    this.canvasPaymentMethod.set('UPI');
    this.showCanvasSettleModal.set(true);
  }

  closeCanvasSettleModal(): void {
    this.showCanvasSettleModal.set(false);
    this.orderToSettle.set(null);
  }

  confirmCanvasSettlement(): void {
    const ord = this.orderToSettle();
    if (!ord) return;

    const method = this.canvasPaymentMethod();
    const res = this.mock.settleOrder({
      orderId: ord.id,
      paymentMethod: method,
    });

    if (res.success) {
      this.toastService.success(`Order #${ord.orderNumber} successfully settled via ${method}`);
      this.closeCanvasSettleModal();
      if (ord.tableId || ord.tableNumber) {
        this.mock.recalculateTableStatus(ord.tableId || ord.tableNumber!);
      }
    } else {
      this.toastService.warning(res.error || 'Failed to settle order');
    }
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
    if (!tableId) return;
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
