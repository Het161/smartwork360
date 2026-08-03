'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, type SupportFixLogEntry } from '@/lib/api';
import { useI18n } from '@/i18n/provider';
import { PageHeader } from '@/components/shell/app-shell';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, SkeletonTable } from '@/components/ui/states';
import { Avatar } from '@/components/avatar';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<string, string> = {
  APPLIED: 'bg-emerald-100 text-emerald-800',
  PROPOSED: 'bg-slate-100 text-slate-700',
  FAILED: 'bg-danger-soft text-danger',
  UNDONE: 'bg-amber-100 text-amber-800',
};

const STATUSES = ['', 'APPLIED', 'PROPOSED', 'FAILED', 'UNDONE'] as const;

/** Turns create_missing_sla_policy into "Create missing sla policy". */
function humanise(action: string): string {
  const s = action.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The audit view for everything Saarthi changed.
 *
 * Separate from the Audit Explorer on purpose: the ledger holds every event in
 * the system, and an administrator reviewing AI-assisted changes specifically
 * should not have to filter thousands of blocks to find them. Each row here has
 * a matching AUTOFIX_APPLIED block in the chain.
 */
export default function AiFixLogPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');

  const fixes = useQuery({
    queryKey: ['support-fixes', status],
    queryFn: () => api.supportFixLog({ status: status || undefined }),
  });

  const reindex = useMutation({
    mutationFn: () => api.reindexKb(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-fixes'] }),
  });

  const items: SupportFixLogEntry[] = fixes.data?.items ?? [];
  const applied = items.filter((f) => f.status === 'APPLIED').length;

  return (
    <>
      <PageHeader
        title={t.support.fixLog}
        subtitle={t.support.fixLogSubtitle}
        breadcrumbs={[{ label: t.nav.admin }, { label: t.support.fixLog }]}
        action={
          <Button
            variant="secondary"
            size="sm"
            loading={reindex.isPending}
            onClick={() => reindex.mutate()}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {t.support.reindex}
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-2 rounded-card border border-borderx bg-primary-50 px-4 py-2.5 text-sm text-primary">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        <p>
          Every change below was proposed by the assistant, confirmed by a person, and written to
          the audit chain in the same transaction as the change itself.
        </p>
      </div>

      <Card>
        <CardHeader
          icon={<Bot className="h-4 w-4 text-primary" aria-hidden />}
          title={t.support.fixLog}
          hint={`${applied} applied · ${items.length} total`}
          action={
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label={t.support.status}
              className="h-9 rounded-btn border border-borderx bg-white px-2.5 text-base text-slate-900"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s || `${t.common.all} ${t.support.status.toLowerCase()}`}
                </option>
              ))}
            </select>
          }
        />

        {fixes.isLoading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Bot className="h-5 w-5" aria-hidden />}
            title={t.support.noFixes}
            body="When Saarthi repairs something, it will be listed here with who confirmed it."
          />
        ) : (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <caption className="sr-only">{t.support.fixLogSubtitle}</caption>
              <thead>
                <tr className="border-b border-borderx bg-slate-50/70">
                  {[
                    t.support.action,
                    t.support.status,
                    t.support.appliedBy,
                    t.support.outcome,
                    t.support.when,
                  ].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((f) => (
                  <tr key={f.id} className="border-b border-borderx last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{humanise(f.action)}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-400">
                        {Object.entries(f.args)
                          .map(([k, v]) => `${k}=${String(v)}`)
                          .join(' ') || '—'}
                      </p>
                      {f.risk === 'medium' ? (
                        <Badge tone="amber" className="mt-1">
                          {t.support.riskMedium}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          STATUS_TONE[f.status] ?? 'bg-slate-100 text-slate-700',
                        )}
                      >
                        {f.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={f.actor.name} seed={f.actor.id} size="xs" />
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-800">{f.actor.name}</p>
                          <p className="text-xs text-slate-400">{f.actor.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[22rem] px-4 py-3">
                      <p className="text-sm text-slate-700">{f.result ?? '—'}</p>
                      {f.reason ? (
                        <p className="mt-0.5 text-xs italic text-slate-500">“{f.reason}”</p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                      {when(f.appliedAt ?? f.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
