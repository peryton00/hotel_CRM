'use client';

import Link from 'next/link';
import { WarningCircle, House, ForkKnife, ArrowRight } from '@phosphor-icons/react';

export default function NotFound() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-4 sm:p-6 bg-[#f8f6f2] dark:bg-[#0c0e12] text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-200">
      <div className="w-full max-w-sm sm:max-w-md bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl rounded-3xl border border-neutral-200/80 dark:border-neutral-800 p-7 sm:p-9 text-center shadow-2xl animate-scale-spring space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto border border-amber-200/60 dark:border-amber-800/60 shadow-xs">
          <WarningCircle size={32} weight="bold" />
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-950/80 px-2.5 py-0.5 rounded-full inline-block">
            404 · Page Not Found
          </span>
          <h1 className="text-xl sm:text-2xl font-black font-display tracking-tight text-neutral-900 dark:text-white">
            Looking for a Table or Dish?
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-xs mx-auto">
            The page or dining table URL you opened does not exist or may have been updated.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
          <Link
            href="/"
            className="touch-tactile inline-flex items-center justify-center gap-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-bold text-xs py-3 px-5 rounded-2xl transition-all shadow-md active:scale-95"
          >
            <House size={16} weight="bold" />
            <span>Restaurant Home</span>
          </Link>

          <Link
            href="/table/tbl-01"
            className="touch-tactile inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs py-3 px-5 rounded-2xl transition-all shadow-md active:scale-95"
          >
            <ForkKnife size={16} weight="bold" />
            <span>Browse Full Menu</span>
            <ArrowRight size={14} weight="bold" />
          </Link>
        </div>

        <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800/80 text-[11px] text-neutral-400 font-medium">
          GuruKripa Dhaba · Direct Dining Service
        </div>
      </div>
    </main>
  );
}
