'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ALERT_STATUSES, RISK_LEVELS, type FraudAlertDTO } from '@smartwork/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { AlertTable } from '@/components/fraud/alert-table';
import { AlertDrawer } from '@/components/fraud/alert-drawer';

export default function ManagerAlertsPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [selected, setSelected] = useState<FraudAlertDTO | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', 'dept', status, severity],
    queryFn: () =>
      api.alerts({ status: status || undefined, severity: severity || undefined, pageSize: 100 }),
  });

  return (
    <>
      <PageHeader
        title={t.nav.alerts}
        subtitle={`Anomalies detected in ${user?.department?.name ?? 'your department'}`}
        breadcrumbs={[{ label: t.nav.manager }, { label: t.nav.alerts }]}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3 p-3">
          <div className="w-44">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
              <option value="">{t.common.all} statuses</option>
              {ALERT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-44">
            <Select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              aria-label="Severity filter"
            >
              <option value="">{t.common.all} severities</option>
              {RISK_LEVELS.map((r) => (
                <option key={r} value={r}>
                  {t.risk[r]}
                </option>
              ))}
            </Select>
          </div>
          <p className="ml-auto text-sm text-slate-500">{data?.total ?? 0} alerts</p>
        </div>
      </Card>

      <Card>
        <AlertTable alerts={data?.items ?? []} loading={isLoading} onSelect={setSelected} />
      </Card>

      <AlertDrawer
        alert={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </>
  );
}
