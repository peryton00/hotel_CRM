'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { WarningCircle, ArrowsClockwise, House } from '@phosphor-icons/react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console for diagnostics
    console.error('Unhandled customer front error:', error);
  }, [error]);

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-4 sm:p-6 bg-[#f8f6f2] dark:bg-[#0c0e12] text-neutral-900 dark:text-neutral-100 font-sans transition-colors duration-200">
      <div className="w-full max-w-sm sm:max-w-md bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl rounded-3xl border border-neutral-200/80 dark:border-neutral-800 p-7 sm:p-9 text-center shadow-2xl animate-scale-spring space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto border border-rose-200/60 dark:border-rose-800/60 shadow-xs">
          <WarningCircle size={32} weight="bold" />
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-400 bg-rose-100/70 dark:bg-rose-950/80 px-2.5 py-0.5 rounded-full inline-block">
            System Notice
          </span>
          <h1 className="text-xl sm:text-2xl font-black font-display tracking-tight text-neutral-900 dark:text-white">
            Connection Interrupted
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-xs mx-auto">
            We could not complete your request. Please check your mobile internet connection and try refreshing.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-2.5 justify-center">
          <button
            onClick={() => reset()}
            className="touch-tactile inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs py-3 px-5 rounded-2xl transition-all shadow-md cursor-pointer"
          >
            <ArrowsClockwise size={16} weight="bold" />
            <span>Try Again</span>
          </button>

          <Link
            href="/"
            className="touch-tactile inline-flex items-center justify-center gap-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 font-bold text-xs py-3 px-5 rounded-2xl transition-all border border-neutral-300 dark:border-neutral-700"
          >
            <House size={16} weight="bold" />
            <span>Return to Home</span>
          </Link>
        </div>

        <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800/80 text-[11px] text-neutral-400 font-medium">
          GuruKripa Dhaba · Direct Dining Service
        </div>
      </div>
    </main>
  );
}
