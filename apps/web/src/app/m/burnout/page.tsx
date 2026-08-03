'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartPulse, Lightbulb, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, SkeletonCard } from '@/components/ui/states';
import { RiskChip } from '@/components/chips';
import { Avatar } from '@/components/avatar';
import { MoraleGauge, ScoreDial } from '@/components/viz';
import { cn, weekStartOf } from '@/lib/utils';

const FACTOR_LABEL: Record<string, string> = {
  activeLoad: 'Active workload',
  overdueCount: 'Overdue tasks',
  afterHoursPct: 'After-hours activity',
  negSentimentPct: 'Negative sentiment',
  avgDailyUpdates: 'Update churn',
};

const FACTOR_UNIT: Record<string, string> = {
  activeLoad: 'tasks',
  overdueCount: 'tasks',
  afterHoursPct: '%',
  negSentimentPct: '%',
  avgDailyUpdates: '/day',
};

export default function BurnoutPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const deptId = user?.departmentId ?? undefined;
  const [message, setMessage] = useState<string | null>(null);

  const burnout = useQuery({
    queryKey: ['burnout', deptId],
    queryFn: () => api.teamBurnout(deptId!),
    enabled: !!deptId,
  });

  const sentiment = useQuery({
    queryKey: ['sentiment', deptId],
    queryFn: () => api.teamSentiment(deptId!),
    enabled: !!deptId,
  });

  const recompute = useMutation({
    mutationFn: () => api.recomputeBurnout(deptId),
    onSuccess: (res) => {
      setMessage(
        `Re-scored ${res.scored} team members using the ${res.mode === 'model' ? 'trained model' : 'offline heuristic'}.`,
      );
      void qc.invalidateQueries({ queryKey: ['burnout'] });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : 'Recompute failed'),
  });

  const items = burnout.data?.items ?? [];

  // Scores are stored per week. When nobody has recomputed since the week
  // rolled over, the API serves the most recent week rather than nothing — so
  // say which week is on screen instead of letting old scores read as today's.
  const shownWeek = items[0]?.weekStart;
  const staleWeek =
    shownWeek !== undefined && new Date(shownWeek).getTime() < weekStartOf(new Date()).getTime();

  return (
    <>
      <PageHeader
        title={t.nav.burnout}
        subtitle={`${user?.department?.name ?? ''} · scored from workload, deadlines, working hours and update sentiment`}
        breadcrumbs={[{ label: t.nav.manager }, { label: t.nav.burnout }]}
        action={
          <Button
            variant="secondary"
            size="sm"
            loading={recompute.isPending}
            onClick={() => recompute.mutate()}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Recompute
          </Button>
        }
      />

      {staleWeek && shownWeek ? (
        <div className="mb-4 rounded-card border border-borderx bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Showing the week of{' '}
          <strong>
            {new Date(shownWeek).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </strong>
          . Press <strong>Recompute</strong> for this week&rsquo;s scores.
        </div>
      ) : null}

      {message ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-card border border-borderx bg-primary-50 px-4 py-2.5 text-sm text-primary">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="font-medium underline">
            {t.common.close}
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit">
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
                <p className="mt-3 text-center text-xs text-slate-500">
                  Averaged over {(sentiment.data?.distribution.positive ?? 0) +
                    (sentiment.data?.distribution.neutral ?? 0) +
                    (sentiment.data?.distribution.negative ?? 0)}{' '}
                  progress updates in the last 14 days.
                </p>
              </>
            )}
          </CardBody>
        </Card>

        <div>
          {burnout.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <SkeletonCard key={i} rows={3} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<HeartPulse className="h-5 w-5" aria-hidden />}
                title={t.common.noData}
                body="No burnout scores have been computed yet."
                action={
                  <Button size="sm" onClick={() => recompute.mutate()} loading={recompute.isPending}>
                    Compute now
                  </Button>
                }
              />
            </Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((b) => (
                <li key={b.userId}>
                  <Card
                    className={cn(
                      'h-full',
                      b.riskLevel === 'CRITICAL' && 'border-l-[3px] border-l-danger',
                      b.riskLevel === 'HIGH' && 'border-l-[3px] border-l-danger/70',
                      b.riskLevel === 'MODERATE' && 'border-l-[3px] border-l-warning',
                    )}
                  >
                    <CardBody>
                      <div className="flex items-start gap-3">
                        <ScoreDial score={b.score} riskLevel={b.riskLevel} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <Avatar name={b.user?.name ?? ''} seed={b.user?.avatarSeed} size="xs" />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                  {b.user?.name}
                                </p>
                                <p className="truncate text-xs text-slate-500">
                                  {b.user?.designation}
                                </p>
                              </div>
                            </div>
                            <RiskChip level={b.riskLevel} />
                          </div>

                          {/* Top contributing factors */}
                          <div className="mt-3">
                            <p className="gt-label mb-1.5">{t.manager.topFactors}</p>
                            <ul className="space-y-1">
                              {b.topFactors.map((f) => (
                                <li key={f.key} className="flex items-center justify-between text-sm">
                                  <span className="text-slate-600">
                                    {FACTOR_LABEL[f.key] ?? f.label}
                                  </span>
                                  <span className="tabular font-medium text-slate-800">
                                    {f.value}
                                    {FACTOR_UNIT[f.key] ?? ''}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* Full factor breakdown */}
                      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-borderx pt-3">
                        <Factor label="Active" value={b.factors.activeLoad} />
                        <Factor label="Overdue" value={b.factors.overdueCount} tone={b.factors.overdueCount > 3 ? 'danger' : undefined} />
                        <Factor label="After hours" value={`${b.factors.afterHoursPct}%`} />
                        <Factor label="Negative" value={`${b.factors.negSentimentPct}%`} tone={b.factors.negSentimentPct > 50 ? 'danger' : undefined} />
                        <Factor label="Updates/day" value={b.factors.avgDailyUpdates} />
                      </div>

                      {b.riskLevel !== 'LOW' ? (
                        <p className="mt-3 flex items-start gap-2 rounded-btn bg-saffron-soft px-3 py-2 text-sm text-saffron-deep">
                          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span>
                            <span className="font-medium">{t.manager.suggestedAction}: </span>
                            {b.suggestedAction}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500">{b.suggestedAction}</p>
                      )}
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Scores combine five signals — active workload, overdue count, share of after-hours activity,
        share of negative-sentiment updates, and update frequency — over the last 14 days.
        <Badge tone="slate" className="ml-2">
          0–100, higher means more strain
        </Badge>
      </p>
    </>
  );
}

function Factor({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'danger';
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cn('tabular text-sm font-semibold', tone === 'danger' ? 'text-danger' : 'text-slate-800')}>
        {value}
      </p>
    </div>
  );
}
