'use client';

import { cn } from '@/lib/utils';

/**
 * Static SVG of Saarthi's face.
 *
 * Serves three jobs: the help button's icon, the Suspense fallback while the 3D
 * canvas loads, and the permanent substitute when the user prefers reduced
 * motion or the device has no WebGL. Same palette and proportions as the 3D
 * model, so it reads as the same character rather than a placeholder.
 */
export function SaarthiFace({
  size = 40,
  className,
  title = 'Saarthi',
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={cn('shrink-0', className)}
      role="img"
      aria-label={title}
    >
      {/* antenna */}
      <line x1="32" y1="10" x2="32" y2="16" stroke="#0E2A52" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="8" r="3.4" fill="#2BAE66" />

      {/* head */}
      <rect x="12" y="15" width="40" height="34" rx="11" fill="#14417B" />
      {/* screen */}
      <rect x="17" y="21" width="30" height="22" rx="7" fill="#0B1D3A" />

      {/* eyes */}
      <rect x="23" y="28" width="5" height="9" rx="2.5" fill="#FFFFFF" />
      <rect x="36" y="28" width="5" height="9" rx="2.5" fill="#FFFFFF" />

      {/* smile */}
      <path
        d="M27 40.5c1.6 1.5 3.2 2.2 5 2.2s3.4-.7 5-2.2"
        stroke="#FFFFFF"
        strokeOpacity="0.55"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* ears */}
      <rect x="8" y="26" width="4" height="11" rx="2" fill="#0E2A52" />
      <rect x="52" y="26" width="4" height="11" rx="2" fill="#0E2A52" />

      {/* chest ring peeking below the head */}
      <path
        d="M20 52c3.4-2.6 7.6-4 12-4s8.6 1.4 12 4"
        stroke="#FF9933"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
