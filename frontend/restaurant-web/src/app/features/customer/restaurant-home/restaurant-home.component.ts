import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { RestaurantDataService } from '../../../data-access/services/restaurant-data.service';
import { CartService } from '../../../core/services/cart.service';

@Component({
  selector: 'app-restaurant-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="restaurant-home-page">
      <!-- Hero Cover & Brand Presentation -->
      <div class="restaurant-hero">
        <div class="hero-image-wrap">
          <img
            [src]="
              restaurant()?.coverImage ||
              'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80'
            "
            alt="GuruKripa Dhaba Ambiance"
            class="hero-img"
          />
          <div class="hero-overlay"></div>
        </div>

        <div class="hero-content">
          <div class="crest-badge"><i class="ph ph-crown"></i></div>
          <h1 class="heading-display brand-hero-title">
            {{ restaurant()?.name || 'GuruKripa Dhaba' }}
          </h1>
          <p class="tagline">
            {{ restaurant()?.tagline || 'Artisanal Mughlai & Contemporary Indian Bistro' }}
          </p>

          <div class="meta-pills">
            <span class="m-pill"><i class="ph ph-star text-gold"></i> 4.85 (1.4k+ Reviews)</span>
            <span class="m-pill"><i class="ph ph-map-pin"></i> MG Road, Civil Lines</span>
            <span class="m-pill"><i class="ph ph-clock"></i> Open: 12:00 PM – 11:30 PM</span>
          </div>
        </div>
      </div>

      <!-- Table Dining Context Banner -->
      @if (cartService.tableContext(); as tbl) {
        <div class="table-order-banner">
          <div class="banner-left">
            <div class="table-icon-circle"><i class="ph ph-fork-knife"></i></div>
            <div>
              <div class="banner-title">Dining at Table {{ tbl.tableNumber }}</div>
              <div class="banner-sub">
                Your digital QR session is active. Dishes will be served directly to your table.
              </div>
            </div>
          </div>
          <a [routerLink]="['/menu/gurukripa-dhaba/table', tbl.token]" class="btn btn-primary">
            <span>Explore Menu</span>
            <i class="ph ph-arrow-right"></i>
          </a>
        </div>
      } @else {
        <div class="table-order-banner guest-mode">
          <div class="banner-left">
            <div class="table-icon-circle"><i class="ph ph-qr-code"></i></div>
            <div>
              <div class="banner-title">Dine-In Digital Table Menu</div>
              <div class="banner-sub">
                Select your dining table or explore our royal culinary catalog.
              </div>
            </div>
          </div>
          <a [routerLink]="['/menu/gurukripa-dhaba/table/tbl-07']" class="btn btn-primary">
            <span>Enter Table 07 Menu</span>
            <i class="ph ph-arrow-right"></i>
          </a>
        </div>
      }

      <!-- Culinary Narrative & Cuisines -->
      <div class="story-card">
        <h2 class="heading-section">Royal Heritage & Wood-Fired Charcoal</h2>
        <p class="story-p">
          Rooted in Awadhi royal kitchens and centuries-old culinary secrets, GuruKripa Dhaba
          slow-cooks each handi over charcoal embers with hand-pounded whole spices, pure saffron,
          and clotted cream.
        </p>

        <div class="cuisine-chips">
          @for (
            c of restaurant()?.cuisine || [
              'Mughlai',
              'Tandoor',
              'Awadhi',
              'Biryani',
              'Continental',
            ];
            track c
          ) {
            <span class="c-chip">{{ c }}</span>
          }
        </div>
      </div>

      <!-- Quick Action Navigation -->
      <div class="features-grid">
        <a [routerLink]="['/menu/gurukripa-dhaba/table/tbl-07']" class="feature-action-card">
          <div class="feature-icon"><i class="ph ph-book-open"></i></div>
          <div class="feature-text">
            <h3>Full Menu Catalog</h3>
            <p>25+ artisanal starters, charcoal kebabs, slow-dum biryanis and desserts.</p>
          </div>
          <i class="ph ph-caret-right chevron"></i>
        </a>

        <a [routerLink]="['/menu/gurukripa-dhaba/coupons']" class="feature-action-card">
          <div class="feature-icon gold"><i class="ph ph-ticket"></i></div>
          <div class="feature-text">
            <h3>Dining Offers & Coupons</h3>
            <p>Exclusive promotions up to 25% off for table diners.</p>
          </div>
          <i class="ph ph-caret-right chevron"></i>
        </a>
      </div>

      <!-- Operating Hours & Location -->
      <div class="info-footer-card">
        <div class="info-block">
          <h4 class="info-title"><i class="ph ph-clock"></i> Service Timings</h4>
          <p>Lunch: 12:00 PM – 03:30 PM</p>
          <p>Royal Dinner: 07:00 PM – 11:30 PM</p>
        </div>
        <div class="info-block">
          <h4 class="info-title"><i class="ph ph-phone"></i> Reservations & Concierge</h4>
          <p>+91 80 4912 8800</p>
          <p>concierge&#64;royalspice.dining</p>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .restaurant-home-page {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .restaurant-hero {
        position: relative;
        border-radius: var(--radius-lg);
        overflow: hidden;
        box-shadow: var(--shadow-md);
        min-height: 280px;
        display: flex;
        align-items: flex-end;
      }

      .hero-image-wrap {
        position: absolute;
        inset: 0;
      }

      .hero-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .hero-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to top,
          rgba(18, 18, 18, 0.92) 0%,
          rgba(18, 18, 18, 0.4) 60%,
          rgba(18, 18, 18, 0.1) 100%
        );
      }

      .hero-content {
        position: relative;
        z-index: 2;
        padding: 28px 24px;
        color: #ffffff;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .crest-badge {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(212, 175, 55, 0.2);
        border: 1px solid var(--color-gold);
        color: var(--color-gold);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        margin-bottom: 4px;
      }

      .brand-hero-title {
        font-size: 2.25rem;
        color: #ffffff;
        letter-spacing: -0.01em;

        @media (max-width: 600px) {
          font-size: 1.75rem;
        }
      }

      .tagline {
        font-size: 0.9375rem;
        color: var(--color-bone-dark);
        font-weight: 400;
      }

      .meta-pills {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 6px;
      }

      .m-pill {
        font-size: 0.75rem;
        background: rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(4px);
        padding: 4px 10px;
        border-radius: var(--radius-full);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .table-order-banner {
        background: var(--color-surface);
        border: 2px solid var(--color-crimson);
        border-radius: var(--radius-md);
        padding: 18px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
        box-shadow: 0 4px 16px rgba(194, 24, 7, 0.08);

        &.guest-mode {
          border-color: var(--color-border);
        }
      }

      .banner-left {
        display: flex;
        align-items: center;
        gap: 14px;
      }

      .table-icon-circle {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--color-crimson-subtle);
        color: var(--color-crimson);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4rem;
        flex-shrink: 0;
      }

      .banner-title {
        font-size: 1.05rem;
        font-weight: 800;
        color: var(--color-text-primary);
      }

      .banner-sub {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        margin-top: 2px;
      }

      .story-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .story-p {
        font-size: 0.9375rem;
        color: var(--color-text-secondary);
        line-height: 1.6;
      }

      .cuisine-chips {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 6px;
      }

      .c-chip {
        background: var(--color-bone);
        border: 1px solid var(--color-border);
        padding: 4px 12px;
        border-radius: var(--radius-full);
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--color-text-secondary);
      }

      .features-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;

        @media (max-width: 600px) {
          grid-template-columns: 1fr;
        }
      }

      .feature-action-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 18px;
        display: flex;
        align-items: center;
        gap: 14px;
        transition: all var(--transition-fast);

        &:hover {
          border-color: var(--color-crimson);
          transform: translateY(-2px);
          box-shadow: var(--shadow-sm);
        }
      }

      .feature-icon {
        width: 44px;
        height: 44px;
        border-radius: var(--radius-sm);
        background: var(--color-crimson-subtle);
        color: var(--color-crimson);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4rem;
        flex-shrink: 0;

        &.gold {
          background: var(--color-gold-subtle);
          color: #7d6514;
        }
      }

      .feature-text {
        flex: 1;
        h3 {
          font-size: 0.9375rem;
          font-weight: 700;
          margin-bottom: 2px;
        }
        p {
          font-size: 0.75rem;
          color: var(--color-text-muted);
          line-height: 1.35;
        }
      }

      .chevron {
        color: var(--color-taupe);
        font-size: 1.1rem;
      }

      .info-footer-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 20px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;

        @media (max-width: 600px) {
          grid-template-columns: 1fr;
        }
      }

      .info-title {
        font-size: 0.875rem;
        font-weight: 700;
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .info-block p {
        font-size: 0.8125rem;
        color: var(--color-text-secondary);
        line-height: 1.45;
      }
    `,
  ],
})
export class RestaurantHomeComponent implements OnInit {
  private dataService = inject(RestaurantDataService);
  private mock = this.dataService;
  cartService = inject(CartService);

  restaurant = this.mock.restaurant;

  ngOnInit(): void {
    // If not set, default table 07 context for convenient exploration
    if (!this.cartService.tableContext()) {
      this.cartService.setTableContext('tbl-007', 'T-07', 'tbl-07');
    }
  }
}
