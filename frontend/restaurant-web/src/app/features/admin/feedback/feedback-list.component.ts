import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MockDataService } from '../../../data-access/mock/mock-data.service';
import { Feedback } from '../../../core/models/feedback.model';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-feedback-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="feedback-page">
      <div class="page-header">
        <div>
          <h1 class="heading-display">Guest Reviews & Feedback</h1>
          <p class="text-muted">
            Monitor diner satisfaction, culinary ratings, and submit managerial responses.
          </p>
        </div>

        <div class="rating-kpi-badge">
          <i class="ph ph-star text-gold"></i>
          <span class="rating-val">4.85 / 5.0</span>
          <span class="rating-count">(1,420 Verified Reviews)</span>
        </div>
      </div>

      <div class="toolbar-card">
        <div class="rating-filter-tabs">
          <button
            class="tab-btn"
            [class.active]="ratingFilter() === 0"
            (click)="ratingFilter.set(0)"
          >
            All Reviews ({{ feedbacks().length }})
          </button>
          <button
            class="tab-btn"
            [class.active]="ratingFilter() === 5"
            (click)="ratingFilter.set(5)"
          >
            5 Stars
          </button>
          <button
            class="tab-btn"
            [class.active]="ratingFilter() === 4"
            (click)="ratingFilter.set(4)"
          >
            4 Stars
          </button>
        </div>
      </div>

      <div class="reviews-list">
        @for (fb of filteredFeedbacks(); track fb.id) {
          <div class="review-card">
            <div class="review-header">
              <div class="guest-info">
                <div class="avatar-sm">{{ fb.customerName.charAt(0) }}</div>
                <div>
                  <h3 class="guest-name">{{ fb.customerName }}</h3>
                  <div class="order-ref">
                    Order {{ fb.orderNumber || 'Dine-In' }} •
                    {{ fb.createdAt | date: 'mediumDate' }}
                  </div>
                </div>
              </div>

              <div class="stars-row">
                @for (star of [1, 2, 3, 4, 5]; track star) {
                  <i
                    class="ph ph-star"
                    [class.text-gold]="star <= fb.rating"
                    [class.text-muted]="star > fb.rating"
                  ></i>
                }
              </div>
            </div>

            <p class="review-comment">"{{ fb.comment }}"</p>

            @if (fb.adminResponse) {
              <div class="admin-reply-box">
                <div class="reply-header">
                  <i class="ph ph-arrow-bend-down-right"></i>
                  <span>Response from General Manager Ranveer Brar:</span>
                </div>
                <p class="reply-text">{{ fb.adminResponse }}</p>
              </div>
            } @else {
              <div class="reply-action-row">
                <button class="btn btn-secondary btn-sm" (click)="openReplyModal(fb)">
                  <i class="ph ph-chat-teardrop-text"></i>
                  <span>Submit Managerial Reply</span>
                </button>
              </div>
            }
          </div>
        } @empty {
          <div class="empty-state-panel">
            <h3 class="heading-card">No reviews found</h3>
          </div>
        }
      </div>

      <!-- Manager Response Modal -->
      @if (respondingFeedback) {
        <div class="modal-overlay" (click)="onBackdropClick($event)">
          <div class="modal-card" role="dialog" aria-modal="true">
            <div class="modal-header">
              <h3 class="heading-card">Reply to {{ respondingFeedback.customerName }}</h3>
              <button class="close-btn" (click)="respondingFeedback = null">
                <i class="ph ph-x"></i>
              </button>
            </div>
            <div class="modal-body">
              <div class="original-quote">"{{ respondingFeedback.comment }}"</div>
              <div class="form-group">
                <label class="form-label">Official Response *</label>
                <textarea
                  class="form-textarea"
                  rows="3"
                  placeholder="Thank the guest for dining with us..."
                  [(ngModel)]="responseText"
                ></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="respondingFeedback = null">Cancel</button>
              <button
                class="btn btn-primary"
                (click)="submitReply()"
                [disabled]="!responseText.trim()"
              >
                Publish Response
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .feedback-page {
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

      .rating-kpi-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        padding: 8px 16px;
        border-radius: var(--radius-sm);
      }

      .rating-val {
        font-weight: 800;
        font-size: 1.125rem;
      }
      .rating-count {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .toolbar-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 14px 20px;
      }
      .rating-filter-tabs {
        display: flex;
        gap: 8px;
      }
      .tab-btn {
        padding: 8px 14px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
        border-radius: var(--radius-sm);
        transition: all var(--transition-fast);
        &:hover {
          background: var(--color-bone-light);
        }
        &.active {
          background: var(--color-onyx);
          color: #ffffff;
        }
      }

      .reviews-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .review-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-shadow: var(--shadow-xs);
      }

      .review-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .guest-info {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .avatar-sm {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--color-onyx);
        color: var(--color-gold);
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .guest-name {
        font-size: 1rem;
        font-weight: 700;
      }
      .order-ref {
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .stars-row {
        display: flex;
        gap: 4px;
        font-size: 1.1rem;
      }
      .review-comment {
        font-size: 0.9375rem;
        color: var(--color-text-primary);
        line-height: 1.5;
        font-style: italic;
      }

      .admin-reply-box {
        background: var(--color-bone-light);
        border-left: 3px solid var(--color-crimson);
        border-radius: var(--radius-xs);
        padding: 12px 16px;
        margin-top: 4px;
      }

      .reply-header {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-crimson);
        margin-bottom: 4px;
      }
      .reply-text {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
      }

      .original-quote {
        background: var(--color-bone);
        padding: 12px;
        border-radius: var(--radius-xs);
        font-style: italic;
        font-size: 0.8125rem;
        margin-bottom: 14px;
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
export class FeedbackListComponent {
  private mock = inject(MockDataService);
  private toastService = inject(ToastService);

  feedbacks = this.mock.feedbacks;
  ratingFilter = signal<number>(0);

  respondingFeedback: Feedback | null = null;
  responseText = '';

  filteredFeedbacks = computed(() => {
    if (this.ratingFilter() === 0) return this.feedbacks();
    return this.feedbacks().filter((f) => f.rating === this.ratingFilter());
  });

  openReplyModal(fb: Feedback): void {
    this.respondingFeedback = fb;
    this.responseText = '';
  }

  submitReply(): void {
    if (!this.respondingFeedback || !this.responseText.trim()) return;

    const updated = this.mock
      .feedbacks()
      .map((f) =>
        f.id === this.respondingFeedback!.id
          ? { ...f, adminResponse: this.responseText.trim() }
          : f,
      );
    this.mock.feedbacks.set(updated);
    this.mock.saveLocal('feedbacks', updated);

    this.toastService.success(`Response published for ${this.respondingFeedback.customerName}`);
    this.respondingFeedback = null;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.respondingFeedback = null;
    }
  }
}
