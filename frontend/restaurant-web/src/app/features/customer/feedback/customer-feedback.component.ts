import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { ToastService } from '../../../core/services/toast.service';
import { Feedback } from '../../../core/models/feedback.model';

@Component({
  selector: 'app-customer-feedback',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="customer-feedback-page">
      <div class="feedback-card">
        @if (!isSubmitted) {
          <div class="feedback-head">
            <div class="crest-icon"><i class="ph ph-crown"></i></div>
            <h1 class="heading-section">Your Royal Dining Experience</h1>
            <p class="text-sm text-muted">
              Please take a moment to rate your feast. Your thoughts guide our master culinary
              craftsmanship.
            </p>
          </div>

          <div class="ratings-block">
            <div class="rate-group">
              <span class="rate-label">Overall Experience</span>
              <div class="stars-selector">
                @for (star of [1, 2, 3, 4, 5]; track star) {
                  <button class="star-btn" (click)="overallRating = star">
                    <i
                      class="ph"
                      [class.ph-star-fill]="star <= overallRating"
                      [class.ph-star]="star > overallRating"
                      [class.text-gold]="star <= overallRating"
                    ></i>
                  </button>
                }
              </div>
            </div>

            <div class="rate-group">
              <span class="rate-label">Food Flavour & Temperature</span>
              <div class="stars-selector">
                @for (star of [1, 2, 3, 4, 5]; track star) {
                  <button class="star-btn" (click)="foodRating = star">
                    <i
                      class="ph"
                      [class.ph-star-fill]="star <= foodRating"
                      [class.ph-star]="star > foodRating"
                      [class.text-gold]="star <= foodRating"
                    ></i>
                  </button>
                }
              </div>
            </div>

            <div class="rate-group">
              <span class="rate-label">Table & Floor Service</span>
              <div class="stars-selector">
                @for (star of [1, 2, 3, 4, 5]; track star) {
                  <button class="star-btn" (click)="serviceRating = star">
                    <i
                      class="ph"
                      [class.ph-star-fill]="star <= serviceRating"
                      [class.ph-star]="star > serviceRating"
                      [class.text-gold]="star <= serviceRating"
                    ></i>
                  </button>
                }
              </div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="comments">Culinary Remarks / Compliments</label>
            <textarea
              id="comments"
              class="form-textarea"
              rows="3"
              placeholder="Tell us what dish you relished most..."
              [(ngModel)]="comments"
            ></textarea>
          </div>

          <button
            class="btn btn-primary submit-btn"
            [disabled]="!comments.trim()"
            (click)="submitReview()"
          >
            Submit Dining Review
          </button>
        } @else {
          <div class="thank-you-view">
            <div class="crest-icon success"><i class="ph ph-heart"></i></div>
            <h2 class="heading-section">Shukriya! Thank You</h2>
            <p class="text-sm text-muted">
              Your review has been conveyed to Executive Chef Ranveer Brar and the culinary brigade.
            </p>
            <a
              routerLink="/menu/gurukripa-dhaba"
              class="btn btn-secondary"
              style="margin-top: 12px;"
              >Return to Restaurant Home</a
            >
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .customer-feedback-page {
        display: flex;
        justify-content: center;
        padding: 16px 0 32px;
      }

      .feedback-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: 32px 24px;
        max-width: 500px;
        width: 100%;
        box-shadow: var(--shadow-md);
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .feedback-head {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }

      .crest-icon {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: var(--color-onyx);
        color: var(--color-gold);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.6rem;
        margin-bottom: 4px;

        &.success {
          background: var(--color-success-bg);
          color: var(--color-success);
        }
      }

      .ratings-block {
        display: flex;
        flex-direction: column;
        gap: 14px;
        background: var(--color-bone-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-sm);
        padding: 16px;
      }

      .rate-group {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .rate-label {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-primary);
      }

      .stars-selector {
        display: flex;
        gap: 4px;
      }

      .star-btn {
        font-size: 1.4rem;
        color: var(--color-border);
        padding: 2px;
        transition: transform var(--transition-fast);
        &:hover {
          transform: scale(1.15);
        }
      }

      .submit-btn {
        width: 100%;
        padding: 12px;
        font-size: 0.9375rem;
      }

      .thank-you-view {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 24px 0;
      }
    `,
  ],
})
export class CustomerFeedbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  private toastService = inject(ToastService);

  orderId = '';
  overallRating = 5;
  foodRating = 5;
  serviceRating = 5;
  comments = '';
  isSubmitted = false;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.orderId = params.get('orderId') || '';
    });
  }

  submitReview(): void {
    if (!this.comments.trim()) return;

    const ord = this.mock
      .orders()
      .find((o) => o.id === this.orderId || o.orderNumber === this.orderId);

    const newFeedback: Feedback = {
      id: `fdbk-${Date.now().toString().slice(-4)}`,
      orderId: this.orderId,
      orderNumber: ord?.orderNumber || '#ORD-DINE',
      customerName: ord?.customerName || 'Valued Table Diner',
      rating: this.overallRating,
      foodRating: this.foodRating,
      serviceRating: this.serviceRating,
      comment: this.comments.trim(),
      createdAt: new Date().toISOString(),
      status: 'PUBLISHED',
    };

    const updated = [newFeedback, ...this.mock.feedbacks()];
    this.mock.feedbacks.set(updated);
    this.mock.saveLocal('feedbacks', updated);

    this.isSubmitted = true;
    this.toastService.success('Review submitted successfully!');
  }
}
