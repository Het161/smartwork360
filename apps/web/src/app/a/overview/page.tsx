'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { RiskLevel } from '@smartwork/shared';
import {
  AlertTriangle,
  ArrowUpDown,
  Building2,
  ClipboardList,
  ShieldAlert,
  Timer,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { KpiCard, KpiGrid } from '@/components/kpi-card';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, SkeletonCard, SkeletonTable } from '@/components/ui/states';
import { RiskChip } from '@/components/chips';
import { Ring } from '@/components/viz';
import { formatHours, heatColor } from '@/lib/charts';
import { cn } from '@/lib/utils';

type SortKey = 'code' | 'open' | 'overdue' | 'compliancePct' | 'morale' | 'risk';

export default function OrgOverviewPage() {
  const { t, pick } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>('compliancePct');
  const [asc, setAsc] = useState(true);

  const kpis = useQuery({ queryKey: ['kpis', 'org'], queryFn: () => api.kpis('org') });
  const sla = useQuery({ queryKey: ['sla', 'org'], queryFn: () => api.sla('org') });
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api.departments() });
  const alerts = useQuery({
    queryKey: ['alerts', 'org', 'summary'],
    queryFn: () => api.alerts({ pageSize: 200 }),
  });
  const tasks = useQuery({
    queryKey: ['tasks', 'org', 'open'],
    queryFn: () => api.tasks({ open: true, pageSize: 100 }),
  });

  // Per-department morale needs one call each; four departments, run in parallel.
  const deptIds = departments.data?.items.map((d) => d.id) ?? [];
  const morale = useQuery({
    queryKey: ['morale', 'all', deptIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        deptIds.map(async (id) => {
          try {
            const s = await api.teamSentiment(id);
            return [id, s.averageScore] as const;
          } catch {
            return [id, 0] as const;
          }
        }),
      );
      return Object.fromEntries(results);
    },
    enabled: deptIds.length > 0,
  });

  const riskByDept = useQuery({
    queryKey: ['risk', 'all', deptIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        deptIds.map(async (id) => {
          try {
            const b = await api.teamBurnout(id);
            return [
              id,
              b.items.filter((x) => x.riskLevel === 'HIGH' || x.riskLevel === 'CRITICAL').length,
            ] as const;
          } catch {
            return [id, 0] as const;
          }
        }),
      );
      return Object.fromEntries(results);
    },
    enabled: deptIds.length > 0,
  });

  const rows = useMemo(() => {
    const openByDept = new Map<string, { open: number; overdue: number }>();
    for (const task of tasks.data?.items ?? []) {
      const entry = openByDept.get(task.departmentId) ?? { open: 0, overdue: 0 };
      entry.open += 1;
      if (task.isOverdue) entry.overdue += 1;
      openByDept.set(task.departmentId, entry);
    }

    return (departments.data?.items ?? []).map((d) => {
      const slaRow = sla.data?.byDepartment.find((x) => x.departmentId === d.id);
      const counts = openByDept.get(d.id) ?? { open: 0, overdue: 0 };
      return {
        id: d.id,
        code: d.code,
        name: pick(d.name, d.nameHi),
        userCount: d.userCount ?? 0,
        open: counts.open,
        overdue: counts.overdue,
        compliancePct: slaRow?.compliancePct ?? 100,
        morale: morale.data?.[d.id] ?? 0,
        risk: riskByDept.data?.[d.id] ?? 0,
      };
    });
  }, [departments.data, sla.data, tasks.data, morale.data, riskByDept.data, pick]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv);
      return asc ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, asc]);

  const openAlerts = (alerts.data?.items ?? []).filter((a) => a.status === 'OPEN');
  const bySeverity = (level: RiskLevel) => openAlerts.filter((a) => a.severity === level).length;

  // Heatmap: weeks across, departments down.
  const heat = useMemo(() => {
    const weeks = [...new Set((sla.data?.heatmap ?? []).map((c) => c.week))].sort().slice(-10);
    const byDept = new Map<string, Map<string, { breaches: number; total: number }>>();
    for (const cell of sla.data?.heatmap ?? []) {
      const map = byDept.get(cell.code) ?? new Map();
      map.set(cell.week, { breaches: cell.breaches, total: cell.total });
      byDept.set(cell.code, map);
    }
    return { weeks, byDept };
  }, [sla.data]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
  }

  return (
    <>
      <PageHeader
        title={t.nav.orgOverview}
        subtitle="All departments, live"
        breadcrumbs={[{ label: t.nav.admin }, { label: t.nav.orgOverview }]}
      />

      <KpiGrid>
        <KpiCard
          label={t.kpi.totalTasks}
          value={kpis.data?.totalTasks ?? 0}
          hint={`${kpis.data?.completed ?? 0} completed · ${kpis.data?.activeUsers ?? 0} staff`}
          icon={<ClipboardList className="h-4 w-4" aria-hidden />}
          loading={kpis.isLoading}
        />
        <KpiCard
          label={t.kpi.overdue}
          value={kpis.data?.overdue ?? 0}
          tone={kpis.data?.overdue ? 'danger' : 'success'}
          hint={`${kpis.data?.dueToday ?? 0} due today`}
          icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
          loading={kpis.isLoading}
        />
        <KpiCard
          label={t.kpi.avgCycleTime}
          value={kpis.data ? formatHours(kpis.data.avgCycleTimeHours) : '—'}
          deltaPct={kpis.data?.cycleTimeImprovementPct}
          hint={t.kpi.cycleImprovement}
          icon={<Timer className="h-4 w-4" aria-hidden />}
          loading={kpis.isLoading}
        />
        <KpiCard
          label={t.kpi.openAlerts}
          value={openAlerts.length}
          tone={openAlerts.length ? 'warning' : 'success'}
          hint={`${bySeverity('CRITICAL')} critical`}
          icon={<ShieldAlert className="h-4 w-4" aria-hidden />}
          loading={alerts.isLoading}
        />
      </KpiGrid>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* Department comparison */}
        <Card>
          <CardHeader
            icon={<Building2 className="h-4 w-4 text-primary" aria-hidden />}
            title={t.admin.deptComparison}
            hint="Click a column heading to sort"
          />
          {departments.isLoading || sla.isLoading ? (
            <SkeletonTable rows={4} cols={6} />
          ) : (
            <div className="thin-scroll overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <caption className="sr-only">Department comparison</caption>
                <thead>
                  <tr className="border-b border-borderx bg-slate-50/70">
                    {(
                      [
                        ['code', 'Department'],
                        ['open', 'Open'],
                        ['overdue', 'Overdue'],
                        ['compliancePct', 'SLA %'],
                        ['morale', 'Morale'],
                        ['risk', 'At risk'],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <th key={key} scope="col" className="px-3 py-2.5">
                        <button
                          onClick={() => toggleSort(key)}
                          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          aria-sort={sortKey === key ? (asc ? 'ascending' : 'descending') : 'none'}
                        >
                          {label}
                          <ArrowUpDown
                            className={cn('h-3 w-3', sortKey === key ? 'text-primary' : 'text-slate-300')}
                            aria-hidden
                          />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr key={row.id} className="border-b border-borderx last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2">
                          <Badge tone="slate">{row.code}</Badge>
                          <span className="text-base text-slate-800">{row.name}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {row.userCount} people
                        </span>
                      </td>
                      <td className="tabular px-3 py-2.5 text-base text-slate-800">{row.open}</td>
                      <td className="tabular px-3 py-2.5">
                        <span className={cn('text-base', row.overdue > 0 ? 'font-medium text-danger' : 'text-slate-800')}>
                          {row.overdue}
                        </span>
                      </td>
                      <td className="tabular px-3 py-2.5">
                        <span
                          className={cn(
                            'text-base font-medium',
                            row.compliancePct >= 85
                              ? 'text-success'
                              : row.compliancePct >= 65
                                ? 'text-warning'
                                : 'text-danger',
                          )}
                        >
                          {row.compliancePct}%
                        </span>
                      </td>
                      <td className="tabular px-3 py-2.5">
                        <span
                          className={cn(
                            'text-base font-medium',
                            row.morale > 0.25
                              ? 'text-success'
                              : row.morale < -0.25
                                ? 'text-danger'
                                : 'text-slate-600',
                          )}
                        >
                          {row.morale > 0 ? '+' : ''}
                          {row.morale.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {row.risk > 0 ? (
                          <RiskChip level={row.risk >= 2 ? 'HIGH' : 'MODERATE'} />
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t.kpi.slaCompliance} hint="Organisation-wide" />
            <CardBody className="flex justify-center">
              {sla.isLoading ? (
                <SkeletonCard rows={2} className="w-full border-0 shadow-none" />
              ) : (
                <Ring
                  value={sla.data?.compliancePct ?? 0}
                  sublabel={`${sla.data?.breached ?? 0} of ${sla.data?.totalMeasured ?? 0} breached`}
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t.admin.alertsSummary}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/a/fraud">{t.common.viewAll}</Link>
                </Button>
              }
            />
            <CardBody className="space-y-2">
              {(['CRITICAL', 'HIGH', 'MODERATE', 'LOW'] as RiskLevel[]).map((level) => (
                <div key={level} className="flex items-center justify-between">
                  <RiskChip level={level} />
                  <span className="tabular text-base font-semibold text-slate-800">
                    {bySeverity(level)}
                  </span>
                </div>
              ))}
              <p className="border-t border-borderx pt-2 text-xs text-slate-500">
                {alerts.data?.precision
                  ? `${alerts.data.precision.confirmed}/${alerts.data.precision.totalLabelled} confirmed on review — ${alerts.data.precision.precisionPct}% precision`
                  : ''}
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* SLA heatmap */}
      <Card className="mt-4">
        <CardHeader title={t.admin.slaHeatmap} hint={t.admin.heatmapHint} />
        <CardBody>
          {sla.isLoading ? (
            <SkeletonCard rows={4} className="border-0 shadow-none" />
          ) : heat.weeks.length === 0 ? (
            <EmptyState title={t.common.noData} className="py-8" />
          ) : (
            <div className="thin-scroll overflow-x-auto">
              <table className="border-collapse">
                <caption className="sr-only">SLA breaches by week and department</caption>
                <thead>
                  <tr>
                    <th scope="col" className="px-2 py-1 text-left text-xs font-semibold text-slate-500">
                      Dept
                    </th>
                    {heat.weeks.map((w) => (
                      <th
                        key={w}
                        scope="col"
                        className="px-1 py-1 text-center text-[10px] font-medium text-slate-400"
                      >
                        {new Date(w).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...heat.byDept.entries()].map(([code, weeks]) => (
                    <tr key={code}>
                      <th scope="row" className="px-2 py-1 text-left">
                        <Badge tone="slate">{code}</Badge>
                      </th>
                      {heat.weeks.map((w) => {
                        const cell = weeks.get(w);
                        const ratio = cell && cell.total > 0 ? cell.breaches / cell.total : 0;
                        return (
                          <td key={w} className="p-0.5">
                            <div
                              className="grid h-8 w-12 place-items-center rounded text-[11px] font-medium"
                              style={{
                                background: heatColor(ratio),
                                color: ratio > 0.5 ? 'white' : '#475569',
                              }}
                              title={
                                cell
                                  ? `${code} · week of ${new Date(w).toLocaleDateString('en-IN')} — ${cell.breaches} breached of ${cell.total}`
                                  : `${code} — no completions that week`
                              }
                            >
                              {cell ? cell.breaches : '·'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
