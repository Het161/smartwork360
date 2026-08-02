'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Award, Flame, Gauge, Timer } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { KpiCard, KpiGrid } from '@/components/kpi-card';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ErrorState, SkeletonCard } from '@/components/ui/states';
import { chartTheme, formatHours } from '@/lib/charts';
import { cn } from '@/lib/utils';

export default function MyPerformancePage() {
  const { t } = useI18n();
  const { user } = useAuth();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['performance', user?.id],
    queryFn: () => api.performance(user!.id),
    enabled: !!user?.id,
  });

  if (isError) {
    return (
      <>
        <PageHeader title={t.nav.myPerformance} />
        <Card>
          <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t.nav.myPerformance}
        subtitle={`${user?.designation} · ${user?.department?.name ?? ''}`}
        breadcrumbs={[{ label: t.nav.employee }, { label: t.nav.myPerformance }]}
      />

      <KpiGrid>
        <KpiCard
          label={t.kpi.onTime}
          value={data?.onTimePct ?? 0}
          suffix="%"
          tone={(data?.onTimePct ?? 0) >= 85 ? 'success' : 'default'}
          icon={<Gauge className="h-4 w-4" aria-hidden />}
          loading={isLoading}
        />
        <KpiCard
          label="Completed (30 days)"
          value={data?.throughput30d ?? 0}
          hint={`${data?.completedTotal ?? 0} all time`}
          icon={<Award className="h-4 w-4" aria-hidden />}
          loading={isLoading}
        />
        <KpiCard
          label={t.kpi.avgCycleTime}
          value={data ? formatHours(data.avgCycleTimeHours) : '—'}
          icon={<Timer className="h-4 w-4" aria-hidden />}
          loading={isLoading}
        />
        <KpiCard
          label={t.employee.streak}
          value={data?.currentStreak ?? 0}
          hint="consecutive tasks within SLA"
          tone={(data?.currentStreak ?? 0) >= 5 ? 'success' : 'default'}
          icon={<Flame className="h-4 w-4" aria-hidden />}
          loading={isLoading}
        />
      </KpiGrid>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.employee.completedPerMonth} hint="Completed vs completed on time" />
          <CardBody>
            {isLoading ? (
              <SkeletonCard rows={4} className="border-0 shadow-none" />
            ) : (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.monthly ?? []} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: chartTheme.axis }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartTheme.axis }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTheme.tooltip} cursor={{ fill: 'rgba(20,65,123,0.04)' }} />
                    <Bar dataKey="completed" name="Completed" fill={chartTheme.primary} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="onTime" name="On time" fill={chartTheme.green} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t.employee.cycleTimeTrend} hint="Average hours from raise to completion" />
          <CardBody>
            {isLoading ? (
              <SkeletonCard rows={4} className="border-0 shadow-none" />
            ) : (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data?.cycleTrend ?? []} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: chartTheme.axis }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: chartTheme.axis }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={chartTheme.tooltip}
                      formatter={(v: number) => [formatHours(v), 'Avg cycle time']}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgCycleTimeHours"
                      stroke={chartTheme.teal}
                      strokeWidth={2}
                      dot={{ r: 3, fill: chartTheme.teal }}
                      name="Avg cycle time"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={t.employee.badges} hint="Earned from your own completion record" />
        <CardBody>
          {isLoading ? (
            <SkeletonCard rows={2} className="border-0 shadow-none" />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(data?.badges ?? []).map((badge) => (
                <li
                  key={badge.key}
                  className={cn(
                    'flex items-start gap-3 rounded-card border p-3',
                    badge.earned
                      ? 'border-success/30 bg-success-soft'
                      : 'border-borderx bg-slate-50 opacity-70',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                      badge.earned ? 'bg-success text-white' : 'bg-slate-200 text-slate-400',
                    )}
                    aria-hidden
                  >
                    <Award className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{badge.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{badge.hint}</span>
                    <span
                      className={cn(
                        'mt-1 inline-block text-[11px] font-semibold uppercase tracking-wide',
                        badge.earned ? 'text-success' : 'text-slate-400',
                      )}
                    >
                      {badge.earned ? 'Earned' : 'Not yet'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
