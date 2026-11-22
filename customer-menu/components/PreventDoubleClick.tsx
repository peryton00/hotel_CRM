'use client';

import { useEffect } from 'react';

/**
 * System-Wide Double-Click Prevention for Customer Menu.
 * Intercepts rapid repeated clicks and double-clicks on buttons, action elements, and forms.
 * Runs in the DOM capture phase to prevent duplicate order submissions, reservations, and feedback.
 */
export function PreventDoubleClick() {
  useEffect(() => {
    let lastClickTime = 0;
    let lastClickTarget: Element | null = null;
    const COOLDOWN_MS = 500;

    const isExempt = (target: Element): boolean => {
      // Allow text selection and normal typing in text fields
      if (
        target.matches(
          'input[type="text"], input[type="search"], input[type="tel"], input[type="email"], input[type="number"], input[type="password"], textarea, select, [contenteditable="true"]'
        )
      ) {
        return true;
      }

      // Allow rapid clicks on quantity counters
      if (
        target.matches(
          '.qty-btn, .qty-btn-inline, [data-allow-rapid-click], [data-no-prevent-double-click], [aria-label*="quantity" i], [aria-label*="increase" i], [aria-label*="decrease" i]'
        ) ||
        target.closest('.qty-controls, .draft-qty-controls, .m-qty-controls, [data-allow-rapid-click]')
      ) {
        return true;
      }

      return false;
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;

      // Find the clickable ancestor
      const actionEl = target.closest(
        'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], a.btn, .btn, .clickable-action'
      ) as HTMLElement | null;

      if (!actionEl) return;
      if (isExempt(actionEl) || isExempt(target)) return;

      const now = Date.now();

      // If already locked, or clicked within cooldown on same action element, or OS double-click (detail > 1)
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
    };

    const handleSubmit = (e: Event) => {
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
    };

    window.addEventListener('click', handleClick, { capture: true });
    window.addEventListener('submit', handleSubmit, { capture: true });

    return () => {
      window.removeEventListener('click', handleClick, { capture: true });
      window.removeEventListener('submit', handleSubmit, { capture: true });
    };
  }, []);

  return null;
}
