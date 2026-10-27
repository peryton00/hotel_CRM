import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MockDataService } from '../../../data-access/mock/mock-data.service';
import { LoyaltyTierConfig, LoyaltyTransaction } from '../../../core/models/loyalty.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-loyalty-management',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyInrPipe],
  template: `
    <div class="loyalty-page">
      <div class="page-header">
        <div>
          <h1 class="heading-display">Loyalty & Rewards Program</h1>
          <p class="text-muted">
            Configure membership tiers, point accrual multipliers, and reward transactions.
          </p>
        </div>

        <button class="btn btn-primary" (click)="openRewardModal()">
          <i class="ph ph-gift"></i>
          <span>Credit Dining Points</span>
        </button>
      </div>

      <!-- Membership Tiers Overview -->
      <div class="panel-box">
        <h2 class="heading-card">Membership Tiers & Privileges</h2>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Min Lifetime Spend</th>
                <th>Points Multiplier</th>
                <th>Special Discount</th>
                <th>Exclusive Perks</th>
              </tr>
            </thead>
            <tbody>
              @for (tier of tiers(); track tier.tier) {
                <tr>
                  <td>
                    <span
                      class="badge"
                      [class.badge-gold]="tier.tier === 'PLATINUM' || tier.tier === 'GOLD'"
                      [class.badge-outline]="tier.tier === 'SILVER' || tier.tier === 'BRONZE'"
                    >
                      <i class="ph ph-crown" *ngIf="tier.tier === 'PLATINUM'"></i>
                      {{ tier.tier }}
                    </span>
                  </td>
                  <td>
                    <strong>{{ tier.minSpend | currencyInr }}</strong>
                  </td>
                  <td>{{ tier.pointsPer100Inr }} pts / ₹100</td>
                  <td>
                    {{
                      tier.discountPercent > 0
                        ? tier.discountPercent + '% Savings'
                        : 'Standard Rates'
                    }}
                  </td>
                  <td>
                    <span class="text-sm text-secondary">{{ tier.perks }}</span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Recent Points Ledger -->
      <div class="panel-box">
        <h2 class="heading-card">Recent Points Ledger Transactions</h2>
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Customer</th>
                <th>Transaction Type</th>
                <th>Points</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
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
                      {{ tx.type }}
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
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Credit Points Modal -->
      @if (showRewardModal) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card">Credit Guest Dining Bonus</h3>
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
                      {{ c.name }} (Current: {{ c.loyaltyPoints }} pts)
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
                  placeholder="e.g. VIP Chef Table Welcome Bonus"
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
    </div>
  `,
  styles: [
    `
      .loyalty-page {
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
      .panel-box {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
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
export class LoyaltyManagementComponent {
  private mock = inject(MockDataService);
  private toastService = inject(ToastService);

  tiers = this.mock.loyaltyTiers;
  transactions = this.mock.loyaltyTransactions;
  customers = this.mock.customers;

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

    const newTx: LoyaltyTransaction = {
      id: `lt-${Date.now().toString().slice(-4)}`,
      customerId: cust.id,
      customerName: cust.name,
      type: 'EARNED',
      points: Number(this.pointsToCredit),
      description: this.creditReason.trim(),
      date: new Date().toISOString(),
    };

    const updatedTx = [newTx, ...this.mock.loyaltyTransactions()];
    this.mock.loyaltyTransactions.set(updatedTx);
    this.mock.saveLocal('loyaltyTransactions', updatedTx);

    // Update customer points
    const updatedCusts = this.mock
      .customers()
      .map((c) =>
        c.id === cust.id
          ? { ...c, loyaltyPoints: c.loyaltyPoints + Number(this.pointsToCredit) }
          : c,
      );
    this.mock.customers.set(updatedCusts);
    this.mock.saveLocal('customers', updatedCusts);

    this.toastService.success(`Awarded ${this.pointsToCredit} points to ${cust.name}`);
    this.showRewardModal = false;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.showRewardModal = false;
    }
  }
}
