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
          <i class="ph ph-shield-check"></i>
          <div>
            <strong>Authorized Staff & Admin Login</strong>
            <p>Access is authenticated strictly against credentials set in Supabase.</p>
          </div>
        </div>

        <form (ngSubmit)="handleLogin()" class="login-form">
          <div class="form-group">
            <label class="form-label" for="loginId">Admin / Staff Access ID</label>
            <div class="input-container">
              <i class="ph ph-identification-badge input-icon"></i>
              <input
                id="loginId"
                type="text"
                class="form-input with-icon"
                placeholder="e.g. admin or assigned staff ID"
                [(ngModel)]="loginId"
                name="loginId"
                autocomplete="username"
                [disabled]="isLoading()"
                required
              />
            </div>
            <span class="hint-text">Enter your Admin username/email or assigned Staff ID</span>
          </div>

          <div class="form-group">
            <label class="form-label" for="staffPassword">Secret Access Password</label>
            <div class="input-container">
              <i class="ph ph-lock-key input-icon"></i>
              <input
                id="staffPassword"
                [type]="showPassword() ? 'text' : 'password'"
                class="form-input with-icon with-action"
                placeholder="Enter password set in Supabase"
                [(ngModel)]="password"
                name="password"
                autocomplete="current-password"
                [disabled]="isLoading()"
                required
              />
              <button
                type="button"
                class="icon-action-btn"
                (click)="togglePasswordVisibility()"
                [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
              >
                <i class="ph" [class.ph-eye]="!showPassword()" [class.ph-eye-slash]="showPassword()"></i>
              </button>
            </div>
            <span class="hint-text">Admin password set in Supabase; assigned staff use their secret password</span>
          </div>

          @if (errorMessage()) {
            <div class="error-msg">
              <i class="ph ph-warning-circle"></i>
              <span>{{ errorMessage() }}</span>
            </div>
          }

          <button type="submit" class="btn btn-primary submit-btn" [disabled]="isLoading() || !loginId.trim() || !password.trim()">
            @if (isLoading()) {
              <i class="ph ph-spinner ph-spin"></i>
              <span>Verifying with Supabase...</span>
            } @else {
              <i class="ph ph-lock-key-open"></i>
              <span>Unlock Staff Console</span>
            }
          </button>
        </form>

        <div class="card-footer">
          <a routerLink="/menu/gurukripa-dhaba" class="back-home-link">
            <i class="ph ph-arrow-left"></i>
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
        background: rgba(46, 125, 50, 0.08);
        border: 1px solid rgba(46, 125, 50, 0.25);
        border-radius: var(--radius-sm);
        padding: 12px 14px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        text-align: left;
        margin-bottom: 20px;
        font-size: 0.8125rem;

        i {
          font-size: 1.35rem;
          color: #2e7d32;
          flex-shrink: 0;
          margin-top: 1px;
        }

        strong {
          color: var(--color-text-primary);
          display: block;
        }

        p {
          margin: 2px 0 0;
          color: var(--color-text-secondary);
          line-height: 1.35;
        }
      }

      .login-form {
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .input-container {
        position: relative;
        display: flex;
        align-items: center;
      }

      .input-icon {
        position: absolute;
        left: 12px;
        font-size: 1.15rem;
        color: var(--color-text-muted);
        pointer-events: none;
      }

      .form-input.with-icon {
        padding-left: 38px;
      }

      .form-input.with-action {
        padding-right: 40px;
      }

      .icon-action-btn {
        position: absolute;
        right: 10px;
        background: transparent;
        border: none;
        color: var(--color-text-muted);
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 4px;
        font-size: 1.15rem;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          color: var(--color-text-primary);
        }
      }

      .hint-text {
        display: block;
        margin-top: 5px;
        font-size: 0.75rem;
        color: var(--color-text-muted);
      }

      .error-msg {
        background: var(--color-danger-bg, rgba(220, 38, 38, 0.1));
        border: 1px solid var(--color-danger, #dc2626);
        color: var(--color-danger, #dc2626);
        border-radius: var(--radius-sm);
        padding: 10px 12px;
        font-size: 0.8125rem;
        display: flex;
        align-items: center;
        gap: 8px;
        text-align: left;
      }

      .submit-btn {
        width: 100%;
        padding: 12px;
        font-size: 0.9375rem;
        font-weight: 700;
        margin-top: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
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

  loginId = '';
  password = '';
  showPassword = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');

  togglePasswordVisibility(): void {
    this.showPassword.set(!this.showPassword());
  }

  handleLogin(): void {
    if (!this.loginId.trim() || !this.password.trim()) {
      this.errorMessage.set('Please provide both your Staff/Admin ID and secret password.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.auth.loginWithSupabase(this.loginId, this.password).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.success) {
          const role = res.user?.role || this.auth.staffRole();
          const name = res.user?.name || this.loginId;
          this.toastService.success(`Welcome, ${name}! (${role}) Access authorized.`);
          const targetRoute = this.auth.getDefaultRouteForRole();
          this.router.navigate([targetRoute]);
        } else {
          this.errorMessage.set(
            res.message ||
              'Invalid credentials. Please verify your ID and password set in Supabase.',
          );
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set(
          'Authentication failed. Access is restricted to credentials set in Supabase.',
        );
      },
    });
  }
}
