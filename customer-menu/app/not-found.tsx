'use client';

import Link from 'next/link';
import { MagnifyingGlass, House } from '@phosphor-icons/react';

export default function NotFound() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-[#f8f9fa] text-center font-sans">
      <div className="max-w-sm w-full bg-white rounded-3xl border border-neutral-100 p-8 shadow-xl">
        <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <MagnifyingGlass size={32} weight="bold" />
        </div>
        <h1 className="text-lg font-black text-neutral-900 mb-1">Invalid Table QR Code</h1>
        <p className="text-neutral-500 text-xs leading-relaxed mb-6">
          The table QR code scanned is invalid or expired. Please re-scan the standee on your dining table.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-colors shadow-xs"
        >
          <House size={14} weight="bold" />
          <span>Return Home</span>
        </Link>
      </div>
    </main>
  );
}