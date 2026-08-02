'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardList, HeartPulse, ShieldAlert, Timer, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { KpiCard, KpiGrid } from '@/components/kpi-card';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, SkeletonCard } from '@/components/ui/states';
import { LoadChip, RiskChip } from '@/components/chips';
import { Avatar } from '@/components/avatar';
import { LoadBar, MoraleGauge, Ring, ScoreDial } from '@/components/viz';
import { formatHours } from '@/lib/charts';

export default function ManagerDashboard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const deptId = user?.departmentId;

  const kpis = useQuery({ queryKey: ['kpis', 'dept'], queryFn: () => api.kpis('dept') });
  const sla = useQuery({ queryKey: ['sla', 'dept'], queryFn: () => api.sla('dept') });
  const workload = useQuery({
    queryKey: ['workload', deptId],
    queryFn: () => api.workload(deptId),
    enabled: !!deptId,
  });
  const sentiment = useQuery({
    queryKey: ['sentiment', deptId],
    queryFn: () => api.teamSentiment(deptId!),
    enabled: !!deptId,
  });
  const burnout = useQuery({
    queryKey: ['burnout', deptId],
    queryFn: () => api.teamBurnout(deptId!),
    enabled: !!deptId,
  });
  const alerts = useQuery({
    queryKey: ['alerts', 'dept', 'recent'],
    queryFn: () => api.alerts({ pageSize: 4, status: 'OPEN' }),
  });

  const maxLoad = Math.max(1, ...(workload.data?.items ?? []).map((w) => w.activeLoad));
  const atRisk = (burnout.data?.items ?? []).filter(
    (b) => b.riskLevel === 'HIGH' || b.riskLevel === 'CRITICAL',
  );

  return (
    <>
      <PageHeader
        title={t.nav.teamDashboard}
        subtitle={`${user?.department?.name ?? ''} · ${user?.designation ?? ''}`}
        breadcrumbs={[{ label: t.nav.manager }, { label: t.nav.teamDashboard }]}
        action={
          <Button asChild size="sm">
            <Link href="/m/board">{t.nav.taskBoard}</Link>
          </Button>
        }
      />

      <KpiGrid>
        <KpiCard
          label={t.kpi.totalTasks}
          value={kpis.data?.totalTasks ?? 0}
          hint={`${kpis.data?.completed ?? 0} completed`}
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
          label={t.kpi.activeStaff}
          value={workload.data?.items.length ?? 0}
          hint={`${atRisk.length} ${t.kpi.atRisk.toLowerCase()}`}
          tone={atRisk.length ? 'warning' : 'default'}
          icon={<Users className="h-4 w-4" aria-hidden />}
          loading={workload.isLoading}
        />
      </KpiGrid>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* SLA ring */}
        <Card>
          <CardHeader title={t.kpi.slaCompliance} hint="Completed tasks that met their deadline" />
          <CardBody className="flex flex-col items-center">
            {sla.isLoading ? (
              <SkeletonCard rows={3} className="w-full border-0 shadow-none" />
            ) : (
              <>
                <Ring
                  value={sla.data?.compliancePct ?? 0}
                  label={t.kpi.slaCompliance}
                  sublabel={`${sla.data?.breached ?? 0} of ${sla.data?.totalMeasured ?? 0} breached`}
                />
                <div className="mt-4 w-full space-y-1.5">
                  {(sla.data?.byPriority ?? [])
                    .filter((p) => p.total > 0)
                    .map((p) => (
                      <div key={p.priority} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">{t.priority[p.priority]}</span>
                        <span className="tabular font-medium text-slate-800">
                          {p.compliancePct}%
                          <span className="ml-1 text-xs font-normal text-slate-400">
                            ({p.breached}/{p.total})
                          </span>
                        </span>
                      </div>
                    ))}
                </div>
              </>
            )}
          </CardBody>
        </Card>

        {/* Morale gauge */}
        <Card>
          <CardHeader title={t.manager.morale} hint={t.manager.morale14d} />
          <CardBody className="flex flex-col items-center">
            {sentiment.isLoading ? (
              <SkeletonCard rows={3} className="w-full border-0 shadow-none" />
            ) : (
              <>
                <MoraleGauge
                  score={sentiment.data?.averageScore ?? 0}
                  label={sentiment.data?.label ?? 'NEUTRAL'}
                  delta={sentiment.data?.trendDelta ?? 0}
                />
                <div className="mt-3 flex w-full justify-around text-center">
                  <div>
                    <p className="kpi-value text-lg font-semibold text-success">
                      {sentiment.data?.distribution.positive ?? 0}
                    </p>
                    <p className="text-xs text-slate-500">Positive</p>
                  </div>
                  <div>
                    <p className="kpi-value text-lg font-semibold text-slate-500">
                      {sentiment.data?.distribution.neutral ?? 0}
                    </p>
                    <p className="text-xs text-slate-500">Neutral</p>
                  </div>
                  <div>
                    <p className="kpi-value text-lg font-semibold text-danger">
                      {sentiment.data?.distribution.negative ?? 0}
                    </p>
                    <p className="text-xs text-slate-500">Negative</p>
                  </div>
                </div>
                <p className="mt-3 text-center text-xs text-slate-400">
                  {sentiment.data?.mode === 'model' ? 'DistilBERT SST-2' : 'Lexicon (offline mode)'} ·{' '}
                  {sentiment.data?.modelVersion}
                </p>
              </>
            )}
          </CardBody>
        </Card>

        {/* Burnout risk top 3 */}
        <Card>
          <CardHeader
            icon={<HeartPulse className="h-4 w-4 text-danger" aria-hidden />}
            title={t.manager.burnoutRisk}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/m/burnout">{t.common.viewAll}</Link>
              </Button>
            }
          />
          {burnout.isLoading ? (
            <SkeletonCard rows={3} className="border-0 shadow-none" />
          ) : (burnout.data?.items ?? []).length === 0 ? (
            <EmptyState title={t.common.noData} className="py-8" />
          ) : (
            <ul className="divide-y divide-borderx">
              {(burnout.data?.items ?? []).slice(0, 3).map((b) => (
                <li key={b.userId} className="flex items-center gap-3 px-4 py-3">
                  <ScoreDial score={b.score} riskLevel={b.riskLevel} size={54} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{b.user?.name}</p>
                    <p className="truncate text-xs text-slate-500">{b.user?.designation}</p>
                    <div className="mt-1">
                      <RiskChip level={b.riskLevel} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Workload */}
        <Card>
          <CardHeader title={t.manager.workload} hint="Active tasks currently on each desk" />
          {workload.isLoading ? (
            <SkeletonCard rows={5} className="border-0 shadow-none" />
          ) : (workload.data?.items ?? []).length === 0 ? (
            <EmptyState title={t.empty.noUsers} className="py-8" />
          ) : (
            <ul className="divide-y divide-borderx">
              {[...(workload.data?.items ?? [])]
                .sort((a, b) => b.activeLoad - a.activeLoad)
                .map((w) => (
                  <li key={w.userId} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={w.name} seed={w.avatarSeed} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-800">{w.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {w.overdue > 0 ? (
                            <Badge tone="red">{w.overdue} overdue</Badge>
                          ) : null}
                          <LoadChip band={w.band} />
                          <span className="tabular w-6 text-right text-sm font-semibold text-slate-700">
                            {w.activeLoad}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <LoadBar value={w.activeLoad} max={maxLoad} band={w.band} />
                      </div>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        {/* Latest alerts */}
        <Card>
          <CardHeader
            icon={<ShieldAlert className="h-4 w-4 text-warning" aria-hidden />}
            title={t.manager.latestAlerts}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/m/alerts">{t.common.viewAll}</Link>
              </Button>
            }
          />
          {alerts.isLoading ? (
            <SkeletonCard rows={3} className="border-0 shadow-none" />
          ) : (alerts.data?.items ?? []).length === 0 ? (
            <EmptyState title={t.empty.noAlerts} body={t.empty.noAlertsBody} className="py-8" />
          ) : (
            <ul className="divide-y divide-borderx">
              {(alerts.data?.items ?? []).map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">
                      {a.type.replace(/_/g, ' ').toLowerCase()}
                    </span>
                    <RiskChip level={a.severity} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {a.user?.name} · score {a.anomalyScore.toFixed(2)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
