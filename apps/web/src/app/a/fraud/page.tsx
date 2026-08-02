'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ALERT_STATUSES,
  FRAUD_TYPES,
  RISK_LEVELS,
  type FraudAlertDTO,
} from '@smartwork/shared';
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { RadarIcon, ScanSearch, ShieldAlert, Target } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { KpiCard, KpiGrid } from '@/components/kpi-card';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { SkeletonCard } from '@/components/ui/states';
import { AlertTable } from '@/components/fraud/alert-table';
import { AlertDrawer, ALERT_TYPE_LABEL } from '@/components/fraud/alert-drawer';
import { RISK_COLOR, chartTheme } from '@/lib/charts';

export default function FraudCenterPage() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');
  const [selected, setSelected] = useState<FraudAlertDTO | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const alerts = useQuery({
    queryKey: ['alerts', 'org', status, severity, type],
    queryFn: () =>
      api.alerts({
        status: status || undefined,
        severity: severity || undefined,
        type: type || undefined,
        pageSize: 200,
      }),
  });

  const scatter = useQuery({ queryKey: ['scatter'], queryFn: () => api.scatter() });

  const scan = useMutation({
    mutationFn: () => api.runScan(),
    onSuccess: (res) => {
      setScanResult(
        res.created > 0
          ? `${res.created} new ${res.created === 1 ? 'alert' : 'alerts'} raised across ${res.evaluated} users (${res.mode} engine).`
          : `${res.evaluated} users evaluated — no new anomalies. Existing open alerts are not duplicated.`,
      );
      void qc.invalidateQueries({ queryKey: ['alerts'] });
      void qc.invalidateQueries({ queryKey: ['scatter'] });
    },
    onError: (err) => setScanResult(err instanceof Error ? err.message : 'Scan failed'),
  });

  const precision = alerts.data?.precision;
  const items = alerts.data?.items ?? [];
  const open = items.filter((a) => a.status === 'OPEN');

  // Scatter: anomaly score against hour of day, coloured by alert type.
  const points = useMemo(
    () =>
      (scatter.data?.items ?? []).map((p) => ({
        ...p,
        x: p.hourOfDay,
        y: p.anomalyScore,
        z: p.severity === 'CRITICAL' ? 200 : p.severity === 'HIGH' ? 140 : 90,
      })),
    [scatter.data],
  );

  const byType = useMemo(() => {
    const map = new Map<string, typeof points>();
    for (const p of points) map.set(p.type, [...(map.get(p.type) ?? []), p]);
    return [...map.entries()];
  }, [points]);

  const TYPE_COLOR: Record<string, string> = {
    BULK_STATUS_CHANGE: chartTheme.danger,
    AFTER_HOURS_SPIKE: chartTheme.warning,
    SELF_APPROVAL: chartTheme.violet,
    UNUSUAL_CYCLE_TIME: chartTheme.teal,
  };

  return (
    <>
      <PageHeader
        title={t.nav.fraudCenter}
        subtitle="Behavioural anomalies derived from the audit chain — the one record that cannot be quietly rewritten"
        breadcrumbs={[{ label: t.nav.admin }, { label: t.nav.fraudCenter }]}
        action={
          <Button size="sm" loading={scan.isPending} onClick={() => scan.mutate()}>
            <ScanSearch className="h-4 w-4" aria-hidden />
            {t.admin.runScan}
          </Button>
        }
      />

      {scanResult ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-card border border-borderx bg-primary-50 px-4 py-2.5 text-sm text-primary">
          <span>{scanResult}</span>
          <button onClick={() => setScanResult(null)} className="font-medium underline">
            {t.common.close}
          </button>
        </div>
      ) : null}

      <KpiGrid>
        <KpiCard
          label={t.kpi.openAlerts}
          value={open.length}
          hint={`${items.length} total raised`}
          tone={open.length ? 'warning' : 'success'}
          icon={<ShieldAlert className="h-4 w-4" aria-hidden />}
          loading={alerts.isLoading}
        />
        <KpiCard
          label="Critical severity"
          value={open.filter((a) => a.severity === 'CRITICAL').length}
          tone="danger"
          hint="Require immediate review"
          icon={<RadarIcon className="h-4 w-4" aria-hidden />}
          loading={alerts.isLoading}
        />
        {/* The honest precision statistic — labelled evaluation set only. */}
        <KpiCard
          label={t.admin.precision}
          value={precision?.precisionPct ?? 0}
          suffix="%"
          tone="success"
          hint={
            precision
              ? `${precision.confirmed}/${precision.totalLabelled} confirmed on review`
              : undefined
          }
          icon={<Target className="h-4 w-4" aria-hidden />}
          loading={alerts.isLoading}
        />
        <KpiCard
          label="Subjects flagged"
          value={new Set(items.map((a) => a.userId).filter(Boolean)).size}
          hint="Distinct users with at least one alert"
          loading={alerts.isLoading}
        />
      </KpiGrid>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_330px]">
        <Card>
          <CardHeader
            title={t.admin.anomalyScatter}
            hint="Anomaly score against hour of day — night-time clusters are the tell"
          />
          <CardBody>
            {scatter.isLoading ? (
              <SkeletonCard rows={5} className="border-0 shadow-none" />
            ) : points.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">{t.empty.noAlerts}</p>
            ) : (
              <>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: -20 }}>
                      <CartesianGrid stroke={chartTheme.grid} />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Hour"
                        domain={[0, 23]}
                        ticks={[0, 4, 8, 12, 16, 20, 23]}
                        tickFormatter={(h: number) => `${String(h).padStart(2, '0')}:00`}
                        tick={{ fontSize: 11, fill: chartTheme.axis }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="Score"
                        domain={[0, 1]}
                        tick={{ fontSize: 11, fill: chartTheme.axis }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <ZAxis type="number" dataKey="z" range={[60, 220]} />
                      <Tooltip
                        contentStyle={chartTheme.tooltip}
                        cursor={{ strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const p = payload[0].payload as (typeof points)[number];
                          return (
                            <div className="rounded-btn border border-borderx bg-white p-2.5 text-xs shadow-pop">
                              <p className="font-semibold text-slate-800">
                                {ALERT_TYPE_LABEL[p.type] ?? p.type}
                              </p>
                              <p className="mt-0.5 text-slate-600">{p.userName}</p>
                              <p className="text-slate-500">
                                score {p.anomalyScore.toFixed(3)} ·{' '}
                                {String(p.hourOfDay).padStart(2, '0')}:00
                              </p>
                              {p.refNo ? (
                                <p className="font-mono text-slate-500">{p.refNo}</p>
                              ) : null}
                            </div>
                          );
                        }}
                      />
                      {byType.map(([alertType, data]) => (
                        <Scatter key={alertType} name={alertType} data={data}>
                          {data.map((p) => (
                            <Cell
                              key={p.id}
                              fill={TYPE_COLOR[alertType] ?? chartTheme.slate}
                              fillOpacity={p.status === 'OPEN' ? 0.85 : 0.3}
                            />
                          ))}
                        </Scatter>
                      ))}
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(TYPE_COLOR).map(([key, colour]) => (
                    <span key={key} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: colour }}
                        aria-hidden
                      />
                      {ALERT_TYPE_LABEL[key]}
                    </span>
                  ))}
                  <span className="ml-auto text-xs text-slate-400">
                    Faded points have already been triaged
                  </span>
                </div>
              </>
            )}
          </CardBody>
        </Card>

        {/* Precision explainer — the number is defensible because it is narrow. */}
        <Card className="h-fit border-l-[3px] border-l-success">
          <CardHeader title={t.admin.precision} hint={t.admin.precisionHint} />
          <CardBody>
            <p className="kpi-value text-4xl font-semibold text-success">
              {precision?.precisionPct ?? 0}
              <span className="text-lg text-slate-500">%</span>
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {precision?.confirmed ?? 0} of {precision?.totalLabelled ?? 0} alerts in the labelled
              evaluation set were confirmed as genuine on review.
            </p>
            <div className="mt-3 space-y-2 border-t border-borderx pt-3 text-sm text-slate-600">
              <p>
                <strong className="text-slate-800">Why not 100%.</strong> One alert is a genuine
                false positive: sustained after-hours activity that turned out to be workload, not
                misuse. It is labelled as such rather than quietly removed.
              </p>
              <p>
                <strong className="text-slate-800">Why it cannot drift.</strong> Alerts raised at
                runtime carry no ground-truth label and are excluded from this figure, so pressing
                <em> Run scan now</em> can never inflate it.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Alerts"
          hint={`${items.length} alerts in scope`}
          action={
            <div className="flex flex-wrap gap-2">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Status filter"
                className="w-36"
              >
                <option value="">{t.common.all} statuses</option>
                {ALERT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <Select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                aria-label="Severity filter"
                className="w-36"
              >
                <option value="">{t.common.all} severities</option>
                {RISK_LEVELS.map((r) => (
                  <option key={r} value={r}>
                    {t.risk[r]}
                  </option>
                ))}
              </Select>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value)}
                aria-label="Type filter"
                className="w-48"
              >
                <option value="">{t.common.all} types</option>
                {FRAUD_TYPES.map((f) => (
                  <option key={f} value={f}>
                    {ALERT_TYPE_LABEL[f]}
                  </option>
                ))}
              </Select>
            </div>
          }
        />
        <AlertTable alerts={items} loading={alerts.isLoading} onSelect={setSelected} />
      </Card>

      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone="teal">Audit-chain sourced</Badge>
        Feature vectors are built from audit blocks, not the task table — a user who edits a record
        cannot edit the evidence of having edited it.
      </p>

      <AlertDrawer alert={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </>
  );
}
