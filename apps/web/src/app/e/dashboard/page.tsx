'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Megaphone,
  Target,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { KpiCard, KpiGrid } from '@/components/kpi-card';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PriorityChip, SlaChip } from '@/components/chips';
import { EmptyState, ErrorState, SkeletonCard } from '@/components/ui/states';
import { TaskDrawer } from '@/components/tasks/task-drawer';
import { Button } from '@/components/ui/button';
import { chartTheme } from '@/lib/charts';

export default function EmployeeDashboard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);

  const kpis = useQuery({ queryKey: ['kpis', 'me'], queryFn: () => api.kpis('me') });
  // `open: true` matters — sorting every task by dueDate would surface long-closed
  // work first and leave this list empty.
  const focus = useQuery({
    queryKey: ['tasks', 'focus'],
    queryFn: () => api.tasks({ open: true, pageSize: 6, sort: 'dueDate', order: 'asc' }),
  });
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications(),
  });

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t.employee.greeting;
    if (h < 17) return t.employee.greetingAfternoon;
    return t.employee.greetingEvening;
  }, [t]);

  // 7-day activity — the real count of updates this user authored each day,
  // derived from their own sentiment records (one row per authored update).
  const mySentiment = useQuery({
    queryKey: ['sentiment', 'mine'],
    queryFn: () => api.mySentiment(),
  });

  const activity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const point of mySentiment.data?.trend ?? []) {
      const key = point.date.slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const days: { day: string; updates: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        day: d.toLocaleDateString('en-IN', { weekday: 'short' }),
        updates: counts.get(d.toISOString().slice(0, 10)) ?? 0,
      });
    }
    return days;
  }, [mySentiment.data]);

  const openFocus = focus.data?.items ?? [];

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user?.name?.split(' ')[0] ?? ''}`}
        subtitle={`${user?.designation} · ${user?.department?.name ?? ''}`}
        breadcrumbs={[{ label: t.nav.employee }, { label: t.nav.dashboard }]}
      />

      {kpis.isError ? (
        <Card>
          <ErrorState message={(kpis.error as Error)?.message} onRetry={() => kpis.refetch()} />
        </Card>
      ) : (
        <KpiGrid className="scroll-mt-24" data-tour="my-kpis">
          <KpiCard
            label={t.kpi.assigned}
            value={kpis.data ? kpis.data.pending + kpis.data.inProgress + kpis.data.underReview : 0}
            hint={`${kpis.data?.completed ?? 0} ${t.employee.completedAllTime}`}
            icon={<ClipboardList className="h-4 w-4" aria-hidden />}
            loading={kpis.isLoading}
          />
          <KpiCard
            label={t.kpi.dueToday}
            value={kpis.data?.dueToday ?? 0}
            tone={kpis.data?.dueToday ? 'warning' : 'default'}
            icon={<CalendarDays className="h-4 w-4" aria-hidden />}
            loading={kpis.isLoading}
          />
          <KpiCard
            label={t.kpi.overdue}
            value={kpis.data?.overdue ?? 0}
            tone={kpis.data?.overdue ? 'danger' : 'success'}
            icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
            loading={kpis.isLoading}
          />
          <KpiCard
            label={t.kpi.onTime}
            value={kpis.data?.onTimePct ?? 0}
            suffix="%"
            tone={(kpis.data?.onTimePct ?? 0) >= 85 ? 'success' : 'default'}
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
            loading={kpis.isLoading}
          />
        </KpiGrid>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* Today's focus */}
        <Card>
          <CardHeader
            icon={<Target className="h-4 w-4 text-primary" aria-hidden />}
            title={t.employee.todaysFocus}
            hint={t.employee.todaysFocusHint}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/e/tasks">{t.common.viewAll}</Link>
              </Button>
            }
          />
          {focus.isLoading ? (
            <div className="space-y-2 p-4">
              <SkeletonCard rows={2} className="border-0 shadow-none" />
            </div>
          ) : openFocus.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
              title={t.employee.noTasksToday}
              body="New assignments will appear here as soon as they are raised."
            />
          ) : (
            <ul className="divide-y divide-borderx">
              {openFocus.map((task) => (
                <li key={task.id}>
                  <button
                    onClick={() => setSelected(task.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs text-primary">{task.refNo}</span>
                        <PriorityChip priority={task.priority} />
                      </span>
                      <span className="mt-1 block truncate text-base text-slate-800">
                        {task.title}
                      </span>
                    </span>
                    <SlaChip hoursRemaining={task.hoursRemaining} isOverdue={task.isOverdue} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          {/* 7-day activity */}
          <Card>
            <CardHeader title={t.employee.activity} hint={t.employee.activityHint} />
            <CardBody className="pt-2">
              <div className="h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activity} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                    <defs>
                      <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartTheme.primary} stopOpacity={0.08} />
                        <stop offset="100%" stopColor={chartTheme.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <Tooltip contentStyle={chartTheme.tooltip} />
                    <Area
                      type="monotone"
                      dataKey="updates"
                      stroke={chartTheme.primary}
                      strokeWidth={2}
                      fill="url(#activityFill)"
                      name="Active days"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          {/* Announcements */}
          <Card>
            <CardHeader
              icon={<Megaphone className="h-4 w-4 text-saffron-deep" aria-hidden />}
              title={t.employee.announcements}
            />
            {!notifications.data?.items.length ? (
              <EmptyState
                title={t.empty.noNotifications}
                body={t.empty.noNotificationsBody}
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-borderx">
                {notifications.data.items.slice(0, 4).map((n) => (
                  <li key={n.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-800">{n.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <TaskDrawer taskId={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </>
  );
}
