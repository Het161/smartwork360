import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SMARTWORK 360',
    template: '%s · SMARTWORK 360',
  },
  description:
    'AI + Blockchain-backed Smart Task & Performance Management System for Government Offices.',
  manifest: '/manifest.webmanifest',
  applicationName: 'SMARTWORK 360',
};

export const viewport: Viewport = {
  themeColor: '#14417B',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
