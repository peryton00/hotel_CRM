'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from '@phosphor-icons/react';

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    try {
      setIsDark(document.documentElement.classList.contains('dark'));
    } catch {}
  }, []);

  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      try {
        localStorage.setItem('customer_theme', 'dark');
      } catch {}
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      try {
        localStorage.setItem('customer_theme', 'light');
      } catch {}
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="w-8 h-8 rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 flex items-center justify-center hover:bg-neutral-200 dark:hover:bg-white/15 transition-colors cursor-pointer shrink-0"
      aria-label="Toggle light and dark theme"
    >
      {isDark ? <Sun size={17} weight="bold" className="text-amber-400" /> : <Moon size={17} weight="bold" />}
    </button>
  );
}
