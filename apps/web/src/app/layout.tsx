import type { Metadata, Viewport } from 'next';
import { Providers } from '@/lib/providers';
import { ServiceWorker } from '@/components/service-worker';
import './globals.css';

/** Absolute base for OpenGraph images; overridable per deployment. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smartwork360.vercel.app';

export const metadata: Metadata = {
  title: {
    default: 'SMARTWORK 360',
    template: '%s · SMARTWORK 360',
  },
  description:
    'AI + Blockchain-backed Smart Task & Performance Management System for Government Offices.',
  manifest: '/manifest.webmanifest',
  applicationName: 'SMARTWORK 360',
  appleWebApp: { capable: true, title: 'SMARTWORK 360', statusBarStyle: 'default' },
  // Icons are NOT declared here: favicon.ico, icon.png and apple-icon.png sit
  // beside this file and App Router wires them automatically. Declaring them
  // as well produces duplicate <link> tags that disagree with each other.
  openGraph: {
    title: 'SMARTWORK 360',
    description: 'Smart Task & Performance Management for Government Offices.',
    url: SITE_URL,
    siteName: 'SMARTWORK 360',
    images: [{ url: '/brand/og-image.png', width: 1200, height: 630, alt: 'SMARTWORK 360' }],
    type: 'website',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SMARTWORK 360',
    description: 'Smart Task & Performance Management for Government Offices.',
    images: ['/brand/og-image.png'],
  },
  // Social scrapers do not resolve relative image paths, so the absolute base
  // has to be declared or the card silently renders without its image.
  metadataBase: new URL(SITE_URL),
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
        <Providers>{children}</Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
