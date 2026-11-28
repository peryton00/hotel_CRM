import type { Metadata } from 'next';
import './globals.css';
import { CartProvider } from '@/lib/cart-context';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Toaster } from 'dynaura';
import { SettlementFeedback } from '@/components/SettlementFeedback';
import { PreventDoubleClick } from '@/components/PreventDoubleClick';


export const metadata: Metadata = {
  title: 'Restaurant Menu & Dining Orders',
  description: 'View fresh dishes, customize options, and order directly from your table.',
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico' },
    ],
    apple: '/logo.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('customer_theme');
                  var isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                    document.documentElement.setAttribute('data-theme', 'dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.setAttribute('data-theme', 'light');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-[#f8f6f2] dark:bg-[#0c0e12] text-neutral-900 dark:text-neutral-100 antialiased min-h-screen transition-colors duration-200">
        <PreventDoubleClick />
        <SettlementFeedback />
        <Toaster />
        <CartProvider>{children}</CartProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
