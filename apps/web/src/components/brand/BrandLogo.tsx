'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/utils';

/**
 * The one place the logo is defined.
 *
 * Two rules make this component worth having rather than sprinkling
 * `<img src="/brand/mark.svg">` around:
 *
 *  1. **The wordmark is HTML text, never baked into the SVG.** It stays
 *     selectable, readable by a screen reader, translatable, and restyleable —
 *     and it cannot go blurry. The SVG file holds only the mark.
 *  2. **Theme is a prop, not a guess.** The white mark on a light background is
 *     invisible and the navy mark on the sidebar is nearly so, which is exactly
 *     the mistake that gets shipped when each call site picks its own file.
 */

export type BrandVariant = 'mark' | 'lockup' | 'stacked';
export type BrandTheme = 'light' | 'dark' | 'mono';
export type BrandSize = 'sm' | 'md' | 'lg';

export interface BrandLogoProps {
  variant?: BrandVariant;
  theme?: BrandTheme;
  size?: BrandSize;
  showTagline?: boolean;
  /** Wraps the logo in a link. Omit where a logo should not navigate. */
  href?: string;
  /** Loads eagerly through next/image — the login page only. */
  priority?: boolean;
  className?: string;
}

const MARK_SRC: Record<BrandTheme, string> = {
  light: '/brand/mark.svg',
  dark: '/brand/mark-white.svg',
  mono: '/brand/mark-mono.svg',
};

/** Mark heights, per the brand sheet. 24px is the documented minimum. */
const MARK_PX: Record<BrandSize, number> = { sm: 24, md: 32, lg: 48 };

const WORD_CLS: Record<BrandSize, string> = {
  sm: 'text-sm',
  md: 'text-md',
  lg: 'text-2xl',
};

const TAGLINE_CLS: Record<BrandSize, string> = {
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm',
};

export function BrandLogo({
  variant = 'lockup',
  theme = 'light',
  size = 'md',
  showTagline = false,
  href,
  priority = false,
  className,
}: BrandLogoProps) {
  const { t } = useI18n();
  const px = MARK_PX[size];

  const onDark = theme === 'dark';
  const primary = onDark ? 'text-white' : theme === 'mono' ? 'text-black' : 'text-primary';
  // "360" stays saffron in colour themes; the mono mark must stay one colour.
  const accent = theme === 'mono' ? 'text-black' : 'text-saffron';
  const muted = onDark ? 'text-white/60' : theme === 'mono' ? 'text-black/60' : 'text-slate-500';

  const mark = (
    <Image
      src={MARK_SRC[theme]}
      alt=""
      width={px}
      height={px}
      priority={priority}
      // Decorative: the adjacent text already announces the name, so a second
      // announcement would just be repetition for a screen-reader user.
      aria-hidden="true"
      className="shrink-0"
      style={{ width: px, height: px }}
    />
  );

  const word = (
    <span
      className={cn(
        'font-bold leading-none tracking-tight tabular',
        WORD_CLS[size],
      )}
    >
      <span className={primary}>SMARTWORK</span>
      <span className={accent}> 360</span>
    </span>
  );

  const tagline = showTagline ? (
    <span className={cn('block leading-snug', TAGLINE_CLS[size], muted)}>{t.app.tagline}</span>
  ) : null;

  let content: React.ReactNode;

  if (variant === 'mark') {
    // Nothing else names the product here, so the wrapper has to.
    content = (
      <span className={cn('brand-logo inline-flex', className)} aria-label="SMARTWORK 360" role="img">
        {mark}
      </span>
    );
  } else if (variant === 'stacked') {
    content = (
      <span className={cn('brand-logo inline-flex flex-col items-center gap-2 text-center', className)}>
        {mark}
        <span className="flex flex-col items-center gap-1">
          {word}
          {tagline}
        </span>
      </span>
    );
  } else {
    content = (
      <span className={cn('brand-logo inline-flex items-center gap-2.5', className)}>
        {mark}
        <span className="flex min-w-0 flex-col gap-0.5">
          {word}
          {tagline}
        </span>
      </span>
    );
  }

  if (!href) return <>{content}</>;

  return (
    <Link href={href} className="rounded-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron">
      {content}
    </Link>
  );
}
