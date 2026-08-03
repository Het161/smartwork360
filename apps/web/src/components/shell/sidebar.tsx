'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@smartwork/shared';
import { AlertTriangle, BarChart3, Building2, ClipboardList, FileBarChart, Gauge, HeartPulse, KanbanSquare, LayoutDashboard, MessageSquareText, ScanSearch, Settings, ShieldCheck, Trophy, Bot } from 'lucide-react';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  labelKey: keyof ReturnType<typeof useI18n>['t']['nav'];
  icon: React.ComponentType<{ className?: string }>;
}

const NAV: Record<Role, { section: 'employee' | 'manager' | 'admin'; items: NavItem[] }> = {
  EMPLOYEE: {
    section: 'employee',
    items: [
      { href: '/e/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
      { href: '/e/tasks', labelKey: 'myTasks', icon: ClipboardList },
      { href: '/e/assistant', labelKey: 'assistant', icon: MessageSquareText },
      { href: '/e/performance', labelKey: 'myPerformance', icon: Trophy },
    ],
  },
  MANAGER: {
    section: 'manager',
    items: [
      { href: '/m/dashboard', labelKey: 'teamDashboard', icon: LayoutDashboard },
      { href: '/m/board', labelKey: 'taskBoard', icon: KanbanSquare },
      { href: '/m/reviews', labelKey: 'reviews', icon: ClipboardList },
      { href: '/m/analytics', labelKey: 'teamAnalytics', icon: BarChart3 },
      { href: '/m/burnout', labelKey: 'burnout', icon: HeartPulse },
      { href: '/m/alerts', labelKey: 'alerts', icon: AlertTriangle },
    ],
  },
  ADMIN: {
    section: 'admin',
    items: [
      { href: '/a/overview', labelKey: 'orgOverview', icon: Gauge },
      { href: '/a/directory', labelKey: 'departments', icon: Building2 },
      { href: '/a/fraud', labelKey: 'fraudCenter', icon: ScanSearch },
      { href: '/a/audit', labelKey: 'auditExplorer', icon: ShieldCheck },
      { href: '/a/fixes', labelKey: 'aiFixLog', icon: Bot },
      { href: '/a/reports', labelKey: 'reports', icon: FileBarChart },
      { href: '/a/settings', labelKey: 'settings', icon: Settings },
    ],
  },
};

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const config = NAV[role];

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-sidebar lg:flex"
      aria-label="Main navigation"
    >
      {/* Generic departmental monogram — deliberately NOT the State Emblem of
          India, whose use is restricted by law. */}
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-saffron text-xs font-bold text-white">
          GoI
        </span>
        <span className="min-w-0">
          <span className="block truncate text-md font-semibold leading-tight text-white">
            {t.app.name}
          </span>
          <span className="block truncate text-xs text-white/60">{t.app.portal}</span>
        </span>
      </div>

      <div className="tricolor-rule mx-5 h-0.5 rounded-full opacity-70" />

      <nav className="thin-scroll mt-4 flex-1 overflow-y-auto px-3">
        <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
          {t.nav[config.section]}
        </p>
        <ul className="space-y-0.5">
          {config.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-btn border-l-[3px] px-3 py-2 text-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-saffron focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
                    active
                      ? 'border-l-saffron bg-sidebar-active font-medium text-white'
                      : 'border-l-transparent text-white/70 hover:bg-sidebar-hover hover:text-white',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{t.nav[item.labelKey]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-[10px] leading-relaxed text-white/45">{t.app.initiative}</p>
        <p className="mt-1 text-[10px] text-white/30">
          {process.env.NEXT_PUBLIC_BUILD_TAG ?? 'SIH Prototype'} · v1.0
        </p>
      </div>
    </aside>
  );
}

export { NAV };
