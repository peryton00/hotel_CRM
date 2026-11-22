/**
 * System-Wide Double-Click Prevention for Admin CRM & Desktop.
 *
 * Intercepts rapid repeated clicks and double-clicks on buttons, action elements, and forms.
 * Runs in the DOM capture phase so neither Angular nor vanilla listeners fire duplicate executions.
 */

export function initGlobalDoubleClickPrevention(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const COOLDOWN_MS = 500;
  let lastClickTime = 0;
  let lastClickTarget: Element | null = null;

  const isExempt = (target: Element): boolean => {
    // Inputs, textareas, contenteditable allow normal text selection / multi-clicks
    if (
      target.matches(
        'input[type="text"], input[type="search"], input[type="tel"], input[type="email"], input[type="number"], input[type="password"], textarea, select, [contenteditable="true"]',
      )
    ) {
      return true;
    }

    // Allow rapid clicks on quantity counters (+ / -)
    if (
      target.matches(
        '.qty-btn, .qty-btn-inline, [data-allow-rapid-click], [data-no-prevent-double-click], [aria-label*="quantity" i], [aria-label*="increase" i], [aria-label*="decrease" i]',
      ) ||
      target.closest(
        '.qty-controls, .draft-qty-controls, .m-qty-controls, [data-allow-rapid-click]',
      )
    ) {
      return true;
    }

    return false;
  };

  // Intercept clicks at the capture phase
  document.addEventListener(
    'click',
    (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;

      const actionEl = target.closest(
        'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], a.btn, .btn, .btn-sm, .action-btn, .close-btn, .step-pill, .btn-advance-order, .clickable-action',
      ) as HTMLElement | null;

      if (!actionEl) return;
      if (isExempt(actionEl) || isExempt(target)) return;

      const now = Date.now();

      // If already locked, or clicked within cooldown on same action element, or OS double-click count > 1
      if (
        actionEl.getAttribute('data-click-locked') === 'true' ||
        (lastClickTarget === actionEl && now - lastClickTime < COOLDOWN_MS) ||
        (e.detail > 1 && lastClickTarget === actionEl)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // First click: record and lock
      lastClickTime = now;
      lastClickTarget = actionEl;
      actionEl.setAttribute('data-click-locked', 'true');

      setTimeout(() => {
        actionEl.removeAttribute('data-click-locked');
        if (lastClickTarget === actionEl) {
          lastClickTarget = null;
        }
      }, COOLDOWN_MS);
    },
    { capture: true },
  );

  // Intercept duplicate form submissions
  document.addEventListener(
    'submit',
    (e: Event) => {
      const form = e.target as HTMLFormElement | null;
      if (!form) return;

      const now = Date.now();
      const lastSubmit = Number(form.getAttribute('data-last-submit') || 0);

      if (now - lastSubmit < 800) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      form.setAttribute('data-last-submit', String(now));
      setTimeout(() => {
        form.removeAttribute('data-last-submit');
      }, 800);
    },
    { capture: true },
  );
}
