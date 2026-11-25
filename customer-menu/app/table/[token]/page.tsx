import { getTable, getMenu } from '@/lib/api';
import { notFound } from 'next/navigation';
import MenuClient from './MenuClient';
import { WarningCircle, ForkKnife } from '@phosphor-icons/react/dist/ssr';

export default async function TablePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  const token = resolvedParams.token;

  let tableData;
  let menuData;

  try {
    tableData = await getTable(token);
  } catch (e: any) {
    if (e.status === 404) return notFound();
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-[#f8f6f2] font-sans selection:bg-orange-100">
        <div className="text-center max-w-sm w-full bg-white p-7 rounded-3xl border border-neutral-200/80 shadow-xs space-y-4">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center mx-auto border border-amber-200/60 shadow-xs">
            <WarningCircle size={32} weight="bold" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700 bg-amber-100/70 px-2.5 py-0.5 rounded-full">
              Kitchen System Offline
            </span>
            <h1 className="text-lg font-black font-display text-neutral-900 tracking-tight mt-2">
              Restaurant System Offline
            </h1>
            <p className="text-neutral-500 text-xs leading-relaxed mt-1">
              Our digital kitchen ordering system is temporarily offline. Please call our restaurant staff to place your order directly at your table.
            </p>
          </div>
          <div className="pt-2 border-t border-neutral-100 text-xs space-y-2">
            <div className="text-[11px] font-medium text-neutral-400">
              Table QR scanned: <span className="font-mono font-bold text-neutral-700">{token}</span>
            </div>
            <a
              href={`/table/${encodeURIComponent(token)}`}
              className="w-full py-2.5 bg-neutral-900 text-white font-bold text-xs rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Retry Connection
            </a>
          </div>
        </div>
      </div>
    );
  }

  try {
    menuData = await getMenu();
  } catch {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-[#f8f9fa] font-sans">
        <div className="text-center max-w-sm w-full bg-white p-7 rounded-3xl border border-neutral-100 shadow-xl">
          <div className="w-14 h-14 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3 animate-pulse">
            <ForkKnife size={32} weight="fill" />
          </div>
          <h1 className="text-base font-black text-neutral-900 mb-1.5">Menu Loading</h1>
          <p className="text-neutral-500 text-xs leading-relaxed">Menu is temporarily updating. Please refresh in a few moments.</p>
        </div>
      </div>
    );
  }

  const table = tableData.data;
  const { categories, items } = menuData.data;

  return <MenuClient table={table} categories={categories || []} items={items || []} token={token} />;
}