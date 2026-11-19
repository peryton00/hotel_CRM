import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  Renderer2,
  SimpleChanges,
  inject,
} from '@angular/core';

@Directive({
  selector: 'button[appLoadingButton]',
  standalone: true,
})
export class LoadingButtonDirective implements OnChanges {
  private el = inject(ElementRef<HTMLButtonElement>);
  private renderer = inject(Renderer2);

  @Input('appLoadingButton') isLoading: boolean = false;
  @Input() loadingText?: string;
  @Input() spinnerColor?: string;

  private originalContent: string | null = null;
  private originalWidth: string | null = null;
  private wasOriginallyDisabled: boolean = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isLoading']) {
      if (this.isLoading) {
        this.applyLoadingState();
      } else {
        this.clearLoadingState();
      }
    }
  }

  private applyLoadingState(): void {
    const btn = this.el.nativeElement;

    // Lock current width to avoid layout jitter
    const rect = btn.getBoundingClientRect();
    if (rect.width > 0 && !this.originalWidth) {
      this.originalWidth = btn.style.minWidth || '';
      btn.style.minWidth = `${rect.width}px`;
    }

    if (this.originalContent === null) {
      this.originalContent = btn.innerHTML;
      this.wasOriginallyDisabled = btn.disabled;
    }

    btn.disabled = true;
    this.renderer.setAttribute(btn, 'aria-busy', 'true');
    this.renderer.addClass(btn, 'btn-loading-state');

    const spinnerSvg = `
      <svg class="btn-spinner-icon" viewBox="0 0 24 24" fill="none" style="width: 14px; height: 14px; animation: btnSpin 0.75s linear infinite; margin-right: 6px; vertical-align: middle;">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-opacity="0.25" stroke-width="2.5"></circle>
        <path d="M12 2.5 A 9.5 9.5 0 0 1 21.5 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"></path>
      </svg>
    `;

    const displayText = this.loadingText
      ? `<span>${this.loadingText}</span>`
      : btn.innerText.trim();

    btn.innerHTML = `${spinnerSvg} ${displayText}`;
  }

  private clearLoadingState(): void {
    const btn = this.el.nativeElement;

    if (this.originalContent !== null) {
      btn.innerHTML = this.originalContent;
      this.originalContent = null;
    }

    if (this.originalWidth !== null) {
      btn.style.minWidth = this.originalWidth;
      this.originalWidth = null;
    }

    btn.disabled = this.wasOriginallyDisabled;
    this.renderer.removeAttribute(btn, 'aria-busy');
    this.renderer.removeClass(btn, 'btn-loading-state');
  }
}
