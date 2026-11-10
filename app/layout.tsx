import type { Metadata, Viewport } from 'next';
import './globals.css';

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
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
