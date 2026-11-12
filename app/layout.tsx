import type { Metadata, Viewport } from 'next';
import { Jost, Neucha } from 'next/font/google';
import './globals.css';

const jost = Jost({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jost',
  display: 'swap',
});

const neucha = Neucha({
  subsets: ['latin', 'cyrillic'],
  weight: '400',
  variable: '--font-neucha',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Футбольная гонка',
  description: 'Предикты на реальные матчи, кубики и рисованная карта сезона',
  applicationName: 'Футбольная гонка',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0b141c',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${jost.variable} ${neucha.variable}`}>
      <body>{children}</body>
    </html>
  );
}
