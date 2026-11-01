import type { Metadata, Viewport } from 'next';
import { Inter, Noto_Sans_Devanagari } from 'next/font/google';
import './globals.css';
import 'leaflet/dist/leaflet.css';
import { AppProvider } from '@/lib/i18n/context';
import { AppShell } from '@/components/AppShell';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const deva = Noto_Sans_Devanagari({ subsets: ['devanagari'], weight: ['400', '500', '600', '700'], variable: '--font-deva', display: 'swap' });

export const metadata: Metadata = {
  title: { default: process.env.NEXT_PUBLIC_APP_NAME || 'Solara Field Advisor', template: '%s · Solara' },
  description: 'Per-field irrigation decisions, season water-stress risk, weather alerts and sell-or-hold for Wheat and Soybean in India.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1F4D2B' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${deva.variable}`}>
      <body>
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
