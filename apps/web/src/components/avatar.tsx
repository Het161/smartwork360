'use client';

import { cn } from '@/lib/utils';

/**
 * Initials avatar. Colour is derived deterministically from the seed, so the same
 * person is always the same colour across every screen — and no network request
 * is made for an image (the demo must work offline).
 */
const PALETTE = [
  'bg-primary text-white',
  'bg-teal text-white',
  'bg-violetx text-white',
  'bg-success text-white',
  'bg-warning text-white',
  'bg-[#7C3AED] text-white',
  'bg-[#0F766E] text-white',
  'bg-[#B45309] text-white',
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  seed,
  size = 'md',
  className,
}: {
  name: string;
  seed?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const colour = PALETTE[hashSeed(seed ?? name) % PALETTE.length];
  const sizes = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-7 w-7 text-[11px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-11 w-11 text-sm',
  };

  return (
    <span
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold tracking-tight',
        colour,
        sizes[size],
        className,
      )}
      title={name}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}

export function PersonCell({
  name,
  designation,
  seed,
  size = 'sm',
}: {
  name: string;
  designation?: string;
  seed?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={name} seed={seed} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-800">{name}</span>
        {designation ? (
          <span className="block truncate text-xs text-slate-500">{designation}</span>
        ) : null}
      </span>
    </span>
  );
}
