'use client';

import type { FraudAlertDTO } from '@smartwork/shared';
import { ShieldCheck } from 'lucide-react';
import { RiskChip } from '../chips';
import { PersonCell } from '../avatar';
import { Badge } from '../ui/badge';
import { EmptyState, SkeletonTable } from '../ui/states';
import { useI18n } from '@/i18n/provider';
import { ALERT_TYPE_LABEL } from './alert-drawer';
import { cn } from '@/lib/utils';

export function AlertTable({
  alerts,
  loading,
  onSelect,
}: {
  alerts: FraudAlertDTO[];
  loading?: boolean;
  onSelect: (alert: FraudAlertDTO) => void;
}) {
  const { t } = useI18n();

  if (loading) return <SkeletonTable rows={6} cols={6} />;
  if (alerts.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
        title={t.empty.noAlerts}
        body={t.empty.noAlertsBody}
      />
    );
  }

  return (
    <div className="thin-scroll overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-left">
        <caption className="sr-only">Anomaly alerts</caption>
        <thead>
          <tr className="border-b border-borderx bg-slate-50/70">
            {['Type', 'Subject', 'Severity', 'Score', 'Status', 'Raised'].map((h) => (
              <th
                key={h}
                scope="col"
                className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr
              key={alert.id}
              className={cn(
                'border-b border-borderx last:border-0 hover:bg-slate-50',
                alert.status === 'OPEN' && alert.severity === 'CRITICAL' && 'bg-danger-soft/25',
              )}
            >
              <td className="px-3 py-2.5">
                <button
                  onClick={() => onSelect(alert)}
                  className="text-left text-base font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {ALERT_TYPE_LABEL[alert.type] ?? alert.type}
                </button>
              </td>
              <td className="px-3 py-2.5">
                {alert.user ? (
                  <PersonCell
                    name={alert.user.name}
                    designation={alert.user.designation}
                    seed={alert.user.avatarSeed}
                    size="xs"
                  />
                ) : (
                  <span className="text-sm text-slate-400">—</span>
                )}
              </td>
              <td className="px-3 py-2.5">
                <RiskChip level={alert.severity} />
              </td>
              <td className="tabular px-3 py-2.5 text-base font-medium text-slate-800">
                {alert.anomalyScore.toFixed(3)}
              </td>
              <td className="px-3 py-2.5">
                <Badge tone={alert.status === 'OPEN' ? 'amber' : 'slate'}>{alert.status}</Badge>
              </td>
              <td className="px-3 py-2.5 text-sm text-slate-500">
                {new Date(alert.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
