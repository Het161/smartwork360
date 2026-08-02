'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { api, downloadCsv } from '@/lib/api';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { KpiCard, KpiGrid } from '@/components/kpi-card';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SkeletonCard } from '@/components/ui/states';
import { formatHours } from '@/lib/charts';

export default function ReportsPage() {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = useQuery({ queryKey: ['report-summary'], queryFn: () => api.reportSummary() });
  const verify = useQuery({ queryKey: ['verify'], queryFn: () => api.verifyChain() });

  async function download(path: string, filename: string, key: string) {
    setBusy(key);
    setError(null);
    try {
      await downloadCsv(path, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title={t.nav.reports}
        subtitle={summary.data ? `${t.admin.monthlySummary} — ${summary.data.period}` : undefined}
        breadcrumbs={[{ label: t.nav.admin }, { label: t.nav.reports }]}
      />

      <KpiGrid>
        <KpiCard
          label="Raised this month"
          value={summary.data?.createdThisMonth ?? 0}
          loading={summary.isLoading}
        />
        <KpiCard
          label="Completed this month"
          value={summary.data?.completedThisMonth ?? 0}
          loading={summary.isLoading}
        />
        <KpiCard
          label={t.kpi.slaCompliance}
          value={summary.data?.sla.compliancePct ?? 0}
          suffix="%"
          hint={`${summary.data?.sla.breached ?? 0} of ${summary.data?.sla.measured ?? 0} breached`}
          tone={(summary.data?.sla.compliancePct ?? 0) >= 85 ? 'success' : 'warning'}
          loading={summary.isLoading}
        />
        <KpiCard
          label="Audit blocks"
          value={summary.data?.auditBlocks ?? 0}
          hint={verify.data?.intact ? 'Chain verified intact' : 'Chain verification failed'}
          tone={verify.data?.intact ? 'success' : 'danger'}
          loading={summary.isLoading}
        />
      </KpiGrid>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={<FileSpreadsheet className="h-4 w-4 text-primary" aria-hidden />}
            title="Data exports"
            hint="Real downloads, generated from live records"
          />
          <CardBody className="space-y-3">
            <ExportRow
              title="Tasks"
              description="Every task in scope with cycle time, SLA outcome and overdue flag."
              loading={busy === 'tasks'}
              onClick={() => download('/reports/tasks.csv', `smartwork360-tasks-${today}.csv`, 'tasks')}
            />
            <ExportRow
              title="Audit ledger"
              description="The full hash chain, including each block's previous hash and its own hash."
              loading={busy === 'audit'}
              onClick={() => download('/reports/audit.csv', `smartwork360-audit-${today}.csv`, 'audit')}
            />
            {error ? (
              <p role="alert" className="rounded-btn bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t.admin.monthlySummary} hint={summary.data?.period} />
          <CardBody>
            {summary.isLoading ? (
              <SkeletonCard rows={5} className="border-0 shadow-none" />
            ) : (
              <dl className="divide-y divide-borderx">
                <Row label="Total tasks" value={summary.data?.kpis.totalTasks ?? 0} />
                <Row label={t.kpi.pending} value={summary.data?.kpis.pending ?? 0} />
                <Row label={t.kpi.inProgress} value={summary.data?.kpis.inProgress ?? 0} />
                <Row label={t.kpi.underReview} value={summary.data?.kpis.underReview ?? 0} />
                <Row label={t.kpi.completed} value={summary.data?.kpis.completed ?? 0} />
                <Row label={t.kpi.overdue} value={summary.data?.kpis.overdue ?? 0} tone="danger" />
                <Row
                  label={t.kpi.avgCycleTime}
                  value={summary.data ? formatHours(summary.data.kpis.avgCycleTimeHours) : '—'}
                />
                <Row
                  label={t.kpi.cycleImprovement}
                  value={`${summary.data?.kpis.cycleTimeImprovementPct.toFixed(1) ?? 0}%`}
                  tone="success"
                />
                <Row label={t.kpi.activeStaff} value={summary.data?.kpis.activeUsers ?? 0} />
              </dl>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4 border-l-[3px] border-l-success">
        <CardBody className="flex flex-wrap items-center gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-success" aria-hidden />
          <p className="min-w-0 flex-1 text-base text-slate-700">
            Exports are generated from the same records the audit chain covers.{' '}
            {verify.data
              ? `${verify.data.checkedCount} blocks were verified in ${verify.data.durationMs}ms at page load.`
              : ''}
          </p>
        </CardBody>
      </Card>
    </>
  );
}

function ExportRow({
  title,
  description,
  onClick,
  loading,
}: {
  title: string;
  description: string;
  onClick: () => void;
  loading: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 rounded-card border border-borderx p-3">
      <div className="min-w-0 flex-1">
        <p className="text-md font-medium text-slate-900">{title}</p>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onClick} loading={loading}>
        <Download className="h-3.5 w-3.5" aria-hidden />
        {t.common.export}
      </Button>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'danger' | 'success';
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <dt className="text-base text-slate-600">{label}</dt>
      <dd
        className={
          tone === 'danger'
            ? 'tabular text-base font-semibold text-danger'
            : tone === 'success'
              ? 'tabular text-base font-semibold text-success'
              : 'tabular text-base font-semibold text-slate-900'
        }
      >
        {value}
      </dd>
    </div>
  );
}
