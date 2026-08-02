'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FraudAlertDTO } from '@smartwork/shared';
import { CheckCircle2, FileJson, ShieldAlert, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n/provider';
import { Drawer } from '../ui/drawer';
import { Button } from '../ui/button';
import { Textarea } from '../ui/input';
import { Badge } from '../ui/badge';
import { RiskChip } from '../chips';
import { PersonCell } from '../avatar';

export const ALERT_TYPE_LABEL: Record<string, string> = {
  BULK_STATUS_CHANGE: 'Bulk status change',
  AFTER_HOURS_SPIKE: 'After-hours spike',
  SELF_APPROVAL: 'Self-approval',
  UNUSUAL_CYCLE_TIME: 'Unusual cycle time',
};

export const REASON_LABEL: Record<string, string> = {
  night_hour_ratio: 'Night-hour concentration',
  action_burst: 'Action burst',
  self_approval: 'Maker-checker violation',
  status_flip: 'Excessive status changes',
  cycle_time_zscore: 'Cycle-time outlier',
};

export function AlertDrawer({
  alert,
  open,
  onOpenChange,
}: {
  alert: FraudAlertDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const triage = useMutation({
    mutationFn: (status: 'REVIEWED' | 'DISMISSED') => api.triageAlert(alert!.id, status, note.trim()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['alerts'] });
      void qc.invalidateQueries({ queryKey: ['scatter'] });
      setNote('');
      setError(null);
      onOpenChange(false);
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not record the decision'),
  });

  const details = (alert?.details ?? {}) as Record<string, unknown>;
  const reasons = Array.isArray(details.reasons) ? (details.reasons as string[]) : [];
  const isOpen = alert?.status === 'OPEN';

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title={
        alert ? (
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-danger" aria-hidden />
            {ALERT_TYPE_LABEL[alert.type] ?? alert.type}
          </span>
        ) : (
          'Alert'
        )
      }
      description={alert ? `Anomaly score ${alert.anomalyScore.toFixed(3)}` : undefined}
      footer={
        alert && isOpen ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={note.trim().length < 5}
              loading={triage.isPending}
              onClick={() => triage.mutate('REVIEWED')}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              {t.admin.markReviewed}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={note.trim().length < 5}
              loading={triage.isPending}
              onClick={() => triage.mutate('DISMISSED')}
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden />
              {t.admin.dismiss}
            </Button>
            <span className="text-xs text-slate-500">A note of 5+ characters is required.</span>
          </div>
        ) : alert ? (
          <p className="text-sm text-slate-600">
            {alert.status === 'REVIEWED' ? 'Reviewed' : 'Dismissed'} — {alert.reviewNote}
          </p>
        ) : null
      }
    >
      {alert ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <RiskChip level={alert.severity} />
            <Badge tone={alert.status === 'OPEN' ? 'amber' : 'slate'}>{alert.status}</Badge>
            {alert.labelConfirmed === true ? (
              <Badge tone="green">Confirmed on review</Badge>
            ) : alert.labelConfirmed === false ? (
              <Badge tone="slate">False positive (labelled)</Badge>
            ) : (
              <Badge tone="slate">Unlabelled</Badge>
            )}
            <span className="ml-auto text-xs text-slate-400">
              {new Date(alert.createdAt).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          {typeof details.narrative === 'string' ? (
            <p className="rounded-btn border-l-[3px] border-l-danger bg-danger-soft/50 px-3 py-2.5 text-base leading-relaxed text-slate-800">
              {details.narrative}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="gt-label mb-1">Subject</p>
              {alert.user ? (
                <PersonCell
                  name={alert.user.name}
                  designation={alert.user.designation}
                  seed={alert.user.avatarSeed}
                  size="xs"
                />
              ) : (
                <span className="text-sm text-slate-500">—</span>
              )}
            </div>
            <div>
              <p className="gt-label mb-1">Linked task</p>
              {alert.task ? (
                <span className="text-base text-slate-800">
                  <span className="font-mono text-xs text-primary">{alert.task.refNo}</span>
                  <span className="block truncate">{alert.task.title}</span>
                </span>
              ) : (
                <span className="text-sm text-slate-500">—</span>
              )}
            </div>
          </div>

          {reasons.length > 0 ? (
            <div>
              <p className="gt-label mb-1.5">Why this fired</p>
              <ul className="flex flex-wrap gap-1.5">
                {reasons.map((r) => (
                  <li key={r}>
                    <Badge tone="amber">{REASON_LABEL[r] ?? r}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="gt-label mb-1.5 flex items-center gap-1.5">
              <FileJson className="h-3.5 w-3.5" aria-hidden />
              {t.admin.evidence}
            </p>
            <pre className="thin-scroll max-h-72 overflow-auto rounded-btn bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
              {JSON.stringify(alert.details, null, 2)}
            </pre>
          </div>

          {isOpen ? (
            <div>
              <label htmlFor="alert-note" className="mb-1.5 block text-sm font-medium text-slate-700">
                Review note<span className="ml-0.5 text-danger">*</span>
              </label>
              <Textarea
                id="alert-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Confirmed misuse — referred to vigilance. / Workload-driven, not misuse."
              />
              <p className="mt-1 text-xs text-slate-500">
                Your decision and this note are written into the audit chain.
              </p>
              {error ? (
                <p role="alert" className="mt-2 text-sm text-danger">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
