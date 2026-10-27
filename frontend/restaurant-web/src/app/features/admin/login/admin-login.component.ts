import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminAuthService } from '../../../core/services/admin-auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="login-page">
      <div class="login-card">
        <div class="brand-crest">
          <i class="ph ph-crown"></i>
        </div>

        <h1 class="brand-title">GuruKripa Dhaba</h1>
        <p class="brand-sub">Restaurant Operations & CRM Terminal</p>

        <div class="customer-warning-box">
          <i class="ph ph-shield-warning"></i>
          <div>
            <strong>Staff Only Area</strong>
            <p>Customers ordering at tables should browse the food menu.</p>
            <a routerLink="/menu/gurukripa-dhaba" class="customer-menu-link">
              <i class="ph ph-arrow-left"></i>
              <span>Go to Customer Dining Menu</span>
            </a>
          </div>
        </div>

        <form (ngSubmit)="handleLogin()" class="login-form">
          <div class="form-group">
            <label class="form-label" for="staffRole">Staff Position</label>
            <select id="staffRole" class="form-select" [(ngModel)]="role" name="role">
              <option value="Floor Manager">Floor Manager</option>
              <option value="Captain / Steward">Captain / Steward</option>
              <option value="Head Chef (KDS)">Head Chef (Kitchen)</option>
              <option value="Billing Cashier">Billing Cashier</option>
              <option value="General Manager">General Manager (Owner)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="staffPin">Security Access PIN</label>
            <input
              id="staffPin"
              type="password"
              maxlength="4"
              class="form-input pin-input"
              placeholder="••••"
              [(ngModel)]="pin"
              name="pin"
              autocomplete="current-password"
            />
            <span class="hint-text">Default demo staff PIN is <strong>1234</strong></span>
          </div>

          @if (errorMessage()) {
            <div class="error-msg">
              <i class="ph ph-warning-circle"></i>
              <span>{{ errorMessage() }}</span>
            </div>
          }

          <button type="submit" class="btn btn-primary submit-btn">
            <i class="ph ph-lock-key-open"></i>
            <span>Unlock Staff Console</span>
          </button>
        </form>

        <div class="card-footer">
          <a routerLink="/menu/gurukripa-dhaba" class="back-home-link">
            <i class="ph ph-house"></i>
            <span>Back to Public Storefront</span>
          </a>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .login-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-onyx);
        padding: 24px;
        position: relative;

        &::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(194, 24, 7, 0.15) 0%, transparent 70%);
          pointer-events: none;
        }
      }

      .login-card {
        width: 100%;
        max-width: 440px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: 36px 32px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
        position: relative;
        z-index: 1;
        text-align: center;
      }

      .brand-crest {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--color-onyx);
        color: var(--color-gold);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.75rem;
        margin: 0 auto 16px;
        box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);
      }

      .brand-title {
        font-family: var(--font-display);
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--color-text-primary);
        margin-bottom: 4px;
      }

      .brand-sub {
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        margin-bottom: 20px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .customer-warning-box {
        background: var(--color-bone-light);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        padding: 12px 14px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        text-align: left;
        margin-bottom: 20px;
        font-size: 0.8125rem;

        i {
          font-size: 1.25rem;
          color: var(--color-crimson);
          flex-shrink: 0;
          margin-top: 2px;
        }

        p {
          margin: 2px 0 6px;
          color: var(--color-text-secondary);
        }
      }

      .customer-menu-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--color-crimson);
        font-weight: 700;
        font-size: 0.8125rem;
        &:hover {
          text-decoration: underline;
        }
      }

      .login-form {
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .pin-input {
        font-size: 1.25rem;
        letter-spacing: 0.3em;
        text-align: center;
        font-weight: 700;
      }

      .hint-text {
        display: block;
        margin-top: 6px;
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .error-msg {
        background: var(--color-danger-bg);
        border: 1px solid var(--color-danger);
        color: var(--color-danger);
        border-radius: var(--radius-sm);
        padding: 8px 12px;
        font-size: 0.8125rem;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .submit-btn {
        width: 100%;
        padding: 12px;
        font-size: 0.9375rem;
        font-weight: 700;
        margin-top: 4px;
      }

      .card-footer {
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid var(--color-border-subtle);
      }

      .back-home-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        &:hover {
          color: var(--color-text-primary);
        }
      }
    `,
  ],
})
export class AdminLoginComponent {
  private auth = inject(AdminAuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  role = 'Manager';
  pin = '';
  errorMessage = signal<string>('');

  handleLogin(): void {
    if (!this.pin.trim()) {
      this.errorMessage.set('Please enter your staff PIN or authorization key.');
      return;
    }

    const ok = this.auth.login(this.pin, this.role);
    if (ok) {
      this.toastService.success(`Welcome back, ${this.role}! Access granted.`);
      this.router.navigate(['/admin/dashboard']);
    } else {
      this.errorMessage.set('Invalid credentials. Please verify your staff access.');
    }
  }
}
