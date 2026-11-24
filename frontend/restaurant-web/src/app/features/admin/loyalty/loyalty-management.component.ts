import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import {
  LoyaltyTierConfig,
  LoyaltyTransaction,
  LoyaltyMilestoneRewardConfig,
  DEFAULT_MILESTONE_REWARD,
} from '../../../core/models/loyalty.model';
import { Customer } from '../../../core/models/customer.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { ToastService } from '../../../core/services/toast.service';
import { SkeletonLoaderComponent } from '../../../shared/components/loading/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-loyalty-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CurrencyInrPipe,
    SkeletonLoaderComponent,
    EmptyStateComponent,
  ],
  template: `
    <div class="loyalty-page">
      <!-- Page Header -->
      <div class="page-header">
        <div>
          <h1 class="heading-display">Customer Loyalty & Dining Visits</h1>
          <p class="text-muted">
            Track guest dining visits tied to verified phone numbers, unlock milestone tiers, and
            reward regular guests.
          </p>
        </div>

        <div class="header-actions">
          <button class="btn btn-secondary" (click)="openRewardModal()">
            <i class="ph ph-gift"></i>
            <span>Credit Points</span>
          </button>
          <button class="btn btn-secondary" (click)="openVisitModal()">
            <i class="ph ph-calendar-plus"></i>
            <span>Log Guest Visit</span>
          </button>
          <button class="btn btn-primary" (click)="openMilestoneConfigModal()">
            <i class="ph ph-sparkle"></i>
            <span>Configure 7-Visit Reward</span>
          </button>
        </div>
      </div>

      <!-- KPI Metrics Overview -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-icon-wrap bg-blue">
            <i class="ph ph-users-three"></i>
          </div>
          <div class="kpi-content">
            <span class="kpi-label">Enrolled Guests</span>
            <span class="kpi-value">{{ customers().length }}</span>
            <span class="kpi-sub">Verified phone profiles</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap bg-green">
            <i class="ph ph-calendar-check"></i>
          </div>
          <div class="kpi-content">
            <span class="kpi-label">Total Visits Logged</span>
            <span class="kpi-value">{{ totalVisits() }}</span>
            <span class="kpi-sub">Lifetime dining sessions</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap bg-gold">
            <i class="ph ph-sparkle"></i>
          </div>
          <div class="kpi-content">
            <span class="kpi-label">Regular Guests</span>
            <span class="kpi-value">{{ regularGuestsCount() }}</span>
            <span class="kpi-sub">3+ dining visits</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-icon-wrap bg-purple">
            <i class="ph ph-crown"></i>
          </div>
          <div class="kpi-content">
            <span class="kpi-label">VIP Legends</span>
            <span class="kpi-value">{{ vipGuestsCount() }}</span>
            <span class="kpi-sub">10+ milestone visits</span>
          </div>
        </div>
      </div>

      <!-- 7th Visit Milestone Policy Highlight Banner -->
      <div class="milestone-policy-card">
        <div class="milestone-card-left">
          <div class="milestone-icon-wrap">
            <i class="ph ph-gift"></i>
          </div>
          <div>
            <div class="milestone-badge-row">
              <span class="badge badge-gold">
                <i class="ph ph-sparkle"></i> Milestone Policy Active
              </span>
              <span class="milestone-tag">Target: {{ milestoneReward().targetVisits }} Visits</span>
              @if (milestoneReward().isActive) {
                <span class="milestone-status-live">Live on Customer Menu</span>
              } @else {
                <span class="milestone-status-paused">Paused</span>
              }
            </div>
            <h3 class="milestone-title">{{ milestoneReward().title }}</h3>
            <p class="milestone-desc">{{ milestoneReward().description }}</p>
            <div class="milestone-perks-row">
              <span class="perk-pill">
                <i class="ph ph-ticket"></i>
                Coupon Code: <strong>{{ milestoneReward().couponCode }}</strong>
              </span>
              <span class="perk-pill">
                <i class="ph ph-tag"></i>
                Reward:
                <strong>
                  {{
                    milestoneReward().rewardType === 'FREE_MEAL'
                      ? 'Free Meal / 100% OFF'
                      : milestoneReward().rewardType === 'PERCENT_DISCOUNT'
                        ? milestoneReward().discountPercent + '% OFF Bill'
                        : 'Flat ₹' + (milestoneReward().flatDiscountPaise || 30000) / 100 + ' OFF'
                  }}
                </strong>
              </span>
              @if (milestoneReward().maxDiscountPaise) {
                <span class="perk-pill">
                  <i class="ph ph-shield-check"></i>
                  Max Cap: <strong>₹{{ (milestoneReward().maxDiscountPaise || 0) / 100 }}</strong>
                </span>
              }
            </div>
          </div>
        </div>

        <div class="milestone-card-actions">
          <button class="btn btn-secondary btn-sm" (click)="openMilestoneConfigModal()">
            <i class="ph ph-pencil-simple"></i>
            <span>Edit Policy</span>
          </button>
        </div>
      </div>

      <!-- Milestone Tiers Overview Cards -->
      <div class="tiers-grid">
        @for (tier of tiers(); track tier.tier) {
          <div
            class="tier-card"
            [class.tier-platinum]="tier.tier === 'PLATINUM'"
            [class.tier-gold]="tier.tier === 'GOLD'"
          >
            <div class="tier-head">
              <div class="tier-badge-group">
                <span
                  class="badge"
                  [class.badge-gold]="tier.tier === 'PLATINUM' || tier.tier === 'GOLD'"
                  [class.badge-outline]="tier.tier === 'SILVER' || tier.tier === 'BRONZE'"
                >
                  <i class="ph ph-crown" *ngIf="tier.tier === 'PLATINUM'"></i>
                  <i class="ph ph-medal" *ngIf="tier.tier === 'GOLD'"></i>
                  <i class="ph ph-seal-check" *ngIf="tier.tier === 'SILVER'"></i>
                  <i class="ph ph-user" *ngIf="tier.tier === 'BRONZE'"></i>
                  {{ tier.tier }}
                </span>
                <span class="tier-members-count"> {{ tierCounts()[tier.tier] }} diners </span>
              </div>
              <div class="tier-visits-req">
                <i class="ph ph-fork-knife"></i>
                <span>{{ tier.minVisits || 1 }}+ Visits</span>
              </div>
            </div>

            <div class="tier-body">
              <div class="tier-discount-banner">
                <span class="discount-val">
                  {{
                    tier.discountPercent > 0
                      ? tier.discountPercent + '% OFF Bill'
                      : 'Welcome Status'
                  }}
                </span>
                <span class="multiplier-tag">{{ tier.pointsPer100Inr }} pts / ₹100</span>
              </div>
              <p class="tier-perks-text">{{ tier.perks }}</p>
            </div>
          </div>
        }
      </div>

      <!-- Customer Phone & Visit Ledger -->
      <div class="panel-box">
        <div class="panel-header">
          <div>
            <h2 class="heading-card">Customer Phone & Dining Visit Ledger</h2>
            <p class="text-xs text-muted">
              Every dining order or walk-in visit automatically records against the customer's phone
              number.
            </p>
          </div>

          <div class="table-search-box">
            <i class="ph ph-magnifying-glass"></i>
            <input
              type="text"
              class="search-input"
              placeholder="Search phone (+91...) or guest name"
              [ngModel]="searchQuery()"
              (ngModelChange)="searchQuery.set($event)"
            />
          </div>
        </div>

        <div class="tier-filter-tabs">
          <button
            class="tab-btn"
            [class.active]="tierFilter() === 'ALL'"
            (click)="tierFilter.set('ALL')"
          >
            All Guests ({{ customers().length }})
          </button>
          <button
            class="tab-btn"
            [class.active]="tierFilter() === 'PLATINUM'"
            (click)="tierFilter.set('PLATINUM')"
          >
            <i class="ph ph-crown text-gold"></i>
            VIP Platinum ({{ tierCounts().PLATINUM }})
          </button>
          <button
            class="tab-btn"
            [class.active]="tierFilter() === 'GOLD'"
            (click)="tierFilter.set('GOLD')"
          >
            <i class="ph ph-medal text-gold"></i>
            Gold Regulars ({{ tierCounts().GOLD }})
          </button>
          <button
            class="tab-btn"
            [class.active]="tierFilter() === 'SILVER'"
            (click)="tierFilter.set('SILVER')"
          >
            Silver Guests ({{ tierCounts().SILVER }})
          </button>
          <button
            class="tab-btn"
            [class.active]="tierFilter() === 'BRONZE'"
            (click)="tierFilter.set('BRONZE')"
          >
            Bronze Diners ({{ tierCounts().BRONZE }})
          </button>
        </div>

        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Customer Phone</th>
                <th>Guest Name</th>
                <th>Dining Visits</th>
                <th>Milestone Tier</th>
                <th>Next Milestone Progress</th>
                <th>Lifetime Spend</th>
                <th>Last Visit</th>
                <th>Quick Actions</th>
              </tr>
            </thead>
            <tbody>
              @if (isLoading()) {
                <tr>
                  <td colspan="8">
                    <app-skeleton variant="table-row" [count]="5" />
                  </td>
                </tr>
              } @else {
                @for (cust of filteredCustomers(); track cust.id) {
                  <tr>
                    <td>
                      <div class="phone-cell">
                        <i class="ph ph-phone"></i>
                        <span class="phone-number">{{
                          cust.phone || cust.phoneE164 || 'Unlinked'
                        }}</span>
                      </div>
                    </td>
                    <td>
                      <strong>{{ cust.name }}</strong>
                    </td>
                    <td>
                      <span class="visit-count-badge">
                        <i class="ph ph-calendar-check"></i>
                        <strong>{{ cust.visitCount || 0 }}</strong> visits
                      </span>
                    </td>
                    <td>
                      <span
                        class="badge"
                        [class.badge-gold]="
                          cust.loyaltyTier === 'PLATINUM' || cust.loyaltyTier === 'GOLD'
                        "
                        [class.badge-outline]="
                          cust.loyaltyTier === 'SILVER' || cust.loyaltyTier === 'BRONZE'
                        "
                      >
                        <i class="ph ph-crown" *ngIf="cust.loyaltyTier === 'PLATINUM'"></i>
                        {{ cust.loyaltyTier }}
                      </span>
                    </td>
                    <td>
                      <div class="progress-wrap">
                        <div class="progress-bar-bg">
                          <div
                            class="progress-bar-fill"
                            [style.width.%]="getNextTierInfo(cust).progressPercent"
                            [class.fill-gold]="
                              cust.loyaltyTier === 'GOLD' || cust.loyaltyTier === 'PLATINUM'
                            "
                          ></div>
                        </div>
                        <span class="progress-label">
                          @if (getNextTierInfo(cust).neededVisits > 0) {
                            {{ getNextTierInfo(cust).neededVisits }} more for
                            {{ getNextTierInfo(cust).nextTier }}
                          } @else {
                            VIP Max Tier Reached
                          }
                        </span>
                      </div>
                    </td>
                    <td>
                      <strong>{{ cust.totalSpend || 0 | currencyInr }}</strong>
                    </td>
                    <td>
                      <span class="text-sm text-muted">
                        {{ cust.lastVisit ? (cust.lastVisit | date: 'mediumDate') : 'Never' }}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="btn btn-sm btn-outline quick-visit-btn"
                        (click)="quickLogVisit(cust, $event)"
                        title="Record a dining visit for this customer"
                      >
                        <i class="ph ph-plus-circle"></i>
                        <span>Log Visit</span>
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="8">
                      <app-empty-state
                        icon="ph-users-three"
                        title="No Guests Found"
                        message="No customer profiles matching the phone or tier search criteria."
                        [compact]="true"
                      />
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Recent Visits & Points Ledger -->
      <div class="panel-box">
        <h2 class="heading-card">Recent Visits & Rewards Activity Log</h2>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Guest</th>
                <th>Event Type</th>
                <th>Points / Perk</th>
                <th>Milestone Note</th>
              </tr>
            </thead>
            <tbody>
              @if (isLoading()) {
                <tr>
                  <td colspan="5">
                    <app-skeleton variant="table-row" [count]="4" />
                  </td>
                </tr>
              } @else {
                @for (tx of transactions(); track tx.id) {
                  <tr>
                    <td>{{ tx.date | date: 'medium' }}</td>
                    <td>
                      <strong>{{ tx.customerName }}</strong>
                    </td>
                    <td>
                      <span
                        class="badge"
                        [class.badge-success]="tx.type === 'EARNED'"
                        [class.badge-danger]="tx.type === 'REDEEMED'"
                      >
                        {{ tx.type === 'EARNED' ? 'VISIT RECORDED' : tx.type }}
                      </span>
                    </td>
                    <td>
                      <strong
                        [class.text-success]="tx.points > 0"
                        [class.text-crimson]="tx.points < 0"
                      >
                        {{ tx.points > 0 ? '+' + tx.points : tx.points }} pts
                      </strong>
                    </td>
                    <td>
                      <span class="text-sm text-muted">{{ tx.description }}</span>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5">
                      <app-empty-state
                        icon="ph-receipt"
                        title="No Visits Recorded Yet"
                        message="Dining visits and reward events will automatically appear here."
                        [compact]="true"
                      />
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Log Customer Visit Modal -->
      @if (showVisitModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card">Log Customer Dining Visit</h3>
              <button class="close-btn" (click)="showVisitModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">Select Customer by Phone / Name *</label>
                <select class="form-select" [(ngModel)]="visitCustomerId">
                  @for (c of customers(); track c.id) {
                    <option [value]="c.id">
                      {{ c.name }} • {{ c.phone }} ({{ c.visitCount || 0 }} visits •
                      {{ c.loyaltyTier }})
                    </option>
                  }
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Visit Occasion / Table Note (Optional)</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="e.g. Table T-7 • Family dinner celebration"
                  [(ngModel)]="visitNote"
                />
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showVisitModal = false">Cancel</button>
              <button
                class="btn btn-primary"
                (click)="executeLogVisit()"
                [disabled]="!visitCustomerId"
              >
                Confirm Visit (+1 Visit Count)
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Credit Points Modal -->
      @if (showRewardModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card">Credit Customer Points</h3>
              <button class="close-btn" (click)="showRewardModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">Select Customer *</label>
                <select class="form-select" [(ngModel)]="selectedCustId">
                  @for (c of customers(); track c.id) {
                    <option [value]="c.id">
                      {{ c.name }} • {{ c.phone }} (Current: {{ c.loyaltyPoints }} pts)
                    </option>
                  }
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Points to Credit *</label>
                <input type="number" class="form-input" min="1" [(ngModel)]="pointsToCredit" />
              </div>
              <div class="form-group">
                <label class="form-label">Reason / Occasion *</label>
                <input
                  type="text"
                  class="form-input"
                  placeholder="e.g. Welcome bonus or goodwill credit"
                  [(ngModel)]="creditReason"
                />
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showRewardModal = false">Cancel</button>
              <button
                class="btn btn-primary"
                (click)="executeCreditPoints()"
                [disabled]="!selectedCustId || !pointsToCredit || !creditReason.trim()"
              >
                Award Points
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Configure Milestone 7-Visit Reward Modal -->
      @if (showMilestoneModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card modal-lg">
            <div class="modal-header">
              <div>
                <h3 class="modal-title">Configure Visit Milestone Reward</h3>
                <p class="text-xs text-muted">
                  Set the threshold visits and exclusive coupon/meal reward for loyal diners.
                </p>
              </div>
              <button class="close-btn" (click)="showMilestoneModal = false">
                <i class="ph ph-x"></i>
              </button>
            </div>

            <div class="modal-body space-y-4">
              <div class="form-row-2">
                <div class="form-group">
                  <label class="form-label">Target Visit Count</label>
                  <input
                    type="number"
                    min="2"
                    max="50"
                    class="form-input"
                    [(ngModel)]="editingMilestoneConfig.targetVisits"
                  />
                  <span class="form-hint">Number of dining visits needed (e.g. 7).</span>
                </div>

                <div class="form-group">
                  <label class="form-label">Reward Type</label>
                  <select class="form-select" [(ngModel)]="editingMilestoneConfig.rewardType">
                    <option value="PERCENT_DISCOUNT">Percentage Discount (e.g. 50% OFF)</option>
                    <option value="FREE_MEAL">Free Meal (100% OFF with cap)</option>
                    <option value="FLAT_DISCOUNT">Flat Rupee Discount (e.g. ₹300 OFF)</option>
                  </select>
                </div>
              </div>

              <div class="form-row-2">
                @if (editingMilestoneConfig.rewardType === 'PERCENT_DISCOUNT') {
                  <div class="form-group">
                    <label class="form-label">Discount Percentage (%)</label>
                    <input
                      type="number"
                      min="5"
                      max="100"
                      class="form-input"
                      [(ngModel)]="editingMilestoneConfig.discountPercent"
                    />
                  </div>
                } @else if (editingMilestoneConfig.rewardType === 'FREE_MEAL') {
                  <div class="form-group">
                    <label class="form-label">Free Meal Value Cap (₹)</label>
                    <input
                      type="number"
                      min="100"
                      class="form-input"
                      [ngModel]="(editingMilestoneConfig.maxDiscountPaise || 50000) / 100"
                      (ngModelChange)="editingMilestoneConfig.maxDiscountPaise = $event * 100"
                    />
                    <span class="form-hint">Maximum bill amount covered by the free meal.</span>
                  </div>
                } @else {
                  <div class="form-group">
                    <label class="form-label">Flat Discount Amount (₹)</label>
                    <input
                      type="number"
                      min="50"
                      class="form-input"
                      [ngModel]="(editingMilestoneConfig.flatDiscountPaise || 30000) / 100"
                      (ngModelChange)="editingMilestoneConfig.flatDiscountPaise = $event * 100"
                    />
                  </div>
                }

                <div class="form-group">
                  <label class="form-label">Coupon Code (Customer Facing)</label>
                  <input
                    type="text"
                    class="form-input font-mono font-bold"
                    [(ngModel)]="editingMilestoneConfig.couponCode"
                    placeholder="VISIT7FREE"
                  />
                  <span class="form-hint">Used by customer at checkout (auto-uppercased).</span>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Reward Display Title</label>
                <input
                  type="text"
                  class="form-input"
                  [(ngModel)]="editingMilestoneConfig.title"
                  placeholder="7th Visit Celebration Reward"
                />
              </div>

              <div class="form-group">
                <label class="form-label">Reward Description &amp; Perks Note</label>
                <textarea
                  class="form-input"
                  rows="2"
                  [(ngModel)]="editingMilestoneConfig.description"
                  placeholder="Enjoy 50% OFF your bill (up to ₹500) as a special thank-you on your 7th dining visit."
                ></textarea>
              </div>

              <div class="form-group">
                <label class="checkbox-inline">
                  <input type="checkbox" [(ngModel)]="editingMilestoneConfig.isActive" />
                  <span>Active &amp; Visible to Eligible Diners on Customer Web</span>
                </label>
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showMilestoneModal = false">Cancel</button>
              <button class="btn btn-primary" (click)="saveMilestoneRewardConfig()">
                <i class="ph ph-check"></i>
                <span>Save Milestone Policy</span>
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .loyalty-page {
        display: flex;
        flex-direction: column;
        gap: 24px;
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
        gap: 12px;
        flex-wrap: wrap;
      }

      /* KPI Cards */
      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
      }
      .kpi-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 18px;
        display: flex;
        align-items: center;
        gap: 16px;
        box-shadow: var(--shadow-xs);
      }
      .kpi-icon-wrap {
        width: 48px;
        height: 48px;
        border-radius: var(--radius-sm);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        flex-shrink: 0;

        &.bg-blue {
          background: rgba(59, 130, 246, 0.12);
          color: #3b82f6;
        }
        &.bg-green {
          background: rgba(34, 197, 94, 0.12);
          color: #22c55e;
        }
        &.bg-gold {
          background: rgba(234, 179, 8, 0.15);
          color: #eab308;
        }
        &.bg-purple {
          background: rgba(168, 85, 247, 0.15);
          color: #a855f7;
        }
      }
      .kpi-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .kpi-label {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted);
      }
      .kpi-value {
        font-size: 1.5rem;
        font-weight: 800;
        color: var(--color-text-primary);
        line-height: 1.2;
      }
      .kpi-sub {
        font-size: 0.6875rem;
        color: var(--color-text-secondary);
      }

      /* Milestone Policy Highlight Card */
      .milestone-policy-card {
        background:
          linear-gradient(135deg, rgba(234, 179, 8, 0.08) 0%, rgba(249, 115, 22, 0.05) 100%),
          var(--color-surface);
        border: 1px solid rgba(234, 179, 8, 0.35);
        border-radius: var(--radius-lg);
        padding: 22px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
        box-shadow: 0 4px 18px rgba(234, 179, 8, 0.06);
      }
      .milestone-card-left {
        display: flex;
        align-items: flex-start;
        gap: 16px;
      }
      .milestone-icon-wrap {
        width: 52px;
        height: 52px;
        border-radius: 16px;
        background: rgba(234, 179, 8, 0.18);
        color: #d97706;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.75rem;
        flex-shrink: 0;
      }
      .milestone-badge-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 6px;
      }
      .milestone-tag {
        font-size: 0.6875rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        background: rgba(0, 0, 0, 0.06);
        color: var(--color-text-primary);
        padding: 2px 8px;
        border-radius: 20px;
      }
      .milestone-status-live {
        font-size: 0.6875rem;
        font-weight: 700;
        color: #16a34a;
        background: rgba(22, 163, 74, 0.12);
        padding: 2px 8px;
        border-radius: 20px;
      }
      .milestone-status-paused {
        font-size: 0.6875rem;
        font-weight: 700;
        color: #dc2626;
        background: rgba(220, 38, 38, 0.12);
        padding: 2px 8px;
        border-radius: 20px;
      }
      .milestone-title {
        font-size: 1.125rem;
        font-weight: 800;
        color: var(--color-text-primary);
        margin: 0 0 4px 0;
      }
      .milestone-desc {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        margin: 0 0 10px 0;
        max-width: 650px;
        line-height: 1.45;
      }
      .milestone-perks-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .perk-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.75rem;
        color: var(--color-text-secondary);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        padding: 4px 10px;
        border-radius: 8px;
        i {
          color: #d97706;
        }
      }
      .milestone-card-actions {
        display: flex;
        align-items: center;
      }
      .form-row-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        @media (max-width: 600px) {
          grid-template-columns: 1fr;
        }
      }
      .form-hint {
        display: block;
        font-size: 0.6875rem;
        color: var(--color-text-muted);
        margin-top: 3px;
      }
      .checkbox-inline {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-primary);
        cursor: pointer;
        input {
          cursor: pointer;
        }
      }
      .modal-card.modal-lg {
        max-width: 580px;
        width: 100%;
      }

      /* Tiers Grid */
      .tiers-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
      }
      .tier-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        box-shadow: var(--shadow-xs);

        &.tier-platinum {
          border-color: rgba(234, 179, 8, 0.5);
          background: linear-gradient(
            135deg,
            var(--color-surface) 0%,
            rgba(234, 179, 8, 0.05) 100%
          );
        }
        &.tier-gold {
          border-color: rgba(234, 179, 8, 0.3);
        }
      }
      .tier-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }
      .tier-badge-group {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .tier-members-count {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }
      .tier-visits-req {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-text-secondary);
        background: var(--color-bone-light);
        padding: 3px 8px;
        border-radius: var(--radius-xs);
      }
      .tier-discount-banner {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }
      .discount-val {
        font-size: 1.125rem;
        font-weight: 800;
        color: var(--color-onyx);
      }
      .multiplier-tag {
        font-size: 0.6875rem;
        font-weight: 700;
        color: var(--color-text-muted);
      }
      .tier-perks-text {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        line-height: 1.45;
        margin: 0;
      }

      /* Panel Box */
      .panel-box {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 16px;
      }
      .table-search-box {
        display: flex;
        align-items: center;
        gap: 12px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md, 10px);
        padding: 0 14px;
        height: 44px;
        width: 100%;
        max-width: 320px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        transition: all var(--transition-fast, 0.15s ease);

        &:focus-within {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px rgba(194, 65, 12, 0.12);
        }

        i {
          color: var(--color-text-muted);
          font-size: 1.125rem;
        }
        .search-input {
          border: none;
          background: none;
          outline: none;
          width: 100%;
          font-size: 0.875rem;
          color: var(--color-text-primary);

          &::placeholder {
            color: var(--color-text-muted);
          }
        }
      }

      /* Filter Tabs */
      .tier-filter-tabs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .tab-btn {
        padding: 6px 12px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        border-radius: var(--radius-sm);
        background: none;
        border: 1px solid var(--color-border);
        cursor: pointer;
        transition: all var(--transition-fast);
        display: inline-flex;
        align-items: center;
        gap: 6px;

        &:hover {
          background: var(--color-bone-light);
        }
        &.active {
          background: var(--color-onyx);
          color: #ffffff;
          border-color: var(--color-onyx);
        }
      }

      /* Table Elements */
      .phone-cell {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-family: var(--font-mono, monospace);
        font-size: 0.8125rem;
        font-weight: 700;
        color: var(--color-text-primary);
        background: var(--color-bone-light);
        padding: 3px 8px;
        border-radius: var(--radius-xs);

        i {
          color: var(--color-gold);
        }
      }
      .visit-count-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        color: var(--color-text-primary);

        i {
          color: var(--color-success);
        }
      }
      .progress-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 140px;
      }
      .progress-bar-bg {
        height: 6px;
        background: var(--color-bone);
        border-radius: var(--radius-full);
        overflow: hidden;
      }
      .progress-bar-fill {
        height: 100%;
        background: #3b82f6;
        border-radius: var(--radius-full);
        transition: width 0.3s ease;

        &.fill-gold {
          background: #eab308;
        }
      }
      .progress-label {
        font-size: 0.6875rem;
        color: var(--color-text-muted);
      }
      .quick-visit-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-weight: 700;
      }

      .text-success {
        color: var(--color-success);
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
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .close-btn {
        font-size: 1.25rem;
        color: var(--color-text-muted);
        background: none;
        border: none;
        cursor: pointer;
        &:hover {
          color: var(--color-onyx);
        }
      }
    `,
  ],
})
export class LoyaltyManagementComponent {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);

  constructor() {
    this.dataService.loadCustomers();
  }

  readonly isLoading = computed(
    () => this.dataService.isCustomersLoading() || !this.dataService.customersLoaded(),
  );

  tiers = this.mock.loyaltyTiers;
  transactions = this.mock.loyaltyTransactions;
  customers = this.mock.customers;

  searchQuery = signal<string>('');
  tierFilter = signal<'ALL' | 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE'>('ALL');

  // Computed KPI Metrics
  readonly totalVisits = computed(() => {
    return this.customers().reduce((acc, c) => acc + (c.visitCount || 0), 0);
  });

  readonly regularGuestsCount = computed(() => {
    return this.customers().filter((c) => (c.visitCount || 0) >= 3).length;
  });

  readonly vipGuestsCount = computed(() => {
    return this.customers().filter((c) => (c.visitCount || 0) >= 10).length;
  });

  readonly tierCounts = computed(() => {
    const custs = this.customers();
    return {
      BRONZE: custs.filter((c) => (c.visitCount || 0) < 3).length,
      SILVER: custs.filter((c) => (c.visitCount || 0) >= 3 && (c.visitCount || 0) < 5).length,
      GOLD: custs.filter((c) => (c.visitCount || 0) >= 5 && (c.visitCount || 0) < 10).length,
      PLATINUM: custs.filter((c) => (c.visitCount || 0) >= 10).length,
    };
  });

  readonly filteredCustomers = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const tier = this.tierFilter();
    let list = this.customers();

    if (tier !== 'ALL') {
      list = list.filter((c) => c.loyaltyTier === tier);
    }

    if (q) {
      list = list.filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(q)) ||
          (c.phone && c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, ''))) ||
          (c.phoneE164 && c.phoneE164.includes(q)),
      );
    }

    return list;
  });

  getNextTierInfo(cust: Customer): {
    nextTier: string;
    neededVisits: number;
    progressPercent: number;
  } {
    const visits = cust.visitCount || 0;
    if (visits >= 10) {
      return { nextTier: 'VIP MAX', neededVisits: 0, progressPercent: 100 };
    }
    if (visits >= 5) {
      const needed = 10 - visits;
      const pct = Math.round(((visits - 5) / 5) * 100);
      return { nextTier: 'PLATINUM', neededVisits: needed, progressPercent: Math.max(15, pct) };
    }
    if (visits >= 3) {
      const needed = 5 - visits;
      const pct = Math.round(((visits - 3) / 2) * 100);
      return { nextTier: 'GOLD', neededVisits: needed, progressPercent: Math.max(25, pct) };
    }
    const needed = 3 - visits;
    const pct = Math.round((visits / 3) * 100);
    return { nextTier: 'SILVER', neededVisits: needed, progressPercent: Math.max(20, pct) };
  }

  // Visit Modal State
  showVisitModal = false;
  visitCustomerId = '';
  visitNote = '';

  openVisitModal(cust?: Customer): void {
    this.visitCustomerId = cust ? cust.id : this.customers()[0]?.id || '';
    this.visitNote = '';
    this.showVisitModal = true;
  }

  executeLogVisit(): void {
    if (!this.visitCustomerId) return;
    const res = this.mock.logCustomerVisit(this.visitCustomerId, this.visitNote);
    if (res.success && res.customer) {
      this.toastService.success(
        `Logged visit #${res.customer.visitCount} for ${res.customer.name} (${res.customer.loyaltyTier})`,
      );
      this.showVisitModal = false;
    } else {
      this.toastService.error('Failed to log visit');
    }
  }

  quickLogVisit(cust: Customer, event: MouseEvent): void {
    event.stopPropagation();
    const res = this.mock.logCustomerVisit(cust.id, 'Dine-In Table Visit');
    if (res.success && res.customer) {
      this.toastService.success(
        `Visit #${res.customer.visitCount} recorded for ${cust.name}! Tier: ${res.customer.loyaltyTier}`,
      );
    }
  }

  // Reward Modal State
  showRewardModal = false;
  selectedCustId = '';
  pointsToCredit = 200;
  creditReason = '';

  openRewardModal(): void {
    this.selectedCustId = this.customers()[0]?.id || '';
    this.pointsToCredit = 200;
    this.creditReason = 'Festival Courtesy Points';
    this.showRewardModal = true;
  }

  executeCreditPoints(): void {
    if (!this.selectedCustId || !this.pointsToCredit) return;

    const cust = this.customers().find((c) => c.id === this.selectedCustId);
    if (!cust) return;

    this.mock.awardLoyaltyPoints(cust.id, Number(this.pointsToCredit), this.creditReason.trim());

    this.toastService.success(`Awarded ${this.pointsToCredit} points to ${cust.name}`);
    this.showRewardModal = false;
  }

  // Milestone 7-Visit Reward State
  readonly milestoneReward = computed(() => this.dataService.milestoneRewardConfig());
  showMilestoneModal = false;
  editingMilestoneConfig: LoyaltyMilestoneRewardConfig = { ...DEFAULT_MILESTONE_REWARD };

  openMilestoneConfigModal(): void {
    this.editingMilestoneConfig = { ...this.dataService.milestoneRewardConfig() };
    this.showMilestoneModal = true;
  }

  saveMilestoneRewardConfig(): void {
    if (!this.editingMilestoneConfig.couponCode) {
      this.toastService.warning('Please provide a valid coupon code for the milestone reward.');
      return;
    }
    this.editingMilestoneConfig.couponCode = this.editingMilestoneConfig.couponCode
      .toUpperCase()
      .trim();
    this.dataService.updateMilestoneRewardConfig(this.editingMilestoneConfig);
    this.toastService.success(
      `Milestone policy updated: ${this.editingMilestoneConfig.targetVisits} visits reward set (${this.editingMilestoneConfig.couponCode})`,
    );
    this.showMilestoneModal = false;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.showRewardModal = false;
      this.showVisitModal = false;
      this.showMilestoneModal = false;
    }
  }
}
