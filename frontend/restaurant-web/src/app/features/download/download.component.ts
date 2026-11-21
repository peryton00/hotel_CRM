import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-download',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="download-page">
      <!-- Ambient Glows -->
      <div class="glow-orb orb-primary"></div>
      <div class="glow-orb orb-gold"></div>

      <!-- Header Navigation -->
      <header class="download-header">
        <div class="brand-bar">
          <div class="brand-crest">
            <img src="/logo.svg" alt="Restaurant Logo" class="brand-logo-img" />
          </div>
          <div class="brand-meta">
            <span class="brand-name">GuruKripa Dhaba</span>
            <span class="brand-sub">HOTEL CRM • DESKTOP TERMINAL</span>
          </div>
        </div>
        <div class="header-actions">
          <a routerLink="/admin/login" class="nav-link">
            <i class="ph ph-arrow-left"></i>
            <span>Staff Portal</span>
          </a>
        </div>
      </header>

      <!-- Main Hero -->
      <main class="download-content">
        <section class="hero-section">
          <div class="platform-badge">
            <i class="ph-fill ph-windows-logo"></i>
            <span>Windows 10 & 11 (64-Bit)</span>
          </div>

          <h1 class="hero-title">The Modern Desktop POS & Kitchen System</h1>
          <p class="hero-subtitle">
            Engineered for restaurant counters. Runs natively on Windows with offline resilience,
            instant desktop shortcut, automatic startup on boot, and direct thermal printer
            integration.
          </p>

          <!-- Primary Download CTA Box -->
          <div class="download-card">
            <div class="card-left">
              <div class="app-icon-wrap">
                <img src="/logo.svg" alt="App Icon" class="app-icon" />
              </div>
              <div class="card-details">
                <div class="app-title-row">
                  <span class="app-name">HOTEL CRM</span>
                  <span class="version-pill">v1.0.0 Setup</span>
                </div>
                <p class="file-info">
                  Modern NSIS Windows Installer • Includes Offline SQLite & ESC/POS Engine
                </p>
              </div>
            </div>

            <div class="card-right">
              <a
                [href]="downloadUrl()"
                [download]="installerFilename"
                class="download-btn"
                (click)="onDownloadTriggered()"
              >
                <i class="ph-bold ph-download-simple"></i>
                <span class="btn-text">
                  <strong>Download for Windows</strong>
                  <small>x64 Executable (.exe)</small>
                </span>
              </a>
              @if (downloadStarted()) {
                <span class="download-hint-active">
                  <i class="ph ph-check-circle"></i> Download initiated! Follow instructions below.
                </span>
              }
            </div>
          </div>
        </section>

        <!-- Modern Installer Workflow Features -->
        <section class="installer-features">
          <h2 class="section-title">Installer Capabilities</h2>
          <div class="feature-grid">
            <div class="feature-card">
              <div class="feature-icon"><i class="ph ph-folder-open"></i></div>
              <h3>Choose Install Location</h3>
              <p>
                Install to standard <code>C:\\Program Files\\HOTEL CRM</code> or choose any custom
                drive or directory on your POS machine.
              </p>
            </div>

            <div class="feature-card">
              <div class="feature-icon"><i class="ph ph-desktop"></i></div>
              <h3>Instant Desktop Shortcut</h3>
              <p>
                Places the official restaurant crest icon directly on your Windows desktop for quick
                1-click launch by cashiers and managers.
              </p>
            </div>

            <div class="feature-card">
              <div class="feature-icon"><i class="ph ph-lightning"></i></div>
              <h3>Launch on Windows Startup</h3>
              <p>
                Configures Windows startup so the CRM opens automatically whenever the billing
                computer powers on. Zero setup needed by morning staff.
              </p>
            </div>

            <div class="feature-card">
              <div class="feature-icon"><i class="ph ph-wifi-slash"></i></div>
              <h3>100% Offline Resilience</h3>
              <p>
                Never lose an order. If internet drops, POS operations continue smoothly on local
                SQLite and auto-sync to Supabase upon reconnection.
              </p>
            </div>
          </div>
        </section>

        <!-- 3-Step Walkthrough (Like VS Code) -->
        <section class="steps-section">
          <h2 class="section-title">How Setup Works</h2>
          <div class="steps-track">
            <div class="step-card">
              <div class="step-num">1</div>
              <div class="step-body">
                <h4>Download Installer</h4>
                <p>Click "Download for Windows" above to download the modern setup executable.</p>
              </div>
            </div>

            <div class="step-divider"><i class="ph ph-arrow-right"></i></div>

            <div class="step-card">
              <div class="step-num">2</div>
              <div class="step-body">
                <h4>Run Setup & Pick Location</h4>
                <p>
                  Open the installer, choose Current User or All Users, and select your destination
                  folder.
                </p>
              </div>
            </div>

            <div class="step-divider"><i class="ph ph-arrow-right"></i></div>

            <div class="step-card">
              <div class="step-num">3</div>
              <div class="step-body">
                <h4>Ready with Desktop Icon</h4>
                <p>
                  Click Finish to launch. Your desktop shortcut is created and startup boot is
                  active.
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- IT Admin Command Snippet -->
        <section class="script-section">
          <div class="script-card">
            <div class="script-header">
              <span class="script-label">
                <i class="ph ph-terminal-window"></i> Rapid IT Setup (PowerShell 1-Liner)
              </span>
              <button class="copy-btn" (click)="copyScript()">
                <i
                  class="ph"
                  [class.ph-copy]="!scriptCopied()"
                  [class.ph-check]="scriptCopied()"
                ></i>
                <span>{{ scriptCopied() ? 'Copied' : 'Copy' }}</span>
              </button>
            </div>
            <pre class="script-code"><code>{{ powerShellSnippet }}</code></pre>
          </div>
        </section>
      </main>

      <!-- Footer -->
      <footer class="download-footer">
        <p>GuruKripa Dhaba Restaurant Management CRM • Desktop Client Version 1.0.0</p>
      </footer>
    </div>
  `,
  styles: [
    `
      .download-page {
        min-height: 100vh;
        background: #0f1117;
        color: #f1f5f9;
        font-family: var(--font-body, system-ui, sans-serif);
        position: relative;
        overflow-x: hidden;
        padding-bottom: 60px;
      }

      /* Ambient Light Glows */
      .glow-orb {
        position: absolute;
        border-radius: 50%;
        filter: blur(120px);
        pointer-events: none;
        z-index: 0;
      }
      .orb-primary {
        width: 500px;
        height: 500px;
        background: rgba(194, 24, 7, 0.18);
        top: -100px;
        left: 50%;
        transform: translateX(-50%);
      }
      .orb-gold {
        width: 400px;
        height: 400px;
        background: rgba(212, 175, 55, 0.12);
        top: 300px;
        right: 5%;
      }

      /* Header */
      .download-header {
        position: relative;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 24px 36px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(15, 17, 23, 0.7);
        backdrop-filter: blur(12px);
      }

      .brand-bar {
        display: flex;
        align-items: center;
        gap: 14px;
      }

      .brand-crest {
        width: 42px;
        height: 42px;
        border-radius: 12px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
      }

      .brand-logo-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .brand-name {
        display: block;
        font-family: var(--font-display, Georgia, serif);
        font-size: 1.15rem;
        font-weight: 700;
        color: #ffffff;
      }

      .brand-sub {
        display: block;
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        color: #d4af37;
      }

      .nav-link {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #94a3b8;
        text-decoration: none;
        font-size: 0.9rem;
        font-weight: 500;
        padding: 8px 16px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        transition: all 0.2s ease;
      }
      .nav-link:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.2);
      }

      /* Content Area */
      .download-content {
        position: relative;
        z-index: 5;
        max-width: 960px;
        margin: 0 auto;
        padding: 60px 24px 0;
      }

      /* Hero */
      .hero-section {
        text-align: center;
        margin-bottom: 64px;
      }

      .platform-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border-radius: 20px;
        background: rgba(56, 189, 248, 0.12);
        color: #38bdf8;
        font-size: 0.8rem;
        font-weight: 600;
        margin-bottom: 20px;
        border: 1px solid rgba(56, 189, 248, 0.25);
      }

      .hero-title {
        font-family: var(--font-display, Georgia, serif);
        font-size: clamp(2rem, 4vw, 3rem);
        font-weight: 800;
        line-height: 1.15;
        margin: 0 0 16px;
        background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .hero-subtitle {
        font-size: 1.05rem;
        color: #94a3b8;
        max-width: 680px;
        margin: 0 auto 36px;
        line-height: 1.6;
      }

      /* Primary Download CTA Card */
      .download-card {
        background: linear-gradient(145deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        padding: 28px 36px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        box-shadow:
          0 20px 40px rgba(0, 0, 0, 0.5),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
        text-align: left;
      }

      .card-left {
        display: flex;
        align-items: center;
        gap: 20px;
      }

      .app-icon-wrap {
        width: 64px;
        height: 64px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.05);
        padding: 6px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .app-icon {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .app-title-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .app-name {
        font-size: 1.35rem;
        font-weight: 700;
        color: #ffffff;
      }

      .version-pill {
        font-size: 0.7rem;
        padding: 3px 8px;
        border-radius: 6px;
        background: rgba(212, 175, 55, 0.15);
        color: #d4af37;
        font-weight: 600;
        border: 1px solid rgba(212, 175, 55, 0.3);
      }

      .file-info {
        font-size: 0.85rem;
        color: #94a3b8;
        margin: 4px 0 0;
      }

      .card-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
      }

      .download-btn {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        background: linear-gradient(135deg, #c21807 0%, #991b1b 100%);
        color: #ffffff;
        text-decoration: none;
        padding: 14px 28px;
        border-radius: 12px;
        box-shadow: 0 4px 18px rgba(194, 24, 7, 0.45);
        border: 1px solid rgba(255, 255, 255, 0.2);
        transition: all 0.2s ease;
      }
      .download-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 24px rgba(194, 24, 7, 0.6);
        background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
      }
      .download-btn i {
        font-size: 1.6rem;
      }
      .btn-text {
        display: flex;
        flex-direction: column;
        text-align: left;
      }
      .btn-text strong {
        font-size: 1rem;
        font-weight: 700;
        line-height: 1.2;
      }
      .btn-text small {
        font-size: 0.75rem;
        opacity: 0.85;
      }

      .download-hint-active {
        font-size: 0.8rem;
        color: #34d399;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      /* Features */
      .section-title {
        font-family: var(--font-display, Georgia, serif);
        font-size: 1.6rem;
        font-weight: 700;
        text-align: center;
        margin: 0 0 28px;
        color: #ffffff;
      }

      .installer-features {
        margin-bottom: 64px;
      }

      .feature-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
      }

      .feature-card {
        background: rgba(30, 41, 59, 0.45);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 24px 20px;
        backdrop-filter: blur(8px);
        transition: border-color 0.2s;
      }
      .feature-card:hover {
        border-color: rgba(212, 175, 55, 0.35);
      }

      .feature-icon {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        background: rgba(212, 175, 55, 0.12);
        color: #d4af37;
        font-size: 1.4rem;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 16px;
      }

      .feature-card h3 {
        font-size: 1.05rem;
        font-weight: 600;
        margin: 0 0 8px;
        color: #f8fafc;
      }

      .feature-card p {
        font-size: 0.85rem;
        color: #94a3b8;
        line-height: 1.5;
        margin: 0;
      }
      .feature-card code {
        font-size: 0.78rem;
        background: rgba(0, 0, 0, 0.3);
        padding: 2px 5px;
        border-radius: 4px;
        color: #cbd5e1;
      }

      /* Steps */
      .steps-section {
        margin-bottom: 56px;
      }

      .steps-track {
        display: flex;
        align-items: center;
        gap: 16px;
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 18px;
        padding: 24px;
      }

      .step-card {
        flex: 1;
        display: flex;
        align-items: flex-start;
        gap: 14px;
      }

      .step-num {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(194, 24, 7, 0.2);
        color: #ef4444;
        border: 1px solid rgba(194, 24, 7, 0.4);
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .step-body h4 {
        margin: 0 0 4px;
        font-size: 0.95rem;
        color: #f1f5f9;
      }

      .step-body p {
        margin: 0;
        font-size: 0.8rem;
        color: #94a3b8;
        line-height: 1.4;
      }

      .step-divider {
        color: #475569;
        font-size: 1.2rem;
      }

      /* Script Card */
      .script-section {
        margin-bottom: 40px;
      }

      .script-card {
        background: #090d16;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 14px;
        overflow: hidden;
      }

      .script-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 16px;
        background: rgba(255, 255, 255, 0.04);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }

      .script-label {
        font-size: 0.8rem;
        font-weight: 600;
        color: #94a3b8;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .copy-btn {
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #cbd5e1;
        font-size: 0.75rem;
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        transition: all 0.2s;
      }
      .copy-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #ffffff;
      }

      .script-code {
        margin: 0;
        padding: 14px 16px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.82rem;
        color: #38bdf8;
        overflow-x: auto;
      }

      /* Footer */
      .download-footer {
        text-align: center;
        font-size: 0.75rem;
        color: #64748b;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        padding-top: 24px;
      }

      @media (max-width: 768px) {
        .download-card {
          flex-direction: column;
          align-items: stretch;
          text-align: center;
        }
        .card-left {
          flex-direction: column;
        }
        .card-right {
          align-items: stretch;
        }
        .steps-track {
          flex-direction: column;
        }
        .step-divider {
          transform: rotate(90deg);
        }
      }
    `,
  ],
})
export class DownloadComponent implements OnInit {
  installerFilename = 'HOTEL-CRM-Setup-1.0.0.exe';
  downloadUrl = signal<string>('/downloads/HOTEL-CRM-Setup-1.0.0.exe');
  downloadStarted = signal<boolean>(false);
  scriptCopied = signal<boolean>(false);

  powerShellSnippet =
    `# 1-Liner: Download, install to chosen folder & auto-start HOTEL CRM\n` +
    `$dest = "$env:TEMP\\HOTEL-CRM-Setup.exe"\n` +
    `Invoke-WebRequest -Uri "${window.location.origin}/downloads/HOTEL-CRM-Setup-1.0.0.exe" -OutFile $dest\n` +
    `Start-Process -FilePath $dest -Wait`;

  ngOnInit(): void {
    // If running in development or hosted domain, configure accurate origin
    if (typeof window !== 'undefined') {
      this.powerShellSnippet =
        `$dest = "$env:TEMP\\HOTEL-CRM-Setup.exe"\n` +
        `Invoke-WebRequest -Uri "${window.location.origin}/downloads/HOTEL-CRM-Setup-1.0.0.exe" -OutFile $dest\n` +
        `Start-Process -FilePath $dest -Wait`;
    }
  }

  onDownloadTriggered(): void {
    this.downloadStarted.set(true);
  }

  copyScript(): void {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(this.powerShellSnippet);
      this.scriptCopied.set(true);
      setTimeout(() => this.scriptCopied.set(false), 2500);
    }
  }
}
