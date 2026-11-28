'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export function SettlementFeedback() {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (path.endsWith('/confirmation')) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const receipt = JSON.parse(sessionStorage.getItem('lastOrder') || 'null')?.request_id;
        if (!receipt || sessionStorage.getItem('feedback-prompt:' + receipt)) return;
        if (document.visibilityState === 'visible') {
          const response = await fetch((process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000') + '/public/receipts/' + encodeURIComponent(receipt), { cache: 'no-store', signal: controller.signal });
          if (response.ok) {
            const { data } = await response.json();
            if (data.settled) {
              sessionStorage.setItem('feedback-prompt:' + receipt, '1');
              if (path === '/') window.dispatchEvent(new Event('settlement-feedback'));
              else router.push('/?feedback=1');
              return;
            }
            if (data.status?.toLowerCase() === 'cancelled') return;
          }
        }
      } catch { /* Retry a transient receipt lookup while this page is open. */ }
      if (!controller.signal.aborted) timer = setTimeout(check, 15000);
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [path, router]);
  return null;
}
