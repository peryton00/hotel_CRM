'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ForkKnife, ArrowRight, QrCode } from '@phosphor-icons/react';

export default function HomePage() {
  const [token, setToken] = useState('');
  const router = useRouter();

  const handleGo = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = token.trim();
    if (clean) {
      router.push(`/table/${clean}`);
    }
  };

  return (
    <main className="min-h-dvh bg-[#f8f9fa] flex flex-col items-center justify-center p-4 font-sans selection:bg-orange-100">
      <div className="max-w-sm w-full bg-white rounded-3xl shadow-xl border border-neutral-100 p-7 space-y-6 text-center">
        {/* Brand Icon */}
        <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-3xl flex items-center justify-center mx-auto shadow-md shadow-orange-500/20">
          <ForkKnife size={32} weight="fill" />
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Dine-In Ordering
          </div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight pt-1">
            GuruKripa Dhaba
          </h1>
          <p className="text-neutral-500 text-xs leading-relaxed max-w-xs mx-auto">
            Scan the QR standee on your dining table using your mobile phone camera to order directly into the kitchen.
          </p>
        </div>

        {/* Manual Table Token Entry */}
        <form onSubmit={handleGo} className="pt-2 border-t border-neutral-100 space-y-3">
          <div className="text-left">
            <label htmlFor="token" className="block text-[11px] font-bold text-neutral-600 mb-1 flex items-center gap-1">
              <QrCode size={14} weight="bold" />
              <span>Have a Table QR Token?</span>
            </label>
            <div className="flex gap-2">
              <input
                id="token"
                type="text"
                placeholder="e.g. tbl-01 or sample-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-medium"
              />
              <button
                type="submit"
                disabled={!token.trim()}
                className="bg-orange-500 hover:bg-orange-600 active:scale-95 disabled:opacity-40 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1"
              >
                <span>Go</span>
                <ArrowRight size={14} weight="bold" />
              </button>
            </div>
          </div>
        </form>

        <div className="pt-1 text-[11px] text-neutral-400 font-medium">
          Powered by Hotel CRM Direct Dining
        </div>
      </div>
    </main>
  );
}