'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, LogOut, Menu, Search, User } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import { cn } from '@/lib/utils';
import { Avatar } from '../avatar';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/states';

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { user, signOut } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState('');

  const searchHome =
    user?.role === 'ADMIN' ? '/a/overview' : user?.role === 'MANAGER' ? '/m/board' : '/e/tasks';

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`${searchHome}?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <header className="sticky top-0 z-20 border-b border-borderx bg-white/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <Button
          variant="ghost"
          size="iconSm"
          className="lg:hidden"
          onClick={onOpenNav}
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" aria-hidden />
        </Button>

        <form onSubmit={onSearch} className="relative hidden min-w-0 flex-1 md:block" role="search">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.common.searchPlaceholder}
            aria-label={t.common.search}
            className="h-9 w-full max-w-md rounded-btn border border-borderx bg-canvas pl-9 pr-3 text-base placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </form>

        <div className="ml-auto flex items-center gap-1.5">
          {/* Language toggle — an instant, no-reload demo moment. */}
          <div
            className="flex items-center rounded-btn border border-borderx p-0.5"
            role="group"
            aria-label={t.common.language}
          >
            {(['en', 'hi'] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                aria-pressed={lang === code}
                className={cn(
                  'rounded-[6px] px-2.5 py-1 text-xs font-medium transition-colors',
                  lang === code
                    ? 'bg-primary text-white'
                    : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {code === 'en' ? 'EN' : 'हिंदी'}
              </button>
            ))}
          </div>

          <NotificationBell />

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="flex items-center gap-2 rounded-btn px-1.5 py-1 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Account menu"
              >
                <Avatar name={user?.name ?? '—'} seed={user?.avatarSeed} size="sm" />
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[150px] truncate text-sm font-medium leading-tight text-slate-800">
                    {user?.name}
                  </span>
                  <span className="block max-w-[150px] truncate text-xs leading-tight text-slate-500">
                    {user?.designation}
                  </span>
                </span>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 w-60 rounded-card border border-borderx bg-white p-1 shadow-pop"
              >
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium text-slate-800">{user?.name}</p>
                  <p className="truncate text-xs text-slate-500">{user?.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {user?.department?.name} · {user?.role}
                  </p>
                </div>
                <DropdownMenu.Separator className="my-1 h-px bg-borderx" />
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded-[6px] px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100"
                  onSelect={() => router.push(user?.role === 'EMPLOYEE' ? '/e/performance' : '/')}
                >
                  <User className="h-4 w-4" aria-hidden />
                  {user?.name?.split(' ')[0]}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2 rounded-[6px] px-3 py-2 text-sm text-danger outline-none data-[highlighted]:bg-danger-soft"
                  onSelect={() => void signOut()}
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  {t.common.signOut}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  );
}

function NotificationBell() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const router = useRouter();

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications(),
  });

  const markAll = useMutation({
    mutationFn: () => api.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => api.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = data?.unreadCount ?? 0;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="relative rounded-btn p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`${t.common.notifications}${unread ? ` — ${unread} ${t.common.unread}` : ''}`}
        >
          <Bell className="h-4 w-4" aria-hidden />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[360px] rounded-card border border-borderx bg-white shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-borderx px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-800">{t.common.notifications}</p>
            {unread > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAll.mutate()}
                loading={markAll.isPending}
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                {t.common.markAllRead}
              </Button>
            ) : null}
          </div>

          <div className="thin-scroll max-h-[380px] overflow-y-auto">
            {!data?.items.length ? (
              <EmptyState
                icon={<Bell className="h-5 w-5" aria-hidden />}
                title={t.empty.noNotifications}
                body={t.empty.noNotificationsBody}
                className="py-8"
              />
            ) : (
              <ul>
                {data.items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => {
                        if (!n.read) markOne.mutate(n.id);
                        if (n.link) router.push(n.link);
                      }}
                      className={cn(
                        'flex w-full gap-2.5 border-b border-borderx px-4 py-3 text-left last:border-0 hover:bg-slate-50',
                        !n.read && 'bg-primary-50/40',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          n.read ? 'bg-transparent' : 'bg-primary',
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                        <span className="mt-0.5 block text-sm text-slate-600">{n.body}</span>
                        <span className="mt-1 block text-xs text-slate-400">
                          {new Date(n.createdAt).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
