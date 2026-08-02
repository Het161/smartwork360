'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/ui/states';
import { PRIORITY_COLOR, chartTheme, formatHours } from '@/lib/charts';

export default function TeamAnalyticsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const deptId = user?.departmentId;

  const trends = useQuery({ queryKey: ['trends', 'dept'], queryFn: () => api.trends('dept') });
  const sla = useQuery({ queryKey: ['sla', 'dept'], queryFn: () => api.sla('dept') });
  const kpis = useQuery({ queryKey: ['kpis', 'dept'], queryFn: () => api.kpis('dept') });
  const sentiment = useQuery({
    queryKey: ['sentiment', deptId],
    queryFn: () => api.teamSentiment(deptId!, 30),
    enabled: !!deptId,
  });
  const tasks = useQuery({
    queryKey: ['tasks', 'analytics'],
    queryFn: () => api.tasks({ status: 'COMPLETED', pageSize: 100 }),
  });

  /** Mean cycle time per priority, computed from the completed tasks we already have. */
  const cycleByPriority = useMemo(() => {
    const buckets = new Map<string, number[]>();
    for (const task of tasks.data?.items ?? []) {
      if (!task.completedAt) continue;
      const hours =
        (new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime()) / 3_600_000;
      buckets.set(task.priority, [...(buckets.get(task.priority) ?? []), hours]);
    }
    return (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((priority) => {
      const list = buckets.get(priority) ?? [];
      return {
        priority,
        label: t.priority[priority],
        hours: list.length ? Number((list.reduce((a, b) => a + b, 0) / list.length).toFixed(1)) : 0,
        count: list.length,
      };
    });
  }, [tasks.data, t]);

  /**
   * The correlation view: daily mean sentiment overlaid on the number of updates
   * logged that day (a proxy for how much work was in flight). Labelled explicitly
   * as a correlation, not a causal claim.
   */
  const correlation = useMemo(() => {
    const trend = sentiment.data?.trend ?? [];
    return trend.map((point) => ({
      date: new Date(point.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      sentiment: point.score,
      load: point.count,
    }));
  }, [sentiment.data]);

  return (
    <>
      <PageHeader
        title={t.nav.teamAnalytics}
        subtitle={user?.department?.name}
        breadcrumbs={[{ label: t.nav.manager }, { label: t.nav.teamAnalytics }]}
      />

      {/* The "30–40% faster" claim, measured */}
      <Card className="mb-4 border-l-[3px] border-l-success">
        <CardBody className="flex flex-wrap items-center gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-success-soft text-success">
            <TrendingUp className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-md font-semibold text-slate-900">
              Cycle time down{' '}
              <span className="text-success">
                {kpis.data ? Math.abs(kpis.data.cycleTimeImprovementPct).toFixed(1) : '—'}%
              </span>{' '}
              across this window
            </p>
            <p className="mt-0.5 text-sm text-slate-600">
              Mean time from raise to completion, older half of completed tasks vs the more recent
              half. Currently averaging{' '}
              <strong>{kpis.data ? formatHours(kpis.data.avgCycleTimeHours) : '—'}</strong>.
            </p>
          </div>
          <Badge tone="green">Computed from task records</Badge>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.manager.throughput} hint="Tasks completed each week" />
          <CardBody>
            {trends.isLoading ? (
              <SkeletonCard rows={4} className="border-0 shadow-none" />
            ) : (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trends.data?.items ?? []} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                    <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.axis }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartTheme.axis }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTheme.tooltip} cursor={{ fill: 'rgba(20,65,123,0.04)' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="throughput" name="Completed" fill={chartTheme.primary} radius={[3, 3, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="avgCycleTimeHours"
                      name="Avg cycle (h)"
                      stroke={chartTheme.saffron}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t.manager.cycleByPriority} hint="Average hours from raise to completion" />
          <CardBody>
            {tasks.isLoading ? (
              <SkeletonCard rows={4} className="border-0 shadow-none" />
            ) : (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cycleByPriority} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 24 }}>
                    <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: chartTheme.axis }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ fontSize: 11, fill: chartTheme.axis }}
                      axisLine={false}
                      tickLine={false}
                      width={70}
                    />
                    <Tooltip
                      contentStyle={chartTheme.tooltip}
                      cursor={{ fill: 'rgba(20,65,123,0.04)' }}
                      formatter={(v: number, _n, item) => [
                        `${formatHours(v)} (${(item.payload as { count: number }).count} tasks)`,
                        'Avg cycle time',
                      ]}
                    />
                    <Bar dataKey="hours" radius={[0, 3, 3, 0]}>
                      {cycleByPriority.map((entry) => (
                        <Cell key={entry.priority} fill={PRIORITY_COLOR[entry.priority]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t.manager.breachesByWeek} hint="Completed tasks that missed their deadline" />
          <CardBody>
            {trends.isLoading ? (
              <SkeletonCard rows={4} className="border-0 shadow-none" />
            ) : (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trends.data?.items ?? []} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                    <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTheme.axis }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: chartTheme.axis }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTheme.tooltip} cursor={{ fill: 'rgba(179,38,30,0.05)' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="breaches" name="SLA breaches" fill={chartTheme.danger} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="throughput" name="Completed" fill={chartTheme.grid} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t.manager.correlation}
            hint={t.manager.correlationHint}
            action={<Badge tone="teal">Correlation, not causation</Badge>}
          />
          <CardBody>
            {sentiment.isLoading ? (
              <SkeletonCard rows={4} className="border-0 shadow-none" />
            ) : correlation.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">{t.common.noData}</p>
            ) : (
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={correlation} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
                    <defs>
                      <linearGradient id="loadFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartTheme.teal} stopOpacity={0.08} />
                        <stop offset="100%" stopColor={chartTheme.teal} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: chartTheme.axis }} axisLine={false} tickLine={false} />
                    <YAxis
                      yAxisId="left"
                      domain={[-1, 1]}
                      tick={{ fontSize: 11, fill: chartTheme.axis }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: chartTheme.axis }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={chartTheme.tooltip} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      yAxisId="right"
                      type="monotone"
                      dataKey="load"
                      name="Updates logged"
                      stroke={chartTheme.teal}
                      strokeWidth={1.5}
                      fill="url(#loadFill)"
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="sentiment"
                      name="Mean sentiment"
                      stroke={chartTheme.primary}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
