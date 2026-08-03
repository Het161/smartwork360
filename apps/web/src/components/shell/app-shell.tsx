'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Role } from '@smartwork/shared';
import { ChevronRight, Loader2, X } from 'lucide-react';
import { useRequireRole } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import { Sidebar, NAV } from './sidebar';
import { WelcomeModal } from '../guide/WelcomeModal';
import { HelpLauncher } from '../guide/HelpLauncher';
import { Topbar } from './topbar';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';

export function AppShell({
  role,
  allow,
  children,
}: {
  role: Role;
  /**
   * Roles permitted on these pages, when that is wider than the section they
   * belong to. An administrator can do everything a manager can — including
   * creating a task in any department — so locking the manager section to
   * MANAGER alone left admins with no task-creation screen at all.
   */
  allow?: Role[];
  children: React.ReactNode;
}) {
  const { user, loading } = useRequireRole(...(allow ?? [role]));
  const [navOpen, setNavOpen] = useState(false);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar role={role} />
      <MobileNav role={role} open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="lg:pl-60">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main id="main-content" className="mx-auto max-w-shell px-4 py-6 lg:px-6">
          {children}
        </main>
      </div>

      {/* Saarthi — the in-app guide */}
      <WelcomeModal />
      <HelpLauncher />
    </div>
  );
}

function MobileNav({ role, open, onClose }: { role: Role; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div className="absolute inset-y-0 left-0 w-64 bg-sidebar p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-md font-semibold text-white">{t.app.name}</span>
          <Button variant="ghost" size="iconSm" onClick={onClose} aria-label={t.common.close}>
            <X className="h-4 w-4 text-white" aria-hidden />
          </Button>
        </div>
        <ul className="space-y-0.5">
          {NAV[role].items.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 rounded-btn border-l-[3px] px-3 py-2 text-sm',
                    active
                      ? 'border-l-saffron bg-sidebar-active font-medium text-white'
                      : 'border-l-transparent text-white/70',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {t.nav[item.labelKey]}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Page header with breadcrumbs — present on every screen. */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs = [],
  action,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
            {breadcrumbs.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <ChevronRight className="h-3 w-3 text-slate-300" aria-hidden /> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-primary hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-slate-700">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-base text-slate-500">{subtitle}</p> : null}
        </div>
        {action ? <div className="flex items-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
